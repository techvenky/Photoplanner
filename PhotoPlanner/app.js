// ─── State ───────────────────────────────────────────────────────────────────
let map, marker;
let sunPathGroup, moonPathGroup, keyTimesGroup, timeIndicatorGroup, targetGroup, milkyWayGroup;
let currentLat = null, currentLon = null;
let targetLat = null, targetLon = null;
let targetMode = false;
let dateSliderAnchor = null; // ISO date string for pill center; null = use selected date
let activeTileLayer = null;
let labelsLayer = null;
let selectedTimezone = ''; // '' = local browser time

// ─── Day.js plugin init ───────────────────────────────────────────────────────
if (typeof dayjs !== 'undefined') {
  dayjs.extend(window.dayjs_plugin_utc);
  dayjs.extend(window.dayjs_plugin_timezone);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtTime(date) {
  if (!date || isNaN(date)) return '—';
  if (typeof dayjs !== 'undefined' && selectedTimezone) {
    try { return dayjs(date).tz(selectedTimezone).format('h:mm A'); } catch(e) {}
  }
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDuration(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

function deg(rad) { return (rad * 180 / Math.PI + 360) % 360; }
function toDeg(rad) { return rad * 180 / Math.PI; }

// ─── Tab Navigation ───────────────────────────────────────────────────────────
document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    if (tab.dataset.tab === 'planner' && map) setTimeout(() => map.invalidateSize(), 50);
  });
});

// ─── Calc Tabs ────────────────────────────────────────────────────────────────
document.querySelectorAll('.calc-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.calc-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.calc-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('calc-' + tab.dataset.calc).classList.add('active');
  });
});

// ─── Init Map ─────────────────────────────────────────────────────────────────
function initMap() {
  map = L.map('map').setView([40, -3], 4);

  // Tile layers — all free, no API key required
  const _street    = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>', maxZoom: 19 });
  const _satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: '© Esri World Imagery', maxZoom: 19 });
  const _terrain   = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { attribution: '© <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)', maxZoom: 17 });
  labelsLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { attribution: '', maxZoom: 19, opacity: 0.85 });
  window._mapTileLayers = { street: _street, satellite: _satellite, terrain: _terrain };

  activeTileLayer = _street;
  _street.addTo(map);

  document.querySelectorAll('.map-layer-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.map-layer-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setMapLayer(btn.dataset.layer);
    });
  });

  // Layer groups — order matters (arcs below, indicator on top)
  sunPathGroup       = L.layerGroup().addTo(map);
  moonPathGroup      = L.layerGroup().addTo(map);
  keyTimesGroup      = L.layerGroup().addTo(map);
  milkyWayGroup      = L.layerGroup().addTo(map);
  targetGroup        = L.layerGroup().addTo(map);
  timeIndicatorGroup = L.layerGroup().addTo(map);

  // Zoom: redraw time indicator at adaptive distance
  map.on('zoomend', () => { if (currentLat !== null) drawTimeIndicator(); });

  map.on('click', e => {
    if (targetMode) {
      setTarget(e.latlng.lat, e.latlng.lng);
    } else {
      setLocation(e.latlng.lat, e.latlng.lng);
    }
  });

  const today = new Date().toISOString().split('T')[0];
  document.getElementById('plan-date').value = today;
  document.getElementById('sm-date').value = today;
  document.getElementById('mw-date').value = today;

  // ── Flatpickr calendar date pickers ───────────────────────────────────────
  if (typeof flatpickr !== 'undefined') {
    const fpCfgBase = { dateFormat: 'Y-m-d', allowInput: true, disableMobile: false };

    window._fpPlan = flatpickr('#plan-date', {
      ...fpCfgBase,
      defaultDate: today,
      onChange(_dates, dateStr) {
        document.getElementById('sm-date').value = dateStr;
        document.getElementById('mw-date').value = dateStr;
        if (window._fpSM)  window._fpSM.setDate(dateStr, false);
        if (window._fpMW)  window._fpMW.setDate(dateStr, false);
        dateSliderAnchor = null;
        buildDateSlider();
        drawSunPath();
        if (targetLat !== null) updateTargetInfo();
        updateSunMoon();
        updateMilkyWay();
      }
    });

    window._fpSM = flatpickr('#sm-date', {
      ...fpCfgBase,
      defaultDate: today,
      onChange(_dates, dateStr) {
        document.getElementById('plan-date').value = dateStr;
        document.getElementById('mw-date').value   = dateStr;
        if (window._fpPlan) window._fpPlan.setDate(dateStr, false);
        if (window._fpMW)   window._fpMW.setDate(dateStr, false);
        updateSunMoon();
        updateMilkyWay();
        buildDateSlider();
      }
    });

    window._fpMW = flatpickr('#mw-date', {
      ...fpCfgBase,
      defaultDate: today,
      onChange(_dates, dateStr) {
        document.getElementById('plan-date').value = dateStr;
        document.getElementById('sm-date').value   = dateStr;
        if (window._fpPlan) window._fpPlan.setDate(dateStr, false);
        if (window._fpSM)   window._fpSM.setDate(dateStr, false);
        updateMilkyWay();
        updateSunMoon();
        buildDateSlider();
      }
    });
  }

  buildDateSlider();

  // Time slider wiring
  const slider = document.getElementById('plan-time-slider');
  slider.addEventListener('input', () => {
    document.getElementById('sky-time-slider').value = slider.value;
    updateSliderDisplay();
    drawTimeIndicator();
    drawSkyDomeIfOpen();
    // Redraw timeline cursor without expensive full re-render
    const overlay = document.getElementById('timeline-overlay');
    if (overlay && !overlay.classList.contains('collapsed')) {
      drawTimelineOverlay(false);
    }
  });

  // Sky modal slider — mirrors main slider
  document.getElementById('sky-time-slider').addEventListener('input', e => {
    document.getElementById('plan-time-slider').value = e.target.value;
    updateSliderDisplay();
    drawTimeIndicator();
    drawSkyDome();
  });

  updateSliderDisplay();
  _initTimelineInteraction();
  _initTimelineControls();
}

function setMapLayer(name) {
  const layers = window._mapTileLayers;
  if (!layers) return;
  if (activeTileLayer) map.removeLayer(activeTileLayer);
  if (labelsLayer && map.hasLayer(labelsLayer)) map.removeLayer(labelsLayer);
  if (name === 'hybrid') {
    activeTileLayer = layers.satellite;
    activeTileLayer.addTo(map);
    labelsLayer.addTo(map);
  } else {
    activeTileLayer = layers[name] || layers.street;
    activeTileLayer.addTo(map);
  }
}

function showToast(msg, type = 'info') {
  const bg = { info: '#1f6feb', success: '#238636', warning: '#b08800', danger: '#da3633' }[type] || '#1f6feb';
  const el = document.createElement('div');
  el.style.cssText = `background:${bg};color:#fff;padding:0.6rem 1rem;border-radius:8px;font-size:0.84rem;box-shadow:0 4px 16px rgba(0,0,0,0.45);opacity:0;transition:opacity 0.2s;word-break:break-word;pointer-events:auto;max-width:300px;`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
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
  const minutes = parseInt(document.getElementById('plan-time-slider').value);
  const label   = minutesToAmPm(minutes);
  document.getElementById('plan-time-display').textContent = label;
  document.getElementById('sky-time-label').textContent    = label;
  document.getElementById('sky-time-slider').value         = minutes;
}

// Returns icon distance in degrees that maps to ~90px at current zoom
function getAdaptiveDot() {
  const zoom = map ? map.getZoom() : 10;
  return 90 * 360 / (256 * Math.pow(2, zoom));
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

// ─── Target Point ─────────────────────────────────────────────────────────────
document.getElementById('target-mode-btn').addEventListener('click', () => {
  targetMode = !targetMode;
  const btn = document.getElementById('target-mode-btn');
  btn.classList.toggle('active', targetMode);
  btn.textContent = targetMode ? '🎯 Click map to place target…' : '🎯 Set Target (Click Map)';
  map.getContainer().style.cursor = targetMode ? 'crosshair' : '';
});

document.getElementById('clear-target-btn').addEventListener('click', () => {
  targetLat = targetLon = null;
  targetGroup.clearLayers();
  document.getElementById('target-info').style.display = 'none';
  document.getElementById('clear-target-btn').style.display = 'none';
  drawSkyDomeIfOpen();
});

function setTarget(lat, lon) {
  targetLat = lat;
  targetLon = lon;
  targetMode = false;
  const btn = document.getElementById('target-mode-btn');
  btn.classList.remove('active');
  btn.textContent = '🎯 Set Target (Click Map)';
  map.getContainer().style.cursor = '';
  document.getElementById('clear-target-btn').style.display = 'block';
  drawTargetOverlay();
  updateTargetInfo();
  drawSkyDomeIfOpen();
}

function drawTargetOverlay() {
  targetGroup.clearLayers();
  if (targetLat === null || currentLat === null) return;

  // Turf: buffer zone (500 m) around camera position — shows shooting radius
  if (typeof turf !== 'undefined') {
    const camPt   = turf.point([currentLon, currentLat]);
    const bufPoly = turf.buffer(camPt, 0.5, { units: 'kilometers' });
    const ring    = bufPoly.geometry.coordinates[0].map(c => [c[1], c[0]]);
    L.polygon(ring, {
      color: '#4fc3f7', weight: 1.2, opacity: 0.55,
      fillColor: '#4fc3f7', fillOpacity: 0.06, dashArray: '5 4'
    }).bindTooltip('500 m shooting radius', { sticky: true }).addTo(targetGroup);
  }

  // Target pin (red)
  const redIcon = L.divIcon({
    html: '<div style="width:14px;height:14px;background:#ff6b6b;border:2px solid #fff;border-radius:50%;box-shadow:0 0 6px #ff6b6b"></div>',
    className: '', iconAnchor: [7, 7]
  });
  L.marker([targetLat, targetLon], { icon: redIcon })
    .bindTooltip('Target', { permanent: true, direction: 'top', offset: [0, -8] })
    .addTo(targetGroup);

  // Line from camera to target
  L.polyline([[currentLat, currentLon], [targetLat, targetLon]], {
    color: '#ff6b6b', weight: 2, opacity: 0.8, dashArray: '6 4'
  }).addTo(targetGroup);
}

// ─── Geo helpers (Turf.js-powered with fallback) ──────────────────────────────
function calcBearing(lat1, lon1, lat2, lon2) {
  if (typeof turf !== 'undefined') {
    const b = turf.bearing(turf.point([lon1, lat1]), turf.point([lon2, lat2]));
    return (b + 360) % 360;
  }
  // Fallback haversine
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const rlat1 = lat1 * Math.PI / 180, rlat2 = lat2 * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(rlat2);
  const x = Math.cos(rlat1) * Math.sin(rlat2) - Math.sin(rlat1) * Math.cos(rlat2) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function calcDistanceKm(lat1, lon1, lat2, lon2) {
  if (typeof turf !== 'undefined') {
    return turf.distance(turf.point([lon1, lat1]), turf.point([lon2, lat2]), { units: 'kilometers' });
  }
  // Fallback haversine
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Find times today (and within 365 days) when sun/moon azimuth matches target bearing
function findAlignments(bearing, date) {
  const results = [];
  const tol = 0.8; // degrees tolerance

  for (let h = 0; h < 24; h += 0.05) {
    const d = new Date(date);
    d.setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0);
    const sunPos  = SunCalc.getPosition(d, currentLat, currentLon);
    const sunAz   = ((sunPos.azimuth + Math.PI) * 180 / Math.PI + 360) % 360;
    const angDiff = Math.abs(((sunAz - bearing + 180 + 360) % 360) - 180);
    if (angDiff < tol && sunPos.altitude > 0) {
      if (!results.find(r => r.type === 'Sun' && Math.abs(r.h - h) < 0.5)) {
        results.push({ type: 'Sun', time: d, az: sunAz, alt: toDeg(sunPos.altitude), h });
      }
    }
    const moonPos = SunCalc.getMoonPosition(d, currentLat, currentLon);
    const moonAz  = ((moonPos.azimuth + Math.PI) * 180 / Math.PI + 360) % 360;
    const mDiff   = Math.abs(((moonAz - bearing + 180 + 360) % 360) - 180);
    if (mDiff < tol && moonPos.altitude > 0) {
      if (!results.find(r => r.type === 'Moon' && Math.abs(r.h - h) < 0.5)) {
        results.push({ type: 'Moon', time: d, az: moonAz, alt: toDeg(moonPos.altitude), h });
      }
    }
  }
  return results;
}

function updateTargetInfo() {
  if (targetLat === null || currentLat === null) return;
  const bearing  = calcBearing(currentLat, currentLon, targetLat, targetLon);
  const distKm   = calcDistanceKm(currentLat, currentLon, targetLat, targetLon);
  const date     = getSelectedDate();
  const alignments = findAlignments(bearing, date);

  let html = `
    <div class="info-row"><span class="info-label">Bearing to Target</span><span class="info-val">${bearing.toFixed(1)}°</span></div>
    <div class="info-row"><span class="info-label">Distance</span><span class="info-val">${distKm < 1 ? (distKm*1000).toFixed(0)+'m' : distKm.toFixed(2)+'km'}</span></div>
    <div class="target-align-title">Alignments today</div>`;

  if (alignments.length === 0) {
    html += `<div class="align-none">No sun/moon alignment today.<br>Try nearby dates.</div>`;
  } else {
    alignments.forEach(a => {
      html += `<div class="align-row">
        <span class="align-icon">${a.type === 'Sun' ? '☀️' : '🌕'}</span>
        <span>${fmtTime(a.time)}</span>
        <span>Alt: ${a.alt.toFixed(1)}°</span>
      </div>`;
    });
  }

  const panel = document.getElementById('target-info');
  panel.innerHTML = html;
  panel.style.display = 'block';
}

// ─── Sky View Modal ───────────────────────────────────────────────────────────
document.getElementById('sky-view-btn').addEventListener('click', () => {
  document.getElementById('sky-modal').style.display = 'flex';
  drawSkyDome();
});
document.getElementById('sky-close-btn').addEventListener('click', () => {
  document.getElementById('sky-modal').style.display = 'none';
});
document.getElementById('sky-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('sky-modal'))
    document.getElementById('sky-modal').style.display = 'none';
});

function drawSkyDomeIfOpen() {
  if (document.getElementById('sky-modal').style.display !== 'none') drawSkyDome();
}

function drawSkyDome() {
  if (currentLat === null) {
    document.getElementById('sky-info').textContent = 'Set a location on the map first.';
    return;
  }

  const canvas = document.getElementById('sky-canvas');
  const ctx    = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2;
  const R  = Math.min(W, H) / 2 - 28; // horizon radius in px

  ctx.clearRect(0, 0, W, H);

  // Sky background
  const skyGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  skyGrad.addColorStop(0,   '#0a1628');
  skyGrad.addColorStop(0.7, '#0f2a45');
  skyGrad.addColorStop(1,   '#1a3d55');
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = skyGrad;
  ctx.fill();

  // Altitude rings: 15°, 30°, 45°, 60°, 75°
  [15, 30, 45, 60, 75].forEach(alt => {
    const r = R * (1 - alt / 90);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(alt + '°', cx + r + 3, cy);
  });

  // Horizon ring
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Cardinal tick lines
  for (let az = 0; az < 360; az += 10) {
    const a = (az - 90) * Math.PI / 180;
    const inner = az % 90 === 0 ? R - 14 : az % 30 === 0 ? R - 8 : R - 4;
    ctx.beginPath();
    ctx.moveTo(cx + inner * Math.cos(a), cy + inner * Math.sin(a));
    ctx.lineTo(cx + R     * Math.cos(a), cy + R     * Math.sin(a));
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Cardinal labels
  [['N','#ff5555',0],['NE','#aaa',45],['E','#ccc',90],['SE','#aaa',135],
   ['S','#ccc',180],['SW','#aaa',225],['W','#ccc',270],['NW','#aaa',315]].forEach(([label, color, az]) => {
    if (label.length > 1 && az % 90 !== 0) {
      // only draw intercardinals at larger size
    }
    const a = (az - 90) * Math.PI / 180;
    const dist = R + 16;
    ctx.fillStyle = color;
    ctx.font = az % 90 === 0 ? 'bold 13px sans-serif' : '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx + dist * Math.cos(a), cy + dist * Math.sin(a));
  });

  // Helper: az (0=N, CW), alt (0=horizon, 90=zenith) → canvas [x,y]
  function skyXY(azDeg, altDeg) {
    const r = R * (1 - Math.max(altDeg, 0) / 90);
    const a = (azDeg - 90) * Math.PI / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  }

  const date = getSelectedDate();
  const minutes = parseInt(document.getElementById('plan-time-slider').value);
  const dt = getDateAtMinutes(minutes);

  // Sun arc
  const sunArcPts = [];
  for (let h = 0; h <= 24; h += 0.1) {
    const d = new Date(date);
    d.setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0);
    const pos   = SunCalc.getPosition(d, currentLat, currentLon);
    const azDeg = ((pos.azimuth + Math.PI) * 180 / Math.PI + 360) % 360;
    const altDeg = toDeg(pos.altitude);
    if (altDeg > -2) sunArcPts.push(skyXY(azDeg, Math.max(altDeg, 0)));
  }
  if (sunArcPts.length > 1) {
    ctx.beginPath();
    ctx.moveTo(sunArcPts[0][0], sunArcPts[0][1]);
    sunArcPts.forEach(p => ctx.lineTo(p[0], p[1]));
    ctx.strokeStyle = 'rgba(227,179,65,0.55)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Moon arc
  const moonArcPts = [];
  for (let h = 0; h <= 24; h += 0.2) {
    const d = new Date(date);
    d.setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0);
    const pos   = SunCalc.getMoonPosition(d, currentLat, currentLon);
    const azDeg = ((pos.azimuth + Math.PI) * 180 / Math.PI + 360) % 360;
    const altDeg = toDeg(pos.altitude);
    if (altDeg > -2) moonArcPts.push(skyXY(azDeg, Math.max(altDeg, 0)));
  }
  if (moonArcPts.length > 1) {
    ctx.beginPath();
    ctx.moveTo(moonArcPts[0][0], moonArcPts[0][1]);
    moonArcPts.forEach(p => ctx.lineTo(p[0], p[1]));
    ctx.strokeStyle = 'rgba(168,216,234,0.5)';
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Key-time labels on sun arc
  const times = SunCalc.getTimes(date, currentLat, currentLon);
  const keyEvts = [
    { t: times.sunrise, label: '☀️', color: '#e3b341' },
    { t: times.sunset,  label: '🌅', color: '#f78166' },
    { t: times.goldenHour,    label: '🌟', color: '#f0a500' },
    { t: times.goldenHourEnd, label: '🌟', color: '#f0a500' },
  ];
  keyEvts.forEach(({ t, label }) => {
    if (!t || isNaN(t)) return;
    const pos   = SunCalc.getPosition(t, currentLat, currentLon);
    const azDeg = ((pos.azimuth + Math.PI) * 180 / Math.PI + 360) % 360;
    const altDeg = toDeg(pos.altitude);
    if (altDeg < -3) return;
    const [x, y] = skyXY(azDeg, Math.max(altDeg, 0));
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y);
  });

  // Target bearing line
  if (targetLat !== null) {
    const bearing = calcBearing(currentLat, currentLon, targetLat, targetLon);
    const a = (bearing - 90) * Math.PI / 180;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a));
    ctx.strokeStyle = '#ff6b6b';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    // Label at horizon
    ctx.fillStyle = '#ff6b6b';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('TARGET', cx + (R + 0) * Math.cos(a) * 0.9, cy + (R + 0) * Math.sin(a) * 0.9);
  }

  // Current sun position
  const sunPos = SunCalc.getPosition(dt, currentLat, currentLon);
  const sunAzDeg  = ((sunPos.azimuth  + Math.PI) * 180 / Math.PI + 360) % 360;
  const sunAltDeg = toDeg(sunPos.altitude);
  if (sunAltDeg > -5) {
    const [sx, sy] = skyXY(sunAzDeg, Math.max(sunAltDeg, 0));
    if (sunAltDeg > 0) {
      const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 18);
      glow.addColorStop(0,   'rgba(255,230,80,0.6)');
      glow.addColorStop(1,   'rgba(255,230,80,0)');
      ctx.beginPath(); ctx.arc(sx, sy, 18, 0, Math.PI*2);
      ctx.fillStyle = glow; ctx.fill();
    }
    ctx.font = '22px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('☀️', sx, sy);
  }

  // Current moon position
  const moonPos = SunCalc.getMoonPosition(dt, currentLat, currentLon);
  const moonAzDeg  = ((moonPos.azimuth  + Math.PI) * 180 / Math.PI + 360) % 360;
  const moonAltDeg = toDeg(moonPos.altitude);
  if (moonAltDeg > -5) {
    const [mx, my] = skyXY(moonAzDeg, Math.max(moonAltDeg, 0));
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🌕', mx, my);
  }

  // Milky Way galactic centre arc + current position
  const mwArcPts = [];
  for (let h = 0; h <= 24; h += 0.2) {
    const d = new Date(date);
    d.setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0);
    const sunAlt2 = toDeg(SunCalc.getPosition(d, currentLat, currentLon).altitude);
    const mwp = getGalacticCenterPos(d, currentLat, currentLon);
    if (sunAlt2 < -12 && mwp.altitude > 0)
      mwArcPts.push(skyXY(mwp.azimuth_north_deg, toDeg(mwp.altitude)));
  }
  if (mwArcPts.length > 1) {
    ctx.beginPath();
    ctx.moveTo(mwArcPts[0][0], mwArcPts[0][1]);
    mwArcPts.forEach(p => ctx.lineTo(p[0], p[1]));
    ctx.strokeStyle = 'rgba(198,120,221,0.6)';
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // Current galactic centre
  const mwNow = getGalacticCenterPos(dt, currentLat, currentLon);
  const sunAltNow = toDeg(SunCalc.getPosition(dt, currentLat, currentLon).altitude);
  if (mwNow.altitude > 0 && sunAltNow < -12) {
    const [gx, gy] = skyXY(mwNow.azimuth_north_deg, toDeg(mwNow.altitude));
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🌌', gx, gy);
  }

  // Zenith dot
  ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI*2);
  ctx.fillStyle = '#ffffff50'; ctx.fill();

  // Info text below canvas
  const mwAzDeg  = mwNow.azimuth_north_deg.toFixed(1);
  const mwAltDeg = toDeg(mwNow.altitude).toFixed(1);
  const infoEl = document.getElementById('sky-info');
  infoEl.innerHTML = `
    <div>☀️ Az: ${sunAzDeg.toFixed(1)}° / Alt: ${sunAltDeg.toFixed(1)}°</div>
    <div>🌕 Az: ${moonAzDeg.toFixed(1)}° / Alt: ${moonAltDeg.toFixed(1)}°</div>
    <div>🌌 Galactic Centre: Az ${mwAzDeg}° / Alt ${mwAltDeg}°</div>
    ${targetLat ? `<div>🎯 Target bearing: ${calcBearing(currentLat,currentLon,targetLat,targetLon).toFixed(1)}°</div>` : ''}
  `;
}

// ─── Timezone auto-detection ──────────────────────────────────────────────────
async function autoDetectTimezone(lat, lon) {
  try {
    const res  = await fetch(
      `https://timeapi.io/api/TimeZone/coordinate?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}`
    );
    const data = await res.json();
    const tz   = data.timeZone;
    if (!tz || typeof dayjs === 'undefined') return;

    selectedTimezone = tz;

    // Sync dropdown: find existing option or insert a dynamic one
    const sel = document.getElementById('timezone-select');
    if (sel) {
      let opt = Array.from(sel.options).find(o => o.value === tz);
      if (!opt) {
        opt = new Option(tz, tz);
        sel.insertBefore(opt, sel.options[1]); // just after "Local (Auto)"
      }
      sel.value = tz;
      // Update UTC offset label
      try {
        const now    = dayjs().tz(tz);
        const offset = now.utcOffset();
        const sign   = offset >= 0 ? '+' : '−';
        const absH   = Math.floor(Math.abs(offset) / 60);
        const absM   = Math.abs(offset) % 60;
        const offStr = `UTC${sign}${absH}${absM ? ':' + String(absM).padStart(2,'0') : ''}`;
        document.getElementById('tz-offset-label').textContent = `${offStr} · auto-detected`;
      } catch(_) {}
    }

    // Refresh all time displays with new timezone
    updateSunMoon();
    updateMilkyWay();
    const tlOverlay = document.getElementById('timeline-overlay');
    if (tlOverlay && !tlOverlay.classList.contains('collapsed')) drawTimelineOverlay(false);
  } catch(_) {
    // Silently ignore — times will show in browser local timezone
  }
}

function setLocation(lat, lon, label) {
  currentLat = lat;
  currentLon = lon;

  if (marker) map.removeLayer(marker);
  marker = L.marker([lat, lon]).addTo(map);
  map.setView([lat, lon], map.getZoom() < 8 ? 10 : map.getZoom());

  const locStr = label || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  document.getElementById('sm-location-label').textContent = locStr;
  document.getElementById('mw-location-label').textContent = locStr;

  _tlDate = null; // invalidate altitude cache for new location
  drawSunPath();
  updateSunMoon();
  updateMilkyWay();

  // Auto-detect local timezone for the new location
  autoDetectTimezone(lat, lon);

  // Show timeline overlay when location is first set
  const overlay = document.getElementById('timeline-overlay');
  if (overlay && overlay.classList.contains('collapsed')) {
    overlay.classList.remove('collapsed');
    const tb = document.getElementById('tl-toggle');
    if (tb) tb.textContent = '▼';
    setTimeout(() => drawTimelineOverlay(false), 80);
  }
}

// ─── Location Search ──────────────────────────────────────────────────────────
document.getElementById('search-btn').addEventListener('click', searchLocation);
document.getElementById('location-search').addEventListener('keydown', e => {
  if (e.key === 'Enter') searchLocation();
});

async function searchLocation() {
  const q = document.getElementById('location-search').value.trim();
  if (!q) return;
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`);
    const data = await res.json();
    if (data.length) {
      setLocation(parseFloat(data[0].lat), parseFloat(data[0].lon), data[0].display_name.split(',').slice(0,2).join(','));
    } else {
      showToast('Location not found. Try a different search term.', 'warning');
    }
  } catch(e) { showToast('Search failed. Check internet connection.', 'danger'); }
}

// Use My Location buttons
['my-location-btn', 'sm-use-location', 'mw-use-location'].forEach(id => {
  document.getElementById(id).addEventListener('click', () => {
    if (!navigator.geolocation) { showToast('Geolocation not supported by this browser.', 'warning'); return; }
    navigator.geolocation.getCurrentPosition(pos => {
      setLocation(pos.coords.latitude, pos.coords.longitude, 'My Location');
    }, () => showToast('Could not get location. Check browser permissions.', 'danger'));
  });
});

// ─── Planner Info Panel ───────────────────────────────────────────────────────
function getSelectedDate() {
  const d = document.getElementById('plan-date').value;
  return d ? new Date(d + 'T12:00:00') : new Date();
}

document.getElementById('plan-date').addEventListener('change', () => {
  _tlDate = null; // invalidate altitude cache
  dateSliderAnchor = null;
  buildDateSlider();
  drawSunPath();
  if (targetLat !== null) updateTargetInfo();
  // Keep Sun & Moon and Milky Way tabs in sync
  const d = document.getElementById('plan-date').value;
  document.getElementById('sm-date').value = d;
  document.getElementById('mw-date').value = d;
  updateSunMoon();
  updateMilkyWay();
});
document.getElementById('show-sun').addEventListener('change', drawSunPath);
document.getElementById('show-moon').addEventListener('change', drawSunPath);
document.getElementById('show-golden').addEventListener('change', drawSunPath);
document.getElementById('show-milkyway').addEventListener('change', drawSunPath);

// ─── Date Slider ──────────────────────────────────────────────────────────────
function buildDateSlider() {
  const selectedDate = document.getElementById('plan-date').value;
  const anchor = dateSliderAnchor || selectedDate || new Date().toISOString().split('T')[0];
  const anchorDate = new Date(anchor + 'T12:00:00');
  const today = new Date().toISOString().split('T')[0];
  const container = document.getElementById('date-pills');
  container.innerHTML = '';

  for (let i = -3; i <= 3; i++) {
    const d = new Date(anchorDate);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    const dayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

    const pill = document.createElement('button');
    pill.className = 'date-pill';
    if (dateStr === selectedDate) pill.classList.add('active');
    if (dateStr === today) pill.classList.add('today');
    pill.innerHTML = `<span class="date-pill-day">${dayNames[d.getDay()]}</span><span class="date-pill-num">${d.getDate()}</span>`;
    pill.addEventListener('click', () => {
      document.getElementById('plan-date').value = dateStr;
      document.getElementById('sm-date').value   = dateStr;
      document.getElementById('mw-date').value   = dateStr;
      if (window._fpPlan) window._fpPlan.setDate(dateStr, false);
      if (window._fpSM)   window._fpSM.setDate(dateStr, false);
      if (window._fpMW)   window._fpMW.setDate(dateStr, false);
      dateSliderAnchor = null;
      buildDateSlider();
      drawSunPath();
      if (targetLat !== null) updateTargetInfo();
      updateSunMoon();
      updateMilkyWay();
    });
    container.appendChild(pill);
  }
}

document.getElementById('date-prev-week').addEventListener('click', () => {
  const anchor = dateSliderAnchor || document.getElementById('plan-date').value || new Date().toISOString().split('T')[0];
  const d = new Date(anchor + 'T12:00:00');
  d.setDate(d.getDate() - 7);
  dateSliderAnchor = d.toISOString().split('T')[0];
  buildDateSlider();
});

document.getElementById('date-next-week').addEventListener('click', () => {
  const anchor = dateSliderAnchor || document.getElementById('plan-date').value || new Date().toISOString().split('T')[0];
  const d = new Date(anchor + 'T12:00:00');
  d.setDate(d.getDate() + 7);
  dateSliderAnchor = d.toISOString().split('T')[0];
  buildDateSlider();
});

// ─── Galactic Centre ──────────────────────────────────────────────────────────
// Galactic centre: RA 266.405°, Dec −29.008°
function getGalacticCenterPos(date, lat, lon) {
  const RA  = 266.405 * Math.PI / 180;
  const DEC = -29.0078 * Math.PI / 180;
  const latr = lat * Math.PI / 180;

  const JD = date.getTime() / 86400000 + 2440587.5;
  const D  = JD - 2451545.0;
  // Greenwich Mean Sidereal Time → Local Sidereal Time (radians)
  const LST = ((280.46061837 + 360.98564736629 * D) + lon) * Math.PI / 180;
  const HA  = LST - RA;

  const sinAlt = Math.sin(DEC) * Math.sin(latr) + Math.cos(DEC) * Math.cos(latr) * Math.cos(HA);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));

  // North-based clockwise azimuth
  const cosAz = (Math.sin(DEC) - Math.sin(alt) * Math.sin(latr)) / (Math.cos(alt) * Math.cos(latr));
  let az_north = Math.acos(Math.max(-1, Math.min(1, cosAz)));
  if (Math.sin(HA) > 0) az_north = 2 * Math.PI - az_north;

  // Convert to SunCalc convention (from south, positive westward)
  return { altitude: alt, azimuth: az_north - Math.PI, azimuth_north_deg: az_north * 180 / Math.PI };
}

// ─── Sun/Moon Path on Map ─────────────────────────────────────────────────────
// SunCalc azimuth: radians from south, positive westward.
// lat/lon offset: lat -= cos(az)*R,  lon -= sin(az)*R
function azToLatLon(az, r) {
  return [currentLat - r * Math.cos(az), currentLon - r * Math.sin(az)];
}

function getDateAtMinutes(minutes) {
  const base = getSelectedDate();
  const dt = new Date(base);
  dt.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return dt;
}

// Draws the static full-day arc + key-time markers. Called on date/location change.
function drawSunPath() {
  if (currentLat === null) return;
  sunPathGroup.clearLayers();
  moonPathGroup.clearLayers();
  keyTimesGroup.clearLayers();
  milkyWayGroup.clearLayers();

  const date = getSelectedDate();
  const R = 1.5; // arc radius in degrees

  if (document.getElementById('show-sun').checked) {
    // Full-day arc
    const sunPoints = [];
    for (let h = 0; h <= 24; h += 0.1) {
      const d = new Date(date);
      d.setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0);
      const pos = SunCalc.getPosition(d, currentLat, currentLon);
      if (pos.altitude > 0) sunPoints.push(azToLatLon(pos.azimuth, R));
    }
    if (sunPoints.length > 1) {
      addStrokedPolyline(sunPoints, { color: '#e3b341', weight: 2.5, opacity: 0.85 }, sunPathGroup);
    }

    // Key-time markers + dashed direction lines
    if (document.getElementById('show-golden').checked) {
      const times = SunCalc.getTimes(date, currentLat, currentLon);
      const keyEvents = [
        { t: times.sunrise,      color: '#e3b341', label: '☀️ Sunrise' },
        { t: times.sunset,       color: '#f78166', label: '🌅 Sunset' },
        { t: times.goldenHour,   color: '#f0a500', label: '🌟 Golden Hour AM' },
        { t: times.goldenHourEnd,color: '#f0a500', label: '🌟 Golden Hour PM' },
        { t: times.dawn,         color: '#58a6ff', label: '🔵 Blue Hour AM' },
        { t: times.dusk,         color: '#58a6ff', label: '🔵 Blue Hour PM' },
      ];
      keyEvents.forEach(({ t, color, label }) => {
        if (!t || isNaN(t)) return;
        const pos = SunCalc.getPosition(t, currentLat, currentLon);
        const pt = azToLatLon(pos.azimuth, R);
        // Dashed line from location pin to arc
        L.polyline([[currentLat, currentLon], pt], {
          color, weight: 1.5, opacity: 0.5, dashArray: '5 5'
        }).addTo(keyTimesGroup);
        // Dot on arc
        L.circleMarker(pt, { color, fillColor: color, fillOpacity: 1, radius: 5, weight: 2 })
          .bindTooltip(`${label}: ${fmtTime(t)}`, { sticky: true })
          .addTo(keyTimesGroup);
      });
    }
  }

  if (document.getElementById('show-moon').checked) {
    const moonPoints = [];
    for (let h = 0; h <= 24; h += 0.25) {
      const d = new Date(date);
      d.setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0);
      const pos = SunCalc.getMoonPosition(d, currentLat, currentLon);
      if (pos.altitude > 0) moonPoints.push(azToLatLon(pos.azimuth, R * 0.75));
    }
    if (moonPoints.length > 1) {
      addStrokedPolyline(moonPoints, { color: '#a8d8ea', weight: 2, opacity: 0.8, dashArray: '6 4' }, moonPathGroup);
    }
  }

  // Milky Way galactic centre arc (visible during astronomical night)
  if (document.getElementById('show-milkyway').checked) {
    const date = getSelectedDate();
    const times = SunCalc.getTimes(date, currentLat, currentLon);
    const mwPoints = [];
    let gcPeak = null; // { point, alt, time } — highest altitude GC moment during night
    for (let h = 0; h <= 24; h += 0.1) {
      const d = new Date(date);
      d.setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0);
      const sunPos = SunCalc.getPosition(d, currentLat, currentLon);
      const mwPos  = getGalacticCenterPos(d, currentLat, currentLon);
      if (toDeg(sunPos.altitude) < -12 && mwPos.altitude > 0) {
        const pt = azToLatLon(mwPos.azimuth, R);
        mwPoints.push(pt);
        const altDeg = toDeg(mwPos.altitude);
        if (!gcPeak || altDeg > gcPeak.alt) gcPeak = { pt, alt: altDeg, az: mwPos.azimuth_north_deg, time: d };
      }
    }

    if (mwPoints.length > 1) {
      // Outer glow band
      L.polyline(mwPoints, { color: '#c678dd', weight: 18, opacity: 0.08 }).addTo(milkyWayGroup);
      // Mid glow
      L.polyline(mwPoints, { color: '#c678dd', weight: 8,  opacity: 0.18 }).addTo(milkyWayGroup);
      // Core line
      L.polyline(mwPoints, { color: '#e2b3ff', weight: 2.5, opacity: 0.85, dashArray: '6 3' }).addTo(milkyWayGroup);
    }

    // Galactic core marker at peak altitude
    if (gcPeak) {
      // Direction ray to peak
      L.polyline([[currentLat, currentLon], gcPeak.pt], {
        color: '#c678dd', weight: 1.5, opacity: 0.45, dashArray: '5 4'
      }).addTo(milkyWayGroup);

      // Glowing core icon
      const gcIcon = L.divIcon({
        html: `<div style="position:relative;width:36px;height:36px">
          <div style="position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle,rgba(198,120,221,0.55) 0%,rgba(198,120,221,0) 70%)"></div>
          <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:18px;line-height:1;filter:drop-shadow(0 0 6px #c678dd)">🌌</div>
        </div>`,
        className: '',
        iconAnchor: [18, 18]
      });
      L.marker(gcPeak.pt, { icon: gcIcon })
        .bindTooltip(`🌌 Galactic Core Peak<br>Alt: ${gcPeak.alt.toFixed(1)}°  Az: ${gcPeak.az.toFixed(1)}°<br>${fmtTime(gcPeak.time)}`, { sticky: true })
        .addTo(milkyWayGroup);
    }

    // Rise / set boundary markers
    [times.night, times.nightEnd].forEach((t, idx) => {
      if (!t || isNaN(t)) return;
      const mwPos = getGalacticCenterPos(t, currentLat, currentLon);
      if (mwPos.altitude > 0) {
        const pt = azToLatLon(mwPos.azimuth, R);
        L.circleMarker(pt, { color: '#c678dd', fillColor: '#c678dd', fillOpacity: 0.8, radius: 5, weight: 1.5 })
          .bindTooltip(`🌌 ${idx === 0 ? 'Astro Night Start' : 'Astro Night End'}: ${fmtTime(t)}`)
          .addTo(milkyWayGroup);
      }
    });
  }

  drawTimeIndicator();
}

// Draws the moving direction ray + position marker at the selected time.
function drawTimeIndicator() {
  if (currentLat === null) return;
  timeIndicatorGroup.clearLayers();

  const minutes = parseInt(document.getElementById('plan-time-slider').value);
  const dt = getDateAtMinutes(minutes);
  const RAY = 4.0;           // ray extends well off-screen
  const DOT = getAdaptiveDot(); // scales with zoom so icon stays ~90px from pin

  function drawRay(pos, color, emoji, name) {
    const az = pos.azimuth;
    const isAboveHorizon = pos.altitude > 0;
    const opacity = isAboveHorizon ? 0.95 : 0.35;
    const endPt = azToLatLon(az, RAY);
    const dotPt = azToLatLon(az, DOT);

    // Direction ray from pin (with dark outline)
    addStrokedPolyline([[currentLat, currentLon], endPt], {
      color, weight: 3, opacity,
      dashArray: isAboveHorizon ? null : '8 6'
    }, timeIndicatorGroup);

    // Emoji marker at fixed distance
    const icon = L.divIcon({
      html: `<div style="font-size:22px;line-height:1;filter:drop-shadow(0 0 4px ${color})">${emoji}</div>`,
      className: '',
      iconAnchor: [11, 11]
    });
    const azDeg = ((az + Math.PI) * 180 / Math.PI + 360) % 360;
    const altDeg = toDeg(pos.altitude).toFixed(1);
    L.marker(dotPt, { icon })
      .bindTooltip(`${name}<br>Az: ${azDeg.toFixed(1)}°  Alt: ${altDeg}°<br>${isAboveHorizon ? 'Above horizon' : 'Below horizon'}`, { sticky: true })
      .addTo(timeIndicatorGroup);
  }

  if (document.getElementById('show-sun').checked) {
    const sunPos = SunCalc.getPosition(dt, currentLat, currentLon);
    drawRay(sunPos, '#e3b341', '☀️', 'Sun');
  }
  if (document.getElementById('show-moon').checked) {
    const moonPos = SunCalc.getMoonPosition(dt, currentLat, currentLon);
    drawRay(moonPos, '#a8d8ea', '🌕', 'Moon');
  }
  if (document.getElementById('show-milkyway').checked) {
    const mwPos    = getGalacticCenterPos(dt, currentLat, currentLon);
    const sunAltNow = toDeg(SunCalc.getPosition(dt, currentLat, currentLon).altitude);
    if (sunAltNow < -12 && mwPos.altitude > 0) {
      const az = mwPos.azimuth;
      const dotPt = azToLatLon(az, getAdaptiveDot());
      const endPt = azToLatLon(az, 4.0);
      // Glow band ray
      L.polyline([[currentLat, currentLon], endPt], { color: '#c678dd', weight: 10, opacity: 0.12 }).addTo(timeIndicatorGroup);
      L.polyline([[currentLat, currentLon], endPt], { color: '#c678dd', weight: 4,  opacity: 0.35 }).addTo(timeIndicatorGroup);
      L.polyline([[currentLat, currentLon], endPt], { color: '#e2b3ff', weight: 1.5, opacity: 0.9 }).addTo(timeIndicatorGroup);
      // Glowing core icon
      const gcIcon = L.divIcon({
        html: `<div style="position:relative;width:40px;height:40px">
          <div style="position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle,rgba(198,120,221,0.6) 0%,rgba(198,120,221,0) 70%);animation:mw-pulse 2s ease-in-out infinite"></div>
          <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:20px;filter:drop-shadow(0 0 8px #c678dd)">🌌</div>
        </div>`,
        className: '',
        iconAnchor: [20, 20]
      });
      const azDeg = mwPos.azimuth_north_deg.toFixed(1);
      const altDeg = toDeg(mwPos.altitude).toFixed(1);
      L.marker(dotPt, { icon: gcIcon })
        .bindTooltip(`🌌 Galactic Core<br>Az: ${azDeg}°  Alt: ${altDeg}°`, { sticky: true })
        .addTo(timeIndicatorGroup);
    }
  }

  updatePlannerInfo(dt);
}

function updatePlannerInfo(dt) {
  if (currentLat === null) return;
  const date = getSelectedDate();
  const times = SunCalc.getTimes(date, currentLat, currentLon);
  const moonTimes = SunCalc.getMoonTimes(date, currentLat, currentLon);

  const targetDt = dt || getDateAtMinutes(parseInt(document.getElementById('plan-time-slider').value));
  const sunPos  = SunCalc.getPosition(targetDt, currentLat, currentLon);
  const moonPos = SunCalc.getMoonPosition(targetDt, currentLat, currentLon);
  const sunAzDeg  = ((sunPos.azimuth  + Math.PI) * 180 / Math.PI + 360) % 360;
  const moonAzDeg = ((moonPos.azimuth + Math.PI) * 180 / Math.PI + 360) % 360;

  // Determine sun status at selected time
  const sunStatus = sunPos.altitude > 0 ? '☀️ Above horizon'
    : toDeg(sunPos.altitude) > -6  ? '🌅 Civil twilight'
    : toDeg(sunPos.altitude) > -12 ? '🌆 Nautical twilight'
    : toDeg(sunPos.altitude) > -18 ? '🌃 Astronomical twilight'
    : '🌑 Night';
  document.getElementById('plan-time-status').textContent = sunStatus;

  const panel = document.getElementById('planner-info');
  panel.innerHTML = `
    <div class="info-row"><span class="info-label">☀️ Sun Az</span><span class="info-val">${sunAzDeg.toFixed(1)}°</span></div>
    <div class="info-row"><span class="info-label">☀️ Sun Alt</span><span class="info-val">${toDeg(sunPos.altitude).toFixed(1)}°</span></div>
    <div class="info-row"><span class="info-label">🌕 Moon Az</span><span class="info-val">${moonAzDeg.toFixed(1)}°</span></div>
    <div class="info-row"><span class="info-label">🌕 Moon Alt</span><span class="info-val">${toDeg(moonPos.altitude).toFixed(1)}°</span></div>
    <hr style="border-color:#30363d;margin:0.4rem 0"/>
    <div class="info-row"><span class="info-label">Sunrise</span><span class="info-val">${fmtTime(times.sunrise)}</span></div>
    <div class="info-row"><span class="info-label">Sunset</span><span class="info-val">${fmtTime(times.sunset)}</span></div>
    <div class="info-row"><span class="info-label">Golden AM</span><span class="info-val">${fmtTime(times.goldenHourEnd)}</span></div>
    <div class="info-row"><span class="info-label">Golden PM</span><span class="info-val">${fmtTime(times.goldenHour)}</span></div>
    <div class="info-row"><span class="info-label">Moonrise</span><span class="info-val">${moonTimes.rise ? fmtTime(moonTimes.rise) : '—'}</span></div>
    <div class="info-row"><span class="info-label">Moonset</span><span class="info-val">${moonTimes.set ? fmtTime(moonTimes.set) : '—'}</span></div>
  `;
}

// ─── Sun & Moon Tab ───────────────────────────────────────────────────────────
document.getElementById('sm-date').addEventListener('change', updateSunMoon);
document.getElementById('sm-time').addEventListener('input', updateSunMoon);

function updateSunMoon() {
  if (currentLat === null) return;
  const dateStr = document.getElementById('sm-date').value;
  if (!dateStr) return;
  const date = new Date(dateStr + 'T12:00:00');
  const times = SunCalc.getTimes(date, currentLat, currentLon);
  const moonTimes = SunCalc.getMoonTimes(date, currentLat, currentLon);
  const moonIllum = SunCalc.getMoonIllumination(date);

  // Sun times
  document.getElementById('astro-dawn').textContent = fmtTime(times.nightEnd);
  document.getElementById('naut-dawn').textContent = fmtTime(times.nauticalDawn);
  // Morning blue hour: civil dawn → sunrise
  document.getElementById('civil-dawn').textContent = fmtTime(times.dawn);        // Blue Hour Start (AM)
  document.getElementById('blue-hour-am-end').textContent = fmtTime(times.sunrise); // Blue Hour End = Sunrise
  // Morning golden hour: sunrise → goldenHourEnd (sun ascending to +6°)
  document.getElementById('sunrise').textContent = fmtTime(times.sunrise);             // Golden Hour Start (AM)
  document.getElementById('golden-hour-am-end').textContent = fmtTime(times.goldenHourEnd); // Golden Hour End (AM)
  document.getElementById('solar-noon').textContent = fmtTime(times.solarNoon);
  // Evening golden hour: goldenHour (sun descends to +6°) → sunset
  document.getElementById('golden-hour-pm-start').textContent = fmtTime(times.goldenHour); // Golden Hour Start (PM)
  document.getElementById('sunset').textContent = fmtTime(times.sunset);               // Golden Hour End = Sunset
  // Evening blue hour: sunset → civil dusk
  document.getElementById('blue-hour-pm-start').textContent = fmtTime(times.sunset); // Blue Hour Start = Sunset
  document.getElementById('civil-dusk').textContent = fmtTime(times.dusk);           // Blue Hour End (PM)
  document.getElementById('naut-dusk').textContent = fmtTime(times.nauticalDusk);
  document.getElementById('astro-dusk').textContent = fmtTime(times.night);

  const dayLen = times.sunset - times.sunrise;
  document.getElementById('day-length').textContent = isNaN(dayLen) ? '—' : fmtDuration(dayLen);

  // Moon times
  document.getElementById('moonrise').textContent = moonTimes.rise ? fmtTime(moonTimes.rise) : '—';
  document.getElementById('moonset').textContent = moonTimes.set ? fmtTime(moonTimes.set) : '—';

  // Moon noon
  if (moonTimes.rise && moonTimes.set) {
    const moonNoon = new Date((moonTimes.rise.getTime() + moonTimes.set.getTime()) / 2);
    document.getElementById('moon-noon').textContent = fmtTime(moonNoon);
  }

  // Moon phase
  const phase = moonIllum.phase;
  const phaseNames = ['New Moon','Waxing Crescent','First Quarter','Waxing Gibbous','Full Moon','Waning Gibbous','Last Quarter','Waning Crescent'];
  const phaseEmojis = ['🌑','🌒','🌓','🌔','🌕','🌖','🌗','🌘'];
  const phaseIdx = Math.round(phase * 8) % 8;
  document.getElementById('moon-phase').textContent = phaseNames[phaseIdx];
  document.getElementById('moon-visual').textContent = phaseEmojis[phaseIdx];
  document.getElementById('moon-illum').textContent = (moonIllum.fraction * 100).toFixed(1) + '%';

  // Moon age (days since new moon)
  const moonAge = phase * 29.53;
  document.getElementById('moon-age').textContent = moonAge.toFixed(1) + ' days';

  // Next full and new moons
  const tomorrow = new Date(date.getTime() + 86400000); // start search from day after selected
  const nfm = nextFullMoon(tomorrow);
  const nnm = nextNewMoons(tomorrow, 1)[0];
  const fmtMoonDate = d => d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  document.getElementById('next-full-moon').textContent = fmtMoonDate(nfm);
  document.getElementById('next-new-moon').textContent  = fmtMoonDate(nnm);

  drawTimelineOverlay(false);
  updateCompass();
}

// ─── Timeline Overlay ─────────────────────────────────────────────────────────
let _tlZoom = 1;          // 1×, 2×, 4×
let _tlDate = null;
let _tlSunAlts  = null;   // cached per date, length = 1441 (one per minute)
let _tlMoonAlts = null;
let _tlGcAlts   = null;   // galactic center altitude (one per minute)
let _tlDragging = false;

const TL_H   = 155;  // canvas height (px)
const TL_PAD = { left: 38, right: 20, top: 12, bottom: 32 };
const TL_ALT_MIN = -20, TL_ALT_MAX = 90;
const TL_MW_STRIP = 7;  // px height of MW strip at bottom of plot

function _tlSkyColor(sunAlt) {
  if (sunAlt < -18) return '#03080e';  // astro night
  if (sunAlt < -12) return '#080d28';  // nautical twilight
  if (sunAlt <  -6) return '#0c2868';  // civil twilight / blue hour
  if (sunAlt <   0) return '#1c5aa0';  // upper civil twilight
  if (sunAlt <   6) return '#c8780a';  // golden hour
  return '#93a8c8';                     // day
}

function _tlCacheAlts(date) {
  // Recompute only if date/location changed
  if (_tlDate && _tlDate.toDateString() === date.toDateString() && _tlSunAlts) return;
  _tlDate = date;
  _tlSunAlts  = [];
  _tlMoonAlts = [];
  _tlGcAlts   = [];
  for (let m = 0; m <= 1440; m++) {
    const t = new Date(date);
    t.setHours(Math.floor(m / 60), m % 60, 0, 0);
    _tlSunAlts.push(toDeg(SunCalc.getPosition(t, currentLat, currentLon).altitude));
    _tlMoonAlts.push(toDeg(SunCalc.getMoonPosition(t, currentLat, currentLon).altitude));
    _tlGcAlts.push(toDeg(getGalacticCenterPos(t, currentLat, currentLon).altitude));
  }
}

function drawTimelineOverlay(fastCursorOnly) {
  const canvas = document.getElementById('timeline-canvas');
  const wrap   = document.getElementById('tl-chart-wrap');
  if (!canvas || !wrap) return;

  const date       = getSelectedDate();
  const containerW = wrap.clientWidth || 600;
  const canvasW    = Math.round(containerW * _tlZoom);
  const H          = TL_H;

  // ── Tick hours depend on zoom: 1×=6h, 2×=3h, 4×=1h ─────────────────────────
  const tickStep  = _tlZoom >= 4 ? 1 : _tlZoom >= 2 ? 3 : 6;
  const tickHours = [];
  for (let h = 0; h <= 24; h += tickStep) tickHours.push(h);

  if (!fastCursorOnly || canvas.width !== canvasW) {
    if (currentLat === null) { canvas.width = canvasW; canvas.height = H; return; }
    _tlCacheAlts(date);

    canvas.width  = canvasW;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    const { left: pL, right: pR, top: pT, bottom: pB } = TL_PAD;
    const plotW    = canvasW - pL - pR;
    const plotH    = H - pT - pB;
    const mwStripY = pT + plotH - TL_MW_STRIP; // MW strip sits at bottom of plot

    // helper: altitude → canvas y (inside plot, above MW strip)
    const drawH = plotH - TL_MW_STRIP;
    function altY(a) {
      const c = Math.max(TL_ALT_MIN, Math.min(TL_ALT_MAX, a));
      return pT + drawH * (1 - (c - TL_ALT_MIN) / (TL_ALT_MAX - TL_ALT_MIN));
    }
    function minX(m) { return pL + (m / 1440) * plotW; }

    // ── Sky background (run-length encoded by color) ──────────────────────────
    let runCol = null, runX = pL;
    for (let m = 0; m <= 1440; m++) {
      const col = _tlSkyColor(_tlSunAlts[m]);
      const x   = minX(m);
      if (col !== runCol) {
        if (runCol) { ctx.fillStyle = runCol; ctx.fillRect(runX, pT, x - runX, drawH); }
        runCol = col; runX = x;
      }
    }
    if (runCol) { ctx.fillStyle = runCol; ctx.fillRect(runX, pT, pL + plotW - runX, drawH); }

    // ── Milky Way visibility strip (bottom of plot) ───────────────────────────
    // Purple where sun < -12° AND galactic centre altitude > 0°
    let mwRunVis = null, mwRunX = pL;
    for (let m = 0; m <= 1440; m++) {
      const vis = (_tlSunAlts[m] < -12 && _tlGcAlts[m] > 0);
      const x   = minX(m);
      if (vis !== mwRunVis) {
        if (mwRunVis !== null) {
          ctx.fillStyle = mwRunVis ? 'rgba(180,100,255,0.55)' : 'rgba(0,0,0,0.35)';
          ctx.fillRect(mwRunX, mwStripY, x - mwRunX, TL_MW_STRIP);
        }
        mwRunVis = vis; mwRunX = x;
      }
    }
    if (mwRunVis !== null) {
      ctx.fillStyle = mwRunVis ? 'rgba(180,100,255,0.55)' : 'rgba(0,0,0,0.35)';
      ctx.fillRect(mwRunX, mwStripY, pL + plotW - mwRunX, TL_MW_STRIP);
    }
    // MW strip top border
    ctx.strokeStyle = 'rgba(180,100,255,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pL, mwStripY); ctx.lineTo(pL + plotW, mwStripY); ctx.stroke();
    // Label "🌌" on left of strip
    ctx.save();
    ctx.font = '8px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(200,140,255,0.75)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('MW', 2, mwStripY + TL_MW_STRIP / 2);
    ctx.restore();

    // ── Hour grid lines ───────────────────────────────────────────────────────
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    tickHours.forEach(h => {
      const x = minX(h * 60);
      ctx.beginPath(); ctx.moveTo(x, pT); ctx.lineTo(x, mwStripY); ctx.stroke();
    });

    // ── Horizon line (altitude = 0) ───────────────────────────────────────────
    const y0 = altY(0);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(pL, y0); ctx.lineTo(pL + plotW, y0); ctx.stroke();
    ctx.restore();

    // ── Moon altitude curve ───────────────────────────────────────────────────
    ctx.save();
    ctx.strokeStyle = '#a8d8ea';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    _tlMoonAlts.forEach((a, i) => {
      const x = minX(i), y = altY(a);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();

    // ── Sun altitude curve ────────────────────────────────────────────────────
    ctx.save();
    ctx.strokeStyle = '#e3b341';
    ctx.lineWidth = 2.2;
    ctx.shadowColor = '#e3b34150';
    ctx.shadowBlur = 4;
    ctx.beginPath();
    _tlSunAlts.forEach((a, i) => {
      const x = minX(i), y = altY(a);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();

    // ── Y-axis labels ─────────────────────────────────────────────────────────
    ctx.save();
    ctx.font = '9px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#6e7681';
    [0, 30, 60, 90].forEach(a => {
      if (a < TL_ALT_MIN || a > TL_ALT_MAX) return;
      ctx.fillText(a + '°', pL - 4, altY(a));
    });
    ctx.restore();

    // ── Time labels with dark backing pill ────────────────────────────────────
    ctx.save();
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lblY = pT + plotH + (pB - TL_MW_STRIP) / 2 + TL_MW_STRIP / 2;
    tickHours.forEach(h => {
      const lbl = h === 0 || h === 24 ? '12am' : h === 12 ? '12pm'
                : h < 12 ? `${h}am` : `${h - 12}pm`;
      // Clamp x so label never clips canvas edges
      const rawX   = minX(h * 60);
      const tw     = ctx.measureText(lbl).width;
      const labelX = Math.max(pL + tw / 2 + 2, Math.min(canvasW - pR - tw / 2 - 2, rawX));
      // Dark pill backdrop
      ctx.fillStyle = 'rgba(10,14,20,0.75)';
      const ph = 13, pw = tw + 8;
      ctx.beginPath();
      ctx.roundRect(labelX - pw / 2, lblY - ph / 2, pw, ph, 3);
      ctx.fill();
      // Label text
      ctx.fillStyle = '#8b949e';
      ctx.fillText(lbl, labelX, lblY);
    });
    ctx.restore();
  }

  // ── Cursor (drawn on every call, on top of full render) ──────────────────────
  const ctx2 = canvas.getContext('2d');
  const { left: pL, right: pR, top: pT, bottom: pB } = TL_PAD;
  const plotW  = canvas.width - pL - pR;
  const plotH  = TL_H - pT - pB;
  const drawH  = plotH - TL_MW_STRIP;

  function altY3(a) {
    const c = Math.max(TL_ALT_MIN, Math.min(TL_ALT_MAX, a));
    return pT + drawH * (1 - (c - TL_ALT_MIN) / (TL_ALT_MAX - TL_ALT_MIN));
  }

  const sliderMin = parseInt(document.getElementById('plan-time-slider').value);
  const cx = pL + (sliderMin / 1440) * plotW;

  ctx2.save();
  ctx2.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx2.lineWidth = 1.5;
  ctx2.setLineDash([3, 4]);
  ctx2.beginPath(); ctx2.moveTo(cx, pT); ctx2.lineTo(cx, pT + drawH); ctx2.stroke();
  ctx2.setLineDash([]);

  if (_tlSunAlts) {
    const sunAltNow  = _tlSunAlts[Math.min(1440, sliderMin)];
    const moonAltNow = _tlMoonAlts[Math.min(1440, sliderMin)];
    ctx2.beginPath(); ctx2.arc(cx, altY3(sunAltNow), 5, 0, Math.PI * 2);
    ctx2.fillStyle = '#e3b341'; ctx2.fill();
    ctx2.strokeStyle = '#fff'; ctx2.lineWidth = 1.2; ctx2.stroke();
    ctx2.beginPath(); ctx2.arc(cx, altY3(moonAltNow), 4, 0, Math.PI * 2);
    ctx2.fillStyle = '#a8d8ea'; ctx2.fill();
    ctx2.strokeStyle = '#fff'; ctx2.lineWidth = 1; ctx2.stroke();
  }
  ctx2.restore();

  // Auto-scroll to keep cursor centred
  const targetScroll = cx - wrap.clientWidth / 2;
  wrap.scrollLeft = Math.max(0, Math.min(canvas.width - wrap.clientWidth, targetScroll));

}

// ── Timeline interactions ──────────────────────────────────────────────────────
function _tlScrubFromEvent(e) {
  const wrap = document.getElementById('tl-chart-wrap');
  const canvas = document.getElementById('timeline-canvas');
  if (!wrap || !canvas) return;
  const rect  = wrap.getBoundingClientRect();
  const rawX  = (e.clientX ?? e.touches?.[0]?.clientX ?? 0) - rect.left + wrap.scrollLeft;
  const plotW = canvas.width - TL_PAD.left - TL_PAD.right;
  const mins  = Math.round(Math.max(0, Math.min(1440, ((rawX - TL_PAD.left) / plotW) * 1440)) / 5) * 5;
  document.getElementById('plan-time-slider').value = mins;
  document.getElementById('sky-time-slider').value  = mins;
  updateSliderDisplay();
  drawTimelineOverlay(false); // full redraw for new cursor
  drawTimeIndicator();
  drawSkyDomeIfOpen();
}

function _initTimelineInteraction() {
  const wrap = document.getElementById('tl-chart-wrap');
  if (!wrap) return;
  wrap.addEventListener('mousedown',  e => { _tlDragging = true;  _tlScrubFromEvent(e); });
  wrap.addEventListener('mousemove',  e => { if (_tlDragging) _tlScrubFromEvent(e); });
  wrap.addEventListener('mouseup',    () => { _tlDragging = false; });
  wrap.addEventListener('mouseleave', () => { _tlDragging = false; });
  wrap.addEventListener('touchstart', e => { _tlDragging = true;  _tlScrubFromEvent(e); }, { passive: true });
  wrap.addEventListener('touchmove',  e => { if (_tlDragging) _tlScrubFromEvent(e); }, { passive: true });
  wrap.addEventListener('touchend',   () => { _tlDragging = false; });
}

function _initTimelineControls() {
  // Toggle panel
  const overlay = document.getElementById('timeline-overlay');
  const toggleBtn = document.getElementById('tl-toggle');
  const handle    = document.getElementById('timeline-handle');

  function toggleOverlay() {
    const collapsed = overlay.classList.toggle('collapsed');
    if (toggleBtn) toggleBtn.textContent = collapsed ? '▲' : '▼';
    if (!collapsed) setTimeout(() => drawTimelineOverlay(false), 50);
  }
  if (handle)    handle.addEventListener('click', toggleOverlay);
  if (toggleBtn) { toggleBtn.addEventListener('click', e => { e.stopPropagation(); toggleOverlay(); }); }

  // Zoom buttons
  const zoomLevels = [1, 2, 4];
  document.getElementById('tl-zoom-in').addEventListener('click', e => {
    e.stopPropagation();
    const idx = zoomLevels.indexOf(_tlZoom);
    if (idx < zoomLevels.length - 1) {
      _tlZoom = zoomLevels[idx + 1];
      document.getElementById('tl-zoom-label').textContent = _tlZoom + '×';
      drawTimelineOverlay(false);
    }
  });
  document.getElementById('tl-zoom-out').addEventListener('click', e => {
    e.stopPropagation();
    const idx = zoomLevels.indexOf(_tlZoom);
    if (idx > 0) {
      _tlZoom = zoomLevels[idx - 1];
      document.getElementById('tl-zoom-label').textContent = _tlZoom + '×';
      drawTimelineOverlay(false);
    }
  });
}

function updateCompass() {
  const dateStr = document.getElementById('sm-date').value;
  const timeStr = document.getElementById('sm-time').value;
  if (!dateStr || !timeStr || currentLat === null) return;

  const [h, m] = timeStr.split(':').map(Number);
  const dt = new Date(dateStr + 'T00:00:00');
  dt.setHours(h, m, 0);

  const sunPos = SunCalc.getPosition(dt, currentLat, currentLon);
  const moonPos = SunCalc.getMoonPosition(dt, currentLat, currentLon);

  const sunAz = deg(sunPos.azimuth);
  const sunAlt = toDeg(sunPos.altitude);
  const moonAz = deg(moonPos.azimuth);
  const moonAlt = toDeg(moonPos.altitude);

  document.getElementById('sun-az').textContent = sunAz.toFixed(1) + '°';
  document.getElementById('sun-alt').textContent = sunAlt.toFixed(1) + '°';
  document.getElementById('moon-az').textContent = moonAz.toFixed(1) + '°';
  document.getElementById('moon-alt').textContent = moonAlt.toFixed(1) + '°';

  drawCompass(sunAz, sunAlt, moonAz);
}

function drawCompass(sunAz, sunAlt, moonAz) {
  const canvas = document.getElementById('compass');
  const ctx = canvas.getContext('2d');
  const cx = 100, cy = 100, r = 85;

  ctx.clearRect(0, 0, 200, 200);

  // Background circle
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#21262d';
  ctx.fill();
  ctx.strokeStyle = '#30363d';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Cardinal directions
  ctx.fillStyle = '#8b949e';
  ctx.font = '13px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ['N','E','S','W'].forEach((d, i) => {
    const a = i * Math.PI / 2 - Math.PI / 2;
    ctx.fillText(d, cx + (r - 12) * Math.cos(a), cy + (r - 12) * Math.sin(a));
  });

  // Tick marks
  for (let i = 0; i < 36; i++) {
    const a = i * 10 * Math.PI / 180 - Math.PI / 2;
    const len = i % 9 === 0 ? 10 : 5;
    ctx.beginPath();
    ctx.moveTo(cx + (r - 20) * Math.cos(a), cy + (r - 20) * Math.sin(a));
    ctx.lineTo(cx + (r - 20 + len) * Math.cos(a), cy + (r - 20 + len) * Math.sin(a));
    ctx.strokeStyle = '#30363d';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawArrow(az, color, emoji) {
    const a = (az - 90) * Math.PI / 180;
    const len = sunAlt > 0 ? r * 0.55 : r * 0.3;
    const x = cx + len * Math.cos(a);
    const y = cy + len * Math.sin(a);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x, y);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, x, y);
  }

  if (sunAlt > -6) drawArrow(sunAz, '#e3b341', '☀️');
  drawArrow(moonAz, '#a8d8ea', '🌕');

  // Center dot
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#58a6ff';
  ctx.fill();
}

// ─── Milky Way Tab ────────────────────────────────────────────────────────────
document.getElementById('mw-date').addEventListener('change', updateMilkyWay);

function updateMilkyWay() {
  const dateStr = document.getElementById('mw-date').value;
  if (!dateStr) return;
  const date = new Date(dateStr + 'T12:00:00');

  // Month badges
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const goodMonths = [2,3,4,5,6,7,8,9]; // Mar-Oct indices
  const bestMonths = [4,5,6,7,8]; // May-Sep
  const container = document.getElementById('mw-months');
  container.innerHTML = months.map((m, i) => {
    let cls = '';
    if (bestMonths.includes(i)) cls = 'best';
    else if (goodMonths.includes(i)) cls = 'good';
    return `<span class="month-badge ${cls}">${m}</span>`;
  }).join('');

  if (currentLat === null) return;

  // Moon illumination check
  const moonIllum = SunCalc.getMoonIllumination(date);
  const illumination = (moonIllum.fraction * 100).toFixed(0);
  const phase = moonIllum.phase;
  const phaseNames = ['New Moon','Waxing Crescent','First Quarter','Waxing Gibbous','Full Moon','Waning Gibbous','Last Quarter','Waning Crescent'];
  const phaseIdx = Math.round(phase * 8) % 8;

  const times = SunCalc.getTimes(date, currentLat, currentLon);

  // Estimate dark hours (astronomical night)
  const nightStart = times.night;
  const nightEnd = times.nightEnd ? new Date(times.nightEnd.getTime() + 86400000) : null;

  let visibilityHTML = `<div class="time-row"><span class="info-label">Moon Phase</span><span>${phaseNames[phaseIdx]}</span></div>`;
  visibilityHTML += `<div class="time-row"><span class="info-label">Moon Illumination</span><span>${illumination}%</span></div>`;

  const quality = moonIllum.fraction < 0.25 ? '⭐⭐⭐⭐⭐ Excellent' :
                  moonIllum.fraction < 0.5  ? '⭐⭐⭐ Good' :
                  moonIllum.fraction < 0.75 ? '⭐⭐ Fair' : '⭐ Poor (bright moon)';

  visibilityHTML += `<div class="time-row"><span class="info-label">Sky Darkness Quality</span><span>${quality}</span></div>`;
  if (nightStart) visibilityHTML += `<div class="time-row"><span class="info-label">Astronomical Night Start</span><span>${fmtTime(nightStart)}</span></div>`;
  if (nightEnd) visibilityHTML += `<div class="time-row"><span class="info-label">Astronomical Night End</span><span>${fmtTime(nightEnd)}</span></div>`;

  document.getElementById('mw-visibility').innerHTML = `<div style="display:flex;flex-direction:column;gap:0.25rem">${visibilityHTML}</div>`;

  // Galactic center rise/set scan during astronomical night
  const month = date.getMonth() + 1;
  const galacticVisible = currentLat > -60 && currentLat < 85;
  const galacticBestMonths = month >= 4 && month <= 10;

  // Scan every 4 minutes across the 24-hour window to find GC altitude crossings
  let gcRise = null, gcSet = null;
  let prevGcAlt = null;
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  for (let m = 0; m <= 1440; m += 4) {
    const t = new Date(dayStart.getTime() + m * 60000);
    const sunPos = SunCalc.getPosition(t, currentLat, currentLon);
    const sunAltDeg = toDeg(sunPos.altitude);
    // Only consider astronomical night (sun < -18°) or near it (< -12° nautical)
    if (sunAltDeg > -12) { prevGcAlt = null; continue; }
    const gcPos = getGalacticCenterPos(t, currentLat, currentLon);
    const gcAltDeg = toDeg(gcPos.altitude);
    if (prevGcAlt !== null) {
      if (prevGcAlt < 0 && gcAltDeg >= 0 && !gcRise) gcRise = new Date(t.getTime() - 2 * 60000);
      if (prevGcAlt >= 0 && gcAltDeg < 0 && !gcSet) gcSet = new Date(t.getTime() - 2 * 60000);
    }
    prevGcAlt = gcAltDeg;
  }

  // Check if GC is up at any point during astronomical night
  let gcPeakAlt = null;
  for (let m = 0; m <= 1440; m += 15) {
    const t = new Date(dayStart.getTime() + m * 60000);
    const sunPos = SunCalc.getPosition(t, currentLat, currentLon);
    if (toDeg(sunPos.altitude) > -18) continue;
    const gcPos = getGalacticCenterPos(t, currentLat, currentLon);
    const gcAltDeg = toDeg(gcPos.altitude);
    if (gcPeakAlt === null || gcAltDeg > gcPeakAlt) gcPeakAlt = gcAltDeg;
  }

  const gcRiseStr = gcRise ? fmtTime(gcRise) : (gcPeakAlt !== null && gcPeakAlt > 0 ? 'Up all night' : '—');
  const gcSetStr  = gcSet  ? fmtTime(gcSet)  : (gcPeakAlt !== null && gcPeakAlt > 0 ? 'Up all night' : '—');
  const gcVisible = galacticVisible && (gcRise !== null || (gcPeakAlt !== null && gcPeakAlt > 0));

  document.getElementById('mw-galactic').innerHTML = `
    <div class="time-row"><span>Latitude</span><span>${currentLat.toFixed(2)}°</span></div>
    <div class="time-row highlight gold"><span>🌌 Milky Way Rises</span><span>${gcRiseStr}</span></div>
    <div class="time-row highlight gold"><span>🌌 Milky Way Sets</span><span>${gcSetStr}</span></div>
    <div class="time-row"><span>Best Season</span><span>${galacticBestMonths ? '✅ In season' : '❌ Off season'}</span></div>
    <div class="time-row"><span>Recommended</span><span>${gcVisible && galacticBestMonths && moonIllum.fraction < 0.3 ? '🌟 Go shoot!' : 'Plan for better conditions'}</span></div>
  `;

  // Next best dates (next 4 new moons)
  const goodMWMonths = [4, 5, 6, 7, 8, 9, 10]; // Apr–Oct
  const nextMoons = nextNewMoons(date, 4);
  const mwDatesHTML = nextMoons.map(d => {
    const inSeason = goodMWMonths.includes(d.getMonth() + 1);
    const dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    const badge = inSeason
      ? '<span class="month-badge best">In season</span>'
      : '<span class="month-badge">Off season</span>';
    return `<div class="time-row" style="gap:0.5rem"><span>🌑 ${dateStr}</span>${badge}</div>`;
  }).join('');
  document.getElementById('mw-next-dates').innerHTML = mwDatesHTML;
}

// ─── Calculators ──────────────────────────────────────────────────────────────
function resultHTML(rows) {
  return rows.map(([label, value, highlight]) =>
    `<div class="result-row">
      <span class="result-label">${label}</span>
      <span class="result-value${highlight ? ' highlight' : ''}">${value}</span>
    </div>`
  ).join('');
}

function calcDOF() {
  const coc = parseFloat(document.getElementById('dof-sensor').value);
  const f = parseFloat(document.getElementById('dof-focal').value) / 1000;
  const N = parseFloat(document.getElementById('dof-aperture').value);
  const D = parseFloat(document.getElementById('dof-distance').value);

  const H = (f * f) / (N * coc) + f;
  const Dn = (H * D) / (H + D - f);
  const Df = D >= H ? Infinity : (H * D) / (H - D + f);
  const dof = Df === Infinity ? Infinity : Df - Dn;

  document.getElementById('dof-results').innerHTML = resultHTML([
    ['Near Limit', Dn.toFixed(2) + ' m'],
    ['Far Limit', Df === Infinity ? '∞' : Df.toFixed(2) + ' m'],
    ['Depth of Field', dof === Infinity ? '∞' : dof.toFixed(2) + ' m', true],
    ['Hyperfocal Distance', H.toFixed(2) + ' m'],
  ]);
}

function calcExposure() {
  const s1 = parseFloat(document.getElementById('exp-shutter').value);
  const iso1 = parseInt(document.getElementById('exp-iso').value);
  const a1 = parseFloat(document.getElementById('exp-aperture').value);
  const a2 = parseFloat(document.getElementById('exp-new-aperture').value);
  const iso2 = parseInt(document.getElementById('exp-new-iso').value);

  // EV = log2(N²/t) + log2(100/ISO)
  const s2 = s1 * (a2 * a2) / (a1 * a1) * iso1 / iso2;

  function fmtShutter(s) {
    if (s >= 1) return s.toFixed(s >= 10 ? 0 : 1) + '"';
    return '1/' + Math.round(1 / s);
  }

  const evDiff = Math.log2((a2 * a2 * s1) / (a1 * a1 * s2 * (iso2 / iso1)));

  document.getElementById('exp-results').innerHTML = resultHTML([
    ['Original Exposure', `${fmtShutter(s1)} @ f/${a1}, ISO ${iso1}`],
    ['New Shutter Speed', fmtShutter(s2), true],
    ['Equivalent EV', '±' + Math.abs(evDiff).toFixed(2) + ' stops'],
    ['Note', s2 > 30 ? '⚠️ Very long exposure — use remote trigger' : s2 > 1 ? '💡 Use tripod' : '✅ Handheld ok'],
  ]);
}

function calcTimelapse() {
  const dur = parseFloat(document.getElementById('tl-duration').value);
  const interval = parseFloat(document.getElementById('tl-interval').value);
  const fps = parseInt(document.getElementById('tl-fps').value);

  const totalShots = Math.floor((dur * 60) / interval);
  const videoLength = totalShots / fps;
  const speed = (dur * 60) / videoLength;

  document.getElementById('tl-results').innerHTML = resultHTML([
    ['Total Shots', totalShots.toLocaleString(), true],
    ['Video Duration', videoLength.toFixed(1) + 's (' + (videoLength / 60).toFixed(2) + ' min)'],
    ['Speed-up Factor', speed.toFixed(0) + '×'],
    ['Storage (RAW ~25MB)', (totalShots * 25 / 1024).toFixed(1) + ' GB'],
    ['Storage (JPEG ~5MB)', (totalShots * 5 / 1024).toFixed(1) + ' GB'],
  ]);
}

function calcHyperfocal() {
  const coc = parseFloat(document.getElementById('hf-sensor').value);
  const f = parseFloat(document.getElementById('hf-focal').value);
  const N = parseFloat(document.getElementById('hf-aperture').value);

  const H = (f * f) / (N * coc * 1000) + f / 1000;
  const nearLimit = H / 2;

  document.getElementById('hf-results').innerHTML = resultHTML([
    ['Hyperfocal Distance', H.toFixed(2) + ' m', true],
    ['Near Limit (H/2)', nearLimit.toFixed(2) + ' m'],
    ['Far Limit', '∞'],
    ['Tip', `Focus at ${H.toFixed(1)}m for max depth of field`],
  ]);
}

function calc500Rule() {
  const crop = parseFloat(document.getElementById('ndr-sensor').value);
  const focal = parseFloat(document.getElementById('ndr-focal').value);

  const max500 = 500 / (focal * crop);
  const max400 = 400 / (focal * crop);
  const max300 = 300 / (focal * crop);

  document.getElementById('ndr-results').innerHTML = resultHTML([
    ['500 Rule Max Exposure', max500.toFixed(1) + 's', true],
    ['400 Rule (stricter)', max400.toFixed(1) + 's'],
    ['300 Rule (strict, FF-equiv)', max300.toFixed(1) + 's'],
    ['Effective Focal Length', (focal * crop).toFixed(0) + 'mm'],
    ['Suggested Exposure', max400.toFixed(1) + 's @ f/2.8, ISO 3200'],
  ]);
}

// Returns next `count` new moon dates on or after fromDate
function nextNewMoons(fromDate, count) {
  const REF = new Date('2000-01-06T18:14:00Z').getTime(); // known new moon
  const SYN = 29.530588853 * 86400000; // synodic month in ms
  const n = Math.ceil((fromDate.getTime() - REF) / SYN);
  const moons = [];
  for (let i = n; moons.length < count; i++) {
    const d = new Date(REF + i * SYN);
    if (d >= fromDate) moons.push(d);
  }
  return moons;
}

// Returns the next full moon on or after fromDate
function nextFullMoon(fromDate) {
  const REF = new Date('2000-01-06T18:14:00Z').getTime(); // known new moon
  const SYN = 29.530588853 * 86400000;
  const HALF = SYN / 2; // new → full = half synodic month
  // full moon reference = new moon ref + half synodic
  const FULL_REF = REF + HALF;
  const n = Math.ceil((fromDate.getTime() - FULL_REF) / SYN);
  for (let i = n; ; i++) {
    const d = new Date(FULL_REF + i * SYN);
    if (d >= fromDate) return d;
  }
}

function calcFOV() {
  const [sw, sh] = document.getElementById('fov-sensor').value.split('x').map(Number);
  const f = parseFloat(document.getElementById('fov-focal').value);
  const hFOV = 2 * Math.atan(sw / (2 * f)) * 180 / Math.PI;
  const vFOV = 2 * Math.atan(sh / (2 * f)) * 180 / Math.PI;
  const dFOV = 2 * Math.atan(Math.sqrt(sw**2 + sh**2) / (2 * f)) * 180 / Math.PI;
  const w100 = 2 * 100 * Math.tan(hFOV * Math.PI / 360);
  const type  = hFOV < 25 ? 'Telephoto' : hFOV < 55 ? 'Normal / Standard' : hFOV < 84 ? 'Wide Angle' : 'Ultra-Wide';
  document.getElementById('fov-results').innerHTML = resultHTML([
    ['Horizontal FOV', hFOV.toFixed(1) + '°', true],
    ['Vertical FOV',   vFOV.toFixed(1) + '°'],
    ['Diagonal FOV',   dFOV.toFixed(1) + '°'],
    ['Width at 100m',  w100.toFixed(1) + ' m'],
    ['Width at 1 km',  (w100 * 10).toFixed(0) + ' m'],
    ['Lens category',  type],
  ]);
}

function calcStarTrail() {
  const parts = document.getElementById('st-sensor').value.split('x');
  const crop = parseFloat(parts[2]);
  const f        = parseFloat(document.getElementById('st-focal').value);
  const aperture = parseFloat(document.getElementById('st-aperture').value);
  const iso      = parseInt(document.getElementById('st-iso').value);
  const trailDeg = parseFloat(document.getElementById('st-trail').value);

  // Stars move at 0.25°/min (Earth's rotation: 360° in 24h)
  const trailMin  = trailDeg / 0.25;
  const trailSec  = trailMin * 60;
  const maxNoTrail = Math.round(500 / (f * crop)); // 500 rule in seconds
  const stackShots = Math.ceil(trailSec / maxNoTrail);
  const totalSec   = stackShots * maxNoTrail;
  const totalLabel = totalSec >= 3600 ? (totalSec / 3600).toFixed(1) + ' hrs' : Math.round(totalSec / 60) + ' min';

  document.getElementById('st-results').innerHTML = resultHTML([
    ['Trail duration',          trailMin < 60 ? trailMin.toFixed(0) + ' min' : (trailMin / 60).toFixed(1) + ' hrs', true],
    ['Max exp (sharp stars)',   maxNoTrail + 's (500 rule)'],
    ['Stack shots needed',      stackShots + ' × ' + maxNoTrail + 's'],
    ['Total shooting time',     totalLabel],
    ['Settings',                `f/${aperture}, ISO ${iso}`],
    ['Full circle',             '24 hrs — align to celestial pole'],
  ]);
}

// ─── Timezone selector ────────────────────────────────────────────────────────
document.getElementById('timezone-select').addEventListener('change', e => {
  selectedTimezone = e.target.value; // '' = local
  const tzLabel = document.getElementById('tz-offset-label');
  if (selectedTimezone && typeof dayjs !== 'undefined') {
    try {
      const now = dayjs().tz(selectedTimezone);
      const offset = now.utcOffset();
      const sign   = offset >= 0 ? '+' : '−';
      const absH   = Math.floor(Math.abs(offset) / 60);
      const absM   = Math.abs(offset) % 60;
      const offsetStr = `UTC${sign}${absH}${absM ? ':' + String(absM).padStart(2,'0') : ''}`;
      tzLabel.textContent = offsetStr + ' — ' + now.format('h:mm A') + ' now';
    } catch(err) { tzLabel.textContent = ''; }
  } else {
    tzLabel.textContent = '';
  }
  // Refresh all time displays
  if (currentLat !== null) { updateSunMoon(); updateMilkyWay(); }
});

// Redraw timeline on window resize
window.addEventListener('resize', () => {
  _tlDate = null;
  const overlay = document.getElementById('timeline-overlay');
  if (overlay && !overlay.classList.contains('collapsed')) {
    drawTimelineOverlay(false);
  }
});

// ─── Init ─────────────────────────────────────────────────────────────────────
initMap();
updateMilkyWay();
