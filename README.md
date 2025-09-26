# ☕ Cafe Finder

A simple web app that helps you find nearby cafés (or other places) using the Google Maps Places API. It shows results both as interactive cards and on a map, lets you filter by rating, distance, type, and “open now”, and even includes a fun “Surprise Me” feature.

---

## 🚀 Features
- **Search nearby places** (cafés, restaurants, bookstores, parks, museums, attractions).
- **Filter controls**:
  - Type of place
  - Radius (1 km – 5 km)
  - Minimum rating
  - Open now toggle
  - Sort by rating, name, or distance
- **Interactive results cards** with images, ratings, reviews, and links for directions.
- **Map integration** to visualize results.
- **Saved places** — swipe right or click to save favorites.
- **“Surprise Me” button** — picks a random spot and adds confetti 🎉.
- **Responsive UI** — works on desktop and mobile.
- **Modern design** — gradient buttons, card shadows, skeleton loaders, and smooth transitions.

---

## 📂 Project Structure
```
.
├── index.html     # Main HTML page
├── styles.css     # App styling (modern gradients & responsive layout)
├── code.js        # Main application logic
├── config.js      # Holds Google Maps API key configuration
└── README.md      # Project documentation
```

---

## 🛠️ Setup

### 1. Clone or download the repo
```bash
git clone hhttps://github.com/adit24dhaya/caffinder
cd caffinder
```

### 2. Configure your Google Maps API key
Edit `config.js` and insert your **Google Maps Places API key**:

```js
window.CONFIG = {
  GMAPS_API_KEY: "YOUR_API_KEY_HERE"
};
```

> You’ll need billing enabled in Google Cloud Console for the Places API.

### 3. Run locally
Start a simple dev server (Python 3 example):

```bash
python3 -m http.server 5173
```

Then open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🎨 Usage
1. Click **Find Nearby** → fetches cafés near your current location.
2. Use the filter controls to refine results.
3. Swipe right / click 💖 to save a café.
4. Switch between **Saved** and **All** results.
5. Try the **Surprise Me** button for a random café with confetti 🎲.

---

## 📸 Screenshots
![Demo Screenshot](caffinder/screenshots/S-1.png)
![Demo Screenshot](caffinder/screenshots/S-2.png)
![Demo Screenshot](caffinder/screenshots/S-3.png)


---

## 📜 License
MIT License — feel free to fork and adapt.  
