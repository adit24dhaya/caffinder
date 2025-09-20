// code.js

// Wire up buttons
window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btn-find").addEventListener("click", getLocation);
  document.getElementById("btn-saved").addEventListener("click", showSaved);

  // Load the Google Maps JS once at startup so Places is ready
  loadGoogleMaps(GOOGLE_MAPS_API_KEY)
    .then(() => console.log("Google Maps JS loaded"))
    .catch(err => {
      console.error("Failed to load Google Maps JS:", err);
      alert("Could not load Google Maps. Check your API key & referrer restrictions.");
    });
});

// --- Load Maps JS dynamically using the key from config.js
function loadGoogleMaps(GOOGLE_MAPS_API_KEY) {
  return new Promise((resolve, reject) => {
    if (window.google?.maps) return resolve(); // already loaded

    const script = document.createElement("script");
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      GOOGLE_MAPS_API_KEY
    )}&libraries=places`;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// --- Geolocation with 10-min cache
function getLocation() {
  const cache = JSON.parse(localStorage.getItem("cachedLocation") || "{}");
  const now = Date.now();

  if (cache.timestamp && now - cache.timestamp < 10 * 60 * 1000) {
    usePlaces(cache.lat, cache.lng);
    return;
  }

  navigator.geolocation.getCurrentPosition(
    pos => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      localStorage.setItem(
        "cachedLocation",
        JSON.stringify({ lat, lng, timestamp: now })
      );
      usePlaces(lat, lng);
    },
    () => alert("Location access denied or unavailable.")
  );
}

// --- Use Places Library (no CORS / no proxy)
function usePlaces(lat, lng) {
  if (!window.google?.maps?.places) {
    alert("Places library not loaded.");
    return;
  }

  const service = new google.maps.places.PlacesService(document.createElement("div"));
  const request = {
    location: new google.maps.LatLng(lat, lng),
    radius: 1500,
    type: "cafe",
  };

  service.nearbySearch(request, (results, status) => {
    if (status === google.maps.places.PlacesServiceStatus.OK && results?.length) {
      // Normalize results for our renderer
      const cafes = results.map(p => ({
        name: p.name,
        place_id: p.place_id,
        rating: p.rating ?? "N/A",
        // SDK gives a method to get an image URL
        photo: p.photos?.[0]?.getUrl({ maxWidth: 400 }) ||
               "https://via.placeholder.com/250x150?text=No+Image",
      }));
      displayCards(cafes);
    } else {
      alert("No cafes found.");
    }
  });
}

// --- Render swipeable cards
function displayCards(cafes) {
  const container = document.querySelector(".cards");
  container.innerHTML = "";

  cafes.forEach((cafe, i) => {
    const wrapper = document.createElement("div");
    wrapper.className = "swipe-wrapper";
    wrapper.style.zIndex = 200 - i;

    const card = document.createElement("div");
    card.className = "location-card";
    card.innerHTML = `
      <img src="${cafe.photo}" alt="${cafe.name}" />
      <h3>${cafe.name}</h3>
      <p>⭐️ Rating: ${cafe.rating}</p>
      <p><small>Swipe right to save 💖</small></p>
    `;

    wrapper.appendChild(card);
    container.appendChild(wrapper);

    const hammertime = new Hammer(wrapper);
    hammertime.on("swipeleft", () => {
      wrapper.style.transform = "translateX(-150%) rotate(-15deg)";
      wrapper.style.opacity = 0;
      setTimeout(() => wrapper.remove(), 120);
    });
    hammertime.on("swiperight", () => {
      saveCafe(JSON.stringify(cafe));
      wrapper.style.transform = "translateX(150%) rotate(15deg)";
      wrapper.style.opacity = 0;
      setTimeout(() => wrapper.remove(), 120);
    });
  });
}

// --- Save / Show saved
function saveCafe(cafeJSON) {
  const cafe = JSON.parse(cafeJSON);
  let saved = JSON.parse(localStorage.getItem("savedCafes") || "[]");

  if (!saved.find(c => c.place_id === cafe.place_id)) {
    saved.push(cafe);
    localStorage.setItem("savedCafes", JSON.stringify(saved));
    alert(`${cafe.name} saved!`);
  } else {
    alert(`${cafe.name} is already saved.`);
  }
}

function showSaved() {
  const container = document.querySelector(".cards");
  container.innerHTML = "";

  const saved = JSON.parse(localStorage.getItem("savedCafes") || "[]");
  if (saved.length === 0) {
    container.innerHTML = "<p>No saved cafes yet 😢</p>";
    return;
  }

  saved.forEach(cafe => {
    const card = document.createElement("div");
    card.className = "location-card";
    card.innerHTML = `
      <img src="${cafe.photo}" alt="${cafe.name}" />
      <h3>${cafe.name}</h3>
      <p>⭐️ Rating: ${cafe.rating}</p>
    `;
    container.appendChild(card);
  });
}
