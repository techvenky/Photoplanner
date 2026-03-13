// ─── Timeline Overlay ─────────────────────────────────────────────────────────

// Module-scoped private vars
let _tlZoom = 1;          // 1×, 2×, 4×
let _tlDate = null;
let _tlSunAlts  = null;   // cached per date, length = 1441 (one per minute)
let _tlMoonAlts = null;
let _tlGcAlts   = null;   // galactic center altitude (one per minute)
let _tlDragging = false;

// Module-scoped constants
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
    _tlSunAlts.push(toDeg(SunCalc.getPosition(t, state.currentLat, state.currentLon).altitude));
    _tlMoonAlts.push(toDeg(SunCalc.getMoonPosition(t, state.currentLat, state.currentLon).altitude));
    _tlGcAlts.push(toDeg(getGalacticCenterPos(t, state.currentLat, state.currentLon).altitude));
  }
}

// Expose _tlDate invalidation for external callers (location change)
function invalidateTlCache() {
  _tlDate = null;
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
    if (state.currentLat === null) { canvas.width = canvasW; canvas.height = H; return; }
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

function _tlScrubFromEvent(e, callbacks) {
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
  if (callbacks && callbacks.onTimeScrub) callbacks.onTimeScrub();
}

function initTimeline(callbacks) {
  const wrap = document.getElementById('tl-chart-wrap');
  if (!wrap) return;

  // Interaction
  wrap.addEventListener('mousedown',  e => { _tlDragging = true;  _tlScrubFromEvent(e, callbacks); });
  wrap.addEventListener('mousemove',  e => { if (_tlDragging) _tlScrubFromEvent(e, callbacks); });
  wrap.addEventListener('mouseup',    () => { _tlDragging = false; });
  wrap.addEventListener('mouseleave', () => { _tlDragging = false; });
  wrap.addEventListener('touchstart', e => { _tlDragging = true;  _tlScrubFromEvent(e, callbacks); }, { passive: true });
  wrap.addEventListener('touchmove',  e => { if (_tlDragging) _tlScrubFromEvent(e, callbacks); }, { passive: true });
  wrap.addEventListener('touchend',   () => { _tlDragging = false; });

  // Controls
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
