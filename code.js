/* -------- State -------- */
let mapsReadyPromise = null;
let map, userMarker, markers = [];
let userLat = null, userLng = null;

window.addEventListener("DOMContentLoaded", () => {
  $("#btn-find").addEventListener("click", findNearby);
  $("#btn-saved").addEventListener("click", showSaved);

  // Controls trigger re-search after first search
  ["type","radius","minRating","openNow","sortBy"].forEach(id => {
    const el = $("#"+id);
    if (el) el.addEventListener("change", () => {
      if (userLat != null) findNearby(); // re-run with new filters
    });
  });

  mapsReadyPromise = loadGoogleMaps(CONFIG.GOOGLE_MAPS_API_KEY)
    .then(() => setStatus("✅ Maps ready. Tap Find Nearby."))
    .catch(e => { console.error(e); setStatus("❌ Failed to load Maps."); });

  setLoading(false);
  showEmpty(true);
});

/* -------- DOM helpers -------- */
function $(s){return document.querySelector(s)}
function setStatus(t){ const el=$("#status"); if(el) el.textContent=t||""; }
function setLoading(on){
  $("#loading").hidden = !on;
  $(".cards").setAttribute("aria-busy", on ? "true" : "false");
  
  if (on) {
    showEmpty(false);
    // Create skeleton cards when loading
    const skeletons = $("#loading");
    skeletons.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const skeleton = document.createElement("div");
      skeleton.className = "skeleton-card";
      skeletons.appendChild(skeleton);
    }
  } else {
    // Clear skeletons when not loading
    $("#loading").innerHTML = '';
  }
}
function showEmpty(on){ const el=$("#empty"); if(el) el.hidden = !on; }
function escapeHTML(s=""){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;

/* -------- Google Maps loader -------- */
function loadGoogleMaps(key){
  return new Promise((resolve,reject)=>{
    if (window.google?.maps?.places) return resolve();
    const sc=document.createElement("script");
    sc.async=true; sc.defer=true;
    sc.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places`;
    sc.onload=()=>window.google?.maps?.places?resolve():reject(new Error("Places missing"));
    sc.onerror=reject;
    document.head.appendChild(sc);
  });
}

/* -------- Geolocation (10-min cache) -------- */
async function ensureLocation(){
  const cache = JSON.parse(localStorage.getItem("cachedLocation")||"{}");
  const now = Date.now();
  if (cache.timestamp && now-cache.timestamp < 10*60*1000){
    userLat=cache.lat; userLng=cache.lng;
    return {lat:userLat, lng:userLng, cached:true};
  }
  setStatus("Requesting location…");
  return new Promise((res,rej)=>{
    navigator.geolocation.getCurrentPosition(pos=>{
      userLat=pos.coords.latitude; userLng=pos.coords.longitude;
      localStorage.setItem("cachedLocation", JSON.stringify({lat:userLat,lng:userLng,timestamp:now}));
      res({lat:userLat,lng:userLng,cached:false});
    },()=>rej(new Error("Location denied/unavailable.")));
  });
}

/* -------- Map helpers -------- */
function ensureMap(lat,lng){
  if (!map){
    map = new google.maps.Map($("#map"), { center:{lat,lng}, zoom:14, mapId: "DEMO_MAP_ID" });
    userMarker = new google.maps.Marker({ map, position:{lat,lng}, title:"You" });
  } else {
    map.setCenter({lat,lng});
    userMarker.setPosition({lat,lng});
  }
}
function clearMarkers(){ markers.forEach(m=>m.setMap(null)); markers=[]; }
function addMarker(place){
  const m = new google.maps.Marker({
    map,
    position: place.location,
    title: place.name
  });
  const infowindow = new google.maps.InfoWindow({
    content: `<strong>${escapeHTML(place.name)}</strong><br/>⭐ ${escapeHTML(String(place.rating))}<br/><small>${escapeHTML(place.vicinity||"")}</small>`
  });
  m.addListener("click", ()=>infowindow.open({anchor:m, map}));
  markers.push(m);
}

/* -------- Places search -------- */
async function fetchPlaces(lat,lng){
  await mapsReadyPromise;
  const type = $("#type").value || DEFAULTS.type;
  const radius = Number($("#radius").value || DEFAULTS.radius);
  const openNow = $("#openNow").checked || DEFAULTS.openNow;

  return new Promise(resolve=>{
    const svc = new google.maps.places.PlacesService(document.createElement("div"));
    const req = { location: new google.maps.LatLng(lat,lng), radius, type, openNow };
    svc.nearbySearch(req, (results, status)=>{
      if (status === google.maps.places.PlacesServiceStatus.OK && results?.length){
        const items = results.map(p=>({
          name: p.name,
          place_id: p.place_id,
          rating: p.rating ?? "N/A",
          photo: p.photos?.[0]?.getUrl({maxWidth:640}) || "https://via.placeholder.com/640x360?text=No+Image",
          vicinity: p.vicinity || "",
          location: { lat: p.geometry?.location?.lat(), lng: p.geometry?.location?.lng() },
          distance: distanceMeters(lat,lng, p.geometry?.location?.lat(), p.geometry?.location?.lng())
        }));
        resolve(items);
      } else resolve([]);
    });
  });
}

/* -------- Orchestrator -------- */
async function findNearby(){
  try{
    setLoading(true);
    await mapsReadyPromise;
    const {lat,lng,cached} = await ensureLocation();
    setStatus(`📍 ${cached?"Using cached":"Using fresh"} location (${lat.toFixed(4)}, ${lng.toFixed(4)})`);

    ensureMap(lat,lng);

    let places = await fetchPlaces(lat,lng);

    // Filter client-side
    const minRating = Number($("#minRating").value || 0);
    places = places.filter(p => (p.rating || 0) >= minRating);

    // Sort
    const sortBy = $("#sortBy").value || "rating";
    places.sort((a,b)=>{
      if (sortBy==="name") return a.name.localeCompare(b.name);
      if (sortBy==="distance") return a.distance - b.distance;
      return Number(b.rating||0) - Number(a.rating||0);
    });

    renderResults(places);
    updateMapMarkers(places);

    setStatus(places.length ? `Found ${places.length} places.` : "No places found.");
  }catch(e){
    console.error(e);
    setStatus(`❌ ${e.message || e}`);
    renderResults([]);
  }finally{
    setLoading(false);
  }
}

/* -------- Rendering -------- */
function renderResults(list){
  const container = $(".cards");
  container.innerHTML = "";
  
  // Make sure loading skeletons are hidden
  setLoading(false);

  if (!list?.length){ showEmpty(true); return; }
  showEmpty(false);
  
  list.forEach(place=>{
    const wrapper = document.createElement("div");
    wrapper.className = "swipe-wrapper";

    const card = document.createElement("div");
    card.className = "location-card";
    const gmapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name)}&query_place_id=${place.place_id}`;
    card.innerHTML = `
      <img src="${place.photo}" alt="${escapeHTML(place.name)}" loading="lazy" />
      <div class="card-row">
        <h3>${escapeHTML(place.name)}</h3>
        <span class="chip">⭐ ${escapeHTML(String(place.rating))}</span>
      </div>
      <div class="card-row">
        <small>${escapeHTML(place.vicinity || "")}</small>
        <div class="card-actions">
          <a href="${gmapsUrl}" target="_blank" rel="noopener noreferrer">Directions</a>
          <span class="chip chip--accent save-btn">Save</span>
        </div>
      </div>
    `;

    // Save button
    card.querySelector(".save-btn").addEventListener("click", ()=>savePlace(place));
    // Swipe (touch only, horizontal)
    if (isTouch && window.Hammer){
      const h = new Hammer(card);
      h.get("swipe").set({ direction: Hammer.DIRECTION_HORIZONTAL });
      h.on("swiperight", ()=>{ savePlace(place); slideAway(wrapper, +1); });
      h.on("swipeleft",  ()=>{ slideAway(wrapper, -1); });
    }

    wrapper.appendChild(card);
    container.appendChild(wrapper);
  });
}

function slideAway(el, dir=1){
  el.style.transform = `translateX(${dir*120}%) rotate(${dir*8}deg)`;
  el.style.opacity = "0";
  setTimeout(()=>el.remove(), 160);
}

function updateMapMarkers(places){
  clearMarkers();
  places.slice(0, 30).forEach(p=>{
    if (p.location?.lat && p.location?.lng) addMarker(p);
  });
}

/* -------- Saved -------- */
function savePlace(place){
  const saved = JSON.parse(localStorage.getItem("savedPlaces") || "[]");
  if (!saved.find(s => s.place_id === place.place_id)){
    saved.push(place);
    localStorage.setItem("savedPlaces", JSON.stringify(saved));
    alert(`Saved: ${place.name}`);
  } else {
    alert(`${place.name} is already saved.`);
  }
}
function showSaved(){
  const saved = JSON.parse(localStorage.getItem("savedPlaces") || "[]");
  renderResults(saved);
  setStatus(saved.length ? `You have ${saved.length} saved.` : "No saved places yet.");
}

/* -------- Utils -------- */
function distanceMeters(lat1,lng1,lat2,lng2){
  if (lat2==null || lng2==null) return Infinity;
  const R=6371000; // m
  const toRad = d=>d*Math.PI/180;
  const dlat=toRad(lat2-lat1), dlng=toRad(lng2-lng1);
  const a=Math.sin(dlat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dlng/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}
