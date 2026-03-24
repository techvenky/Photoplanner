// ─── Utility helpers ──────────────────────────────────────────────────────────

function fmtTime(date) {
  if (!date || isNaN(date)) return '—';
  // Use selected timezone, or fall back to the auto-detected location timezone
  const tz = state.selectedTimezone || state.locationTz;
  if (typeof dayjs !== 'undefined' && tz) {
    try { return dayjs(date).tz(tz).format('h:mm A'); } catch(e) {
      console.warn('fmtTime: timezone conversion failed', e);
    }
  }
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Moon phase emoji shared across Sun & Moon tab and Alignment Finder
function moonPhaseEmoji(phase) {
  return ['🌑','🌒','🌓','🌔','🌕','🌖','🌗','🌘'][Math.round(phase * 8) % 8];
}

// Moon apparent diameter in metres at a given shooting distance
// Angular diameter ~0.5177°, half-angle ~0.004515 rad
function moonApparentSizeM(distKm) {
  return distKm * 1000 * 2 * Math.tan(0.004515);
}

// Smallest angular difference between two compass bearings (0–180°)
function circularAzDiff(a, b) {
  return Math.abs(((a - b + 180 + 360) % 360) - 180);
}

function fmtDuration(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

function deg(rad) { return (rad * 180 / Math.PI + 360) % 360; }
function toDeg(rad) { return rad * 180 / Math.PI; }

function showToast(msg, type = 'info') {
  const bg = { info: '#1f6feb', success: '#238636', warning: '#b08800', danger: '#da3633' }[type] || '#1f6feb';
  const el = document.createElement('div');
  el.style.cssText = `background:${bg};color:#fff;padding:0.6rem 1rem;border-radius:8px;font-size:0.84rem;box-shadow:0 4px 16px rgba(0,0,0,0.45);opacity:0;transition:opacity 0.2s;word-break:break-word;pointer-events:auto;max-width:300px;`;
  el.textContent = msg;
  const container = document.getElementById('toast-container');
  if (!container) { console.warn('showToast: #toast-container not found', msg); return; }
  container.appendChild(el);
  requestAnimationFrame(() => { el.style.opacity = '1'; });
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 250); }, 3500);
}

function minutesToAmPm(minutes) {
  const h24 = Math.floor(minutes / 60);
  const m   = minutes % 60;
  const period = h24 < 12 ? 'AM' : 'PM';
  const h12  = h24 % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function updateSliderDisplay() {
  const slider = document.getElementById('plan-time-slider');
  if (!slider) return;
  const minutes = parseInt(slider.value);
  const label   = minutesToAmPm(minutes);

  // #plan-time-display was moved out of the sidebar — guard in case it's absent
  const displayEl = document.getElementById('plan-time-display');
  if (displayEl) displayEl.textContent = label;

  const skyLabel = document.getElementById('sky-time-label');
  if (skyLabel) skyLabel.textContent = label;

  const skySlider = document.getElementById('sky-time-slider');
  if (skySlider) skySlider.value = minutes;

  // Keep the bottom bar label/status in sync
  const barLabel  = document.getElementById('map-time-bar-label');
  const barStatus = document.getElementById('map-time-bar-status');
  if (barLabel || barStatus) {
    if (typeof _updateBarLabel === 'function') {
      _updateBarLabel(barLabel, barStatus, minutes);
    } else if (barLabel) {
      barLabel.textContent = label;
    }
  }
}

// Returns icon distance in degrees that maps to ~90px at current zoom
function getAdaptiveDot() {
  const zoom = state.map ? state.map.getZoom() : 10;
  return 90 * 360 / (256 * Math.pow(2, zoom));
}

// Returns arc radius in degrees that maps to ~200px at current zoom (for sun/moon arc).
// Capped at 2° (~222 km) so the arc never dominates the screen when zoomed out.
function getAdaptiveArcR() {
  const zoom = state.map ? state.map.getZoom() : 8;
  const r = 200 * 360 / (256 * Math.pow(2, zoom));
  return Math.min(r, 2.0);
}

// Returns a ray length in degrees that extends well past the map viewport edges
function getAdaptiveRay() {
  if (!state.map) return 4.0;
  const b = state.map.getBounds();
  return Math.max(b.getNorth() - b.getSouth(), b.getEast() - b.getWest()) * 1.2;
}

function getSelectedDate() {
  const d = document.getElementById('plan-date').value;
  // Use UTC noon so SunCalc always gets the correct calendar day regardless of browser timezone
  return d ? new Date(d + 'T12:00:00Z') : new Date();
}

// Draw a polyline with a dark outline beneath for readability over map tiles
function addStrokedPolyline(points, opts, group) {
  L.polyline(points, {
    color: '#00000080',
    weight: (opts.weight || 2) + 3,
    opacity: (opts.opacity || 0.7) * 0.5,
    dashArray: null
  }).addTo(group);
  L.polyline(points, opts).addTo(group);
}
