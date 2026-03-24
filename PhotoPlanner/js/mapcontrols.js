// ─── Map Controls: Compass Rose, Moon Viewer, Analog Clock ───────────────────

// ── Fixed star positions for moon viewer (avoids flicker from Math.random on every frame) ──
// Each entry: [x%, y%, radius (0=small, 1=large)]
const _MOON_STARS = [
  [8,9,0],[82,14,1],[19,55,0],[91,62,0],[6,38,1],[94,45,0],
  [52,8,0],[38,78,0],[72,28,1],[22,84,0],[47,19,0],[63,70,0],
  [15,70,0],[78,45,1],
];

// ── Moon photograph preload ───────────────────────────────────────────────────
let _moonImg       = null;
let _moonImgLoaded = false;

function _preloadMoonImg() {
  if (_moonImg) return;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload  = () => { _moonImg = img; _moonImgLoaded = true; updateMoonViewer(); };
  img.onerror = () => { _moonImgLoaded = false; };
  img.src = 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/FullMoon2010.jpg/600px-FullMoon2010.jpg';
}

// ── 1. Compass Rose Leaflet Control ──────────────────────────────────────────
function initMapCompass() {
  if (!state.map) return;
  const CompassControl = L.Control.extend({
    options: { position: 'topright' },
    onAdd() {
      const div = L.DomUtil.create('div', 'map-compass-ctrl');
      div.title = 'Compass — North is always up';
      div.innerHTML = `<svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
        <circle cx="32" cy="32" r="30" fill="rgba(10,14,20,0.85)" stroke="#30363d" stroke-width="1.5"/>
        <line x1="32" y1="3"  x2="32" y2="10" stroke="#ff6b6b" stroke-width="2"/>
        <line x1="61" y1="32" x2="54" y2="32" stroke="#484f58" stroke-width="1.5"/>
        <line x1="32" y1="61" x2="32" y2="54" stroke="#484f58" stroke-width="1.5"/>
        <line x1="3"  y1="32" x2="10" y2="32" stroke="#484f58" stroke-width="1.5"/>
        <line x1="53" y1="11" x2="48" y2="16" stroke="#484f58" stroke-width="1"/>
        <line x1="53" y1="53" x2="48" y2="48" stroke="#484f58" stroke-width="1"/>
        <line x1="11" y1="53" x2="16" y2="48" stroke="#484f58" stroke-width="1"/>
        <line x1="11" y1="11" x2="16" y2="16" stroke="#484f58" stroke-width="1"/>
        <text x="32" y="17" text-anchor="middle" dominant-baseline="middle" fill="#ff6b6b" font-size="9" font-weight="700" font-family="system-ui,sans-serif">N</text>
        <text x="32" y="50" text-anchor="middle" dominant-baseline="middle" fill="#8b949e" font-size="7.5" font-family="system-ui,sans-serif">S</text>
        <text x="50" y="33" text-anchor="middle" dominant-baseline="middle" fill="#8b949e" font-size="7.5" font-family="system-ui,sans-serif">E</text>
        <text x="14" y="33" text-anchor="middle" dominant-baseline="middle" fill="#8b949e" font-size="7.5" font-family="system-ui,sans-serif">W</text>
        <polygon points="32,23 29.5,32 32,30 34.5,32" fill="#ff6b6b"/>
        <polygon points="32,41 29.5,32 32,34 34.5,32" fill="#4a5568"/>
        <circle cx="32" cy="32" r="2.5" fill="#e6edf3" stroke="#30363d" stroke-width="1"/>
      </svg>`;
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.disableScrollPropagation(div);
      return div;
    }
  });
  new CompassControl().addTo(state.map);
}

// ── 2. Moon Phase Viewer ──────────────────────────────────────────────────────
function initMoonViewer() {
  if (!state.map) return;
  const MoonControl = L.Control.extend({
    options: { position: 'topright' },
    onAdd() {
      const div = L.DomUtil.create('div', 'map-moon-ctrl');
      div.id = 'moon-viewer-ctrl';
      div.innerHTML = `
        <div class="moon-ctrl-header">
          <span class="moon-ctrl-label">🌙 Moon</span>
          <button class="moon-ctrl-toggle" id="moon-ctrl-toggle" title="Toggle">−</button>
        </div>
        <canvas id="moon-viewer-canvas" class="moon-ctrl-canvas" width="140" height="140"></canvas>
        <div id="moon-ctrl-info" class="moon-ctrl-info"></div>`;
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.disableScrollPropagation(div);
      return div;
    },
    onRemove() {}
  });
  new MoonControl().addTo(state.map);
  _preloadMoonImg();

  state.map.whenReady(() => {
    const btn = document.getElementById('moon-ctrl-toggle');
    if (btn) {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const canvas = document.getElementById('moon-viewer-canvas');
        const info   = document.getElementById('moon-ctrl-info');
        const hidden = canvas && canvas.style.display === 'none';
        if (canvas) canvas.style.display = hidden ? 'block' : 'none';
        if (info)   info.style.display   = hidden ? 'block' : 'none';
        btn.textContent = hidden ? '−' : '+';
      });
    }
    updateMoonViewer();
  });
}

function updateMoonViewer() {
  const canvas = document.getElementById('moon-viewer-canvas');
  const info   = document.getElementById('moon-ctrl-info');
  if (!canvas) return;

  const date      = typeof getSelectedDate === 'function' ? getSelectedDate() : new Date();
  const slider    = document.getElementById('plan-time-slider');
  const sliderMin = slider ? parseInt(slider.value) : 720;
  const t         = new Date(date);
  t.setHours(Math.floor(sliderMin / 60), sliderMin % 60, 0, 0);

  const moonIllum = SunCalc.getMoonIllumination(t);
  const phase     = moonIllum.phase;
  const fraction  = moonIllum.fraction;

  let sunAlt = -90, moonAlt = -90, moonAz = 180;
  if (state.currentLat !== null) {
    sunAlt = toDeg(SunCalc.getPosition(t, state.currentLat, state.currentLon).altitude);
    const mp = SunCalc.getMoonPosition(t, state.currentLat, state.currentLon);
    moonAlt  = toDeg(mp.altitude);
    moonAz   = ((toDeg(mp.azimuth) + 180) % 360 + 360) % 360;
  }

  // Moon is "visible" when it's above the horizon AND has any illumination
  const isVisible = moonAlt > -1 && fraction > 0.01;

  // Hide the entire moon viewer widget when moon is below horizon
  const ctrl = document.getElementById('moon-viewer-ctrl');
  if (ctrl) ctrl.style.display = isVisible ? '' : 'none';
  if (!isVisible) return;

  _drawMoonCanvas(canvas, phase, fraction, moonAlt, moonAz, sunAlt, isVisible);

  if (info) {
    const phaseNames = ['New Moon','Waxing Crescent','First Quarter','Waxing Gibbous',
                        'Full Moon','Waning Gibbous','Last Quarter','Waning Crescent'];
    const phaseLabel = phaseNames[Math.round(phase * 8) % 8];
    const dirs = ['N','NE','E','SE','S','SW','W','NW'];
    const dir  = dirs[Math.round(moonAz / 45) % 8];
    info.textContent = `${phaseLabel} · ${(fraction * 100).toFixed(0)}% · ${moonAlt.toFixed(0)}° ${dir}`;
  }
}

// ── Draw the full moon canvas ─────────────────────────────────────────────────
function _drawMoonCanvas(canvas, phase, fraction, moonAlt, moonAz, sunAlt, isVisible) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // Rounded clip (roundRect not supported in older browsers)
  ctx.save();
  ctx.beginPath();
  if (ctx.roundRect) { ctx.roundRect(0, 0, W, H, 7); } else { ctx.rect(0, 0, W, H); }
  ctx.clip();

  if (!isVisible) {
    _drawNotVisible(ctx, W, H, fraction, moonAlt);
    ctx.restore();
    return;
  }

  // ── Sky background ──────────────────────────────────────────────────────────
  _drawSkyBg(ctx, W, H, sunAlt);

  // ── Stars if dark enough ────────────────────────────────────────────────────
  if (sunAlt < -5) {
    const op = Math.min(0.9, (-sunAlt - 5) / 15);
    ctx.fillStyle = `rgba(255,255,255,${op})`;
    _MOON_STARS.forEach(([sx, sy, large]) => {
      ctx.beginPath();
      ctx.arc(sx * W / 100, sy * H / 100, large ? 1.1 : 0.65, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // ── Horizon line ────────────────────────────────────────────────────────────
  const horizY = H * 0.85;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.setLineDash([4, 5]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, horizY);
  ctx.lineTo(W, horizY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // ── Moon position (altitude → y, azimuth → compass label) ──────────────────
  // altitude 0° = 78% from top, altitude 90° = 14% from top
  const altClamped = Math.max(0, Math.min(90, moonAlt));
  const moonY = H * (0.78 - 0.64 * (altClamped / 90));
  const moonX = W / 2;

  // Moon radius: slightly larger near horizon (atmospheric effect)
  const baseR  = W * 0.235;
  const moonR  = baseR * (1 + Math.max(0, 10 - altClamped) / 100 * 0.07);

  // ── Full-moon halo ──────────────────────────────────────────────────────────
  if (fraction > 0.85) {
    const haloOp = (fraction - 0.85) / 0.15 * 0.25;
    const halo   = ctx.createRadialGradient(moonX, moonY, moonR * 0.8, moonX, moonY, moonR * 2.2);
    halo.addColorStop(0, `rgba(220,215,190,${haloOp})`);
    halo.addColorStop(1, 'rgba(220,215,190,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Realistic moon ──────────────────────────────────────────────────────────
  _drawRealisticMoon(ctx, moonX, moonY, moonR, phase, fraction);

  // ── Compass direction label ─────────────────────────────────────────────────
  const dirs   = ['N','NE','E','SE','S','SW','W','NW'];
  const dirLbl = dirs[Math.round(moonAz / 45) % 8];
  ctx.font          = `bold 10px system-ui, sans-serif`;
  ctx.textAlign     = 'center';
  ctx.textBaseline  = 'bottom';
  ctx.fillStyle     = 'rgba(255,255,255,0.55)';
  ctx.fillText(`${moonAlt.toFixed(0)}° ${dirLbl}`, W / 2, H - 4);

  ctx.restore();
}

// ── Not-visible state ─────────────────────────────────────────────────────────
function _drawNotVisible(ctx, W, H, fraction, _moonAlt) {
  // Deep dark sky
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#070c14');
  bg.addColorStop(1, '#0d1220');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Faint stars
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  [[10,12],[82,18],[22,52],[88,58],[7,40],[93,44],[50,8],[38,80],[68,28],[20,86]].forEach(([sx,sy]) => {
    ctx.beginPath();
    ctx.arc(sx * W / 100, sy * H / 100, 0.65, 0, Math.PI * 2);
    ctx.fill();
  });

  // Central "not visible" icon
  const cx = W / 2, cy = H / 2 - 10;
  const ir  = 22;

  // Icon circle
  ctx.beginPath();
  ctx.arc(cx, cy, ir, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Eye shape
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth   = 1.3;
  ctx.beginPath();
  // Upper eyelid arc
  ctx.moveTo(cx - 9, cy);
  ctx.bezierCurveTo(cx - 9, cy - 5.5, cx + 9, cy - 5.5, cx + 9, cy);
  // Lower eyelid arc
  ctx.bezierCurveTo(cx + 9, cy + 5.5, cx - 9, cy + 5.5, cx - 9, cy);
  ctx.stroke();
  // Iris
  ctx.beginPath();
  ctx.arc(cx, cy, 2.8, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fill();
  // Slash
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth   = 1.6;
  ctx.lineCap     = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - ir * 0.58, cy + ir * 0.58);
  ctx.lineTo(cx + ir * 0.58, cy - ir * 0.58);
  ctx.stroke();
  ctx.restore();

  // Status text
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  ctx.font         = 'bold 9px system-ui, sans-serif';
  ctx.fillStyle    = 'rgba(255,255,255,0.35)';
  if (fraction <= 0.01) {
    ctx.fillText('New Moon', cx, cy + ir + 8);
  } else {
    ctx.fillText('Not visible', cx, cy + ir + 8);
    ctx.font      = '8px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillText('Moon below horizon', cx, cy + ir + 20);
  }
}

// ── Sky background gradient ───────────────────────────────────────────────────
function _drawSkyBg(ctx, W, H, sunAlt) {
  let t, b;
  if      (sunAlt >= 12)  { t = '#4a96cc'; b = '#7ec8e8'; }
  else if (sunAlt >= 3)   { t = '#264a8a'; b = '#c07038'; }
  else if (sunAlt >= -2)  { t = '#142060'; b = '#40306a'; }
  else if (sunAlt >= -8)  { t = '#0a1540'; b = '#111830'; }
  else if (sunAlt >= -15) { t = '#050c25'; b = '#080e1e'; }
  else                    { t = '#020710'; b = '#050b18'; }
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, t);
  g.addColorStop(1, b);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// ── Realistic moon renderer ───────────────────────────────────────────────────
function _drawRealisticMoon(ctx, cx, cy, r, phase, _fraction) {
  const SHADOW = '#040710';

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();

  // ── 1. Dark base ────────────────────────────────────────────────────────────
  ctx.fillStyle = SHADOW;
  ctx.fillRect(cx - r - 1, cy - r - 1, 2 * r + 2, 2 * r + 2);

  // ── 2. Earthshine on thin crescents ─────────────────────────────────────────
  const crescentPhase = Math.min(phase, 1 - phase); // 0=new, 0.5=quarter
  if (crescentPhase < 0.13) {
    const esOp = (0.13 - crescentPhase) / 0.13 * 0.16;
    const esG  = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    esG.addColorStop(0, `rgba(65, 100, 180, ${esOp})`);
    esG.addColorStop(1, 'rgba(40, 65, 130, 0)');
    ctx.fillStyle = esG;
    ctx.fillRect(cx - r - 1, cy - r - 1, 2 * r + 2, 2 * r + 2);
  }

  // ── 3. Moon surface: actual photo or gradient fallback ───────────────────────
  let _sg = null;
  const _drawLitSurface = () => {
    if (_moonImgLoaded && _moonImg) {
      ctx.drawImage(_moonImg, cx - r, cy - r, r * 2, r * 2);
    } else {
      // Fallback: procedural gradient sphere + mare
      if (!_sg) {
        const litX = cx - r * 0.28, litY = cy - r * 0.28;
        _sg = ctx.createRadialGradient(litX, litY, r * 0.04, cx, cy, r * 1.02);
        _sg.addColorStop(0,    '#eee6d6');
        _sg.addColorStop(0.22, '#d8d0c0');
        _sg.addColorStop(0.55, '#aaa298');
        _sg.addColorStop(0.82, '#7a7268');
        _sg.addColorStop(1,    '#4e4842');
      }
      ctx.fillStyle = _sg;
      ctx.fillRect(cx - r - 1, cy - r - 1, 2 * r + 2, 2 * r + 2);
      _drawMare(ctx, cx, cy, r);
    }
  };
  _drawLitSurface();

  // ── 4. Phase shadow overlay ──────────────────────────────────────────────────
  _applyPhaseShadow(ctx, cx, cy, r, phase, _drawLitSurface, SHADOW);

  // ── 5. Soft terminator gradient ──────────────────────────────────────────────
  const cosA = Math.cos(phase * 2 * Math.PI);
  if (Math.abs(cosA) > 0.04) {
    const tx   = cx + (phase < 0.5 ? 1 : -1) * cosA * r;
    const tHW  = Math.max(2, r * 0.07);
    const tG   = ctx.createLinearGradient(tx - tHW, 0, tx + tHW, 0);
    tG.addColorStop(0,   'rgba(0,0,0,0)');
    tG.addColorStop(0.5, 'rgba(0,0,0,0.20)');
    tG.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = tG;
    ctx.fillRect(cx - r - 1, cy - r - 1, 2 * r + 2, 2 * r + 2);
  }

  // ── 6. Limb darkening (radial vignette) ──────────────────────────────────────
  const ld = ctx.createRadialGradient(cx, cy, r * 0.58, cx, cy, r * 1.01);
  ld.addColorStop(0, 'rgba(0,0,0,0)');
  ld.addColorStop(1, 'rgba(0,0,0,0.38)');
  ctx.fillStyle = ld;
  ctx.fillRect(cx - r - 1, cy - r - 1, 2 * r + 2, 2 * r + 2);

  // ── 7. Limb outline ──────────────────────────────────────────────────────────
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(30,25,20,0.55)';
  ctx.lineWidth   = 0.8;
  ctx.stroke();
  ctx.restore();
}

// ── Lunar mare (dark seas) detail ─────────────────────────────────────────────
function _drawMare(ctx, cx, cy, r) {
  // [dx, dy, rx, ry, opacity] — positions are normalized to moon radius
  const mare = [
    [-0.28, -0.26, 0.29, 0.24, 0.25], // Mare Imbrium (upper-left)
    [ 0.14, -0.30, 0.19, 0.15, 0.22], // Mare Serenitatis (upper-center)
    [ 0.17, -0.06, 0.21, 0.16, 0.21], // Mare Tranquillitatis (center-right)
    [ 0.50, -0.21, 0.12, 0.09, 0.19], // Mare Crisium (far right)
    [ 0.36,  0.10, 0.14, 0.11, 0.17], // Mare Fecunditatis (right-lower)
    [-0.43,  0.02, 0.34, 0.26, 0.20], // Oceanus Procellarum (far left)
    [-0.11,  0.30, 0.19, 0.14, 0.19], // Mare Nubium (lower-center)
    [-0.37,  0.35, 0.12, 0.10, 0.19], // Mare Humorum (lower-left)
    [ 0.13,  0.41, 0.11, 0.08, 0.15], // Mare Nectaris (lower-right)
  ];
  mare.forEach(([dx, dy, rx, ry, op]) => {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx + dx * r, cy + dy * r, rx * r, ry * r, 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(18,13,8,${op})`;
    ctx.fill();
    ctx.restore();
  });
  // A few prominent crater bright rays
  const craters = [
    [ 0.26,  0.50, 0.06, 0.10], // Tycho
    [-0.06,  0.56, 0.04, 0.08], // Clavius region
    [ 0.55, -0.08, 0.03, 0.09], // Langrenus
  ];
  craters.forEach(([dx, dy, cr, op]) => {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx + dx * r, cy + dy * r, cr * r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,252,245,${op})`;
    ctx.fill();
    ctx.restore();
  });
}

// ── Phase shadow: cover dark side ─────────────────────────────────────────────
function _applyPhaseShadow(ctx, cx, cy, r, phase, drawLitFn, shadow) {
  const isWaxing = phase < 0.5;
  const cosA     = Math.cos(phase * 2 * Math.PI);
  // cosA:  1 at phase=0 (new), 0 at phase=0.25 (first quarter),
  //       -1 at phase=0.5 (full),  0 at phase=0.75 (last quarter), 1 at phase=1

  const halfR = r + 0.5;

  if (isWaxing) {
    // Cover left half with shadow
    ctx.beginPath();
    ctx.arc(cx, cy, halfR, Math.PI / 2, 3 * Math.PI / 2);
    ctx.lineTo(cx, cy);
    ctx.closePath();
    ctx.fillStyle = shadow;
    ctx.fill();

    if (cosA > 0.02) {
      // Waxing crescent: additional dark ellipse on right side
      ctx.beginPath();
      ctx.ellipse(cx, cy, cosA * r, r, 0, -Math.PI / 2, Math.PI / 2);
      ctx.closePath();
      ctx.fillStyle = shadow;
      ctx.fill();
    } else if (cosA < -0.02) {
      // Waxing gibbous: restore lit surface in the left-side ellipse
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(cx, cy, -cosA * r, r, 0, Math.PI / 2, 3 * Math.PI / 2);
      ctx.closePath();
      ctx.clip();
      drawLitFn();
      ctx.restore();
    }
  } else {
    // Cover right half with shadow
    ctx.beginPath();
    ctx.arc(cx, cy, halfR, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(cx, cy);
    ctx.closePath();
    ctx.fillStyle = shadow;
    ctx.fill();

    if (cosA < -0.02) {
      // Waning gibbous: restore lit surface in right-side ellipse
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(cx, cy, -cosA * r, r, 0, -Math.PI / 2, Math.PI / 2);
      ctx.closePath();
      ctx.clip();
      drawLitFn();
      ctx.restore();
    } else if (cosA > 0.02) {
      // Waning crescent: additional dark ellipse on left side
      ctx.beginPath();
      ctx.ellipse(cx, cy, cosA * r, r, 0, Math.PI / 2, 3 * Math.PI / 2);
      ctx.closePath();
      ctx.fillStyle = shadow;
      ctx.fill();
    }
  }
}

// ── 3. Map Clock Control ──────────────────────────────────────────────────────
function initAnalogClock() {
  if (!state.map) return;
  const ClockControl = L.Control.extend({
    options: { position: 'bottomleft' },
    onAdd() {
      const div = L.DomUtil.create('div', 'map-clock-ctrl');
      div.id    = 'map-clock-ctrl';
      div.innerHTML = `<canvas id="analog-clock-canvas" width="52" height="52"></canvas>`;
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.disableScrollPropagation(div);
      return div;
    }
  });
  new ClockControl().addTo(state.map);
  state.map.whenReady(() => {
    const slider = document.getElementById('plan-time-slider');
    showAnalogClock(slider ? parseInt(slider.value) : 360);
  });
}

function showAnalogClock(totalMinutes) {
  const canvas = document.getElementById('analog-clock-canvas');
  if (!canvas) return;
  _drawAnalogClock(canvas, totalMinutes);
}

function _drawAnalogClock(canvas, totalMinutes) {
  const ctx  = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2;
  const r  = Math.min(W, H) / 2 - 2;
  const h24  = Math.floor(totalMinutes / 60) % 24;
  const hrs  = h24 % 12;
  const mins = totalMinutes % 60;
  ctx.clearRect(0, 0, W, H);
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.fillStyle = 'rgba(8,11,18,0.95)'; ctx.fill();
  ctx.strokeStyle = 'rgba(88,166,255,0.75)'; ctx.lineWidth = 1.8; ctx.stroke();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * 2 * Math.PI - Math.PI / 2, long = i % 3 === 0;
    ctx.beginPath();
    ctx.moveTo(cx + (r - 2) * Math.cos(a), cy + (r - 2) * Math.sin(a));
    ctx.lineTo(cx + (r - (long ? 7 : 4)) * Math.cos(a), cy + (r - (long ? 7 : 4)) * Math.sin(a));
    ctx.strokeStyle = long ? 'rgba(88,166,255,0.7)' : 'rgba(110,118,129,0.5)';
    ctx.lineWidth = long ? 1.5 : 1; ctx.stroke();
  }
  const ha = ((hrs + mins / 60) / 12) * 2 * Math.PI - Math.PI / 2;
  ctx.beginPath(); ctx.moveTo(cx - Math.cos(ha) * 4, cy - Math.sin(ha) * 4);
  ctx.lineTo(cx + Math.cos(ha) * (r * 0.48), cy + Math.sin(ha) * (r * 0.48));
  ctx.strokeStyle = '#e6edf3'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.stroke();
  const ma = (mins / 60) * 2 * Math.PI - Math.PI / 2;
  ctx.beginPath(); ctx.moveTo(cx - Math.cos(ma) * 4, cy - Math.sin(ma) * 4);
  ctx.lineTo(cx + Math.cos(ma) * (r * 0.70), cy + Math.sin(ma) * (r * 0.70));
  ctx.strokeStyle = '#58a6ff'; ctx.lineWidth = 1.8; ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, 3, 0, 2 * Math.PI);
  ctx.fillStyle = '#58a6ff'; ctx.fill();
}

// ── 4. Bottom Map Time Bar — unified single slider ────────────────────────────
// The slider #plan-time-slider lives inside #map-time-bar (not the sidebar).
// This function wires it up: on input it drives map, timeline, tooltip, sky view.
function initMapTimeBar() {
  const slider  = document.getElementById('plan-time-slider');
  const label   = document.getElementById('map-time-bar-label');
  const status  = document.getElementById('map-time-bar-status');
  const bar     = document.getElementById('map-time-bar');
  const tlOverlay = document.getElementById('timeline-overlay');
  if (!slider) return;

  // ── Core update — called on every slider change from ANY source ───────────
  function onTimeChange(mins) {
    // Update progress fill on the slider track (inline style overrides class bg)
    const pct = (Math.max(0, Math.min(1439, mins)) / 1439 * 100).toFixed(2);
    const _skyGrad = 'linear-gradient(to right,#03080e 0%,#03080e 8%,#080d28 14%,#0c2868 18%,#c8780a 25%,#f4c542 31%,#93a8c8 37%,#93a8c8 63%,#f4c542 69%,#c8780a 75%,#0c2868 82%,#080d28 86%,#03080e 92%,#03080e 100%)';
    slider.style.background = `linear-gradient(to right,rgba(255,255,255,0.22) 0%,rgba(255,255,255,0.22) ${pct}%,transparent ${pct}%,transparent 100%),${_skyGrad}`;

    // Update sky-view modal mirror slider
    const skySlider = document.getElementById('sky-time-slider');
    if (skySlider) skySlider.value = mins;

    // Update all map layers / overlays
    updateSliderDisplay();
    drawTimeIndicator();
    drawSkyDomeIfOpen();
    updateMoonViewer();
    showAnalogClock(mins);

    // Update bottom bar label
    _updateBarLabel(label, status, mins);

    // Redraw timeline cursor — canvas only, skip event card DOM rebuild
    if (tlOverlay && !tlOverlay.classList.contains('collapsed')) {
      drawTimelineOverlay(true);
    }
  }

  // ── Slider input ──────────────────────────────────────────────────────────
  // 'input' fires continuously on modern browsers during touch drag.
  // 'change' fires on drag-end on older Samsung Internet / WebKit.
  // touchmove ensures the map updates on every touch frame even when 'input' is
  // throttled by the browser (common on mid-range Android devices).
  slider.addEventListener('input',     () => onTimeChange(parseInt(slider.value)));
  slider.addEventListener('change',    () => onTimeChange(parseInt(slider.value)));
  slider.addEventListener('touchmove', () => onTimeChange(parseInt(slider.value)), { passive: true });

  // ── Tell CSS how tall the time bar is so the timeline sits above it ─────────
  if (bar) {
    const setBarHeight = () => {
      const h = bar.offsetHeight;
      if (h > 0) document.documentElement.style.setProperty('--time-bar-h', h + 'px');
    };
    setBarHeight();
    // Re-measure on resize (font scaling can change bar height)
    window.addEventListener('resize', setBarHeight, { passive: true });
  }

  // ── Expose update so timeline scrub & sky slider can call back in ─────────
  window._onTimeChange = onTimeChange;

  // ── Initial label draw + progress fill ───────────────────────────────────
  const _initMins = parseInt(slider.value) || 360;
  onTimeChange(_initMins);  // internally calls _updateBarLabel — no second call needed
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function _updateBarLabel(labelEl, statusEl, totalMinutes) {
  if (!labelEl) return;
  const h24  = Math.floor(totalMinutes / 60) % 24;
  const mins = totalMinutes % 60;
  const h12  = h24 % 12 || 12;
  labelEl.textContent = `${h12}:${String(mins).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
  if (!statusEl) return;
  const phases = [
    [22, 24, '🌑 Astro Night'], [20, 22, '🌑 Astro Dusk'],
    [19, 20, '🔭 Nautical Dusk'], [18, 19, '🔵 Blue Hour'],
    [17, 18, '✨ Golden Hour'], [9,  17, '☀️ Daytime'],
    [7,   9, '✨ Golden Hour'], [6,   7, '🌅 Sunrise'],
    [5,   6, '🔵 Blue Hour'],  [4,   5, '🔭 Nautical Dawn'],
    [0,   4, '🌑 Astro Night'],
  ];
  const match = phases.find(([s, e]) => h24 >= s && h24 < e);
  statusEl.textContent = match ? match[2] : '🌑 Astro Night';
}
