// ─── Location ─────────────────────────────────────────────────────────────────

function setLocation(lat, lon, label) {
  state.currentLat = lat;
  state.currentLon = lon;

  if (state.marker) state.map.removeLayer(state.marker);
  state.marker = L.marker([lat, lon]).addTo(state.map);
  state.map.setView([lat, lon], state.map.getZoom() < 8 ? 10 : state.map.getZoom());

  const locStr = label || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  document.getElementById('sm-location-label').textContent = locStr;
  document.getElementById('mw-location-label').textContent = locStr;
  const searchEl = document.getElementById('location-search');
  if (searchEl) searchEl.value = locStr;

  invalidateTlCache(); // invalidate altitude cache for new location
  drawSunPath();
  updateSunMoon();
  updateMilkyWay();

  // Enable the Save Location button now that a location is set
  updateSaveBtnState();

  // Auto-detect local timezone + fetch weather for the new location
  autoDetectTimezone(lat, lon);
  fetchWeather(lat, lon);

  // Show timeline overlay when location is first set
  const overlay = document.getElementById('timeline-overlay');
  if (overlay && overlay.classList.contains('collapsed')) {
    overlay.classList.remove('collapsed');
    const tb = document.getElementById('tl-toggle');
    if (tb) tb.textContent = '▼';
    setTimeout(() => drawTimelineOverlay(false), 80);
  }
}

async function searchLocation() {
  const q = document.getElementById('location-search').value.trim();
  if (!q) return;
  if (q.length > 200) {
    showToast('Search query too long (max 200 characters).', 'warning');
    return;
  }
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`,
      { headers: { 'Accept': 'application/json', 'User-Agent': 'PhotoPlanner/1.0' } }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('Unexpected response');
    if (data.length) {
      const lat = parseFloat(data[0].lat);
      const lon = parseFloat(data[0].lon);
      if (!isFinite(lat) || !isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        showToast('Invalid coordinates in search result.', 'warning');
        return;
      }
      setLocation(lat, lon, data[0].display_name.split(',').slice(0, 2).join(','));
    } else {
      showToast('Location not found. Try a different search term.', 'warning');
    }
  } catch(e) { showToast('Search failed. Check internet connection.', 'danger'); }
}

async function autoDetectTimezone(lat, lon) {
  const sel = document.getElementById('timezone-select');

  // Immediately reset to browser local so a stale timezone from a previous
  // location is never shown while the API call is in-flight or if it fails.
  if (state._tzAutoDetected) {
    state.selectedTimezone = '';
    state._tzAutoDetected  = false;
    if (sel) {
      sel.value = '';
      document.getElementById('tz-offset-label').textContent = '';
    }
    updateSunMoon();
    updateMilkyWay();
  }

  try {
    const res = await fetch(
      `https://timeapi.io/api/timezone/coordinate?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}`
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const tz   = data.timeZone;
    if (!tz || typeof dayjs === 'undefined') return;

    state.selectedTimezone = tz;
    state._tzAutoDetected  = true;

    // Sync dropdown: find existing option or insert a dynamic one
    if (sel) {
      let opt = Array.from(sel.options).find(o => o.value === tz);
      if (!opt) {
        opt = new Option(tz, tz);
        sel.add(opt, 1); // insert at index 1 (just after "Local (Auto)"); appends if only one option
      }
      sel.value = tz;
      try {
        const now    = dayjs().tz(tz);
        const offset = now.utcOffset();
        const sign   = offset >= 0 ? '+' : '−';
        const absH   = Math.floor(Math.abs(offset) / 60);
        const absM   = Math.abs(offset) % 60;
        const offStr = `UTC${sign}${absH}${absM ? ':' + String(absM).padStart(2,'0') : ''}`;
        document.getElementById('tz-offset-label').textContent = `${offStr} · auto-detected`;
      } catch(e) { console.warn('autoDetectTimezone: offset formatting failed', e); }
    }

    // Refresh all time displays with the detected timezone
    updateSunMoon();
    updateMilkyWay();
    const tlOverlay = document.getElementById('timeline-overlay');
    if (tlOverlay && !tlOverlay.classList.contains('collapsed')) drawTimelineOverlay(false);
  } catch(e) {
    console.warn('autoDetectTimezone: API unavailable, using browser local timezone', e);
    // Browser local timezone is already active (reset above)
  }
}

function initLocationControls() {
  document.getElementById('search-btn').addEventListener('click', searchLocation);
  document.getElementById('location-search').addEventListener('keydown', e => {
    if (e.key === 'Enter') searchLocation();
  });

  // Use My Location buttons
  ['my-location-btn', 'sm-use-location', 'mw-use-location'].forEach(id => {
    document.getElementById(id).addEventListener('click', () => {
      if (!navigator.geolocation) { showToast('Geolocation not supported by this browser.', 'warning'); return; }
      navigator.geolocation.getCurrentPosition(
        pos => { setLocation(pos.coords.latitude, pos.coords.longitude, 'My Location'); },
        err => {
          const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent);
          const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
          let msg;
          if (err.code === 1) {
            msg = (isIOS || isSafari)
              ? 'Location denied. Go to Settings → Privacy → Location Services → Safari and allow access.'
              : 'Location denied. Allow access in your browser\'s site permissions and reload.';
          } else if (err.code === 2) {
            msg = 'Position unavailable. Ensure GPS/Wi-Fi is enabled and try again.';
          } else {
            msg = 'Location request timed out. Move to an area with better signal.';
          }
          showToast(msg, 'danger');
        },
        { timeout: 10000, maximumAge: 60000, enableHighAccuracy: false }
      );
    });
  });
}
