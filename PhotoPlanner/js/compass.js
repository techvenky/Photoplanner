// ─── Compass ──────────────────────────────────────────────────────────────────

function updateCompass() {
  const dateStr = document.getElementById('sm-date').value;
  const timeStr = document.getElementById('sm-time').value;
  if (!dateStr || !timeStr || state.currentLat === null) return;

  const [h, m] = timeStr.split(':').map(Number);
  const dt = new Date(dateStr + 'T00:00:00');
  dt.setHours(h, m, 0);

  const sunPos = SunCalc.getPosition(dt, state.currentLat, state.currentLon);
  const moonPos = SunCalc.getMoonPosition(dt, state.currentLat, state.currentLon);

  const sunAz = deg(sunPos.azimuth);
  const sunAlt = toDeg(sunPos.altitude);
  const moonAz = deg(moonPos.azimuth);
  const moonAlt = toDeg(moonPos.altitude);

  document.getElementById('sun-az').textContent = sunAz.toFixed(1) + '°';
  document.getElementById('sun-alt').textContent = sunAlt.toFixed(1) + '°';
  document.getElementById('moon-az').textContent = moonAz.toFixed(1) + '°';
  document.getElementById('moon-alt').textContent = moonAlt.toFixed(1) + '°';

  drawCompass(sunAz, sunAlt, moonAz);
}

function drawCompass(sunAz, sunAlt, moonAz) {
  const canvas = document.getElementById('compass');
  const ctx = canvas.getContext('2d');
  const cx = 100, cy = 100, r = 85;

  ctx.clearRect(0, 0, 200, 200);

  // Background circle
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#21262d';
  ctx.fill();
  ctx.strokeStyle = '#30363d';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Cardinal directions
  ctx.fillStyle = '#8b949e';
  ctx.font = '13px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ['N','E','S','W'].forEach((d, i) => {
    const a = i * Math.PI / 2 - Math.PI / 2;
    ctx.fillText(d, cx + (r - 12) * Math.cos(a), cy + (r - 12) * Math.sin(a));
  });

  // Tick marks
  for (let i = 0; i < 36; i++) {
    const a = i * 10 * Math.PI / 180 - Math.PI / 2;
    const len = i % 9 === 0 ? 10 : 5;
    ctx.beginPath();
    ctx.moveTo(cx + (r - 20) * Math.cos(a), cy + (r - 20) * Math.sin(a));
    ctx.lineTo(cx + (r - 20 + len) * Math.cos(a), cy + (r - 20 + len) * Math.sin(a));
    ctx.strokeStyle = '#30363d';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawArrow(az, color, emoji) {
    const a = (az - 90) * Math.PI / 180;
    const len = sunAlt > 0 ? r * 0.55 : r * 0.3;
    const x = cx + len * Math.cos(a);
    const y = cy + len * Math.sin(a);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x, y);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, x, y);
  }

  if (sunAlt > -6) drawArrow(sunAz, '#e3b341', '☀️');
  drawArrow(moonAz, '#a8d8ea', '🌕');

  // Center dot
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#58a6ff';
  ctx.fill();
}
