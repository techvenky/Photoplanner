// ─── Target Point ─────────────────────────────────────────────────────────────

function _switchToSatellite() {
  if (!window._mapTileLayers) return;
  state._prevLayerName = state.activeLayerName || 'street';
  setMapLayer('satellite');
  document.querySelectorAll('.map-layer-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.layer === 'satellite');
  });
  if (typeof window.closeMobileSidebar === 'function') window.closeMobileSidebar();
}

function _restorePrevLayer() {
  const prev = state._prevLayerName || 'street';
  setMapLayer(prev);
  document.querySelectorAll('.map-layer-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.layer === prev);
  });
  state._prevLayerName = null;
}

function setTarget(lat, lon) {
  state.targetLat = lat;
  state.targetLon = lon;
  state.targetMode = false;
  const btn = document.getElementById('target-mode-btn');
  btn.classList.remove('active');
  btn.textContent = '🎯 Set Target (Click Map)';
  state.map.getContainer().style.cursor = '';
  document.getElementById('clear-target-btn').style.display = 'block';
  _restorePrevLayer();
  drawTargetOverlay();
  updateTargetInfo();
  // NOTE: caller in main.js calls drawSkyDomeIfOpen() after setTarget
}

function drawTargetOverlay() {
  state.targetGroup.clearLayers();
  if (state.targetLat === null || state.currentLat === null) return;

  // Turf: buffer zone (500 m) around camera position — shows shooting radius
  if (typeof turf !== 'undefined') {
    const camPt   = turf.point([state.currentLon, state.currentLat]);
    const bufPoly = turf.buffer(camPt, 0.5, { units: 'kilometers' });
    const ring    = bufPoly.geometry.coordinates[0].map(c => [c[1], c[0]]);
    L.polygon(ring, {
      color: '#4fc3f7', weight: 1.2, opacity: 0.55,
      fillColor: '#4fc3f7', fillOpacity: 0.06, dashArray: '5 4'
    }).bindTooltip('500 m shooting radius', { sticky: true }).addTo(state.targetGroup);
  }

  // Target pin (red)
  const redIcon = L.divIcon({
    html: '<div style="width:14px;height:14px;background:#ff6b6b;border:2px solid #fff;border-radius:50%;box-shadow:0 0 6px #ff6b6b"></div>',
    className: '', iconAnchor: [7, 7]
  });
  L.marker([state.targetLat, state.targetLon], { icon: redIcon })
    .bindTooltip('Target', { permanent: true, direction: 'top', offset: [0, -8] })
    .addTo(state.targetGroup);

  // Line from camera to target
  L.polyline([[state.currentLat, state.currentLon], [state.targetLat, state.targetLon]], {
    color: '#ff6b6b', weight: 2, opacity: 0.8, dashArray: '6 4'
  }).addTo(state.targetGroup);
}

// ─── Finder Sun/Moon Pin Overlay ───────────────────────────────────────────────
function drawFinderSourceOverlay() {
  if (!state.finderSourceGroup) return;
  state.finderSourceGroup.clearLayers();
  if (state.finderSourceLat === null) return;

  // Yellow/gold pin for sun/moon position
  const sunMoonIcon = L.divIcon({
    html: '<div style="width:14px;height:14px;background:#e3b341;border:2px solid #fff;border-radius:50%;box-shadow:0 0 6px #e3b341"></div>',
    className: '', iconAnchor: [7, 7]
  });
  L.marker([state.finderSourceLat, state.finderSourceLon], { icon: sunMoonIcon })
    .bindTooltip('Sun/Moon', { permanent: true, direction: 'top', offset: [0, -8] })
    .addTo(state.finderSourceGroup);

  // Always draw from camera (subject/tower) toward the sun/moon pin —
  // this is on the OPPOSITE side from the red target line (photographer position).
  if (state.currentLat !== null) {
    L.polyline([[state.currentLat, state.currentLon], [state.finderSourceLat, state.finderSourceLon]], {
      color: '#e3b341', weight: 2, opacity: 0.85, dashArray: '6 4'
    }).addTo(state.finderSourceGroup);
  }
}

function updateTargetInfo() {
  if (state.targetLat === null || state.currentLat === null) return;
  const bearing  = calcBearing(state.currentLat, state.currentLon, state.targetLat, state.targetLon);
  const distKm   = calcDistanceKm(state.currentLat, state.currentLon, state.targetLat, state.targetLon);
  const date     = getSelectedDate();
  const alignments = findAlignments(bearing, date);

  const moonSizeM   = moonApparentSizeM(distKm);
  const distStr     = distKm < 1 ? (distKm * 1000).toFixed(0) + ' m' : distKm.toFixed(2) + ' km';

  let html = `
    <div class="info-row"><span class="info-label">Bearing to Target</span><span class="info-val">${bearing.toFixed(1)}°</span></div>
    <div class="info-row"><span class="info-label">Distance</span><span class="info-val">${distStr}</span></div>
    <div class="info-row"><span class="info-label">🌕 Apparent Moon Size</span><span class="info-val">${moonSizeM.toFixed(1)} m</span></div>
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

function initTargetControls(callbacks) {
  document.getElementById('target-mode-btn').addEventListener('click', () => {
    state.targetMode = !state.targetMode;
    const btn = document.getElementById('target-mode-btn');
    btn.classList.toggle('active', state.targetMode);
    btn.textContent = state.targetMode ? '🎯 Click map to place target…' : '🎯 Set Target (Click Map)';
    state.map.getContainer().style.cursor = state.targetMode ? 'crosshair' : '';
    if (state.targetMode) _switchToSatellite();
    else _restorePrevLayer();
  });

  document.getElementById('clear-target-btn').addEventListener('click', () => {
    state.targetLat = null;
    state.targetLon = null;
    state.targetGroup.clearLayers();
    document.getElementById('target-info').style.display = 'none';
    document.getElementById('clear-target-btn').style.display = 'none';
    if (callbacks && callbacks.onTargetCleared) callbacks.onTargetCleared();
  });
}
