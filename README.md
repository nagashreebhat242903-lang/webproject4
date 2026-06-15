# Real-time Weather Dashboard (Async JavaScript + REST)

## Files
- `index.html` – UI skeleton
- `styles.css` – styling
- `script.js` – Fetch API + async/await + rendering + search
- `TODO.md` – progress tracker

## How it works
- Uses **Open-Meteo** public APIs (no API key required):
  - Geocoding: `geocoding-api.open-meteo.com`
  - Weather: `api.open-meteo.com`
- Search workflow:
  1. User enters a city name
  2. App geocodes it to latitude/longitude
  3. App fetches current weather JSON
  4. App extracts temperature, humidity, wind speed/direction, and conditions
  5. App dynamically updates the dashboard

## Run
Open `index.html` in a browser. If you face CORS issues, serve the folder with a simple local server.

Common option:
- Start a local server (e.g., VS Code Live Server or `python -m http.server`)

Then open: `http://127.0.0.1:8000/` (port may vary).

