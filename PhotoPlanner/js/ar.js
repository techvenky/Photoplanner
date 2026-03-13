// ─── Live AR View ─────────────────────────────────────────────────────────────
// Points the device camera at the sky and overlays live sun/moon positions.
// Uses:  getUserMedia (rear camera)  +  DeviceOrientationEvent (compass/tilt)

const AR = {
  stream:       null,
  animFrame:    null,
  heading:      null,   // degrees 0–360, 0 = North
  elevation:    null,   // camera tilt above horizon in degrees
  FOV_H:        62,     // horizontal field-of-view (degrees) — typical rear camera
  FOV_V:        46,     // vertical   field-of-view
  useAbsolute:  false,  // true when deviceorientationabsolute fired
};

// ─── Open / Close ─────────────────────────────────────────────────────────────
async function openARView() {
  if (!navigator.mediaDevices?.getUserMedia) {
    showToast('Camera API not supported by this browser.', 'danger');
    return;
  }

  // iOS 13+ requires a user-gesture before requesting orientation permission
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      const perm = await DeviceOrientationEvent.requestPermission();
      if (perm !== 'granted') {
        showToast('Orientation permission denied — AR compass will not work.', 'warning');
      }
    } catch (_) {}
  }

  const overlay = document.getElementById('ar-overlay');
  if (overlay) overlay.classList.add('active');

  await _startCamera();
  _startOrientation();
  _scheduleFrame();
}

function closeARView() {
  const overlay = document.getElementById('ar-overlay');
  if (overlay) overlay.classList.remove('active');
  _stopCamera();
  _stopOrientation();
  if (AR.animFrame) { cancelAnimationFrame(AR.animFrame); AR.animFrame = null; }
  AR.heading = AR.elevation = null;
}

// ─── Camera ───────────────────────────────────────────────────────────────────
async function _startCamera() {
  try {
    AR.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } },
      audio: false,
    });
    const video = document.getElementById('ar-video');
    if (video) { video.srcObject = AR.stream; await video.play().catch(() => {}); }
  } catch (e) {
    showToast('Camera unavailable: ' + (e.message || e.name), 'danger');
    closeARView();
  }
}

function _stopCamera() {
  if (AR.stream) { AR.stream.getTracks().forEach(t => t.stop()); AR.stream = null; }
  const video = document.getElementById('ar-video');
  if (video) { video.srcObject = null; }
}

// ─── Orientation ──────────────────────────────────────────────────────────────
function _onOrientationAbsolute(e) {
  AR.useAbsolute = true;
  _processOrientation(e);
}

function _onOrientation(e) {
  if (AR.useAbsolute) return;   // prefer absolute when available
  _processOrientation(e);
}

function _processOrientation(e) {
  // ── Heading (compass bearing, 0=North) ───────────────────────────────────────
  if (e.webkitCompassHeading != null) {
    // iOS: webkitCompassHeading is true magnetic North heading
    AR.heading = e.webkitCompassHeading;
  } else if (e.alpha != null) {
    // Android absolute: alpha = 0 when pointing North
    AR.heading = (360 - e.alpha + 360) % 360;
  }

  // ── Elevation (camera tilt above horizon) ────────────────────────────────────
  // beta = 90  → device upright, portrait, rear camera → horizon (0°)
  // beta = 45  → tilted 45° upward                    → 45° above horizon
  // beta = 0   → flat face-up                         → pointing at zenith (90°)
  if (e.beta != null) {
    AR.elevation = 90 - Math.abs(e.beta);
  }
}

function _startOrientation() {
  window.addEventListener('deviceorientationabsolute', _onOrientationAbsolute, true);
  window.addEventListener('deviceorientation',         _onOrientation,         true);
}

function _stopOrientation() {
  window.removeEventListener('deviceorientationabsolute', _onOrientationAbsolute, true);
  window.removeEventListener('deviceorientation',         _onOrientation,         true);
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
    _drawMessage(ctx, canvas, 'Waiting for compass…\nPoint device at the horizon');
    return;
  }

  // ── Compute celestial positions ──────────────────────────────────────────────
  const date = getSelectedDate();
  const minutes = parseInt(document.getElementById('plan-time-slider').value, 10);
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);

  const sunPos  = SunCalc.getPosition(date,  state.currentLat, state.currentLon);
  const moonPos = SunCalc.getMoonPosition(date, state.currentLat, state.currentLon);

  // SunCalc azimuth: 0 = South, positive = West.  Convert → bearing (0=N, 90=E)
  const sunAz   = (toDeg(sunPos.azimuth)  + 180 + 360) % 360;
  const sunAlt  =  toDeg(sunPos.altitude);
  const moonAz  = (toDeg(moonPos.azimuth) + 180 + 360) % 360;
  const moonAlt =  toDeg(moonPos.altitude);

  // ── Draw layers ──────────────────────────────────────────────────────────────
  _drawHorizon(ctx, canvas);
  _drawCompassRuler(ctx, canvas);

  const sunXY  = _project(sunAz,  sunAlt,  canvas);
  const moonXY = _project(moonAz, moonAlt, canvas);

  if (sunXY)  _drawSun(ctx,  sunXY.x,  sunXY.y,  sunAlt,  canvas);
  if (moonXY) _drawMoon(ctx, moonXY.x, moonXY.y, moonAlt, canvas);

  _drawInfoBar(ctx, canvas, sunAz, sunAlt, moonAz, moonAlt);
}

// ─── Projection: (azimuth°, altitude°) → canvas (x, y) ───────────────────────
function _project(az, alt, canvas) {
  let dAz = az - AR.heading;
  while (dAz >  180) dAz -= 360;
  while (dAz < -180) dAz += 360;

  const camElev = AR.elevation != null ? AR.elevation : 0;
  const dAlt = alt - camElev;

  // Clip to ±70 % of FOV so markers don't wander off screen weirdly at edges
  if (Math.abs(dAz) > AR.FOV_H * 0.7 || Math.abs(dAlt) > AR.FOV_V * 0.7) return null;

  const x = canvas.width  / 2 + (dAz  / (AR.FOV_H / 2)) * (canvas.width  / 2);
  const y = canvas.height / 2 - (dAlt / (AR.FOV_V / 2)) * (canvas.height / 2);
  return { x, y };
}

// ─── Drawing helpers ──────────────────────────────────────────────────────────
function _drawHorizon(ctx, canvas) {
  const camElev = AR.elevation != null ? AR.elevation : 0;
  // How far does the horizon sit from vertical centre on screen?
  const y = canvas.height / 2 + (camElev / (AR.FOV_V / 2)) * (canvas.height / 2);

  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
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

function _drawCompassRuler(ctx, canvas) {
  if (AR.heading === null) return;

  const heading = AR.heading;
  const tickH   = Math.round(canvas.height * 0.055);
  const y0      = Math.round(canvas.height * 0.06);   // top of tick bar
  const yLabel  = y0 + tickH + Math.round(canvas.height * 0.03);
  const pixPerDeg = canvas.width / AR.FOV_H;

  ctx.save();
  ctx.fillStyle   = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 0, canvas.width, yLabel + 4);

  // Draw cardinal & intercardinal ticks across visible heading range
  const CARDS = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE',
                  180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };

  for (let offset = -AR.FOV_H; offset <= AR.FOV_H; offset += 5) {
    const bearing = ((heading + offset) % 360 + 360) % 360;
    const nearestFive = Math.round(bearing / 5) * 5 % 360;
    if (Math.abs(bearing - nearestFive) > 2) continue;

    const x     = canvas.width / 2 + offset * pixPerDeg;
    const isCard = nearestFive % 45 === 0;
    const isMajor = nearestFive % 10 === 0;

    ctx.strokeStyle = isCard ? '#fff' : (isMajor ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.3)');
    ctx.lineWidth   = isCard ? 2 : 1;
    const tH        = isCard ? tickH : (isMajor ? tickH * 0.65 : tickH * 0.35);

    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y0 + tH);
    ctx.stroke();

    if (isCard) {
      ctx.fillStyle  = '#fff';
      ctx.font       = `bold ${Math.max(10, Math.round(canvas.height * 0.028))}px sans-serif`;
      ctx.textAlign  = 'center';
      ctx.fillText(CARDS[nearestFive], x, yLabel);
    }
  }

  // Centre heading readout
  const dir   = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  const label = `${dir[Math.round(heading / 22.5) % 16]}  ${Math.round(heading)}°`;
  ctx.fillStyle   = '#f0c040';
  ctx.font        = `bold ${Math.max(12, Math.round(canvas.height * 0.032))}px monospace`;
  ctx.textAlign   = 'center';
  ctx.fillText(label, canvas.width / 2, Math.round(canvas.height * 0.03));

  ctx.restore();
}

function _drawSun(ctx, x, y, alt, canvas) {
  const r   = Math.max(14, Math.round(canvas.width * 0.045));
  const fnt = Math.max(10, Math.round(canvas.height * 0.025));

  ctx.save();

  // Glow halo
  const grd = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 2.2);
  grd.addColorStop(0, alt > 0 ? 'rgba(255,220,50,0.55)' : 'rgba(255,100,0,0.45)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.2, 0, Math.PI * 2);
  ctx.fill();

  // Sun disk
  ctx.fillStyle   = alt > 0 ? '#FFD700' : '#FF6600';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Label chip
  const label = `☀ ${alt.toFixed(1)}°`;
  _drawChip(ctx, x, y - r - 6, label, fnt, '#FFD700', 'rgba(0,0,0,0.6)');

  ctx.restore();
}

function _drawMoon(ctx, x, y, alt, canvas) {
  const r   = Math.max(12, Math.round(canvas.width * 0.038));
  const fnt = Math.max(10, Math.round(canvas.height * 0.025));

  const moonInfo = SunCalc.getMoonIllumination(getSelectedDate());
  const illum    = Math.round(moonInfo.fraction * 100);

  ctx.save();

  // Soft glow
  const grd = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 2);
  grd.addColorStop(0, 'rgba(180,210,255,0.35)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(x, y, r * 2, 0, Math.PI * 2);
  ctx.fill();

  // Moon disk
  ctx.fillStyle   = alt > 0 ? 'rgba(200,220,255,0.92)' : 'rgba(130,130,160,0.75)';
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  const label = `☽ ${alt.toFixed(1)}°  ${illum}%`;
  _drawChip(ctx, x, y - r - 6, label, fnt, '#a8d8ea', 'rgba(0,0,0,0.6)');

  ctx.restore();
}

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

  ctx.fillStyle  = textColor;
  ctx.textAlign  = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, ry + h / 2);
  ctx.textBaseline = 'alphabetic';
}

function _drawInfoBar(ctx, canvas, sunAz, sunAlt, moonAz, moonAlt) {
  const fnt = Math.max(11, Math.round(canvas.height * 0.028));
  const pad = 12;
  const lh  = fnt + 10;
  const lines = [
    `☀  Az ${sunAz.toFixed(1)}°   Alt ${sunAlt.toFixed(1)}°`,
    `☽  Az ${moonAz.toFixed(1)}°   Alt ${moonAlt.toFixed(1)}°`,
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

function _drawMessage(ctx, canvas, msg) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const lines  = msg.split('\n');
  const fnt    = Math.max(14, Math.round(canvas.width * 0.04));
  ctx.font     = `${fnt}px sans-serif`;
  ctx.fillStyle = '#8b949e';
  ctx.textAlign = 'center';
  lines.forEach((line, i) => {
    ctx.fillText(line, canvas.width / 2, canvas.height / 2 + (i - (lines.length - 1) / 2) * (fnt + 8));
  });
  ctx.restore();
}

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
  el.textContent = `${dir} ${Math.round(AR.heading)}°${elev}`;
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

// ─── Init ─────────────────────────────────────────────────────────────────────
function initAR() {
  const openBtn  = document.getElementById('ar-view-btn');
  const closeBtn = document.getElementById('ar-close-btn');
  if (openBtn)  openBtn.addEventListener('click', openARView);
  if (closeBtn) closeBtn.addEventListener('click', closeARView);
  _initFOVSlider();
}
