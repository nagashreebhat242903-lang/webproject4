/*
  Real-time Weather Dashboard (Async JS + REST)
  Uses async/await + Fetch API.
  Public API: Open-Meteo (no API key required)
  Docs: https://open-meteo.com/
*/

const $ = (id) => document.getElementById(id);

const els = {
  form: $("searchForm"),
  cityInput: $("cityInput"),
  searchBtn: $("searchBtn"),
  status: $("status"),
  error: $("error"),
  placeName: $("placeName"),
  lastUpdated: $("lastUpdated"),
  iconWrap: $("iconWrap"),
  temp: $("temp"),
  tempFeels: $("tempFeels"),
  humidity: $("humidity"),
  wind: $("wind"),
  windDir: $("windDir"),
  conditions: $("conditions"),
  more: $("more")
};

function setStatus(message) {
  els.status.textContent = message ?? "";
}

function setError(message) {
  els.error.textContent = message ?? "";
}

function setLoading(isLoading) {
  els.searchBtn.disabled = isLoading;
  els.cityInput.disabled = isLoading;
}

function safeGet(obj, path, fallback = "—") {
  try {
    return path.split(".").reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj) ?? fallback;
  } catch {
    return fallback;
  }
}

function formatNumber(value, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  const n = Number(value);
  return n.toFixed(digits);
}

function directionFromDegrees(deg) {
  const d = Number(deg);
  if (!Number.isFinite(d)) return "—";
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const idx = Math.round(((d % 360) / 45)) % 8;
  return dirs[idx];
}

async function fetchJson(url, { signal, timeoutMs = 10000 } = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // If an upstream signal exists, respect cancellation.
  if (signal) {
    if (signal.aborted) {
      clearTimeout(timeoutId);
      throw new DOMException("Aborted", "AbortError");
    }
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "Accept": "application/json" },
      signal: controller.signal
    });

    if (!res.ok) {
      // Try to extract useful server message.
      let bodyText = "";
      try {
        bodyText = await res.text();
      } catch {}
      throw new Error(`Request failed: ${res.status} ${res.statusText}${bodyText ? ` - ${bodyText}` : ""}`);
    }

    return await res.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

async function geocodeCity(city, { signal } = {}) {
  // Open-Meteo geocoding endpoint
  // Example: https://geocoding-api.open-meteo.com/v1/search?name=London&count=1&language=en&format=json
  const q = encodeURIComponent(city.trim());
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${q}&count=1&language=en&format=json`;
  const data = await fetchJson(url, { signal, timeoutMs: 12000 });

  const results = data?.results;
  if (!Array.isArray(results) || results.length === 0) {
    throw new Error("No location found for that city name.");
  }

  const best = results[0];
  const name = best?.name ?? city.trim();
  const country = best?.country ?? "";

  return {
    name: country ? `${name}, ${country}` : name,
    latitude: best.latitude,
    longitude: best.longitude
  };
}

function pickCurrentHour(latestObj) {
  // latestObj is hourly/daily arrays; use the first element as 'current' for simplicity.
  return Array.isArray(latestObj) ? latestObj[0] : undefined;
}

function buildIcon(weatherCode) {
  // Open-Meteo weather codes mapping (partial, enough for dashboard)
  // https://open-meteo.com/en/docs
  const code = Number(weatherCode);
  if (!Number.isFinite(code)) return "🌤️";

  if (code === 0) return "☀️";
  if ([1, 2].includes(code)) return "🌤️";
  if (code === 3) return "☁️";
  if ([45, 48].includes(code)) return "🌫️";
  if ([51, 53, 55].includes(code)) return "🌦️";
  if ([56, 57].includes(code)) return "🌧️";
  if ([61, 63, 65].includes(code)) return "🌧️";
  if ([66, 67].includes(code)) return "🌨️";
  if ([71, 73, 75, 77].includes(code)) return "❄️";
  if ([80, 81, 82].includes(code)) return "🌧️";
  if (code >= 95) return "⛈️";
  return "🌦️";
}

function weatherDescriptionFromCode(code) {
  const c = Number(code);
  if (!Number.isFinite(c)) return "—";
  const map = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    56: "Light freezing drizzle",
    57: "Dense freezing drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    66: "Light freezing rain",
    67: "Heavy freezing rain",
    71: "Slight snow",
    73: "Moderate snow",
    75: "Heavy snow",
    77: "Snow grains",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    85: "Slight snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail"
  };
  return map[c] ?? "—";
}

async function fetchWeatherByCoords({ latitude, longitude, signal }) {
  // Open-Meteo weather endpoint
  // We'll fetch hourly values, using the first hour as 'current'.
  // Parameters: temperature_2m, relative_humidity_2m, wind_speed_10m, wind_direction_10m, weather_code, feels_like
  // Note: 'apparent_temperature' is available as 'apparent_temperature' (feels-like).
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", latitude);
  url.searchParams.set("longitude", longitude);
  url.searchParams.set("current", "temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code,apparent_temperature");
  url.searchParams.set("timezone", "auto");

  // Open-Meteo provides current weather in a compact structure.
  const data = await fetchJson(url.toString(), { signal, timeoutMs: 12000 });

  const current = data?.current;
  if (!current) throw new Error("Weather data is not available from the API response.");

  return current;
}

async function renderWeather(city) {
  const query = city.trim();
  if (!query) return;

  setError("");
  setStatus("Resolving location...");
  setLoading(true);

  const controller = new AbortController();

  try {
    const place = await geocodeCity(query, { signal: controller.signal });
    setStatus("Fetching live weather...");

    const current = await fetchWeatherByCoords({ latitude: place.latitude, longitude: place.longitude, signal: controller.signal });

    // last updated
    const time = current?.time ?? null;
    els.lastUpdated.textContent = time ? `Updated: ${time}` : "";

    els.placeName.textContent = place.name;

    const temperature = safeGet(current, "temperature_2m");
    const feelsLike = safeGet(current, "apparent_temperature");
    const humidity = safeGet(current, "relative_humidity_2m");
    const windSpeed = safeGet(current, "wind_speed_10m");
    const windDirDeg = safeGet(current, "wind_direction_10m");
    const weatherCode = safeGet(current, "weather_code");

    els.temp.textContent = `${formatNumber(temperature, 1)} °C`;
    els.tempFeels.textContent = `Feels like ${formatNumber(feelsLike, 1)} °C`;

    els.humidity.textContent = `${formatNumber(humidity, 0)} %`;

    els.wind.textContent = `${formatNumber(windSpeed, 1)} km/h`;
    els.windDir.textContent = `Direction: ${directionFromDegrees(windDirDeg)}`;

    els.conditions.textContent = weatherDescriptionFromCode(weatherCode);
    els.more.textContent = `Weather code: ${weatherCode}`;

    els.iconWrap.textContent = buildIcon(weatherCode);

    setStatus("Done.");
  } catch (err) {
    const msg = err?.name === "AbortError" ? "Request timed out. Please try again." : err?.message ?? "Unexpected error.";
    setError(msg);
    setStatus("");
  } finally {
    setLoading(false);
  }
}

els.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  await renderWeather(els.cityInput.value);
});

// Optional: load a default city on first visit.
const defaultCity = "London";
renderWeather(defaultCity);

