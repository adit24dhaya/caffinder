// code.js file
(() => {
  'use strict';

  // ===== Utilities =====
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const elStatus = $('#status');
  const elCards = $('.cards');
  const elLoading = $('#loading');
  const elEmpty = $('#empty');
  const btnFind = $('#btn-find');
  const btnSaved = $('#btn-saved');
  const btnSurprise = $('#btn-surprise');

  const selType = $('#type');
  const selRadius = $('#radius');
  const selMinRate = $('#minRating');
  const chkOpenNow = $('#openNow');
  const selSortBy = $('#sortBy');

  // Local storage keys
  const LS_SAVED = 'cafefinder_saved_v1';

  /** Saved helpers */
  const getSaved = () => {
    try { return JSON.parse(localStorage.getItem(LS_SAVED) || '[]'); }
    catch { return []; }
  };
  const setSaved = (ids) => localStorage.setItem(LS_SAVED, JSON.stringify(ids));
  const toggleSaved = (placeId) => {
    const saved = new Set(getSaved());
    if (saved.has(placeId)) saved.delete(placeId); else saved.add(placeId);
    setSaved([...saved]);
    return saved.has(placeId);
  };
  const isSaved = (placeId) => new Set(getSaved()).has(placeId);

  // ===== Google Maps loader =====
  let map, maps, placesService, userPos, geocoder;
  let markers = []; let markersById = {}; let infoWindows = [];
  let latestResults = []; // enriched results incl. details
  let showingSavedOnly = false;

  async function loadGoogleMaps() {
    return new Promise((resolve, reject) => {
      if (window.google && window.google.maps) return resolve();
      const key = window.CONFIG?.GMAPS_API_KEY;
      if (!key) {
        reject(new Error('Missing Google Maps API key in window.CONFIG.GMAPS_API_KEY'));
        return;
      }
      const cbName = 'onMapsReady_' + Math.random().toString(36).slice(2);
      window[cbName] = () => resolve();
      const s = document.createElement('script');
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&callback=${cbName}`;
      s.async = true; s.defer = true;
      s.onerror = () => reject(new Error('Failed to load Google Maps JS API'));
      document.head.appendChild(s);
    });
  }

  function setStatus(txt) {
    elStatus.textContent = txt || '';
  }

  function setLoading(isLoading, { skeleton = true } = {}) {
    elLoading.hidden = !(isLoading && skeleton);
    elCards.setAttribute('aria-busy', isLoading ? 'true' : 'false');
  }

  // ===== Geolocation =====
  function getLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => reject(err),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    });
  }

  // ===== Map helpers =====
  function clearMarkers() {
    for (const m of markers) m.setMap(null);
    markers = [];
    markersById = {};
    infoWindows = [];
  }
  function addMarker(place) {
    const marker = new maps.Marker({
      position: place.geometry.location,
      map,
      title: place.name
    });
    const infowindow = new maps.InfoWindow({
      content: `<strong>${escapeHtml(place.name)}</strong><br/>${place.vicinity || ''}`
    });
    marker.addListener('click', () => infowindow.open({ map, anchor: marker }));
    markers.push(marker);
    markersById[place.place_id] = { marker, infowindow };
    infoWindows.push(infowindow);
  }

  function fitToMarkers() {
    if (!markers.length) return;
    const bounds = new maps.LatLngBounds();
    for (const m of markers) bounds.extend(m.getPosition());
    map.fitBounds(bounds);
  }

  function closeAllInfoWindows() {
    infoWindows.forEach(iw => iw && iw.close && iw.close());
  }
  function focusPlace(placeId) {
    const entry = markersById[placeId];
    if (!entry) return;
    const { marker, infowindow } = entry;
    closeAllInfoWindows();
    map.setZoom(Math.max(map.getZoom() || 14, 16));
    map.panTo(marker.getPosition());
    infowindow.open({ map, anchor: marker });
    if (marker.setAnimation) {
      marker.setAnimation(maps.Animation.BOUNCE);
      setTimeout(() => marker.setAnimation(null), 900);
    }
    const mapEl = document.getElementById('map');
    if (mapEl) mapEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ===== HTML helpers =====
  function escapeHtml(str = '') {
    return str.replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }

  function stars(rating) {
    if (!rating && rating !== 0) return '';
    const full = '★'.repeat(Math.floor(rating));
    const half = (rating % 1 >= 0.5) ? '½' : '';
    const empty = '☆'.repeat(5 - Math.ceil(rating));
    return `<span class="stars" title="${Number(rating).toFixed(1)}">${full}${half}${empty}</span>`;
  }

  function buildPhotoStrip(photos = []) {
    if (!photos.length) return '';
    const imgs = photos.slice(0, 3).map(p => {
      const url = (typeof p?.getUrl === 'function')
        ? p.getUrl({ maxWidth: 900, maxHeight: 650 })
        : p;
      return `<img loading="lazy" alt="" src="${url}" onload="this.classList.add('is-loaded')" />`;
    }).join('');
    return `<div class="photo-strip">${imgs}</div>`;
  }

  function buildReviews(reviews = []) {
    if (!reviews.length) return '';
    const items = reviews.slice(0, 3).map(r => {
      const rating = r.rating || 0;
      const author = escapeHtml(r.author_name || 'Anonymous');
      const text = escapeHtml((r.text || '').trim());
      return `<div class="review">
        <div class="stars">${stars(rating)}</div>
        <div class="author">${author}</div>
        <div class="text">${text}</div>
      </div>`;
    }).join('');
    return `<div class="reviews">${items}</div>`;
  }

  function buildCard(place, details = {}) {
    const name = escapeHtml(place.name || '');
    const vicinity = escapeHtml(place.vicinity || place.formatted_address || '');
    const rating = place.rating || details.rating;
    const total = place.user_ratings_total || details.user_ratings_total;
    const saved = isSaved(place.place_id);
    const url = details.url || `https://www.google.com/maps/place/?q=place_id:${place.place_id}`;

    const photos = (details.photos && details.photos.length ? details.photos : (place.photos || []));
    const reviews = details.reviews || [];

    return `<article class="card location-card" data-id="${place.place_id}">
      ${buildPhotoStrip(photos)}
      <h3>${name}</h3>
      <div class="card-row">
        <div class="chip chip--accent">${stars(rating || 0)} ${rating ? Number(rating).toFixed(1) : ''} ${total ? `· ${total}` : ''}</div>
        <div class="card-actions">
          <a class="btn-showmap" href="#" data-id="${place.place_id}">Show on map</a>
          <a class="btn-save ${saved ? 'is-saved' : ''}" href="#" data-id="${place.place_id}">${saved ? 'Saved' : 'Save'}</a>
        </div>
      </div>
      <p class="muted">${vicinity}</p>
      ${buildReviews(reviews)}
      <a class="see-more" target="_blank" rel="noopener" href="${url}">See more on Google Maps</a>
    </article>`;
  }

  function attachCardInteractions(container) {
    // Click actions
    container.addEventListener('click', (e) => {
      // Show on map
      const show = e.target.closest('.btn-showmap');
      if (show) {
        e.preventDefault();
        const id = show.getAttribute('data-id');
        focusPlace(id);
        return;
      }

      /*SAVE_TOGGLE_PATCH*/
      const a = e.target.closest('.btn-save');
      if (!a) return;
      e.preventDefault();
      const id = a.getAttribute('data-id');
      const nowSaved = toggleSaved(id);
      a.textContent = nowSaved ? 'Saved' : 'Save';
      a.classList.toggle('is-saved', nowSaved);
      a.classList.remove('danger-hover');
      // Visual feedback
      const card = a.closest('.card');
      if (card) {
        card.style.transition = 'transform .15s ease';
        card.style.transform = 'scale(0.98)';
        setTimeout(() => card.style.transform = '', 160);
      }
    });

    /*HOVER_UNSAVE_PREVIEW*/
    container.addEventListener('mouseover', (e) => {
      const btn = e.target.closest('.btn-save.is-saved');
      if (!btn) return;
      btn.dataset._label = btn.textContent;
      btn.textContent = 'Unsave';
      btn.classList.add('danger-hover');
    });
    container.addEventListener('mouseout', (e) => {
      const btn = e.target.closest('.btn-save.is-saved');
      if (!btn) return;
      btn.textContent = btn.dataset._label || 'Saved';
      btn.classList.remove('danger-hover');
    });

    // Swipe to save via HammerJS
    $$('.card', container).forEach(card => {
      const hammertime = new Hammer(card);
      hammertime.on('swiperight', () => {
        const id = card.getAttribute('data-id');
        const nowSaved = toggleSaved(id);
        const btn = $('.btn-save', card);
        if (btn) { btn.textContent = nowSaved ? 'Saved' : 'Save'; btn.classList.toggle('is-saved', nowSaved); btn.classList.remove('danger-hover'); }
        card.classList.add('highlight');
        setTimeout(() => card.classList.remove('highlight'), 1200);
      });
    });
  }

  function renderCards(list) {
    elCards.innerHTML = list.map(item => buildCard(item.place, item.details || {})).join('');
    attachCardInteractions(elCards);
  }

  // ===== Distance helper (Haversine) =====
  function computeDistanceMeters(a, b) {
    if (!a || !b) return null;
    const R = 6371000;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLng = (b.lng - a.lng) * Math.PI / 180;
    const lat1 = a.lat * Math.PI / 180;
    const lat2 = b.lat * Math.PI / 180;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
    return R * c;
  }

  // ===== Search flow =====
  async function performSearch(showSkeleton = true) {
    try {
      if (!maps) {
        await loadGoogleMaps();
        maps = google.maps;
      }
    } catch (e) {
      setStatus(`Maps failed to load: ${e.message}. Check API key, referrers, billing, and API enablement.`);
      setLoading(false);
      return;
    }

    setStatus('Getting your location…');
    setLoading(true, { skeleton: showSkeleton });
    elEmpty.hidden = true;

    try {
      userPos = await getLocation();
    } catch (err) {
      setLoading(false);
      setStatus('Please allow location access to search nearby.');
      throw err;
    }

    // Init map once
    if (!map) {
      map = new maps.Map($('#map'), {
        center: userPos,
        zoom: 15,
        mapTypeControl: false,
        streetViewControl: false,
      });
      geocoder = new maps.Geocoder();
      placesService = new maps.places.PlacesService(map);
      new maps.Marker({ position: userPos, map, title: 'You are here' });
    }

    // Build request
    const typeValue = selType.value;
    const radius = parseInt(selRadius.value, 10) || 1500;
    const minRating = parseFloat(selMinRate.value) || 0;
    const openNow = !!chkOpenNow.checked;

    setStatus('Searching nearby places…');
    const nearbyReq = {
      location: new maps.LatLng(userPos.lat, userPos.lng),
      radius,
      type: typeValue,
      openNow: openNow || undefined,
    };

    const nearbyResults = await new Promise((resolve, reject) => {
      placesService.nearbySearch(nearbyReq, (results, status) => {
        if (status !== maps.places.PlacesServiceStatus.OK &&
          status !== maps.places.PlacesServiceStatus.ZERO_RESULTS) {
          reject(new Error('Places nearbySearch failed: ' + status));
          return;
        }
        resolve(results || []);
      });
    });

    // Filter by rating
    let filtered = nearbyResults.filter(p => (p.rating || 0) >= minRating);

    // Annotate distance
    for (const p of filtered) {
      const loc = p.geometry?.location;
      if (loc) {
        p._distanceMeters = computeDistanceMeters(userPos, { lat: loc.lat(), lng: loc.lng() });
      }
    }

    // Sort
    const sortBy = selSortBy.value;
    filtered.sort((a, b) => {
      if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
      if (sortBy === 'distance') return (a._distanceMeters || 0) - (b._distanceMeters || 0);
      // default rating desc
      return (b.rating || 0) - (a.rating || 0);
    });

    // Limit and fetch details (photos/reviews/url)
    const limited = filtered.slice(0, 12);
    setStatus(`Found ${filtered.length} place(s) · showing ${limited.length}`);

    // Clear markers and add new
    clearMarkers();
    limited.forEach(p => addMarker(p));
    fitToMarkers();

    // Fetch details with small concurrency to avoid quota spikes
    const enriched = [];
    const queue = [...limited];

    while (queue.length) {
      const batch = queue.splice(0, 3);
      const details = await Promise.all(batch.map(p => fetchDetails(p.place_id)));
      details.forEach((det, i) => {
        enriched.push({ place: batch[i], details: det || {} });
      });
      await sleep(200);
    }

    latestResults = enriched;

    const finalList = showingSavedOnly
      ? enriched.filter(it => isSaved(it.place.place_id))
      : enriched;

    renderCards(finalList);
    setLoading(false);
    if (!finalList.length) {
      elEmpty.hidden = false;
      setStatus('No places match the current filters.');
    } else {
      elEmpty.hidden = true;
    }
  }

  function fetchDetails(placeId) {
    return new Promise((resolve) => {
      const fields = [
        'url', 'rating', 'user_ratings_total', 'reviews',
        'photos', 'formatted_address', 'name', 'place_id'
      ];
      placesService.getDetails({ placeId, fields }, (place, status) => {
        if (status !== maps.places.PlacesServiceStatus.OK) {
          resolve(null);
        } else {
          resolve(place);
        }
      });
    });
  }

  // ===== Surprise Me =====
  function surpriseMe() {
    if (!latestResults.length) {
      setStatus('Search first, then try Surprise Me.');
      return;
    }
    const pool = [];
    latestResults.forEach((it, idx) => {
      const r = (it.place.rating || 0);
      const weight = Math.max(1, Math.round(r * 2));
      for (let i = 0; i < weight; i++) pool.push(idx);
    });
    const pickIdx = pool[Math.floor(Math.random() * pool.length)] ?? 0;
    const id = latestResults[pickIdx].place.place_id;
    const card = $(`.card[data-id="${CSS.escape(id)}"]`);
    if (card) {
      card.classList.add('highlight');
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (window.confetti) {
        window.confetti({ particleCount: 180, spread: 80, origin: { y: 0.25 } });
      }
      setTimeout(() => card.classList.remove('highlight'), 1800);
    }
  }

  // ===== Saved toggle =====
  function showSavedOnly(flag) {
    showingSavedOnly = flag;
    if (!latestResults.length) {
      if (!flag) return;
      const ids = getSaved();
      if (!ids.length) {
        elCards.innerHTML = '';
        elEmpty.hidden = false;
        setStatus('No saved places yet. Swipe right on a card to save.');
        return;
      }
      (async () => {
        if (!maps) await loadGoogleMaps();
        if (!map) {
          map = new google.maps.Map($('#map'), { center: { lat: 0, lng: 0 }, zoom: 2 });
          placesService = new google.maps.places.PlacesService(map);
        }
        setLoading(true, { skeleton: true });
        const results = [];
        for (const pid of ids.slice(0, 12)) {
          const det = await fetchDetails(pid);
          if (det) results.push({ place: det, details: det });
          await sleep(120);
        }
        latestResults = results;
        renderCards(results);
        setLoading(false);
        setStatus('Showing saved places.');
      })();
      return;
    }

    const list = flag
      ? latestResults.filter(it => isSaved(it.place.place_id))
      : latestResults;
    renderCards(list);
    elEmpty.hidden = list.length > 0;
    setStatus(flag ? 'Showing saved places.' : 'Showing search results.');
  }

  // ===== Wire up controls =====
  function initControls() {
    btnFind.addEventListener('click', () => performSearch(true));
    btnSurprise.addEventListener('click', surpriseMe);
    btnSaved.addEventListener('click', () => {
      const now = !showingSavedOnly;
      btnSaved.classList.toggle('btn-primary', now);
      showSavedOnly(now);
    });

    [selType, selRadius, selMinRate, chkOpenNow, selSortBy].forEach(el => {
      el.addEventListener('change', () => {
        if (map) performSearch(false); // re-run without skeleton after first search
      });
    });
  }

  // ===== Boot =====
  (async function boot() {
    initControls();
    setStatus('Ready. Tap “Find Nearby” to begin.');
  })();

  // ===== Wire up controls =====
  function initControls() {
    btnFind.addEventListener('click', () => performSearch(true));
    btnSurprise.addEventListener('click', surpriseMe);
    btnSaved.addEventListener('click', () => {
      const now = !showingSavedOnly;
      btnSaved.classList.toggle('btn-primary', now);
      showSavedOnly(now);
    });

    // Shoelace-compatible change listeners
    const ids = ['type', 'radius', 'minRating', 'openNow', 'sortBy'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const rerun = () => { if (map) performSearch(false); };
      el.addEventListener('sl-change', rerun); // Shoelace event
      el.addEventListener('change', rerun);    // Fallback (just in case)
    });
  }


})();
