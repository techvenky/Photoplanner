// ─── Timeline Overlay ─────────────────────────────────────────────────────────

// Module-scoped private vars
let _tlZoom = 1;          // 1×, 2×, 4×
let _tlDate = null;
let _tlCallbacks = null;  // stored from initTimeline so card clicks can fire onTimeScrub
let _tlSunAlts  = null;   // cached per date, length = 1441 (one per minute)
let _tlMoonAlts = null;
let _tlGcAlts   = null;   // galactic center altitude (one per minute)
let _tlDragging = false;

// Module-scoped constants
const TL_H   = 155;  // canvas height (px)
const TL_PAD = { left: 38, right: 20, top: 12, bottom: 32 };
const TL_ALT_MIN = -90, TL_ALT_MAX = 90;
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

  // Always redraw the canvas so the cursor line never ghosts at old positions.
  // Altitude data is cached, so this is fast after the first render.
  if (state.currentLat === null) { canvas.width = canvasW; canvas.height = H; /* falls through to cursor + return below */ }

  if (state.currentLat !== null) {
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
    ctx.setLineDash([]);
    ctx.font = '8px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillText('Horizon: \u00b10.00\u00b0', pL + plotW - 2, y0 - 2);
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
    [-60, -30, 0, 30, 60, 90].forEach(a => {
      if (a < TL_ALT_MIN || a > TL_ALT_MAX) return;
      ctx.fillStyle = a === 0 ? 'rgba(255,255,255,0.55)' : '#6e7681';
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

  // Event cards: full rebuild on location/date change; active-card update on every call
  if (!fastCursorOnly) drawEventCards();
  _updateActiveEventCard();
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
  // Drive all map/overlay updates through the single shared hook
  if (window._onTimeChange) window._onTimeChange(mins);
  else drawTimelineOverlay(true);  // fallback cursor-only redraw
  if (callbacks && callbacks.onTimeScrub) callbacks.onTimeScrub();
}

function initTimeline(callbacks) {
  _tlCallbacks = callbacks;
  const wrap = document.getElementById('tl-chart-wrap');
  if (!wrap) return;

  // Interaction
  wrap.addEventListener('mousedown',  e => { _tlDragging = true;  _tlScrubFromEvent(e, callbacks); });
  wrap.addEventListener('mousemove',  e => {
    if (_tlDragging) _tlScrubFromEvent(e, callbacks);
    _onChartHover(e);
  });
  wrap.addEventListener('mouseup',    () => { _tlDragging = false; });
  wrap.addEventListener('mouseleave', () => { _tlDragging = false; _hideChartTooltip(); });
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
    setTimeout(() => drawTimelineOverlay(false), 50);
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

  _initChartTooltip();
}

// ─── Event Cards Bar ──────────────────────────────────────────────────────────

const _EVENT_TIPS = {
  'moonset': {
    title: 'Moonset',
    desc: 'The Moon disappears below the horizon.',
    tip: 'After moonset during night hours, the sky becomes darker — a prime window for Milky Way and deep-sky photography.'
  },
  'astro-dawn': {
    title: 'Astronomical Twilight Start',
    desc: 'The Sun is 18° below the horizon. Sky brightness begins to increase, ending true astronomical darkness.',
    tip: 'Last opportunity for deep-sky astrophotography. Sky glow will increase rapidly from here.'
  },
  'nautical-dawn': {
    title: 'Nautical Twilight Start',
    desc: 'The Sun is 12° below the horizon. The horizon becomes faintly visible at sea.',
    tip: 'The horizon becomes discernible — great for star-trail photography with a visible foreground.'
  },
  'civil-dawn': {
    title: 'Civil Twilight Start — Blue Hour',
    desc: 'The Sun is 6° below the horizon. There is enough light for most outdoor activities without artificial lighting.',
    tip: 'The blue hour: sky takes on a rich, even blue tone that balances beautifully with artificial lights. Ideal for cityscapes and seascapes.'
  },
  'sunrise': {
    title: 'Sunrise',
    desc: 'The upper limb of the Sun appears above the horizon.',
    tip: 'Warm, low-angle golden light with long shadows. One of the best moments for landscapes, portraits, and architecture.'
  },
  'golden-am': {
    title: 'Golden Hour End (Morning)',
    desc: 'The Sun climbs above 6° altitude, ending the morning golden hour.',
    tip: 'The last minutes of soft, warm, directional light before midday contrast takes over.'
  },
  'moonrise': {
    title: 'Moonrise',
    desc: 'The Moon rises above the horizon.',
    tip: 'The Moon appears largest near the horizon due to the Moon illusion. Combine it with a distant landmark for compelling compositions.'
  },
  'solar-noon': {
    title: 'Sun-Meridian Transit',
    desc: 'The Sun crosses the meridian, the line running from due north (0°) to due south (180°) and reaches its highest altitude.',
    tip: 'Around solar noon, shadows are at their shortest and the light is at its coolest, creating high-contrast conditions that can work well for black-and-white photography.'
  },
  'moon-transit': {
    title: 'Moon Transit',
    desc: 'The Moon crosses the meridian and reaches its highest point in the sky.',
    tip: 'Highest altitude means less atmospheric distortion — optimal for sharp lunar photography.'
  },
  'golden-pm': {
    title: 'Golden Hour Start (Evening)',
    desc: 'The Sun descends below 6° altitude, beginning the evening golden hour.',
    tip: 'Warm, directional light and long shadows return. Perfect for portraits, landscapes, and architectural shots.'
  },
  'sunset': {
    title: 'Sunset',
    desc: 'The upper limb of the Sun disappears below the horizon.',
    tip: 'The sky can burst with vivid oranges and reds. Colors may intensify for up to 20 minutes after the Sun sets.'
  },
  'civil-dusk': {
    title: 'Civil Twilight End — Blue Hour',
    desc: 'The Sun is 6° below the horizon. The evening blue hour is at its peak.',
    tip: 'Rich, deep-blue sky perfectly balances city lights — a classic window for long-exposure cityscapes.'
  },
  'nautical-dusk': {
    title: 'Nautical Twilight End',
    desc: 'The Sun is 12° below the horizon. The sky darkens noticeably.',
    tip: 'Stars grow more visible. Good for wide-field star photography while retaining a subtle sky gradient.'
  },
  'astro-dusk': {
    title: 'Astronomical Twilight End',
    desc: 'The Sun is 18° below the horizon. True astronomical darkness begins.',
    tip: 'The darkest skies of the night begin. Optimal for Milky Way photography, deep-sky imaging, and meteor showers.'
  }
};

function drawEventCards() {
  const bar = document.getElementById('tl-events-bar');
  if (!bar || state.currentLat === null) { if (bar) bar.innerHTML = ''; return; }

  const date      = getSelectedDate();
  const times     = SunCalc.getTimes(date, state.currentLat, state.currentLon);
  const moonTimes = SunCalc.getMoonTimes(date, state.currentLat, state.currentLon);
  const moonIllum = SunCalc.getMoonIllumination(date);
  const illumPct  = (moonIllum.fraction * 100).toFixed(1);
  const waxWane   = moonIllum.phase < 0.5 ? 'Waxing' : 'Waning';

  let moonNoon = null;
  if (moonTimes.rise && moonTimes.set) {
    moonNoon = new Date((moonTimes.rise.getTime() + moonTimes.set.getTime()) / 2);
  }

  const events = [
    { key: 'moonset',       label: 'Moonset',        time: moonTimes.set,       type: 'moon',     extra: `${waxWane} ${illumPct}%` },
    { key: 'astro-dawn',    label: 'Astro start',    time: times.nightEnd,      type: 'astro',    extra: null },
    { key: 'nautical-dawn', label: 'Nautical start', time: times.nauticalDawn,  type: 'nautical', extra: null },
    { key: 'civil-dawn',    label: 'Civil start',    time: times.dawn,          type: 'civil',    extra: null },
    { key: 'sunrise',       label: 'Sunrise',        time: times.sunrise,       type: 'sunrise',  extra: null },
    { key: 'golden-am',     label: 'Golden hr',      time: times.goldenHourEnd, type: 'golden',   extra: null },
    { key: 'moonrise',      label: 'Moonrise',       time: moonTimes.rise,      type: 'moon',     extra: `${waxWane} ${illumPct}%` },
    { key: 'solar-noon',    label: 'Sun transit',    time: times.solarNoon,     type: 'transit',  extra: null },
    { key: 'moon-transit',  label: 'Moon transit',   time: moonNoon,            type: 'moon',     extra: `${waxWane} ${illumPct}%` },
    { key: 'golden-pm',     label: 'Golden hr',      time: times.goldenHour,    type: 'golden',   extra: null },
    { key: 'sunset',        label: 'Sunset',         time: times.sunset,        type: 'sunset',   extra: null },
    { key: 'civil-dusk',    label: 'Civil end',      time: times.dusk,          type: 'civil',    extra: null },
    { key: 'nautical-dusk', label: 'Nautical end',   time: times.nauticalDusk,  type: 'nautical', extra: null },
    { key: 'astro-dusk',    label: 'Astro end',      time: times.night,         type: 'astro',    extra: null },
  ];

  const valid = events.filter(e => e.time && !isNaN(e.time.getTime()));
  valid.sort((a, b) => a.time - b.time);

  // Helper: SunCalc azimuth → compass bearing (0=N, clockwise)
  function toCompassAz(radAz) { return ((toDeg(radAz) + 180) % 360 + 360) % 360; }

  bar.innerHTML = valid.map(ev => {
    let az = null;
    try {
      const pos = ev.type === 'moon'
        ? SunCalc.getMoonPosition(ev.time, state.currentLat, state.currentLon)
        : SunCalc.getPosition(ev.time, state.currentLat, state.currentLon);
      az = toCompassAz(pos.azimuth).toFixed(2);
    } catch (_) {}

    const timeStr = fmtTime(ev.time);
    return `<div class="tl-event-card tl-event-card--${ev.type}" data-event-key="${ev.key}" data-time="${ev.time.getTime()}">
      <div class="tl-event-label">${ev.label}</div>
      <div class="tl-event-time">${timeStr}</div>
      ${az !== null ? `<div class="tl-event-az">${az}°</div>` : ''}
      ${ev.extra ? `<div class="tl-event-extra">${ev.extra}</div>` : ''}
    </div>`;
  }).join('');

  bar.querySelectorAll('.tl-event-card').forEach(card => {
    card.addEventListener('click', e => {
      e.stopPropagation();
      // Scrub timeline + all overlays to this event's time
      const ts = parseInt(card.dataset.time);
      if (!isNaN(ts)) {
        const t    = new Date(ts);
        const mins = Math.round((t.getHours() * 60 + t.getMinutes()) / 5) * 5;
        document.getElementById('plan-time-slider').value = mins;
        document.getElementById('sky-time-slider').value  = mins;
        if (window._onTimeChange) window._onTimeChange(mins);
        else { updateSliderDisplay(); drawTimelineOverlay(true); }
        if (_tlCallbacks && _tlCallbacks.onTimeScrub) _tlCallbacks.onTimeScrub();
      }
      _showEventTip(card.dataset.eventKey, card);
    });
  });
}

function _updateActiveEventCard() {
  const bar    = document.getElementById('tl-events-bar');
  const slider = document.getElementById('plan-time-slider');
  if (!bar || !slider) return;

  const sliderMin = parseInt(slider.value);
  const date      = getSelectedDate();
  const curTime   = new Date(date);
  curTime.setHours(Math.floor(sliderMin / 60), sliderMin % 60, 0, 0);

  const cards = Array.from(bar.querySelectorAll('.tl-event-card'));
  let activeCard = null;
  cards.forEach(c => {
    const t = parseInt(c.dataset.time);
    if (!isNaN(t) && new Date(t) <= curTime) activeCard = c;
  });

  cards.forEach(c => c.classList.remove('active'));
  if (activeCard) {
    activeCard.classList.add('active');
    // Auto-scroll to centre the active card
    const barW      = bar.clientWidth;
    const cardLeft  = activeCard.offsetLeft;
    const cardW     = activeCard.offsetWidth;
    bar.scrollLeft  = Math.max(0, cardLeft - barW / 2 + cardW / 2);
  }
}

// Photography tip popup
let _tlTipPopup = null;
function _showEventTip(key, cardEl) {
  _hideTipPopup();
  const tip = _EVENT_TIPS[key];
  if (!tip) return;

  _tlTipPopup = document.createElement('div');
  _tlTipPopup.className = 'tl-event-tip-popup';
  _tlTipPopup.innerHTML = `
    <div class="tl-event-tip-title">📸 ${tip.title}</div>
    <div class="tl-event-tip-desc">${tip.desc}</div>
    <div class="tl-event-tip-photo-label">📷 Photography Tips</div>
    <div class="tl-event-tip-photo-text">${tip.tip}</div>
  `;
  document.body.appendChild(_tlTipPopup);

  const rect   = cardEl.getBoundingClientRect();
  const popW   = 272;
  let   left   = rect.left + rect.width / 2 - popW / 2;
  left = Math.max(8, Math.min(window.innerWidth - popW - 8, left));
  // Try to show above the card; if not enough room, show below
  const spaceAbove = rect.top - 8;
  const popH       = _tlTipPopup.offsetHeight || 140;
  const top = spaceAbove >= popH ? rect.top - popH - 6 : rect.bottom + 6;
  _tlTipPopup.style.left = left + 'px';
  _tlTipPopup.style.top  = top + 'px';

  setTimeout(() => document.addEventListener('click', _hideTipPopup, { once: true }), 0);
}
function _hideTipPopup() { if (_tlTipPopup) { _tlTipPopup.remove(); _tlTipPopup = null; } }

// Chart hover tooltip
let _tlChartTip = null;
function _initChartTooltip() {
  _tlChartTip = document.createElement('div');
  _tlChartTip.className = 'tl-chart-tooltip';
  _tlChartTip.style.display = 'none';
  document.body.appendChild(_tlChartTip);
}

function _onChartHover(e) {
  if (!_tlChartTip || !_tlSunAlts || state.currentLat === null) {
    if (_tlChartTip) _tlChartTip.style.display = 'none';
    return;
  }
  const wrap   = document.getElementById('tl-chart-wrap');
  const canvas = document.getElementById('timeline-canvas');
  if (!wrap || !canvas) return;

  const rect  = wrap.getBoundingClientRect();
  const rawX  = e.clientX - rect.left + wrap.scrollLeft;
  const plotW = canvas.width - TL_PAD.left - TL_PAD.right;
  const mins  = Math.round(Math.max(0, Math.min(1440, ((rawX - TL_PAD.left) / plotW) * 1440)));

  const date = getSelectedDate();
  const t    = new Date(date);
  t.setHours(Math.floor(mins / 60), mins % 60, 0, 0);

  function toCompassAz(radAz) { return ((toDeg(radAz) + 180) % 360 + 360) % 360; }

  const sunPos  = SunCalc.getPosition(t, state.currentLat, state.currentLon);
  const moonPos = SunCalc.getMoonPosition(t, state.currentLat, state.currentLon);
  const mIllum  = SunCalc.getMoonIllumination(t);

  const sunAz     = toCompassAz(sunPos.azimuth).toFixed(2);
  const sunAlt    = toDeg(sunPos.altitude).toFixed(2);
  const moonAz    = toCompassAz(moonPos.azimuth).toFixed(2);
  const moonAlt   = toDeg(moonPos.altitude).toFixed(2);
  const moonIllum = (mIllum.fraction * 100).toFixed(2);
  const altSign   = v => parseFloat(v) >= 0 ? '+' : '';

  _tlChartTip.innerHTML = `
    <div class="tl-chart-tooltip-time">${fmtTime(t)}</div>
    <div class="tl-chart-tooltip-row">
      <span class="tl-chart-tooltip-dot" style="background:#e3b341"></span>
      <span>${sunAz}°&nbsp; ${altSign(sunAlt)}${sunAlt}°</span>
    </div>
    <div class="tl-chart-tooltip-row">
      <span class="tl-chart-tooltip-dot" style="background:#a8d8ea"></span>
      <span>${moonAz}°&nbsp; ${altSign(moonAlt)}${moonAlt}°&nbsp; ${moonIllum}%</span>
    </div>
  `;

  // Flip tooltip side at noon: before 12 PM → right of cursor; after → left of cursor
  const tipW  = _tlChartTip.offsetWidth || 170;
  let   tipX  = mins < 720
    ? e.clientX + 10            // before noon: show to the right
    : e.clientX - tipW - 6;    // after noon:  show to the left
  tipX = Math.max(8, Math.min(window.innerWidth - tipW - 8, tipX));
  const tipY = rect.top + 6;  // sit at top inside the chart, not above it

  _tlChartTip.style.left    = tipX + 'px';
  _tlChartTip.style.top     = tipY + 'px';
  _tlChartTip.style.display = 'block';
}

function _hideChartTooltip() { if (_tlChartTip) _tlChartTip.style.display = 'none'; }
