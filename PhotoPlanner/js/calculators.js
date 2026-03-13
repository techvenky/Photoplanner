// ─── Photography Calculators ──────────────────────────────────────────────────

function resultHTML(rows) {
  return rows.map(([label, value, highlight]) =>
    `<div class="result-row">
      <span class="result-label">${label}</span>
      <span class="result-value${highlight ? ' highlight' : ''}">${value}</span>
    </div>`
  ).join('');
}

function calcError(elId, msg) {
  document.getElementById(elId).innerHTML =
    `<div class="calc-error">⚠ ${msg}</div>`;
}

function requirePositive(...vals) {
  return vals.every(v => typeof v === 'number' && isFinite(v) && v > 0);
}

function requireNonNegative(...vals) {
  return vals.every(v => typeof v === 'number' && isFinite(v) && v >= 0);
}

function calcDOF() {
  const coc = parseFloat(document.getElementById('dof-sensor').value);
  const f = parseFloat(document.getElementById('dof-focal').value) / 1000;
  const N = parseFloat(document.getElementById('dof-aperture').value);
  const D = parseFloat(document.getElementById('dof-distance').value);

  if (!requirePositive(coc, f, N, D)) {
    calcError('dof-results', 'Enter valid positive values for all fields.');
    return;
  }

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

  if (!requirePositive(s1, iso1, a1, a2, iso2)) {
    calcError('exp-results', 'Enter valid positive values for all fields.');
    return;
  }

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

  if (!requirePositive(dur, interval, fps)) {
    calcError('tl-results', 'Enter valid positive values for all fields.');
    return;
  }
  if (interval < 1) {
    calcError('tl-results', 'Interval must be at least 1 second.');
    return;
  }

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

  if (!requirePositive(coc, f, N)) {
    calcError('hf-results', 'Enter valid positive values for all fields.');
    return;
  }

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

  if (!requirePositive(crop, focal)) {
    calcError('ndr-results', 'Enter valid positive values for all fields.');
    return;
  }

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

function calcFOV() {
  const parts = document.getElementById('fov-sensor').value.split('x').map(Number);
  const [sw, sh] = parts;
  const f = parseFloat(document.getElementById('fov-focal').value);

  if (!requirePositive(sw, sh, f)) {
    calcError('fov-results', 'Enter valid positive values for all fields.');
    return;
  }

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
  const sensorParts = document.getElementById('st-sensor').value.split('x');
  const crop = parseFloat(sensorParts[2]);
  const f        = parseFloat(document.getElementById('st-focal').value);
  const aperture = parseFloat(document.getElementById('st-aperture').value);
  const iso      = parseInt(document.getElementById('st-iso').value);
  const trailDeg = parseFloat(document.getElementById('st-trail').value);

  if (!requirePositive(crop, f, aperture, iso, trailDeg)) {
    calcError('st-results', 'Enter valid positive values for all fields.');
    return;
  }
  if (trailDeg > 360) {
    calcError('st-results', 'Trail length cannot exceed 360°.');
    return;
  }

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

function initCalcTabs() {
  document.querySelectorAll('.calc-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.calc-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.calc-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('calc-' + tab.dataset.calc).classList.add('active');
    });
  });
}
