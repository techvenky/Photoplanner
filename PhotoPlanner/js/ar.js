// ─── Live AR View ─────────────────────────────────────────────────────────────
// Points the device camera at the sky and overlays live sun/moon/planet positions.
// Uses:  getUserMedia (rear camera)  +  DeviceOrientationEvent (compass/tilt)

const AR = {
  stream:        null,
  animFrame:     null,
  heading:       null,   // degrees 0–360, 0 = North
  elevation:     null,   // camera tilt above horizon in degrees
  FOV_H:         62,     // horizontal field-of-view (degrees) — typical rear camera
  FOV_V:         46,     // vertical field-of-view
  useAbsolute:   false,  // true once deviceorientationabsolute gives valid data
  useRelative:   false,  // Android fallback: treat relative alpha as north-ref after timeout
  compassTimer:  null,   // fallback timer handle
  layers: { sun: true, moon: true, mw: true, planets: true, path: true, grid: true },
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
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
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
  _startOrientation();
  _scheduleFrame();
}

function closeARView() {
  const overlay = document.getElementById('ar-overlay');
  if (overlay) overlay.classList.remove('active');
  document.body.classList.remove('modal-open');
  _stopCamera();
  _stopOrientation();
  if (AR.animFrame)    { cancelAnimationFrame(AR.animFrame); AR.animFrame = null; }
  if (AR.compassTimer) { clearTimeout(AR.compassTimer);      AR.compassTimer = null; }
  AR.heading = AR.elevation = null;
  AR.useAbsolute = false;
  AR.useRelative = false;
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
        const msg = e.name === 'NotAllowedError'  ? 'Camera permission denied.' :
                    e.name === 'NotFoundError'     ? 'No camera found on this device.' :
                    e.name === 'NotReadableError'  ? 'Camera is in use by another app.' :
                    'Camera unavailable: ' + (e.message || e.name);
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
  // Only lock out the fallback once we have valid absolute data.
  // On Android the event fires with alpha=null until a magnetic fix is acquired.
  if (e.alpha != null || e.webkitCompassHeading != null) {
    AR.useAbsolute = true;
  }
  _processOrientation(e, true);
}

function _onOrientation(e) {
  if (AR.useAbsolute) return;  // prefer absolute when available

  // iOS: webkitCompassHeading is always north-referenced — use it directly.
  if (e.webkitCompassHeading != null) {
    _processOrientation(e, false);
    return;
  }

  // Android browsers that never fire deviceorientationabsolute (Firefox, older Samsung
  // Internet): after the 4-second grace period, use relative alpha as a best-effort
  // compass. The user sees a warning toast before this engages.
  if (AR.useRelative && e.alpha != null) {
    _processOrientation(e, true);
  }
}

function _processOrientation(e, isAbsolute) {
  const screenAngle = _getScreenAngle();

  // ── Heading ─────────────────────────────────────────────────────────────────
  // Both webkitCompassHeading (iOS) and alpha (Android) report the direction of
  // the device's physical top (Y-axis). Subtracting the screen rotation gives
  // the direction the camera lens is actually facing.
  let rawHeading = null;
  if (e.webkitCompassHeading != null) {
    rawHeading = e.webkitCompassHeading;           // iOS: true magnetic north, CW
  } else if (isAbsolute && e.alpha != null) {
    rawHeading = (360 - e.alpha + 360) % 360;      // Android absolute: alpha=0 → North
  }
  if (rawHeading !== null) {
    AR.heading = (rawHeading - screenAngle + 360) % 360;
  }

  // ── Elevation ───────────────────────────────────────────────────────────────
  // Portrait / portrait-upside-down: beta controls front-back tilt.
  //   beta=90° → upright (horizon), beta=0° → flat face-up (zenith), beta=180° → face-down
  // Landscape: gamma controls up-down tilt (left-right tilt in portrait).
  //   Landscape-CW (90°):  elevation = −gamma
  //   Landscape-CCW (270°): elevation =  gamma
  if (screenAngle === 0 || screenAngle === 180) {
    if (e.beta != null) {
      const beta = screenAngle === 0 ? e.beta : -e.beta;
      AR.elevation = Math.min(90, Math.max(-90, 90 - beta));
    }
  } else {
    if (e.gamma != null) {
      const gamma = screenAngle === 90 ? -e.gamma : e.gamma;
      AR.elevation = Math.min(90, Math.max(-90, gamma));
    }
  }
}

function _startOrientation() {
  window.addEventListener('deviceorientationabsolute', _onOrientationAbsolute, true);
  window.addEventListener('deviceorientation',         _onOrientation,         true);

  // After 4 s with no heading signal, enable relative-alpha fallback so that
  // Android browsers without absolute-orientation support (Firefox, older
  // Samsung Internet) still get a usable — though not north-locked — compass.
  AR.compassTimer = setTimeout(() => {
    AR.compassTimer = null;
    if (AR.heading === null && !AR.useAbsolute) {
      AR.useRelative = true;
      showToast(
        'No absolute compass. Using relative orientation — rotate the device once to calibrate.',
        'warning'
      );
    }
  }, 4000);
}

function _stopOrientation() {
  window.removeEventListener('deviceorientationabsolute', _onOrientationAbsolute, true);
  window.removeEventListener('deviceorientation',         _onOrientation,         true);
  if (AR.compassTimer) { clearTimeout(AR.compassTimer); AR.compassTimer = null; }
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
  if (AR.heading === null) {
    _drawMessage(ctx, canvas, 'Waiting for compass…\nPoint device at the horizon\n(ensure motion & orientation access is allowed)');
    return;
  }

  const date = _getARDate();
  const lat  = state.currentLat, lon = state.currentLon;

  const sunPos  = SunCalc.getPosition(date, lat, lon);
  const moonPos = SunCalc.getMoonPosition(date, lat, lon);
  const sunAz   = (toDeg(sunPos.azimuth)  + 180 + 360) % 360;
  const sunAlt  =  toDeg(sunPos.altitude);
  const moonAz  = (toDeg(moonPos.azimuth) + 180 + 360) % 360;
  const moonAlt =  toDeg(moonPos.altitude);

  // ── Draw layers bottom-up ────────────────────────────────────────────────────
  if (AR.layers.grid)    _drawElevationGrid(ctx, canvas);
  _drawHorizon(ctx, canvas);
  if (AR.layers.path) {
    _drawCelestialPath(ctx, canvas,
      (d, la, lo) => SunCalc.getPosition(d, la, lo), 'rgba(255,200,50,0.45)');
    _drawCelestialPath(ctx, canvas,
      (d, la, lo) => SunCalc.getMoonPosition(d, la, lo), 'rgba(150,200,255,0.35)');
  }
  if (AR.layers.mw)      _drawGalacticCenter(ctx, canvas, date, lat, lon);
  if (AR.layers.planets) _drawPlanets(ctx, canvas, date, lat, lon);
  _drawCompassRuler(ctx, canvas);
  _drawRiseSetOnRuler(ctx, canvas, date, lat, lon);

  const sunXY  = _project(sunAz,  sunAlt,  canvas);
  const moonXY = _project(moonAz, moonAlt, canvas);
  if (AR.layers.sun  && sunXY)  _drawSun(ctx,  sunXY.x,  sunXY.y,  sunAlt,  canvas);
  if (AR.layers.moon && moonXY) _drawMoon(ctx, moonXY.x, moonXY.y, moonAlt, canvas);

  _drawInfoBar(ctx, canvas, sunAz, sunAlt, moonAz, moonAlt);
}

// ─── Projection: (azimuth°, altitude°) → canvas (x, y) ───────────────────────
function _project(az, alt, canvas, clipFrac = 0.75) {
  let dAz = az - AR.heading;
  while (dAz >  180) dAz -= 360;
  while (dAz < -180) dAz += 360;

  const camElev = AR.elevation != null ? AR.elevation : 0;
  const dAlt = alt - camElev;

  if (Math.abs(dAz)  > AR.FOV_H * clipFrac) return null;
  if (Math.abs(dAlt) > AR.FOV_V * clipFrac) return null;

  const x = canvas.width  / 2 + (dAz  / (AR.FOV_H / 2)) * (canvas.width  / 2);
  const y = canvas.height / 2 - (dAlt / (AR.FOV_V / 2)) * (canvas.height / 2);
  return { x, y };
}

// ─── Elevation grid ───────────────────────────────────────────────────────────
function _drawElevationGrid(ctx, canvas) {
  const camElev = AR.elevation != null ? AR.elevation : 0;
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

// ─── Horizon line ─────────────────────────────────────────────────────────────
function _drawHorizon(ctx, canvas) {
  const camElev = AR.elevation != null ? AR.elevation : 0;
  const y = canvas.height / 2 + (camElev / (AR.FOV_V / 2)) * (canvas.height / 2);

  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth   = 1.5;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(canvas.width, y);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font      = `${Math.max(11, Math.round(canvas.height * 0.025))}px sans-serif`;
  ctx.setLineDash([]);
  ctx.fillText('— horizon —', 10, y - 4);
  ctx.restore();
}

// ─── Celestial path arcs (sun or moon trajectory across the day) ──────────────
function _drawCelestialPath(ctx, canvas, getSunCalcPos, color) {
  const lat  = state.currentLat, lon = state.currentLon;
  const date = _getARDate();
  const base = new Date(date);
  base.setHours(0, 0, 0, 0);

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth   = 1.5;
  ctx.setLineDash([4, 5]);

  let lastPt = null;
  ctx.beginPath();
  for (let m = 0; m <= 1440; m += 30) {
    const d   = new Date(base.getTime() + m * 60000);
    const pos = getSunCalcPos(d, lat, lon);
    const az  = (toDeg(pos.azimuth) + 180 + 360) % 360;
    const alt =  toDeg(pos.altitude);
    if (alt < -3) { lastPt = null; continue; }
    const pt = _project(az, alt, canvas, 0.98);
    if (!pt) { lastPt = null; continue; }
    if (!lastPt) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
    lastPt = pt;
  }
  ctx.stroke();
  ctx.restore();
}

// ─── Compass ruler ────────────────────────────────────────────────────────────
function _drawCompassRuler(ctx, canvas) {
  if (AR.heading === null) return;

  const heading   = AR.heading;
  const tickH     = Math.round(canvas.height * 0.055);
  const y0        = Math.round(canvas.height * 0.06);
  const yLabel    = y0 + tickH + Math.round(canvas.height * 0.03);
  const pixPerDeg = canvas.width / AR.FOV_H;

  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 0, canvas.width, yLabel + 4);

  const CARDS = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE',
                  180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };

  for (let offset = -AR.FOV_H; offset <= AR.FOV_H; offset += 5) {
    const bearing     = ((heading + offset) % 360 + 360) % 360;
    const nearestFive = Math.round(bearing / 5) * 5 % 360;
    if (Math.abs(bearing - nearestFive) > 2) continue;

    const x      = canvas.width / 2 + offset * pixPerDeg;
    const isCard  = nearestFive % 45 === 0;
    const isMajor = nearestFive % 10 === 0;

    ctx.strokeStyle = isCard ? '#fff' : (isMajor ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.3)');
    ctx.lineWidth   = isCard ? 2 : 1;
    const tH        = isCard ? tickH : (isMajor ? tickH * 0.65 : tickH * 0.35);

    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y0 + tH);
    ctx.stroke();

    if (isCard) {
      ctx.fillStyle = '#fff';
      ctx.font      = `bold ${Math.max(10, Math.round(canvas.height * 0.028))}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(CARDS[nearestFive], x, yLabel);
    }
  }

  // Centre heading readout
  const dir   = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  const label = `${dir[Math.round(heading / 22.5) % 16]}  ${Math.round(heading)}°`;
  ctx.fillStyle = '#f0c040';
  ctx.font      = `bold ${Math.max(12, Math.round(canvas.height * 0.032))}px monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(label, canvas.width / 2, Math.round(canvas.height * 0.03));

  ctx.restore();
}

// ─── Rise / Set markers on the compass ruler ──────────────────────────────────
function _drawRiseSetOnRuler(ctx, canvas, date, lat, lon) {
  if (AR.heading === null) return;

  const times     = SunCalc.getTimes(date, lat, lon);
  const moonTimes = SunCalc.getMoonTimes(date, lat, lon);
  const pixPerDeg = canvas.width / AR.FOV_H;
  const fntSz     = Math.max(9, Math.round(canvas.height * 0.021));

  // Row just below the compass ruler background
  const markerY = Math.round(canvas.height * 0.06)    // y0
                + Math.round(canvas.height * 0.055)   // tickH
                + Math.round(canvas.height * 0.03)    // gap
                + Math.max(10, Math.round(canvas.height * 0.028)) // cardinal label height
                + fntSz + 4;

  // Extend dark background to cover marker row
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, markerY - fntSz - 2, canvas.width, fntSz + 8);
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

  const pt = _project(az, alt, canvas, 0.9);
  if (!pt) return;

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

function _drawPlanets(ctx, canvas, date, lat, lon) {
  const fnt = Math.max(9, Math.round(canvas.height * 0.022));
  const r   = Math.max(5, Math.round(canvas.width  * 0.012));

  for (const [name, pl] of Object.entries(_PLANET_ELEMS)) {
    let pos;
    try { pos = _solvePlanetAzAlt(name, date, lat, lon); } catch (_) { continue; }
    if (pos.alt < -10) continue;

    const pt = _project(pos.az, pos.alt, canvas, 0.9);
    if (!pt) continue;

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
      `${pl.symbol} ${name.slice(0, 3)}  ${pos.alt.toFixed(1)}°`, fnt, pl.color, 'rgba(0,0,0,0.65)');
    ctx.restore();
  }
}

// ─── Sun drawing ──────────────────────────────────────────────────────────────
function _drawSun(ctx, x, y, alt, canvas) {
  const r   = Math.max(14, Math.round(canvas.width * 0.045));
  const fnt = Math.max(10, Math.round(canvas.height * 0.025));
  ctx.save();
  const grd = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 2.2);
  grd.addColorStop(0, alt > 0 ? 'rgba(255,220,50,0.55)' : 'rgba(255,100,0,0.45)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle   = alt > 0 ? '#FFD700' : '#FF6600';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  _drawChip(ctx, x, y - r - 6, `☀ ${alt.toFixed(1)}°`, fnt, '#FFD700', 'rgba(0,0,0,0.6)');
  ctx.restore();
}

// ─── Moon drawing ─────────────────────────────────────────────────────────────
function _drawMoon(ctx, x, y, alt, canvas) {
  const r      = Math.max(12, Math.round(canvas.width * 0.038));
  const fnt    = Math.max(10, Math.round(canvas.height * 0.025));
  const illum  = Math.round(SunCalc.getMoonIllumination(_getARDate()).fraction * 100);
  ctx.save();
  const grd = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 2);
  grd.addColorStop(0, 'rgba(180,210,255,0.35)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(x, y, r * 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle   = alt > 0 ? 'rgba(200,220,255,0.92)' : 'rgba(130,130,160,0.75)';
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  _drawChip(ctx, x, y - r - 6, `☽ ${alt.toFixed(1)}°  ${illum}%`, fnt, '#a8d8ea', 'rgba(0,0,0,0.6)');
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
  ctx.roundRect(rx, ry, w, h, 5);
  ctx.fill();
  ctx.fillStyle    = textColor;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, ry + h / 2);
  ctx.textBaseline = 'alphabetic';
}

// ─── Info bar (bottom) ────────────────────────────────────────────────────────
function _drawInfoBar(ctx, canvas, sunAz, sunAlt, moonAz, moonAlt) {
  const fnt  = Math.max(11, Math.round(canvas.height * 0.028));
  const pad  = 12;
  const lh   = fnt + 10;
  const date = _getARDate();
  const moonInfo = SunCalc.getMoonIllumination(date);
  const phase    = moonPhaseEmoji(moonInfo.phase);

  const lines = [
    `☀  Az ${sunAz.toFixed(1)}°   Alt ${sunAlt.toFixed(1)}°`,
    `${phase}  Az ${moonAz.toFixed(1)}°   Alt ${moonAlt.toFixed(1)}°`,
  ];
  const boxH = lines.length * lh + pad * 1.5;
  const by   = canvas.height - boxH - 8;

  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  ctx.roundRect(8, by, canvas.width - 16, boxH, 10);
  ctx.fill();
  ctx.font      = `${fnt}px sans-serif`;
  ctx.fillStyle = '#e6edf3';
  ctx.textAlign = 'left';
  lines.forEach((line, i) => {
    ctx.fillText(line, 8 + pad, by + pad + lh * i + fnt * 0.85);
  });
  ctx.restore();
}

// ─── Status bar (top HUD text) ────────────────────────────────────────────────
function _updateStatusBar() {
  const el = document.getElementById('ar-status');
  if (!el) return;
  if (AR.heading === null) {
    el.textContent = 'No compass signal';
    return;
  }
  const dirs = ['N','NE','E','SE','S','SW','W','NW'];
  const dir  = dirs[Math.round(AR.heading / 45) % 8];
  const elev = AR.elevation != null ? `  ↑${AR.elevation.toFixed(0)}°` : '';
  const date = _getARDate();
  const time = minutesToAmPm(date.getHours() * 60 + date.getMinutes());
  el.textContent = `${dir} ${Math.round(AR.heading)}°${elev}  ·  ${time}`;
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
}

// ─── Init ─────────────────────────────────────────────────────────────────────
function initAR() {
  const openBtn  = document.getElementById('ar-view-btn');
  const closeBtn = document.getElementById('ar-close-btn');
  if (openBtn)  openBtn.addEventListener('click', openARView);
  if (closeBtn) closeBtn.addEventListener('click', closeARView);
  _initFOVSlider();
  _initARTimeControls();
}
