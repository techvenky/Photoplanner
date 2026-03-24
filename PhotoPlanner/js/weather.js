// ─── Weather & Sky Conditions ──────────────────────────────────────────────────
// Uses Open-Meteo (free, no API key) for temperature + cloud cover data.

// WMO weather code → human-readable description
function weatherCodeToDesc(code) {
  if (code === 0)          return 'Clear sky';
  if (code <= 2)           return 'Mainly clear';
  if (code === 3)          return 'Overcast';
  if (code <= 49)          return 'Fog';
  if (code <= 55)          return 'Drizzle';
  if (code <= 67)          return 'Rain';
  if (code <= 77)          return 'Snow';
  if (code <= 82)          return 'Rain showers';
  if (code <= 86)          return 'Snow showers';
  if (code <= 99)          return 'Thunderstorm';
  return 'Unknown';
}

function cloudCoverQuality(pct) {
  if (pct <= 10) return { stars: '⭐⭐⭐⭐⭐', label: 'Clear sky',     color: '#3fb950' };
  if (pct <= 25) return { stars: '⭐⭐⭐⭐',   label: 'Mostly clear', color: '#58a6ff' };
  if (pct <= 50) return { stars: '⭐⭐⭐',     label: 'Partly cloudy', color: '#e3b341' };
  if (pct <= 75) return { stars: '⭐⭐',       label: 'Mostly cloudy', color: '#f0883e' };
  return          { stars: '⭐',              label: 'Overcast',      color: '#da3633' };
}

async function fetchWeather(lat, lon) {
  // Clear stale data immediately so the card shows "Fetching…" instead of
  // the previous location's weather while the new request is in-flight.
  state.weather = null;
  _showWeatherLoading();

  const params = new URLSearchParams({
    latitude:         lat.toFixed(4),
    longitude:        lon.toFixed(4),
    current:          'temperature_2m,cloud_cover,weather_code',
    hourly:           'cloud_cover',
    daily:            'sunrise,sunset',   // high-accuracy sunrise/sunset for sun times tab
    temperature_unit: 'celsius',
    timezone:         'auto',
    forecast_days:    7,                  // 7 days covers near-future shoot planning
  });

  try {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // Build a date→localTimeString map for sunrise/sunset (e.g. {"2026-03-23":"2026-03-23T07:14"})
    const dailyDates   = data.daily?.time    || [];
    const dailySunrise = data.daily?.sunrise || [];
    const dailySunset  = data.daily?.sunset  || [];
    const sunriseMap   = Object.fromEntries(dailyDates.map((d, i) => [d, dailySunrise[i]]));
    const sunsetMap    = Object.fromEntries(dailyDates.map((d, i) => [d, dailySunset[i]]));

    state.weather = {
      temp:        data.current.temperature_2m,
      cloudCover:  data.current.cloud_cover,
      weatherCode: data.current.weather_code,
      hourlyCloud: data.hourly?.cloud_cover || [],
      hourlyTimes: data.hourly?.time || [],
      sunriseMap,  // date → "YYYY-MM-DDTHH:MM" in location's local timezone
      sunsetMap,
      fetchedAt:   Date.now(),
    };
  } catch (e) {
    console.warn('fetchWeather: failed to fetch weather data', e);
    state.weather = null;
  }

  updateWeatherDisplays();
}

function _showWeatherLoading() {
  const mw = document.getElementById('mw-weather');
  if (mw) mw.innerHTML = '<div class="text-secondary small">⏳ Fetching weather…</div>';
  const pl = document.getElementById('planner-weather');
  if (pl) pl.style.display = 'none';
}

// Called after fetchWeather() resolves and also when Milky Way tab is opened
function updateWeatherDisplays() {
  _updatePlannerWeather();
  _updateMilkyWayWeather();
}

// ─── Planner sidebar: compact weather chip ────────────────────────────────────
function _updatePlannerWeather() {
  const el = document.getElementById('planner-weather');
  if (!el) return;

  if (!state.weather) {
    el.style.display = 'none';
    return;
  }

  const w = state.weather;
  const q = cloudCoverQuality(w.cloudCover);
  const desc = weatherCodeToDesc(w.weatherCode);

  el.style.display = '';
  el.innerHTML = `
    <span class="weather-chip" title="${desc}">🌡 ${w.temp.toFixed(1)}°C</span>
    <span class="weather-chip" title="Cloud cover: ${w.cloudCover}%" style="color:${q.color}">
      ☁ ${w.cloudCover}%&nbsp;${q.label}
    </span>
  `;
}

// ─── Milky Way tab: full sky conditions card ──────────────────────────────────
function _updateMilkyWayWeather() {
  const el = document.getElementById('mw-weather');
  if (!el) return;

  if (!state.weather) {
    el.innerHTML = '<div class="text-secondary small">Set a location to fetch weather data.</div>';
    return;
  }

  const w = state.weather;
  const q = cloudCoverQuality(w.cloudCover);

  // Average cloud cover during night hours (20:00–05:00)
  let nightVals = [];
  w.hourlyTimes.forEach((t, i) => {
    const h = new Date(t).getHours();
    if (h >= 20 || h <= 5) nightVals.push(w.hourlyCloud[i]);
  });
  const nightAvg = nightVals.length
    ? Math.round(nightVals.reduce((a, b) => a + b, 0) / nightVals.length)
    : null;
  const nightQ = nightAvg !== null ? cloudCoverQuality(nightAvg) : null;

  el.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:0.25rem">
      <div class="time-row">
        <span class="info-label">🌡 Temperature</span>
        <span>${w.temp.toFixed(1)} °C</span>
      </div>
      <div class="time-row">
        <span class="info-label">☁ Cloud Cover Now</span>
        <span style="color:${q.color}">${w.cloudCover}% — ${q.label}</span>
      </div>
      ${nightQ ? `
      <div class="time-row">
        <span class="info-label">🌙 Tonight Avg Cloud</span>
        <span style="color:${nightQ.color}">${nightAvg}% — ${nightQ.label}</span>
      </div>` : ''}
      <div class="time-row">
        <span class="info-label">Sky Quality (now)</span>
        <span>${q.stars}</span>
      </div>
      <div class="time-row">
        <span class="info-label">Conditions</span>
        <span>${weatherCodeToDesc(w.weatherCode)}</span>
      </div>
      <div style="font-size:0.67rem;color:#484f58;margin-top:0.2rem">via Open-Meteo · updated on location change</div>
    </div>
  `;
}
