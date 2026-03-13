// ─── Entry Point ──────────────────────────────────────────────────────────────

// ─── Day.js plugin init ───────────────────────────────────────────────────────
if (typeof dayjs !== 'undefined') {
  dayjs.extend(window.dayjs_plugin_utc);
  dayjs.extend(window.dayjs_plugin_timezone);
}

// ─── Tab Navigation ───────────────────────────────────────────────────────────
document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    if (tab.dataset.tab === 'planner' && state.map) setTimeout(() => state.map.invalidateSize(), 50);
  });
});

// ─── Init Map ─────────────────────────────────────────────────────────────────
function setMapLayer(name) {
  const layers = window._mapTileLayers;
  if (!layers) return;
  if (state.activeTileLayer) state.map.removeLayer(state.activeTileLayer);
  if (state.labelsLayer && state.map.hasLayer(state.labelsLayer)) state.map.removeLayer(state.labelsLayer);
  if (name === 'hybrid') {
    state.activeTileLayer = layers.satellite;
    state.activeTileLayer.addTo(state.map);
    state.labelsLayer.addTo(state.map);
  } else {
    state.activeTileLayer = layers[name] || layers.street;
    state.activeTileLayer.addTo(state.map);
  }
  state.activeLayerName = name;
}

function initMap() {
  state.map = L.map('map').setView([40, -3], 4);

  // Tile layers — OpenStreetMap / ESRI (free, no API key required)
  const OSM_ATTR   = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
  const ESRI_ATTR  = '© <a href="https://www.esri.com">Esri</a>, Maxar, Earthstar Geographics';
  const _street    = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                       { subdomains: 'abc', attribution: OSM_ATTR, maxZoom: 19 });
  const _satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                       { attribution: ESRI_ATTR, maxZoom: 19 });
  const _terrain   = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
                       { subdomains: 'abc', attribution: OSM_ATTR + ', © OpenTopoMap', maxZoom: 17 });
  // Labels overlay for hybrid mode (CartoDB labels-only layer, transparent background)
  state.labelsLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png',
                       { subdomains: 'abcd', attribution: '© CartoDB', maxZoom: 19, opacity: 0.9 });
  window._mapTileLayers = { street: _street, satellite: _satellite, terrain: _terrain };

  state.activeTileLayer = _street;
  _street.addTo(state.map);

  document.querySelectorAll('.map-layer-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.map-layer-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setMapLayer(btn.dataset.layer);
    });
  });

  // Layer groups — order matters (arcs below, indicator on top)
  state.sunPathGroup       = L.layerGroup().addTo(state.map);
  state.moonPathGroup      = L.layerGroup().addTo(state.map);
  state.keyTimesGroup      = L.layerGroup().addTo(state.map);
  state.milkyWayGroup      = L.layerGroup().addTo(state.map);
  state.targetGroup        = L.layerGroup().addTo(state.map);
  state.finderSourceGroup  = L.layerGroup().addTo(state.map);
  state.timeIndicatorGroup = L.layerGroup().addTo(state.map);

  // Zoom: redraw time indicator at adaptive distance
  state.map.on('zoomend', () => { if (state.currentLat !== null) drawTimeIndicator(); });

  // Map click handler
  state.map.on('click', e => {
    if (state.finderSourceMode) {
      state.finderSourceLat = e.latlng.lat;
      state.finderSourceLon = e.latlng.lng;
      state.finderSourceMode = false;
      _restorePrevLayer();
      drawFinderSourceOverlay();
      openFinderModal();
    } else if (state.targetMode) {
      setTarget(e.latlng.lat, e.latlng.lng);
      drawSkyDomeIfOpen();
    } else {
      setLocation(e.latlng.lat, e.latlng.lng);
    }
  });

  const today = new Date().toISOString().split('T')[0];
  document.getElementById('plan-date').value = today;
  document.getElementById('sm-date').value = today;
  document.getElementById('mw-date').value = today;

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

  // Init all subsystems
  initDatePickers();
  buildDateSlider();
  initTimezoneSelector();
  initSunMoonListeners();
  initMilkyWayListeners();
  initCalcTabs();
  initSkyModal();
  initLocationControls();
  initTargetControls({
    onTargetCleared: () => drawSkyDomeIfOpen()
  });
  initFinderModal();
  initTimeline({
    onTimeScrub: () => {
      drawTimeIndicator();
      drawSkyDomeIfOpen();
    }
  });
  initMobileSidebar();
  initSidebarDock();

  // Window resize handler
  window.addEventListener('resize', () => {
    invalidateTlCache();
    const overlay = document.getElementById('timeline-overlay');
    if (overlay && !overlay.classList.contains('collapsed')) {
      drawTimelineOverlay(false);
    }
  });
}

// ─── Expose calculator functions to global scope (called from onclick in HTML)
window.calcDOF        = calcDOF;
window.calcExposure   = calcExposure;
window.calcTimelapse  = calcTimelapse;
window.calcHyperfocal = calcHyperfocal;
window.calc500Rule    = calc500Rule;
window.calcFOV        = calcFOV;
window.calcStarTrail  = calcStarTrail;

// ─── Mobile sidebar drawer ────────────────────────────────────────────────────
function initMobileSidebar() {
  const fab      = document.getElementById('mobile-sidebar-fab');
  const backdrop = document.getElementById('mobile-sidebar-backdrop');
  const sidebar  = document.querySelector('.planner-sidebar');
  const handle   = document.getElementById('sidebar-drag-handle');
  if (!fab || !sidebar) return;

  window.closeMobileSidebar = function() {
    sidebar.classList.remove('mobile-open');
    if (backdrop) backdrop.classList.remove('visible');
  };

  function openMobileSidebar() {
    sidebar.classList.add('mobile-open');
    if (backdrop) backdrop.classList.add('visible');
  }

  fab.addEventListener('click', openMobileSidebar);
  if (backdrop) backdrop.addEventListener('click', window.closeMobileSidebar);
  if (handle)   handle.addEventListener('click', window.closeMobileSidebar);

  // Close sidebar on tab switch (map becomes irrelevant when other tabs active)
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', window.closeMobileSidebar);
  });
}

// ─── Dockable sidebar (desktop) ──────────────────────────────────────────────
function initSidebarDock() {
  const btn     = document.getElementById('sidebar-dock-btn');
  const sidebar = document.querySelector('.planner-sidebar');
  if (!btn || !sidebar) return;

  btn.addEventListener('click', () => {
    const docked = sidebar.classList.toggle('docked');
    btn.textContent = docked ? '▶' : '◀';
    btn.title       = docked ? 'Expand sidebar' : 'Collapse sidebar';
    btn.setAttribute('aria-label', docked ? 'Expand sidebar' : 'Collapse sidebar');
    // Let the CSS transition finish before telling Leaflet to resize
    if (state.map) setTimeout(() => state.map.invalidateSize(), 280);
  });
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────
initMap();
updateMilkyWay();
