// ─── Live AR View ─────────────────────────────────────────────────────────────
// Points the device camera at the sky and overlays live sun/moon/planet positions.
// Uses:  getUserMedia (rear camera)  +  DeviceOrientationEvent (compass/tilt)

const AR = {
  stream:          null,
  animFrame:       null,
  heading:         null,   // degrees 0–360, 0 = North
  elevation:       null,   // camera tilt above horizon in degrees
  FOV_H:           62,     // horizontal field-of-view (degrees) — typical rear camera
  FOV_V:           46,     // vertical field-of-view
  tiltOffset:      0,      // user-adjustable horizon offset (degrees) for device calibration
  useAbsolute:     false,  // true once deviceorientationabsolute gives valid data
  useRelative:     false,  // Android fallback: treat relative alpha as north-ref after timeout
  compassTimer:    null,   // fallback timer handle
  calibrateTimer:  null,   // calibration-prompt timer handle
  absEventSeen:    false,  // true if deviceorientationabsolute has fired at least once
  absNullCount:    0,      // consecutive null-alpha absolute events (high = permission blocked)
  smoothHeading:   null,  // EMA-filtered heading (degrees)
  smoothElevation: null,  // EMA-filtered elevation (degrees)
  layers: { sun: true, moon: true, mw: true, planets: true, path: true, grid: true, target: true },
  // Cache: avoids recomputing expensive astronomy on every animation frame.
  // astroKey / planetsKey invalidate when date+location changes (or per 5-min bucket for planets).
  _cache: {
    astroKey:     null,
    sunPathPts:   null,   // [{az,alt}] at 10-min steps across the day
    moonPathPts:  null,
    sunLabels:    null,   // [{az,alt,label}] at 60-min steps
    moonLabels:   null,
    riseSetData:  null,   // { times, moonTimes }
    planetsKey:   null,
    planetsData:  null,   // [{name, az, alt, pl}]
  },
};

// ─── AR Date/Time ─────────────────────────────────────────────────────────────
function _getARDate() {
  const dateEl = document.getElementById('ar-date-input');
  const timeEl = document.getElementById('ar-time-slider');
  const dateStr = (dateEl && dateEl.value)
    ? dateEl.value
    : (document.getElementById('plan-date')?.value || '');
  const minutes = timeEl
    ? parseInt(timeEl.value, 10)
    : parseInt(document.getElementById('plan-time-slider')?.value || '720', 10);
  const d = dateStr ? new Date(dateStr + 'T12:00:00') : new Date();
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return d;
}

function _updateARTimeLabel() {
  const slider = document.getElementById('ar-time-slider');
  const label  = document.getElementById('ar-time-label');
  if (slider && label) label.textContent = minutesToAmPm(parseInt(slider.value, 10));
}

// ─── Open / Close ─────────────────────────────────────────────────────────────
async function openARView() {
  // Camera and orientation APIs require a secure context
  if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    showToast('AR requires HTTPS. Open the app over a secure connection.', 'danger');
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    showToast('Camera not supported. Use Chrome (Android) or Safari (iOS).', 'danger');
    return;
  }

  // iOS 13+ requires requestPermission() from a user-gesture click handler
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    let perm;
    try { perm = await DeviceOrientationEvent.requestPermission(); }
    catch (_) { perm = 'denied'; }
    if (perm !== 'granted') {
      showToast('Motion access denied. Go to Settings → Safari → Motion & Orientation Access and reload.', 'warning');
      // Still open the view — camera works even without compass
    }
  }

  // Sync AR time controls from the main planner
  const mainDate = document.getElementById('plan-date')?.value;
  const mainTime = document.getElementById('plan-time-slider')?.value;
  const arDate   = document.getElementById('ar-date-input');
  const arTime   = document.getElementById('ar-time-slider');
  if (arDate && mainDate) arDate.value = mainDate;
  if (arTime && mainTime) arTime.value = mainTime;
  _updateARTimeLabel();

  const overlay = document.getElementById('ar-overlay');
  if (overlay) overlay.classList.add('active');
  document.body.classList.add('modal-open');

  await _startCamera();
  _initCompassOverlayBtn();
  _startOrientation();
  _scheduleFrame();
}

function closeARView() {
  const overlay = document.getElementById('ar-overlay');
  if (overlay) overlay.classList.remove('active');
  _hideCompassOverlay();
  document.body.classList.remove('modal-open');
  _stopCamera();
  _stopOrientation();
  if (AR.animFrame)      { cancelAnimationFrame(AR.animFrame); AR.animFrame      = null; }
  if (AR.compassTimer)   { clearTimeout(AR.compassTimer);      AR.compassTimer   = null; }
  if (AR.calibrateTimer) { clearTimeout(AR.calibrateTimer);    AR.calibrateTimer = null; }
  AR.heading = AR.elevation = null;
  AR.useAbsolute    = false;
  AR.useRelative    = false;
  AR.absEventSeen   = false;
  AR.absNullCount   = 0;
  AR.smoothHeading  = null;
  AR.smoothElevation = null;
  AR.tiltOffset     = 0;
  AR._cache.astroKey    = null;
  AR._cache.planetsKey  = null;
  AR._cache.sunPathPts  = AR._cache.moonPathPts  = null;
  AR._cache.sunLabels   = AR._cache.moonLabels   = null;
  AR._cache.riseSetData = AR._cache.planetsData  = null;
}

// ─── Camera ───────────────────────────────────────────────────────────────────
async function _startCamera() {
  // Preferred: rear camera at full HD. Fall back to any camera if rear is busy/missing.
  const constraints = [
    { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false },
    { video: { facingMode: { ideal: 'environment' } }, audio: false },
    { video: true, audio: false },
  ];
  for (const c of constraints) {
    try {
      AR.stream = await navigator.mediaDevices.getUserMedia(c);
      break;
    } catch (e) {
      if (c === constraints[constraints.length - 1]) {
        const isPWA = window.matchMedia('(display-mode: standalone)').matches ||
                      navigator.standalone === true;
        const msg = e.name === 'NotAllowedError'
          ? (isPWA
              ? 'Camera permission denied. Go to device Settings → Apps → PhotoPlanner → Permissions and enable Camera.'
              : 'Camera permission denied. Tap the camera icon in the address bar to allow access.')
          : e.name === 'NotFoundError'     ? 'No camera found on this device.'
          : e.name === 'NotReadableError'  ? 'Camera is in use by another app — close it and retry.'
          : e.name === 'OverconstrainedError' ? 'Camera resolution not supported — retrying…'
          : 'Camera unavailable: ' + (e.message || e.name);
        showToast(msg, 'danger');
        closeARView();
        return;
      }
    }
  }
  const video = document.getElementById('ar-video');
  if (video && AR.stream) {
    video.srcObject = AR.stream;
    // iOS Safari needs the video element to be in the DOM before play()
    await video.play().catch(() => {});
  }
}

function _stopCamera() {
  if (AR.stream) { AR.stream.getTracks().forEach(t => t.stop()); AR.stream = null; }
  const video = document.getElementById('ar-video');
  if (video) { video.srcObject = null; }
}

// ─── Screen orientation angle ─────────────────────────────────────────────────
// Returns 0 (portrait), 90 (landscape-CW), 180 (portrait-upside-down), 270 (landscape-CCW).
// The heading and elevation reported by DeviceOrientation are relative to the physical
// device top, so we must subtract the screen-rotation angle to get the camera direction.
function _getScreenAngle() {
  // screen.orientation is supported on Chrome 38+, Firefox 43+, Safari 16.4+.
  // Devices without it (very old Safari) fall back to 0° (portrait), which is safe.
  if (screen.orientation && screen.orientation.angle != null) {
    return ((screen.orientation.angle % 360) + 360) % 360;
  }
  return 0;
}

// ─── Orientation ──────────────────────────────────────────────────────────────
function _onOrientationAbsolute(e) {
  AR.absEventSeen = true;
  if (e.alpha != null || e.webkitCompassHeading != null) {
    // Valid compass data acquired — mark absolute and reset null counter.
    AR.useAbsolute = true;
    AR.absNullCount = 0;
  } else {
    // alpha is null: sensor is firing but compass data is unavailable.
    // High counts (>20 ≈ 2 s at 10 Hz) mean Chrome's Motion Sensor
    // site permission is blocked rather than just uncalibrated.
    AR.absNullCount++;
    // If the compass was previously working but now consistently returns null
    // (e.g. sensor temporarily lost lock), fall back to relative orientation
    // so rotation tracking continues rather than freezing.
    if (AR.useAbsolute && AR.absNullCount > 30) {
      AR.useAbsolute = false;
      AR.useRelative = true;
    }
  }
  _processOrientation(e, true);
}

function _onOrientation(e) {
  // iOS: webkitCompassHeading is always north-referenced — use it directly.
  if (e.webkitCompassHeading != null) {
    _processOrientation(e, false);
    return;
  }

  // Absolute bearing delivered via deviceorientation (Samsung, many Chrome Android builds
  // use this instead of the dedicated deviceorientationabsolute event).
  // IMPORTANT: every such event must be processed individually — do NOT gate on
  // AR.useAbsolute here, because setting it on the first event would cause the
  // old early-return logic to block every subsequent one, freezing the heading.
  if (e.absolute === true && e.alpha != null) {
    AR.absEventSeen = true;
    AR.useAbsolute = true;
    _processOrientation(e, true);
    return;
  }

  // Relative orientation: only fall through here when deviceorientationabsolute is NOT
  // providing valid data (AR.useAbsolute stays false until absolute data arrives), so
  // there is no double-processing risk with the dedicated absolute listener.
  if (!AR.useAbsolute && AR.useRelative && e.alpha != null) {
    _processOrientation(e, true);
  }
}

function _processOrientation(e, isAbsolute) {
  const screenAngle = _getScreenAngle();

  // ── Heading ─────────────────────────────────────────────────────────────────
  // Both webkitCompassHeading (iOS) and alpha (Android) report the direction of
  // the device's physical top (Y-axis). Subtracting the screen rotation gives
  // the direction the camera lens is actually facing.
  // EMA smoothing (α=0.25) removes sensor jitter while keeping fast response.
  let rawHeading = null;
  if (e.webkitCompassHeading != null) {
    rawHeading = e.webkitCompassHeading;           // iOS: true magnetic north, CW
  } else if (isAbsolute && e.alpha != null) {
    rawHeading = (360 - e.alpha + 360) % 360;      // Android absolute: alpha=0 → North
  }
  if (rawHeading !== null) {
    const adjusted = (rawHeading - screenAngle + 360) % 360;
    if (AR.smoothHeading === null) {
      AR.smoothHeading = adjusted;
    } else {
      // Wraparound-safe EMA: interpolate the shortest arc
      let diff = adjusted - AR.smoothHeading;
      while (diff >  180) diff -= 360;
      while (diff < -180) diff += 360;
      AR.smoothHeading = (AR.smoothHeading + diff * 0.35 + 360) % 360;
    }
    AR.heading = AR.smoothHeading;
  }

  // ── Elevation ───────────────────────────────────────────────────────────────
  // Portrait / portrait-upside-down: beta controls front-back tilt.
  //   beta=90° → upright (horizon), beta=0° → flat face-up (zenith), beta=180° → face-down
  // Landscape: gamma controls up-down tilt (left-right tilt in portrait).
  //   Landscape-CW (90°):  elevation = −gamma
  //   Landscape-CCW (270°): elevation =  gamma
  let rawElev = null;
  if (screenAngle === 0 || screenAngle === 180) {
    if (e.beta != null) {
      const beta = screenAngle === 0 ? e.beta : -e.beta;
      rawElev = Math.min(90, Math.max(-90, 90 - beta));
    }
  } else {
    if (e.gamma != null) {
      const gamma = screenAngle === 90 ? -e.gamma : e.gamma;
      rawElev = Math.min(90, Math.max(-90, gamma));
    }
  }
  if (rawElev !== null) {
    if (AR.smoothElevation === null) {
      AR.smoothElevation = rawElev;
    } else {
      AR.smoothElevation += (rawElev - AR.smoothElevation) * 0.35;
    }
    AR.elevation = AR.smoothElevation;
  }
}

// ─── Astronomy cache builders ─────────────────────────────────────────────────
// _buildAstroCache: computes all daily path points, labels, and rise/set times once
// per unique date+location, so _drawFrame does zero SunCalc calls for paths/rise-set.
function _buildAstroCache(date, lat, lon) {
  const base = new Date(date);
  base.setHours(0, 0, 0, 0);

  const sunPts = [], sunLabels = [], moonPts = [], moonLabels = [];

  for (let m = 0; m <= 1440; m += 10) {
    const d  = new Date(base.getTime() + m * 60000);
    const sp = SunCalc.getPosition(d, lat, lon);
    const mp = SunCalc.getMoonPosition(d, lat, lon);
    const saz  = (toDeg(sp.azimuth) + 180 + 360) % 360;
    const salt = toDeg(sp.altitude);
    const maz  = (toDeg(mp.azimuth) + 180 + 360) % 360;
    const malt = toDeg(mp.altitude);
    sunPts.push({ az: saz, alt: salt });
    moonPts.push({ az: maz, alt: malt });
    if (m % 60 === 0) {
      const h = d.getHours();
      const label = h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`;
      sunLabels.push({ az: saz, alt: salt, label });
      moonLabels.push({ az: maz, alt: malt, label });
    }
  }

  AR._cache.sunPathPts  = sunPts;
  AR._cache.moonPathPts = moonPts;
  AR._cache.sunLabels   = sunLabels;
  AR._cache.moonLabels  = moonLabels;
  AR._cache.riseSetData = {
    times:     SunCalc.getTimes(date, lat, lon),
    moonTimes: SunCalc.getMoonTimes(date, lat, lon),
  };
}

// _buildPlanetsCache: runs the Kepler solver once per 5-minute bucket instead of per frame.
function _buildPlanetsCache(date, lat, lon) {
  const data = [];
  for (const [name, pl] of Object.entries(_PLANET_ELEMS)) {
    try {
      const pos = _solvePlanetAzAlt(name, date, lat, lon);
      data.push({ name, az: pos.az, alt: pos.alt, pl });
    } catch (_) {}
  }
  AR._cache.planetsData = data;
}

function _startOrientation() {
  AR.absEventSeen = false;
  window.addEventListener('deviceorientationabsolute', _onOrientationAbsolute, true);
  window.addEventListener('deviceorientation',         _onOrientation,         true);

  // Show initial waiting overlay immediately
  _showCompassOverlay('Calibrating compass…', false);

  // After 2 s: update overlay message based on sensor state.
  // >20 null events ≈ Chrome Motion Sensor permission is blocked.
  // Few events → magnetometer uncalibrated → suggest figure-8.
  AR.calibrateTimer = setTimeout(() => {
    AR.calibrateTimer = null;
    if (AR.heading === null && AR.absEventSeen) {
      if (AR.absNullCount > 20) {
        _showCompassOverlay('Compass access is blocked by your browser.', true);
      } else {
        _showCompassOverlay(
          'Rotate the device in a figure-8 pattern to calibrate the compass.',
          false
        );
      }
    }
  }, 2000);

  // After 3 s with no heading, auto-enable REL mode so AR is usable without
  // a geographic compass.  Always engage so the canvas renders — the user can
  // still see celestial objects at heading=0 and rotate using DevTools Sensors
  // or device sensors (once permission is granted).
  AR.compassTimer = setTimeout(() => {
    AR.compassTimer = null;
    if (AR.heading === null && !AR.useAbsolute) {
      AR.useRelative = true;
      AR.heading = 0;
      AR.smoothHeading = 0;
      _hideCompassOverlay();
      const msg = AR.absNullCount > 20
        ? 'Compass blocked — enable Motion Sensors in Chrome site settings (REL mode active).'
        : 'No compass signal — AR running in REL mode. Point phone at a known direction to orient.';
      showToast(msg, 'warning');
    }
  }, 3000);
}

function _stopOrientation() {
  window.removeEventListener('deviceorientationabsolute', _onOrientationAbsolute, true);
  window.removeEventListener('deviceorientation',         _onOrientation,         true);
  if (AR.compassTimer)   { clearTimeout(AR.compassTimer);   AR.compassTimer   = null; }
  if (AR.calibrateTimer) { clearTimeout(AR.calibrateTimer); AR.calibrateTimer = null; }
}

// ─── Compass overlay (HTML, not canvas) ───────────────────────────────────────
function _showCompassOverlay(msg, showSteps) {
  const el    = document.getElementById('ar-compass-overlay');
  const msgEl = document.getElementById('ar-compass-msg');
  const steps = document.getElementById('ar-compass-steps');
  if (!el) return;
  if (msgEl) msgEl.textContent = msg;
  if (steps) steps.style.display = showSteps ? '' : 'none';
  el.style.display = '';
}
function _hideCompassOverlay() {
  const el = document.getElementById('ar-compass-overlay');
  if (el) el.style.display = 'none';
}
function _initCompassOverlayBtn() {
  const btn = document.getElementById('ar-rel-mode-btn');
  if (!btn || btn._arBound) return;
  btn._arBound = true;
  btn.addEventListener('click', () => {
    AR.heading    = 0;
    AR.useRelative = true;
    AR.smoothHeading = 0;
    _hideCompassOverlay();
  });
}

// ─── Draw loop ────────────────────────────────────────────────────────────────
function _scheduleFrame() {
  AR.animFrame = requestAnimationFrame(() => {
    const overlay = document.getElementById('ar-overlay');
    if (!overlay?.classList.contains('active')) return;
    _drawFrame();
    _scheduleFrame();
  });
}

function _drawFrame() {
  const canvas = document.getElementById('ar-canvas');
  if (!canvas) return;

  // Sync canvas pixel size to its CSS display size
  const rect = canvas.getBoundingClientRect();
  if (canvas.width !== rect.width || canvas.height !== rect.height) {
    canvas.width  = rect.width  || window.innerWidth;
    canvas.height = rect.height || window.innerHeight;
  }

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  _updateStatusBar();

  if (state.currentLat === null) {
    _drawMessage(ctx, canvas, 'Set a location first (use map or search)');
    return;
  }

  // When heading is null, draw the reference lines (grid, horizon, crosshair)
  // so the user sees a live camera with context lines while the overlay asks
  // them to fix compass access or tap REL Mode.
  if (AR.heading === null) {
    if (AR.layers.grid) _drawElevationGrid(ctx, canvas);
    _drawHorizon(ctx, canvas);
    _drawCrosshair(ctx, canvas);
    // Update the HTML overlay message based on sensor state
    if (!AR.absEventSeen) {
      _showCompassOverlay(
        'Point the device at the horizon.\nEnsure Motion & Orientation access is allowed.',
        false
      );
    } else if (AR.absNullCount > 20) {
      _showCompassOverlay(
        'Compass access is blocked by your browser.',
        true
      );
    } else {
      _showCompassOverlay(
        'Rotate the device in a figure-8 pattern to calibrate the compass.',
        false
      );
    }
    return;
  }

  // Heading acquired — hide the overlay
  _hideCompassOverlay();

  const date = _getARDate();
  const lat  = state.currentLat, lon = state.currentLon;

  // ── Refresh astronomy caches (near-zero cost when key is unchanged) ──────────
  const astroKey = `${lat.toFixed(4)},${lon.toFixed(4)},${date.toDateString()}`;
  if (AR._cache.astroKey !== astroKey) {
    AR._cache.astroKey = astroKey;
    _buildAstroCache(date, lat, lon);
  }
  // Planet positions update every 5-minute bucket (planets barely move in 5 min)
  const planetsKey = `${lat.toFixed(4)},${lon.toFixed(4)},${Math.floor(date.getTime() / 300000)}`;
  if (AR._cache.planetsKey !== planetsKey) {
    AR._cache.planetsKey = planetsKey;
    _buildPlanetsCache(date, lat, lon);
  }

  const sunPos  = SunCalc.getPosition(date, lat, lon);
  const moonPos = SunCalc.getMoonPosition(date, lat, lon);
  const sunAz   = (toDeg(sunPos.azimuth)  + 180 + 360) % 360;
  const sunAlt  =  toDeg(sunPos.altitude);
  const moonAz  = (toDeg(moonPos.azimuth) + 180 + 360) % 360;
  const moonAlt =  toDeg(moonPos.altitude);

  // ── 1. Reference lines (always drawn, no crashes possible) ──────────────────
  if (AR.layers.grid) _drawElevationGrid(ctx, canvas);
  _drawHorizon(ctx, canvas);
  _drawCrosshair(ctx, canvas);

  // ── 2. Orbital path arcs with hourly time labels (PhotoPills style) ──────────
  if (AR.layers.path && AR._cache.sunPathPts) {
    try {
      _drawCelestialPath(ctx, canvas,
        AR._cache.sunPathPts,  'rgba(255,200,50,0.55)',
        AR.layers.sun ? '#FFD700' : null, AR._cache.sunLabels);
      _drawCelestialPath(ctx, canvas,
        AR._cache.moonPathPts, 'rgba(150,200,255,0.45)',
        AR.layers.moon ? 'rgba(170,220,255,0.95)' : null, AR._cache.moonLabels);
    } catch (e) { console.warn('AR: celestial path draw failed', e); }
  }

  // ── 3. Compass ruler — moved BEFORE celestial objects so it always renders ───
  _drawCompassRuler(ctx, canvas);
  try { _drawRiseSetOnRuler(ctx, canvas); } catch (e) { console.warn('AR: rise/set ruler failed', e); }

  // ── 4. Celestial objects — each isolated so one crash can't block the rest ───
  if (AR.layers.mw)      { try { _drawGalacticCenter(ctx, canvas, date, lat, lon); } catch (e) { console.warn('AR: galactic center failed', e); } }
  if (AR.layers.planets) { try { _drawPlanets(ctx, canvas);                        } catch (e) { console.warn('AR: planets failed', e); } }
  if (AR.layers.target)  { try { _drawTargetMarker(ctx, canvas);                   } catch (e) { console.warn('AR: target marker failed', e); } }

  const sunXY  = _project(sunAz,  sunAlt,  canvas);
  const moonXY = _project(moonAz, moonAlt, canvas);
  if (AR.layers.sun) {
    try {
      if (sunXY)  _drawSun(ctx, sunXY.x, sunXY.y, sunAlt, canvas);
      else        _drawOffScreenArrow(ctx, canvas, sunAz,  sunAlt,  '#FFD700',             '☀');
    } catch (e) { console.warn('AR: sun draw failed', e); }
  }
  if (AR.layers.moon) {
    try {
      if (moonXY) _drawMoon(ctx, moonXY.x, moonXY.y, moonAlt, canvas);
      else        _drawOffScreenArrow(ctx, canvas, moonAz, moonAlt, 'rgba(180,220,255,1)', '☽');
    } catch (e) { console.warn('AR: moon draw failed', e); }
  }

  try { _drawInfoBar(ctx, canvas, sunAz, sunAlt, moonAz, moonAlt); } catch (e) { console.warn('AR: info bar failed', e); }
  try { _drawCompassBadge(ctx, canvas); } catch (e) { console.warn('AR: compass badge failed', e); }
}

// ─── Projection: (azimuth°, altitude°) → canvas (x, y) ───────────────────────
// clipFrac trims the usable FOV so objects near the edge don't get partially
// clipped by the canvas boundary.  Clip threshold is FOV_H/2 * clipFrac (half-FOV
// is what maps to the screen edge — using full FOV here was the previous bug).
function _project(az, alt, canvas, clipFrac = 0.92) {
  let dAz = az - AR.heading;
  while (dAz >  180) dAz -= 360;
  while (dAz < -180) dAz += 360;

  const camElev = (AR.elevation != null ? AR.elevation : 0) + AR.tiltOffset;
  const dAlt    = alt - camElev;

  // Half-FOV is the angular distance from centre to the screen edge.
  // Any object beyond halfH/halfV * clipFrac is outside the visible canvas
  // and should be shown as an off-screen arrow instead.
  const halfH = AR.FOV_H / 2;   // 31° for a 62° lens
  const halfV = AR.FOV_V / 2;   // 23° for a 46° lens

  if (Math.abs(dAz)  > halfH * clipFrac) return null;
  if (Math.abs(dAlt) > halfV * clipFrac) return null;

  const x = canvas.width  / 2 + (dAz  / halfH) * (canvas.width  / 2);
  const y = canvas.height / 2 - (dAlt / halfV) * (canvas.height / 2);
  return { x, y };
}

// ─── roundRect polyfill (Chrome <99, Samsung Internet, older WebViews) ────────
// ctx.roundRect is not available everywhere; fall back to quadraticCurveTo.
function _roundRect(ctx, x, y, w, h, r) {
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  const rad = Math.min(r, Math.min(w, h) / 2);
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y,     x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x,     y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x,     y,     x + rad, y);
  ctx.closePath();
}

// ─── Viewfinder crosshair ─────────────────────────────────────────────────────
function _drawCrosshair(ctx, canvas) {
  const cx = canvas.width  / 2;
  const cy = canvas.height / 2;
  const s  = Math.max(16, canvas.width * 0.03);
  const gap = 5;

  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - s, cy); ctx.lineTo(cx - gap, cy);
  ctx.moveTo(cx + gap, cy); ctx.lineTo(cx + s, cy);
  ctx.moveTo(cx, cy - s); ctx.lineTo(cx, cy - gap);
  ctx.moveTo(cx, cy + gap); ctx.lineTo(cx, cy + s);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath();
  ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Corner bracket guides
  const bx = s * 1.8, by2 = s * 1.8, bl = s * 0.6;
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth   = 1;
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([dx, dy]) => {
    ctx.beginPath();
    ctx.moveTo(cx + dx * bx,        cy + dy * by2);
    ctx.lineTo(cx + dx * (bx - bl), cy + dy * by2);
    ctx.moveTo(cx + dx * bx,        cy + dy * by2);
    ctx.lineTo(cx + dx * bx,        cy + dy * (by2 - bl));
    ctx.stroke();
  });
  ctx.restore();
}

// ─── Off-screen direction arrow ───────────────────────────────────────────────
// Draws an arrow at the screen edge pointing toward a celestial object that is
// outside the current camera FOV.  Uses asymmetric margins so arrows never
// overlap the compass strip (top) or info bar (bottom).
function _drawOffScreenArrow(ctx, canvas, az, alt, color, symbol) {
  if (AR.heading === null) return;

  let dAz = az - AR.heading;
  while (dAz >  180) dAz -= 360;
  while (dAz < -180) dAz += 360;

  const camElev = (AR.elevation != null ? AR.elevation : 0) + AR.tiltOffset;
  const dAlt    = alt - camElev;

  // Screen-space displacement vector (pixels from canvas centre)
  const sx = (dAz  / (AR.FOV_H / 2)) * (canvas.width  / 2);
  const sy = -(dAlt / (AR.FOV_V / 2)) * (canvas.height / 2);
  const slen = Math.sqrt(sx * sx + sy * sy);
  if (slen < 1) return;

  const cx = canvas.width  / 2;
  const cy = canvas.height / 2;

  // Safe-area boundaries — keep arrows clear of the compass strip and info bar.
  // Compass strip ends at ~11.4% of height; info bar occupies ~10% at the bottom.
  const mTop    = Math.round(canvas.height * 0.135) + 4; // below compass strip
  const mBottom = Math.round(canvas.height * 0.105) + 4; // above info bar
  const mSide   = Math.max(28, Math.round(canvas.width * 0.065));

  const xMin = mSide;
  const xMax = canvas.width  - mSide;
  const yMin = mTop;
  const yMax = canvas.height - mBottom;

  // Find where the direction ray exits the safe-area rectangle
  let t = Infinity;
  if (sx > 0.5)  t = Math.min(t, (xMax - cx) / sx);
  if (sx < -0.5) t = Math.min(t, (xMin - cx) / sx);
  if (sy > 0.5)  t = Math.min(t, (yMax - cy) / sy);
  if (sy < -0.5) t = Math.min(t, (yMin - cy) / sy);
  if (!isFinite(t) || t <= 0) return;

  // Clamp to boundary in case of floating-point overshoot
  const ex = Math.min(xMax, Math.max(xMin, cx + sx * t));
  const ey = Math.min(yMax, Math.max(yMin, cy + sy * t));

  const r          = Math.max(14, canvas.width * 0.032);
  const arrowAngle = Math.atan2(sy, sx);

  ctx.save();
  ctx.translate(ex, ey);

  // Dark backing circle
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.3, 0, Math.PI * 2);
  ctx.fill();

  // Arrow triangle pointing outward toward the object
  ctx.fillStyle = color;
  ctx.rotate(arrowAngle);
  ctx.beginPath();
  ctx.moveTo( r * 0.9,  0);
  ctx.lineTo(-r * 0.45, -r * 0.55);
  ctx.lineTo(-r * 0.45,  r * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.rotate(-arrowAngle);

  // Symbol label
  const fnt = Math.max(10, Math.round(canvas.height * 0.022));
  ctx.font         = `bold ${fnt}px sans-serif`;
  ctx.fillStyle    = color;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(symbol, 0, r * 1.35);

  ctx.restore();
}

// ─── Elevation grid ───────────────────────────────────────────────────────────
function _drawElevationGrid(ctx, canvas) {
  const camElev = (AR.elevation != null ? AR.elevation : 0) + AR.tiltOffset;
  const fnt = Math.max(10, Math.round(canvas.height * 0.022));
  ctx.save();
  ctx.font = `${fnt}px sans-serif`;
  ctx.textBaseline = 'middle';

  for (const alt of [-15, 15, 30, 45, 60, 75]) {
    const dAlt = alt - camElev;
    if (Math.abs(dAlt) > AR.FOV_V * 0.9) continue;
    const y = canvas.height / 2 - (dAlt / (AR.FOV_V / 2)) * (canvas.height / 2);
    if (y < 20 || y > canvas.height - 20) continue;

    ctx.strokeStyle = alt > 0 ? 'rgba(255,255,255,0.13)' : 'rgba(255,80,80,0.18)';
    ctx.lineWidth   = 1;
    ctx.setLineDash([4, 7]);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
    ctx.setLineDash([]);

    const lbl = (alt > 0 ? '+' : '') + alt + '°';
    ctx.fillStyle = alt > 0 ? 'rgba(255,255,255,0.4)' : 'rgba(255,120,120,0.5)';
    ctx.textAlign = 'left';
    ctx.fillText(lbl, 6, y);
    ctx.textAlign = 'right';
    ctx.fillText(lbl, canvas.width - 6, y);
  }
  ctx.restore();
}

// ─── Horizon line (with atmospheric gradient band) ────────────────────────────
function _drawHorizon(ctx, canvas) {
  const camElev = (AR.elevation != null ? AR.elevation : 0) + AR.tiltOffset;
  const y = canvas.height / 2 + (camElev / (AR.FOV_V / 2)) * (canvas.height / 2);
  if (y < -50 || y > canvas.height + 50) return;

  ctx.save();

  // Atmospheric glow band centred on the horizon
  const bandH = Math.max(24, canvas.height * 0.09);
  const grd = ctx.createLinearGradient(0, y - bandH, 0, y + bandH * 0.5);
  grd.addColorStop(0,   'rgba(80,160,255,0)');
  grd.addColorStop(0.35, 'rgba(80,160,255,0.07)');
  grd.addColorStop(0.6,  'rgba(255,210,120,0.10)');
  grd.addColorStop(1,   'rgba(255,130,60,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, y - bandH, canvas.width, bandH * 1.5);

  // Dashed horizon line
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth   = 1.5;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(canvas.width, y);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font      = `${Math.max(11, Math.round(canvas.height * 0.025))}px sans-serif`;
  ctx.fillText('— horizon —', 10, y - 4);
  ctx.restore();
}

// ─── Celestial path arcs (sun or moon trajectory across the day) ──────────────
// pts: [{az,alt}] pre-computed array (10-min steps).
// labelColor / labelPts: if provided, draws hourly time stamps (PhotoPills style).
function _drawCelestialPath(ctx, canvas, pts, color, labelColor, labelPts) {
  if (!pts || pts.length === 0) return;

  // Draw smooth arc
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth   = 2;
  ctx.setLineDash([5, 6]);

  let lastPt = null;
  ctx.beginPath();
  for (const p of pts) {
    if (p.alt < -5) { lastPt = null; continue; }
    const pt = _project(p.az, p.alt, canvas, 1.0);
    if (!pt) { lastPt = null; continue; }
    if (!lastPt) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
    lastPt = pt;
  }
  ctx.stroke();
  ctx.restore();

  // Hourly time stamps along arc (PhotoPills style)
  if (!labelColor || !labelPts) return;
  const fnt = Math.max(9, Math.round(canvas.height * 0.019));
  for (const p of labelPts) {
    if (p.alt < -2) continue;
    const pt = _project(p.az, p.alt, canvas, 0.88);
    if (!pt) continue;

    // Dot on arc
    ctx.save();
    ctx.fillStyle = labelColor;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Time chip above dot
    _drawChip(ctx, pt.x, pt.y - 10, p.label, fnt, labelColor, 'rgba(0,0,0,0.68)');
  }
}

// ─── Target location marker ───────────────────────────────────────────────────
// Shows the user's planned subject as a cyan marker with bearing + distance.
// The target is projected at altitude 0° (on the horizon plane).
function _drawTargetMarker(ctx, canvas) {
  if (state.targetLat === null || state.targetLon === null) return;
  if (state.currentLat === null || AR.heading === null) return;

  const az    = _bearingTo(state.currentLat, state.currentLon, state.targetLat, state.targetLon);
  const color = '#00e5ff';
  const r     = Math.max(12, Math.round(canvas.width * 0.025));
  const pt    = _project(az, 0, canvas);

  if (!pt) {
    _drawOffScreenArrow(ctx, canvas, az, 0, color, '🎯');
    return;
  }

  ctx.save();

  // Glow
  const grd = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, r * 2.5);
  grd.addColorStop(0, 'rgba(0,229,255,0.45)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(pt.x, pt.y, r * 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Target circle
  ctx.strokeStyle = color;
  ctx.lineWidth   = 2.5;
  ctx.beginPath();
  ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
  ctx.stroke();

  // Inner crosshair
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(pt.x - r * 0.5, pt.y); ctx.lineTo(pt.x + r * 0.5, pt.y);
  ctx.moveTo(pt.x, pt.y - r * 0.5); ctx.lineTo(pt.x, pt.y + r * 0.5);
  ctx.stroke();

  // Chip: bearing + distance
  const dist = _haversineKm(state.currentLat, state.currentLon, state.targetLat, state.targetLon);
  const distStr = dist < 1 ? `${(dist * 1000).toFixed(0)}m` : `${dist.toFixed(1)}km`;
  const fnt = Math.max(9, Math.round(canvas.height * 0.022));
  _drawChip(ctx, pt.x, pt.y - r - 4, `🎯 ${Math.round(az)}°  ${distStr}`, fnt, color, 'rgba(0,0,0,0.68)');

  ctx.restore();
}

// Returns true bearing (degrees, 0=N CW) from point 1 to point 2.
function _bearingTo(lat1, lon1, lat2, lon2) {
  const D2R = Math.PI / 180;
  const φ1  = lat1 * D2R, φ2 = lat2 * D2R;
  const Δλ  = (lon2 - lon1) * D2R;
  const y   = Math.sin(Δλ) * Math.cos(φ2);
  const x   = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

// Haversine great-circle distance in kilometres.
function _haversineKm(lat1, lon1, lat2, lon2) {
  const R   = 6371;
  const D2R = Math.PI / 180;
  const dLat = (lat2 - lat1) * D2R;
  const dLon = (lon2 - lon1) * D2R;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * D2R) * Math.cos(lat2 * D2R) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Compass direction badge (PhotoPills-style circle at bottom centre) ────────
function _drawCompassBadge(ctx, canvas) {
  if (AR.heading === null) return;
  const dir8 = ['N','NE','E','SE','S','SW','W','NW'];
  const dirLabel = dir8[Math.round(AR.heading / 45) % 8];
  const deg = Math.round(AR.heading);

  const r  = Math.max(28, Math.round(canvas.width * 0.065));
  const cx = canvas.width / 2;
  // Keep badge clear of the HTML bottom-HUD strip (~80px) plus a gap above it
  const hudH = Math.max(80, Math.round(canvas.height * 0.14));
  const cy = canvas.height - hudH - r - 8;

  ctx.save();

  // Outer ring glow
  const grd = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r * 1.5);
  grd.addColorStop(0, 'rgba(255,255,255,0.08)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.5, 0, Math.PI * 2);
  ctx.fill();

  // Badge background
  ctx.fillStyle   = 'rgba(0,0,0,0.62)';
  ctx.strokeStyle = AR.useRelative ? 'rgba(255,159,67,0.9)' : 'rgba(255,255,255,0.75)';
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Cardinal direction text
  const fntDir = Math.max(13, Math.round(canvas.height * 0.033));
  ctx.fillStyle    = AR.useRelative ? '#ff9f43' : '#ffffff';
  ctx.font         = `bold ${fntDir}px sans-serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(dirLabel, cx, cy - fntDir * 0.22);

  // Degree sub-label
  const fntDeg = Math.max(9, Math.round(canvas.height * 0.018));
  ctx.font         = `${fntDeg}px monospace`;
  ctx.fillStyle    = 'rgba(255,255,255,0.65)';
  ctx.fillText(`${deg}°`, cx, cy + fntDir * 0.62);

  ctx.restore();
}

// ─── Compass ruler (PhotoPills-style) ────────────────────────────────────────
function _drawCompassRuler(ctx, canvas) {
  if (AR.heading === null) return;

  const heading    = AR.heading;
  const pixPerDeg  = canvas.width / AR.FOV_H;
  const rulerH     = Math.round(canvas.height * 0.072);   // total ruler strip height
  const tickTop    = Math.round(canvas.height * 0.042);   // where ticks start (below heading text)
  const cardFntSz  = Math.max(11, Math.round(canvas.height * 0.030));
  const headFntSz  = Math.max(14, Math.round(canvas.height * 0.038));
  const stripH     = tickTop + rulerH + 4;

  ctx.save();

  // Dark strip background
  ctx.fillStyle = 'rgba(0,0,0,0.52)';
  ctx.fillRect(0, 0, canvas.width, stripH);

  // Centre-pointer triangle ▼ above the tick strip
  const cx = canvas.width / 2;
  const triY = tickTop - 1;
  ctx.fillStyle = AR.useRelative ? '#ff9f43' : '#f0c040';
  ctx.beginPath();
  ctx.moveTo(cx, triY + 6);
  ctx.lineTo(cx - 5, triY);
  ctx.lineTo(cx + 5, triY);
  ctx.closePath();
  ctx.fill();

  // Tick marks + cardinal labels
  const CARDS = { 0:'N', 45:'NE', 90:'E', 135:'SE', 180:'S', 225:'SW', 270:'W', 315:'NW' };
  const CARD_COLOR = { 0:'#ff6b6b', 180:'#ff6b6b' }; // N and S red, rest white

  for (let offset = -AR.FOV_H * 1.1; offset <= AR.FOV_H * 1.1; offset += 5) {
    const bearing = ((heading + offset) % 360 + 360) % 360;
    const snapped = Math.round(bearing / 5) * 5 % 360;
    if (Math.abs(((bearing - snapped + 180) % 360) - 180) > 2) continue;

    const x      = canvas.width / 2 + offset * pixPerDeg;
    if (x < 0 || x > canvas.width) continue;

    const isCard  = snapped % 45 === 0;
    const isMajor = snapped % 10 === 0;
    const tickLen = isCard   ? rulerH * 0.72
                  : isMajor  ? rulerH * 0.48
                  :            rulerH * 0.25;

    ctx.strokeStyle = isCard  ? (CARD_COLOR[snapped] || '#fff')
                    : isMajor ? 'rgba(255,255,255,0.55)'
                    :           'rgba(255,255,255,0.25)';
    ctx.lineWidth   = isCard ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x, tickTop);
    ctx.lineTo(x, tickTop + tickLen);
    ctx.stroke();

    if (isCard) {
      ctx.fillStyle = CARD_COLOR[snapped] || '#fff';
      ctx.font      = `bold ${cardFntSz}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(CARDS[snapped], x, tickTop + rulerH * 0.72 + 2);
      ctx.textBaseline = 'alphabetic';
    }
  }

  // Large central heading readout
  const dir       = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  const dirLabel  = dir[Math.round(heading / 22.5) % 16];
  const relSuffix = AR.useRelative ? ' REL' : '';
  const headLabel = `${dirLabel}  ${Math.round(heading)}°${relSuffix}`;
  ctx.fillStyle    = AR.useRelative ? '#ff9f43' : '#f0c040';
  ctx.font         = `bold ${headFntSz}px monospace`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(headLabel, canvas.width / 2, tickTop / 2);
  ctx.textBaseline = 'alphabetic';

  // Elevation readout (right side of heading strip)
  if (AR.elevation !== null) {
    const elevLabel = `${AR.elevation >= 0 ? '+' : ''}${Math.round(AR.elevation)}°`;
    ctx.fillStyle  = 'rgba(255,255,255,0.6)';
    ctx.font       = `${Math.max(11, Math.round(canvas.height * 0.025))}px monospace`;
    ctx.textAlign  = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('↑ ' + elevLabel, canvas.width - 10, tickTop / 2);
    ctx.textBaseline = 'alphabetic';
  }

  ctx.restore();
}

// ─── Rise / Set markers on the compass ruler ──────────────────────────────────
function _drawRiseSetOnRuler(ctx, canvas) {
  if (AR.heading === null || !AR._cache.riseSetData) return;

  const { times, moonTimes } = AR._cache.riseSetData;
  const lat = state.currentLat, lon = state.currentLon;
  const pixPerDeg = canvas.width / AR.FOV_H;
  const fntSz     = Math.max(9, Math.round(canvas.height * 0.021));

  // Match the compass ruler's stripH (tickTop + rulerH + 4) so rise/set
  // markers sit immediately below the compass strip background.
  const compassStripH = Math.round(canvas.height * 0.042)   // tickTop
                      + Math.round(canvas.height * 0.072)   // rulerH
                      + 4;
  const markerY = compassStripH + fntSz + 2;

  // Extend dark background to cover marker row
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, compassStripH, canvas.width, fntSz + 6);
  ctx.restore();

  function _mark(time, getPosFn, color, symbol, rise) {
    if (!time || isNaN(time)) return;
    const pos = getPosFn(time, lat, lon);
    const az  = (toDeg(pos.azimuth) + 180 + 360) % 360;
    let dAz   = az - AR.heading;
    while (dAz >  180) dAz -= 360;
    while (dAz < -180) dAz += 360;
    if (Math.abs(dAz) > AR.FOV_H * 0.9) return;
    const x = canvas.width / 2 + dAz * pixPerDeg;
    ctx.save();
    ctx.font      = `${fntSz}px sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.fillText(symbol + (rise ? '↑' : '↓'), x, markerY);
    ctx.restore();
  }

  _mark(times.sunrise,  (t,la,lo) => SunCalc.getPosition(t, la, lo),     '#FFD700',              '☀', true);
  _mark(times.sunset,   (t,la,lo) => SunCalc.getPosition(t, la, lo),     '#FF8C00',              '☀', false);
  _mark(moonTimes.rise, (t,la,lo) => SunCalc.getMoonPosition(t, la, lo), 'rgba(160,210,255,0.9)','☽', true);
  _mark(moonTimes.set,  (t,la,lo) => SunCalc.getMoonPosition(t, la, lo), 'rgba(160,210,255,0.7)','☽', false);
}

// ─── Galactic Center ──────────────────────────────────────────────────────────
function _drawGalacticCenter(ctx, canvas, date, lat, lon) {
  const gc  = getGalacticCenterPos(date, lat, lon);
  const az  = (gc.azimuth_north_deg + 360) % 360;
  const alt = toDeg(gc.altitude);
  if (alt < -10) return;

  const pt = _project(az, alt, canvas);
  if (!pt) {
    _drawOffScreenArrow(ctx, canvas, az, alt, '#c678dd', '🌌');
    return;
  }

  const r   = Math.max(10, Math.round(canvas.width * 0.022));
  const fnt = Math.max(9,  Math.round(canvas.height * 0.022));

  ctx.save();
  // Purple glow
  const grd = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, r * 3.5);
  grd.addColorStop(0, 'rgba(180,80,255,0.45)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(pt.x, pt.y, r * 3.5, 0, Math.PI * 2);
  ctx.fill();

  // Star burst spokes
  ctx.strokeStyle = 'rgba(200,130,255,0.85)';
  ctx.lineWidth   = 1.5;
  for (let a = 0; a < 8; a++) {
    const ang = (a * Math.PI) / 4;
    ctx.beginPath();
    ctx.moveTo(pt.x + Math.cos(ang) * r * 0.4, pt.y + Math.sin(ang) * r * 0.4);
    ctx.lineTo(pt.x + Math.cos(ang) * r * 1.3, pt.y + Math.sin(ang) * r * 1.3);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(220,160,255,0.95)';
  ctx.beginPath();
  ctx.arc(pt.x, pt.y, r * 0.38, 0, Math.PI * 2);
  ctx.fill();

  _drawChip(ctx, pt.x, pt.y - r - 4, `🌌 GC  ${alt.toFixed(1)}°`, fnt, '#c678dd', 'rgba(0,0,0,0.65)');
  ctx.restore();
}

// ─── Planetary positions (Paul Schlyter simplified orbital elements) ──────────
const _PLANET_ELEMS = {
  Mercury: {
    N: [48.3313, 3.24587e-5], i: [7.0047, 5.00e-8],   w: [29.1241, 1.01444e-5],
    a: 0.387098, e: [0.205635, 5.59e-10],              M: [168.6562, 4.0923344368],
    color: '#c8a0ff', symbol: '☿',
  },
  Venus: {
    N: [76.6799, 2.46590e-5], i: [3.3946, 2.75e-8],   w: [54.8910, 1.38374e-5],
    a: 0.723330, e: [0.006773, -1.302e-9],             M: [48.0052, 1.6021302244],
    color: '#ffe880', symbol: '♀',
  },
  Mars: {
    N: [49.5574, 2.11081e-5], i: [1.8497, -1.78e-8],  w: [286.5016, 2.92961e-5],
    a: 1.523688, e: [0.093405, 2.516e-9],              M: [18.6021, 0.5240207766],
    color: '#ff7050', symbol: '♂',
  },
  Jupiter: {
    N: [100.4542, 2.76854e-5], i: [1.3030, -1.557e-7], w: [273.8777, 1.64505e-5],
    a: 5.20256, e: [0.048498, 4.469e-9],               M: [19.8950, 0.0830853001],
    color: '#f8d890', symbol: '♃',
  },
  Saturn: {
    N: [113.6634, 2.38980e-5], i: [2.4886, -1.081e-7], w: [339.3939, 2.97661e-5],
    a: 9.55475, e: [0.055546, -9.499e-9],              M: [316.9670, 0.0334442282],
    color: '#e8c870', symbol: '♄',
  },
};

function _solvePlanetAzAlt(name, date, lat, lon) {
  const D2R = Math.PI / 180;
  const R2D = 180 / Math.PI;
  // Days from J2000.0 (JD 2451545.0)
  const d = date.getTime() / 86400000 + 2440587.5 - 2451545.0;

  function _kepler(M_deg, ecc) {
    const M = ((M_deg % 360) + 360) % 360 * D2R;
    let E = M;
    for (let i = 0; i < 10; i++) {
      const dE = (E - ecc * Math.sin(E) - M) / (1 - ecc * Math.cos(E));
      E -= dE;
      if (Math.abs(dE) < 1e-8) break;
    }
    return E; // radians
  }

  function _helio(pl) {
    const N   = ((pl.N[0] + pl.N[1] * d) % 360 + 360) % 360 * D2R;
    const inc = (pl.i[0] + pl.i[1] * d) * D2R;
    const w   = ((pl.w[0] + pl.w[1] * d) % 360 + 360) % 360 * D2R;
    const ecc = pl.e[0] + pl.e[1] * d;
    const E   = _kepler(pl.M[0] + pl.M[1] * d, ecc);
    const v   = Math.atan2(Math.sqrt(1 - ecc * ecc) * Math.sin(E), Math.cos(E) - ecc);
    const r   = pl.a * (1 - ecc * Math.cos(E));
    const vw  = v + w;
    return {
      x: r * (Math.cos(N) * Math.cos(vw) - Math.sin(N) * Math.sin(vw) * Math.cos(inc)),
      y: r * (Math.sin(N) * Math.cos(vw) + Math.cos(N) * Math.sin(vw) * Math.cos(inc)),
      z: r * (Math.sin(vw) * Math.sin(inc)),
    };
  }

  // Earth heliocentric position (Sun orbital elements)
  const sunEcc = 0.016709 - 1.151e-9 * d;
  const earthE = _kepler(356.0470 + 0.9856002585 * d, sunEcc);
  const earthV = Math.atan2(Math.sqrt(1 - sunEcc * sunEcc) * Math.sin(earthE), Math.cos(earthE) - sunEcc);
  const earthW = ((282.9404 + 4.70935e-5 * d) % 360 + 360) % 360 * D2R;
  const earthR = 1.000001018 * (1 - sunEcc * Math.cos(earthE));
  const xe = earthR * Math.cos(earthV + earthW);
  const ye = earthR * Math.sin(earthV + earthW);

  const h = _helio(_PLANET_ELEMS[name]);

  // Geocentric ecliptic coordinates
  const xg = h.x - xe, yg = h.y - ye, zg = h.z;

  // Ecliptic → equatorial (obliquity of ecliptic)
  const eps = (23.4393 - 3.563e-7 * d) * D2R;
  const xeq = xg;
  const yeq = yg * Math.cos(eps) - zg * Math.sin(eps);
  const zeq = yg * Math.sin(eps) + zg * Math.cos(eps);

  const RA  = Math.atan2(yeq, xeq);
  const Dec = Math.atan2(zeq, Math.sqrt(xeq * xeq + yeq * yeq));

  // Equatorial → horizontal
  const JD  = date.getTime() / 86400000 + 2440587.5;
  const LST = ((280.46061837 + 360.98564736629 * (JD - 2451545.0) + lon) % 360 + 360) % 360 * D2R;
  const HA  = LST - RA;
  const lat_r = lat * D2R;

  const sinAlt = Math.sin(Dec) * Math.sin(lat_r) + Math.cos(Dec) * Math.cos(lat_r) * Math.cos(HA);
  const altR   = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  const cosAz  = (Math.sin(Dec) - Math.sin(altR) * Math.sin(lat_r)) / (Math.cos(altR) * Math.cos(lat_r));
  let azR      = Math.acos(Math.max(-1, Math.min(1, cosAz)));
  if (Math.sin(HA) > 0) azR = 2 * Math.PI - azR;

  return { az: azR * R2D, alt: altR * R2D };
}

function _drawPlanets(ctx, canvas) {
  if (!AR._cache.planetsData) return;
  const fnt = Math.max(9, Math.round(canvas.height * 0.022));
  const r   = Math.max(5, Math.round(canvas.width  * 0.012));

  for (const { name, az, alt, pl } of AR._cache.planetsData) {
    if (alt < -10) continue;

    const pt = _project(az, alt, canvas);
    if (!pt) {
      _drawOffScreenArrow(ctx, canvas, az, alt, pl.color, pl.symbol);
      continue;
    }

    ctx.save();
    // Glow
    const grd = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, r * 2.8);
    grd.addColorStop(0, pl.color + 'aa');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, r * 2.8, 0, Math.PI * 2);
    ctx.fill();
    // Disk
    ctx.fillStyle   = pl.color;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Label
    _drawChip(ctx, pt.x, pt.y - r - 4,
      `${pl.symbol} ${name.slice(0, 3)}  ${alt.toFixed(1)}°`, fnt, pl.color, 'rgba(0,0,0,0.65)');
    ctx.restore();
  }
}

// ─── Sun drawing (PhotoPills-style: large disk + radiating rays) ──────────────
function _drawSun(ctx, x, y, alt, canvas) {
  const r   = Math.max(22, Math.round(canvas.width * 0.058));
  const fnt = Math.max(11, Math.round(canvas.height * 0.026));
  const col = alt > 0 ? '#FFD700' : '#FF8C00';
  ctx.save();

  // Outer atmospheric glow
  const grd = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 3.2);
  grd.addColorStop(0, alt > 0 ? 'rgba(255,230,80,0.45)' : 'rgba(255,120,0,0.38)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(x, y, r * 3.2, 0, Math.PI * 2);
  ctx.fill();

  // Radiating rays (PhotoPills style)
  ctx.strokeStyle = col;
  ctx.lineCap     = 'round';
  for (let i = 0; i < 16; i++) {
    const angle  = (i * Math.PI * 2) / 16;
    const inner  = r * 1.32;
    const outer  = r * (i % 2 === 0 ? 2.1 : 1.72);
    ctx.lineWidth = i % 2 === 0 ? Math.max(2, r * 0.1) : Math.max(1, r * 0.06);
    ctx.globalAlpha = i % 2 === 0 ? 0.9 : 0.6;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner);
    ctx.lineTo(x + Math.cos(angle) * outer, y + Math.sin(angle) * outer);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.lineCap     = 'butt';

  // Sun disk
  ctx.fillStyle   = col;
  ctx.strokeStyle = alt > 0 ? 'rgba(255,255,180,0.9)' : 'rgba(255,200,80,0.8)';
  ctx.lineWidth   = 2.5;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Label
  _drawChip(ctx, x, y - r * 2.3, `☀  ${alt.toFixed(1)}°`, fnt, '#FFD700', 'rgba(0,0,0,0.72)');
  ctx.restore();
}

// ─── Moon drawing (PhotoPills-style: large disk with glow halo) ───────────────
function _drawMoon(ctx, x, y, alt, canvas) {
  const r      = Math.max(18, Math.round(canvas.width * 0.048));
  const fnt    = Math.max(11, Math.round(canvas.height * 0.026));
  const illum  = Math.round(SunCalc.getMoonIllumination(_getARDate()).fraction * 100);
  const moonColor = alt > 0 ? 'rgba(215,232,255,0.96)' : 'rgba(140,140,175,0.82)';
  ctx.save();

  // Outer halo glow
  const grd = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 2.8);
  grd.addColorStop(0, 'rgba(180,210,255,0.38)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.8, 0, Math.PI * 2);
  ctx.fill();

  // Moon disk
  ctx.fillStyle   = moonColor;
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth   = 2.5;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Label
  _drawChip(ctx, x, y - r * 2.0, `☽  ${alt.toFixed(1)}°  ${illum}%`, fnt, '#a8d8ea', 'rgba(0,0,0,0.72)');
  ctx.restore();
}

// ─── Chip / badge label helper ────────────────────────────────────────────────
function _drawChip(ctx, cx, y, text, fontSize, textColor, bgColor) {
  ctx.font = `bold ${fontSize}px sans-serif`;
  const w  = ctx.measureText(text).width + 14;
  const h  = fontSize + 8;
  const rx = cx - w / 2;
  const ry = y - h;
  ctx.fillStyle = bgColor;
  ctx.beginPath();
  _roundRect(ctx, rx, ry, w, h, 5);
  ctx.fill();
  ctx.fillStyle    = textColor;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, ry + h / 2);
  ctx.textBaseline = 'alphabetic';
}

// ─── Info bar (compact side chips, avoids compass badge at bottom centre) ─────
function _drawInfoBar(ctx, canvas, sunAz, sunAlt, moonAz, moonAlt) {
  const fnt  = Math.max(10, Math.round(canvas.height * 0.023));
  const date = _getARDate();
  const moonInfo = SunCalc.getMoonIllumination(date);
  const phase    = moonPhaseEmoji(moonInfo.phase);

  // Left chip — Sun
  const sunLine  = `☀  ${sunAlt.toFixed(0)}°`;
  // Right chip — Moon
  const moonLine = `${phase} ${moonAlt.toFixed(0)}°`;

  const badgeR  = Math.max(28, Math.round(canvas.width * 0.065));
  const hudH    = Math.max(80, Math.round(canvas.height * 0.14));
  const badgeCY = canvas.height - hudH - badgeR - 8;
  // _drawChip draws from (cx, y) where y is the chip BOTTOM.
  // To centre chips at badge centre, pass badgeCY + half chip height.
  const chipHalfH = fnt / 2 + 4;
  const chipY  = badgeCY + chipHalfH;
  const margin = badgeR * 2.2 + 8;

  ctx.save();
  _drawChip(ctx, margin,                    chipY, sunLine,  fnt, '#FFD700',              'rgba(0,0,0,0.62)');
  _drawChip(ctx, canvas.width - margin, chipY, moonLine, fnt, 'rgba(180,220,255,0.95)', 'rgba(0,0,0,0.62)');
  ctx.restore();
}

// ─── Status bar (top HUD text) ────────────────────────────────────────────────
function _updateStatusBar() {
  const el = document.getElementById('ar-status');
  if (!el) return;
  if (AR.heading === null) {
    if (!AR.absEventSeen) {
      el.textContent = 'No compass signal';
    } else if (AR.absNullCount > 20) {
      el.textContent = 'Compass blocked — check Chrome site settings';
    } else {
      el.textContent = 'Calibrating compass…';
    }
    return;
  }
  const dirs = ['N','NE','E','SE','S','SW','W','NW'];
  const dir  = dirs[Math.round(AR.heading / 45) % 8];
  const elev = AR.elevation != null ? `  ↑${AR.elevation.toFixed(0)}°` : '';
  const date = _getARDate();
  const time = minutesToAmPm(date.getHours() * 60 + date.getMinutes());
  const rel  = AR.useRelative ? '  (REL)' : '';
  el.textContent = `${dir} ${Math.round(AR.heading)}°${elev}${rel}  ·  ${time}`;
}

// ─── Waiting / error message ──────────────────────────────────────────────────
function _drawMessage(ctx, canvas, msg) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const lines = msg.split('\n');
  const fnt   = Math.max(14, Math.round(canvas.width * 0.04));
  ctx.font      = `${fnt}px sans-serif`;
  ctx.fillStyle = '#8b949e';
  ctx.textAlign = 'center';
  lines.forEach((line, i) => {
    ctx.fillText(line, canvas.width / 2, canvas.height / 2 + (i - (lines.length - 1) / 2) * (fnt + 8));
  });
  ctx.restore();
}

// ─── Screenshot capture ───────────────────────────────────────────────────────
// Composites the live video frame and the AR canvas overlay into a single PNG download.
function _captureARView() {
  const video  = document.getElementById('ar-video');
  const arCanvas = document.getElementById('ar-canvas');
  if (!arCanvas) return;

  const out = document.createElement('canvas');
  out.width  = arCanvas.width  || window.innerWidth;
  out.height = arCanvas.height || window.innerHeight;
  const ctx  = out.getContext('2d');

  // Draw the camera frame first, scaled to canvas size
  if (video && video.readyState >= 2) {
    try { ctx.drawImage(video, 0, 0, out.width, out.height); } catch (_) {}
  }
  // Overlay the AR canvas
  ctx.drawImage(arCanvas, 0, 0);

  const url = out.toDataURL('image/png');
  const a   = document.createElement('a');
  a.href     = url;
  a.download = `PhotoPlanner_AR_${new Date().toISOString().slice(0,19).replace(/[T:]/g,'-')}.png`;
  a.click();
  showToast('AR snapshot saved.', 'success');
}

// ─── FOV slider ───────────────────────────────────────────────────────────────
function _initFOVSlider() {
  const sl  = document.getElementById('ar-fov-slider');
  const lbl = document.getElementById('ar-fov-label');
  if (!sl || !lbl) return;
  sl.value = AR.FOV_H;
  lbl.textContent = AR.FOV_H + '°';
  sl.addEventListener('input', () => {
    AR.FOV_H = +sl.value;
    AR.FOV_V = Math.round(AR.FOV_H * 0.75);
    lbl.textContent = AR.FOV_H + '°';
  });
}

// ─── AR time controls + layer toggles ────────────────────────────────────────
function _initARTimeControls() {
  const slider = document.getElementById('ar-time-slider');
  if (slider) slider.addEventListener('input', _updateARTimeLabel);

  document.querySelectorAll('.ar-layer-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const layer = btn.dataset.layer;
      AR.layers[layer] = !AR.layers[layer];
      btn.classList.toggle('active', AR.layers[layer]);
    });
  });

  // Horizon tilt calibration buttons
  function _updateTiltLabel() {
    const el = document.getElementById('ar-tilt-offset');
    if (el) el.textContent = (AR.tiltOffset >= 0 ? '+' : '') + AR.tiltOffset + '°';
  }
  const tiltUp   = document.getElementById('ar-tilt-up');
  const tiltDown = document.getElementById('ar-tilt-down');
  if (tiltUp)   tiltUp.addEventListener('click',   () => { AR.tiltOffset = Math.min(30, AR.tiltOffset + 1); _updateTiltLabel(); });
  if (tiltDown) tiltDown.addEventListener('click', () => { AR.tiltOffset = Math.max(-30, AR.tiltOffset - 1); _updateTiltLabel(); });
}

// ─── Init ─────────────────────────────────────────────────────────────────────
function initAR() {
  const openBtn    = document.getElementById('ar-view-btn');
  const closeBtn   = document.getElementById('ar-close-btn');
  const captureBtn = document.getElementById('ar-capture-btn');
  if (openBtn)    openBtn.addEventListener('click', openARView);
  if (closeBtn)   closeBtn.addEventListener('click', closeARView);
  if (captureBtn) captureBtn.addEventListener('click', _captureARView);
  _initFOVSlider();
  _initARTimeControls();
}
