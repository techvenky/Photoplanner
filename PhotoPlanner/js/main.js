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

  // Tile layers
  const OSM_ATTR  = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
  const ESRI_ATTR = '© <a href="https://www.esri.com">Esri</a>, Maxar, Earthstar Geographics';
  const TF_ATTR   = '© <a href="https://www.thunderforest.com">Thunderforest</a>, ' + OSM_ATTR;
  const BKG_ATTR  = '© <a href="https://www.bkg.bund.de">BKG</a> (2024), ' + OSM_ATTR;

  const _street    = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                       { subdomains: 'abc', attribution: OSM_ATTR, maxZoom: 19 });
  const _satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                       { attribution: ESRI_ATTR, maxZoom: 19 });
  const _terrain   = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
                       { subdomains: 'abc', attribution: OSM_ATTR + ', © <a href="https://opentopomap.org">OpenTopoMap</a>', maxZoom: 17 });
  // TopPlusOpen — free, no API key (BKG Germany, WMTS uses {z}/{y}/{x} order)
  const _topplusopen = L.tileLayer('https://sgx.geodatenzentrum.de/wmts_topplus_open/tile/1.0.0/web/default/WEBMERCATOR/{z}/{y}/{x}.png',
                         { attribution: BKG_ATTR, maxZoom: 18 });
  // Labels overlay for hybrid mode
  state.labelsLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png',
                       { subdomains: 'abcd', attribution: '© CartoDB', maxZoom: 19, opacity: 0.9 });

  // Thunderforest (free tier — API key required, get one free at thunderforest.com)
  state.tfApiKey = localStorage.getItem('tf_api_key') || '';
  function _makeTFLayer(style) {
    return L.tileLayer(
      `https://tile.thunderforest.com/${style}/{z}/{x}/{y}.png?apikey=${state.tfApiKey}`,
      { attribution: TF_ATTR, maxZoom: 22 }
    );
  }

  window._mapTileLayers = {
    street: _street, satellite: _satellite, terrain: _terrain, topplusopen: _topplusopen
  };

  state.activeTileLayer = _street;
  _street.addTo(state.map);

  document.querySelectorAll('.map-layer-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const layer = btn.dataset.layer;
      // Thunderforest layers require an API key
      if (layer === 'tf-landscape' || layer === 'tf-outdoors') {
        if (!state.tfApiKey) {
          const key = prompt('Enter your free Thunderforest API key\n(register at thunderforest.com):');
          if (!key) return;
          state.tfApiKey = key.trim();
          localStorage.setItem('tf_api_key', state.tfApiKey);
        }
        // Build the layer on demand and register it
        window._mapTileLayers[layer] = _makeTFLayer(layer === 'tf-landscape' ? 'landscape' : 'outdoors');
      }
      document.querySelectorAll('.map-layer-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setMapLayer(layer);
    });
  });

  // Light pollution overlay (NASA VIIRS Night Lights — free, no API key)
  const _lightPollution = L.tileLayer(
    'https://map1.vis.earthdata.nasa.gov/wmts-webmerc/VIIRS_CityLights_2012/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg',
    { attribution: '© NASA VIIRS', maxZoom: 8, opacity: 0.7 }
  );
  window._mapTileLayers['light-pollution'] = _lightPollution;

  // Layer groups — order matters (arcs below, indicator on top)
  state.cardinalGroup      = L.layerGroup().addTo(state.map);
  state.distanceRingGroup  = L.layerGroup().addTo(state.map);
  state.sunPathGroup       = L.layerGroup().addTo(state.map);
  state.moonPathGroup      = L.layerGroup().addTo(state.map);
  state.keyTimesGroup      = L.layerGroup().addTo(state.map);
  state.milkyWayGroup      = L.layerGroup().addTo(state.map);
  state.fovGroup           = L.layerGroup().addTo(state.map);
  state.targetGroup        = L.layerGroup().addTo(state.map);
  state.finderSourceGroup  = L.layerGroup().addTo(state.map);
  state.timeIndicatorGroup = L.layerGroup().addTo(state.map);

  // Zoom: redraw arcs + indicator at adaptive scale
  state.map.on('zoomend', () => { if (state.currentLat !== null) drawSunPath(); });

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

  // Time slider is now in the bottom map bar (#plan-time-slider inside #map-time-bar)
  // initMapTimeBar() wires it up — no duplicate listener needed here.

  // Sky modal slider — mirrors main slider
  document.getElementById('sky-time-slider').addEventListener('input', e => {
    const mins = parseInt(e.target.value);
    document.getElementById('plan-time-slider').value = mins;
    if (window._onTimeChange) window._onTimeChange(mins);
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
  initFavorites();
  initAR();
  initTargetControls({
    onTargetCleared: () => drawSkyDomeIfOpen()
  });
  initFinderModal();
  initTimeline({
    onTimeScrub: () => {
      // timeline scrub already calls window._onTimeChange directly
    }
  });
  initMobileSidebar();
  initSidebarDock();
  initInfoModals();

  // Map overlay controls
  initMapCompass();
  initMoonViewer();
  initAnalogClock();
  initMapTimeBar(); // wires up the single unified bottom slider

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

// ─── Help & About modals ──────────────────────────────────────────────────────
function initInfoModals() {
  [
    { openId: 'readme-btn', modalId: 'readme-modal', closeId: 'readme-close-btn' },
    { openId: 'about-btn',  modalId: 'about-modal',  closeId: 'about-close-btn'  },
  ].forEach(({ openId, modalId, closeId }) => {
    const modal    = document.getElementById(modalId);
    const openBtn  = document.getElementById(openId);
    const closeBtn = document.getElementById(closeId);
    if (!modal) return;

    function openModal()  { modal.style.display = 'flex'; document.body.classList.add('modal-open'); }
    function closeModal() { modal.style.display = 'none'; document.body.classList.remove('modal-open'); }

    if (openBtn)  openBtn.addEventListener('click', openModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    // Close on backdrop click
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
    // Close on Escape key
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && modal.style.display !== 'none') closeModal(); });
  });
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────
initMap();
updateMilkyWay();
