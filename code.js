// code.js - Complete working solution

// Global variables
let map, userMarker, markers = [];
let userLat = null, userLng = null;

// Wire up buttons and initialize
window.addEventListener("DOMContentLoaded", () => {
  console.log("Initializing Cafe Finder...");
  
  // Set up event listeners
  document.getElementById("btn-find").addEventListener("click", findNearby);
  document.getElementById("btn-saved").addEventListener("click", showSaved);

  // Set up filter change listeners
  ["type", "radius", "minRating", "openNow", "sortBy"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", () => {
      if (userLat != null) findNearby(); // re-run with new filters
    });
  });

  // Load Google Maps
  loadGoogleMaps(CONFIG.GOOGLE_MAPS_API_KEY)
    .then(() => {
      console.log("✅ Google Maps loaded successfully");
      setStatus("✅ Maps ready. Tap Find Nearby to search.");
    })
    .catch(err => {
      console.error("❌ Failed to load Google Maps:", err);
      setStatus("❌ Failed to load Maps. Check console for details.");
    });

  setLoading(false);
  showEmpty(true);
});

// --- DOM helpers ---
function setStatus(text) {
  const statusEl = document.getElementById("status");
  if (statusEl) statusEl.textContent = text || "";
}

function setLoading(loading) {
  const loadingEl = document.getElementById("loading");
  const cardsEl = document.querySelector(".cards");
  
  if (loadingEl) loadingEl.hidden = !loading;
  if (cardsEl) cardsEl.setAttribute("aria-busy", loading ? "true" : "false");
  
  if (loading) {
    showEmpty(false);
  }
}

function showEmpty(show) {
  const emptyEl = document.getElementById("empty");
  if (emptyEl) emptyEl.hidden = !show;
}

function escapeHTML(text) {
  return String(text).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

// --- Google Maps loader ---
function loadGoogleMaps(apiKey) {
  return new Promise((resolve, reject) => {
    if (window.google?.maps?.places) return resolve();
    
    const script = document.createElement("script");
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
    script.onload = () => window.google?.maps?.places ? resolve() : reject(new Error("Places library missing"));
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// --- Geolocation with 10-min cache ---
async function ensureLocation() {
  const cache = JSON.parse(localStorage.getItem("cachedLocation") || "{}");
  const now = Date.now();
  
  if (cache.timestamp && now - cache.timestamp < 10 * 60 * 1000) {
    userLat = cache.lat;
    userLng = cache.lng;
    return { lat: userLat, lng: userLng, cached: true };
  }
  
  setStatus("Requesting location…");
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not supported"));
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      pos => {
        userLat = pos.coords.latitude;
        userLng = pos.coords.longitude;
        localStorage.setItem("cachedLocation", JSON.stringify({
          lat: userLat,
          lng: userLng,
          timestamp: now
        }));
        resolve({ lat: userLat, lng: userLng, cached: false });
      },
      error => {
        let errorMsg = "Location access denied or unavailable";
        switch(error.code) {
          case error.PERMISSION_DENIED:
            errorMsg = "Location permission denied. Please enable location access.";
            break;
          case error.POSITION_UNAVAILABLE:
            errorMsg = "Location information unavailable.";
            break;
          case error.TIMEOUT:
            errorMsg = "Location request timed out.";
            break;
        }
        reject(new Error(errorMsg));
      },
      { timeout: 10000 }
    );
  });
}

// --- Map helpers ---
function ensureMap(lat, lng) {
  const mapEl = document.getElementById("map");
  if (!mapEl) return;
  
  if (mapEl.offsetWidth === 0) {
    requestAnimationFrame(() => ensureMap(lat, lng));
    return;
  }
  
  if (!map) {
    map = new google.maps.Map(mapEl, {
      center: { lat, lng },
      zoom: 14,
      disableDefaultUI: false,
    });
    
    userMarker = new google.maps.Marker({
      map,
      position: { lat, lng },
      title: "You"
    });
    
    google.maps.event.addListenerOnce(map, "tilesloaded", () => {
      console.log("✅ Google Map tiles loaded");
    });
  } else {
    map.setCenter({ lat, lng });
    userMarker.setPosition({ lat, lng });
  }
  
  setTimeout(() => {
    google.maps.event.trigger(map, "resize");
    map.setCenter({ lat, lng });
  }, 0);
}

function clearMarkers() {
  markers.forEach(marker => marker.setMap(null));
  markers = [];
}

function addMarker(place) {
  if (!map || !place?.location) return;
  
  const marker = new google.maps.Marker({
    map,
    position: place.location,
    title: place.name
  });
  
  const infowindow = new google.maps.InfoWindow({
    content: `
      <strong>${escapeHTML(place.name)}</strong><br/>
      ⭐ ${escapeHTML(String(place.rating))}<br/>
      <small>${escapeHTML(place.vicinity || "")}</small>
    `
  });
  
  marker.addListener("click", () => infowindow.open({ anchor: marker, map }));
  markers.push(marker);
}

// --- Places search ---
async function fetchPlaces(lat, lng) {
  const type = document.getElementById("type").value || "cafe";
  const radius = Number(document.getElementById("radius").value || 1500);
  const openNow = document.getElementById("openNow").checked || false;
  
  return new Promise(resolve => {
    const service = new google.maps.places.PlacesService(document.createElement("div"));
    const request = {
      location: new google.maps.LatLng(lat, lng),
      radius,
      type,
      openNow
    };
    
    service.nearbySearch(request, (results, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && results?.length) {
        const places = results.map(place => ({
          name: place.name,
          place_id: place.place_id,
          rating: place.rating ?? "N/A",
          photo: place.photos?.[0]?.getUrl({ maxWidth: 640 }) || "https://via.placeholder.com/640x360?text=No+Image",
          vicinity: place.vicinity || "",
          location: {
            lat: place.geometry?.location?.lat(),
            lng: place.geometry?.location?.lng()
          },
          distance: calculateDistance(lat, lng, place.geometry?.location?.lat(), place.geometry?.location?.lng())
        }));
        resolve(places);
      } else {
        console.log("Places API status:", status);
        resolve([]);
      }
    });
  });
}

// --- Main search function ---
async function findNearby() {
  try {
    setLoading(true);
    setStatus("Finding your location…");
    
    const { lat, lng, cached } = await ensureLocation();
    setStatus(`📍 ${cached ? "Using cached" : "Using fresh"} location (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
    
    ensureMap(lat, lng);
    
    let places = await fetchPlaces(lat, lng);
    
    // Apply filters
    const minRating = Number(document.getElementById("minRating").value || 0);
    places = places.filter(place => {
      const rating = Number(place.rating);
      return !isNaN(rating) && rating >= minRating;
    });
    
    // Apply sorting
    const sortBy = document.getElementById("sortBy").value || "rating";
    places.sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "distance") return a.distance - b.distance;
      
      const ratingA = Number(a.rating) || 0;
      const ratingB = Number(b.rating) || 0;
      return ratingB - ratingA;
    });
    
    renderResults(places);
    updateMapMarkers(places);
    
    setStatus(places.length ? `Found ${places.length} places.` : "No places found.");
    
  } catch (error) {
    console.error("Error in findNearby:", error);
    setStatus(`❌ ${error.message || "Something went wrong"}`);
    renderResults([]);
  } finally {
    setLoading(false);
  }
}

// --- Rendering ---
function renderResults(places) {
  const container = document.querySelector(".cards");
  if (!container) return;
  
  container.innerHTML = "";
  
  if (!places?.length) {
    showEmpty(true);
    return;
  }
  
  showEmpty(false);
  
  places.forEach(place => {
    const wrapper = document.createElement("div");
    wrapper.className = "swipe-wrapper";
    
    const card = document.createElement("div");
    card.className = "location-card";
    
    const gmapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name)}&query_place_id=${place.place_id}`;
    const distanceKm = place.distance ? (place.distance / 1000).toFixed(1) + ' km' : 'Unknown';
    
    card.innerHTML = `
      <img src="${place.photo}" alt="${escapeHTML(place.name)}" loading="lazy" />
      <div class="card-row">
        <h3>${escapeHTML(place.name)}</h3>
        <span class="chip">⭐ ${escapeHTML(String(place.rating))}</span>
      </div>
      <div class="card-row">
        <small>${escapeHTML(place.vicinity || "")}</small>
        <span class="chip">${distanceKm}</span>
      </div>
      <div class="card-actions">
        <a href="${gmapsUrl}" target="_blank" rel="noopener noreferrer">Directions</a>
        <span class="chip chip--accent save-btn">Save</span>
      </div>
    `;
    
    // Save button
    const saveBtn = card.querySelector(".save-btn");
    if (saveBtn) {
      saveBtn.addEventListener("click", () => savePlace(place));
    }
    
    // Swipe functionality
    if (window.Hammer) {
      const hammer = new Hammer(card);
      hammer.get("swipe").set({ direction: Hammer.DIRECTION_HORIZONTAL });
      hammer.on("swiperight", () => {
        savePlace(place);
        slideAway(wrapper, 1);
      });
      hammer.on("swipeleft", () => {
        slideAway(wrapper, -1);
      });
    }
    
    wrapper.appendChild(card);
    container.appendChild(wrapper);
  });
}

function slideAway(element, direction = 1) {
  element.style.transform = `translateX(${direction * 120}%) rotate(${direction * 8}deg)`;
  element.style.opacity = "0";
  setTimeout(() => {
    if (element.parentNode) element.parentNode.removeChild(element);
  }, 160);
}

function updateMapMarkers(places) {
  clearMarkers();
  places.slice(0, 30).forEach(place => {
    if (place.location?.lat && place.location?.lng) {
      addMarker(place);
    }
  });
}

// --- Saved places ---
function savePlace(place) {
  const saved = JSON.parse(localStorage.getItem("savedPlaces") || "[]");
  if (!saved.find(p => p.place_id === place.place_id)) {
    saved.push(place);
    localStorage.setItem("savedPlaces", JSON.stringify(saved));
    alert(`Saved: ${place.name}`);
  } else {
    alert(`${place.name} is already saved.`);
  }
}

function showSaved() {
  const saved = JSON.parse(localStorage.getItem("savedPlaces") || "[]");
  renderResults(saved);
  setStatus(saved.length ? `You have ${saved.length} saved places.` : "No saved places yet.");
}

// --- Utility functions ---
function calculateDistance(lat1, lng1, lat2, lng2) {
  if (lat2 == null || lng2 == null) return Infinity;
  
  const R = 6371000; // Earth radius in meters
  const toRad = degrees => degrees * Math.PI / 180;
  
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLng / 2) ** 2;
  
  return 2 * R * Math.asin(Math.sqrt(a));
}