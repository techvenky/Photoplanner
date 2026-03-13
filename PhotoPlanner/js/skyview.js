// ─── Sky View Modal ───────────────────────────────────────────────────────────

function drawSkyDomeIfOpen() {
  if (document.getElementById('sky-modal').style.display !== 'none') drawSkyDome();
}

function drawSkyDome() {
  if (state.currentLat === null) {
    document.getElementById('sky-info').textContent = 'Set a location on the map first.';
    return;
  }

  const canvas = document.getElementById('sky-canvas');
  const ctx    = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2;
  const R  = Math.min(W, H) / 2 - 28; // horizon radius in px

  ctx.clearRect(0, 0, W, H);

  // Sky background
  const skyGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  skyGrad.addColorStop(0,   '#0a1628');
  skyGrad.addColorStop(0.7, '#0f2a45');
  skyGrad.addColorStop(1,   '#1a3d55');
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = skyGrad;
  ctx.fill();

  // Altitude rings: 15°, 30°, 45°, 60°, 75°
  [15, 30, 45, 60, 75].forEach(alt => {
    const r = R * (1 - alt / 90);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(alt + '°', cx + r + 3, cy);
  });

  // Horizon ring
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Cardinal tick lines
  for (let az = 0; az < 360; az += 10) {
    const a = (az - 90) * Math.PI / 180;
    const inner = az % 90 === 0 ? R - 14 : az % 30 === 0 ? R - 8 : R - 4;
    ctx.beginPath();
    ctx.moveTo(cx + inner * Math.cos(a), cy + inner * Math.sin(a));
    ctx.lineTo(cx + R     * Math.cos(a), cy + R     * Math.sin(a));
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Cardinal labels
  [['N','#ff5555',0],['NE','#aaa',45],['E','#ccc',90],['SE','#aaa',135],
   ['S','#ccc',180],['SW','#aaa',225],['W','#ccc',270],['NW','#aaa',315]].forEach(([label, color, az]) => {
    if (label.length > 1 && az % 90 !== 0) {
      // only draw intercardinals at larger size
    }
    const a = (az - 90) * Math.PI / 180;
    const dist = R + 16;
    ctx.fillStyle = color;
    ctx.font = az % 90 === 0 ? 'bold 13px sans-serif' : '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx + dist * Math.cos(a), cy + dist * Math.sin(a));
  });

  // Helper: az (0=N, CW), alt (0=horizon, 90=zenith) → canvas [x,y]
  function skyXY(azDeg, altDeg) {
    const r = R * (1 - Math.max(altDeg, 0) / 90);
    const a = (azDeg - 90) * Math.PI / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  }

  const date = getSelectedDate();
  const minutes = parseInt(document.getElementById('plan-time-slider').value);

  // Get date at slider minutes
  const base = getSelectedDate();
  const dt = new Date(base);
  dt.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);

  // Sun arc
  const sunArcPts = [];
  for (let h = 0; h <= 24; h += 0.1) {
    const d = new Date(date);
    d.setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0);
    const pos   = SunCalc.getPosition(d, state.currentLat, state.currentLon);
    const azDeg = ((pos.azimuth + Math.PI) * 180 / Math.PI + 360) % 360;
    const altDeg = toDeg(pos.altitude);
    if (altDeg > -2) sunArcPts.push(skyXY(azDeg, Math.max(altDeg, 0)));
  }
  if (sunArcPts.length > 1) {
    ctx.beginPath();
    ctx.moveTo(sunArcPts[0][0], sunArcPts[0][1]);
    sunArcPts.forEach(p => ctx.lineTo(p[0], p[1]));
    ctx.strokeStyle = 'rgba(227,179,65,0.55)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Moon arc
  const moonArcPts = [];
  for (let h = 0; h <= 24; h += 0.2) {
    const d = new Date(date);
    d.setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0);
    const pos   = SunCalc.getMoonPosition(d, state.currentLat, state.currentLon);
    const azDeg = ((pos.azimuth + Math.PI) * 180 / Math.PI + 360) % 360;
    const altDeg = toDeg(pos.altitude);
    if (altDeg > -2) moonArcPts.push(skyXY(azDeg, Math.max(altDeg, 0)));
  }
  if (moonArcPts.length > 1) {
    ctx.beginPath();
    ctx.moveTo(moonArcPts[0][0], moonArcPts[0][1]);
    moonArcPts.forEach(p => ctx.lineTo(p[0], p[1]));
    ctx.strokeStyle = 'rgba(168,216,234,0.5)';
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Key-time labels on sun arc
  const times = SunCalc.getTimes(date, state.currentLat, state.currentLon);
  const keyEvts = [
    { t: times.sunrise, label: '☀️', color: '#e3b341' },
    { t: times.sunset,  label: '🌅', color: '#f78166' },
    { t: times.goldenHour,    label: '🌟', color: '#f0a500' },
    { t: times.goldenHourEnd, label: '🌟', color: '#f0a500' },
  ];
  keyEvts.forEach(({ t, label }) => {
    if (!t || isNaN(t)) return;
    const pos   = SunCalc.getPosition(t, state.currentLat, state.currentLon);
    const azDeg = ((pos.azimuth + Math.PI) * 180 / Math.PI + 360) % 360;
    const altDeg = toDeg(pos.altitude);
    if (altDeg < -3) return;
    const [x, y] = skyXY(azDeg, Math.max(altDeg, 0));
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y);
  });

  // Target bearing line
  if (state.targetLat !== null) {
    const bearing = calcBearing(state.currentLat, state.currentLon, state.targetLat, state.targetLon);
    const a = (bearing - 90) * Math.PI / 180;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a));
    ctx.strokeStyle = '#ff6b6b';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    // Label at horizon
    ctx.fillStyle = '#ff6b6b';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('TARGET', cx + (R + 0) * Math.cos(a) * 0.9, cy + (R + 0) * Math.sin(a) * 0.9);
  }

  // Current sun position
  const sunPos = SunCalc.getPosition(dt, state.currentLat, state.currentLon);
  const sunAzDeg  = ((sunPos.azimuth  + Math.PI) * 180 / Math.PI + 360) % 360;
  const sunAltDeg = toDeg(sunPos.altitude);
  if (sunAltDeg > -5) {
    const [sx, sy] = skyXY(sunAzDeg, Math.max(sunAltDeg, 0));
    if (sunAltDeg > 0) {
      const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 18);
      glow.addColorStop(0,   'rgba(255,230,80,0.6)');
      glow.addColorStop(1,   'rgba(255,230,80,0)');
      ctx.beginPath(); ctx.arc(sx, sy, 18, 0, Math.PI*2);
      ctx.fillStyle = glow; ctx.fill();
    }
    ctx.font = '22px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('☀️', sx, sy);
  }

  // Current moon position
  const moonPos = SunCalc.getMoonPosition(dt, state.currentLat, state.currentLon);
  const moonAzDeg  = ((moonPos.azimuth  + Math.PI) * 180 / Math.PI + 360) % 360;
  const moonAltDeg = toDeg(moonPos.altitude);
  if (moonAltDeg > -5) {
    const [mx, my] = skyXY(moonAzDeg, Math.max(moonAltDeg, 0));
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🌕', mx, my);
  }

  // Milky Way galactic centre arc + current position
  const mwArcPts = [];
  for (let h = 0; h <= 24; h += 0.2) {
    const d = new Date(date);
    d.setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0);
    const sunAlt2 = toDeg(SunCalc.getPosition(d, state.currentLat, state.currentLon).altitude);
    const mwp = getGalacticCenterPos(d, state.currentLat, state.currentLon);
    if (sunAlt2 < -12 && mwp.altitude > 0)
      mwArcPts.push(skyXY(mwp.azimuth_north_deg, toDeg(mwp.altitude)));
  }
  if (mwArcPts.length > 1) {
    ctx.beginPath();
    ctx.moveTo(mwArcPts[0][0], mwArcPts[0][1]);
    mwArcPts.forEach(p => ctx.lineTo(p[0], p[1]));
    ctx.strokeStyle = 'rgba(198,120,221,0.6)';
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // Current galactic centre
  const mwNow = getGalacticCenterPos(dt, state.currentLat, state.currentLon);
  const sunAltNow = toDeg(SunCalc.getPosition(dt, state.currentLat, state.currentLon).altitude);
  if (mwNow.altitude > 0 && sunAltNow < -12) {
    const [gx, gy] = skyXY(mwNow.azimuth_north_deg, toDeg(mwNow.altitude));
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🌌', gx, gy);
  }

  // Zenith dot
  ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI*2);
  ctx.fillStyle = '#ffffff50'; ctx.fill();

  // Info text below canvas
  const mwAzDeg  = mwNow.azimuth_north_deg.toFixed(1);
  const mwAltDeg = toDeg(mwNow.altitude).toFixed(1);
  const infoEl = document.getElementById('sky-info');
  infoEl.innerHTML = `
    <div>☀️ Az: ${sunAzDeg.toFixed(1)}° / Alt: ${sunAltDeg.toFixed(1)}°</div>
    <div>🌕 Az: ${moonAzDeg.toFixed(1)}° / Alt: ${moonAltDeg.toFixed(1)}°</div>
    <div>🌌 Galactic Centre: Az ${mwAzDeg}° / Alt ${mwAltDeg}°</div>
    ${state.targetLat ? `<div>🎯 Target bearing: ${calcBearing(state.currentLat,state.currentLon,state.targetLat,state.targetLon).toFixed(1)}°</div>` : ''}
  `;
}

function initSkyModal() {
  document.getElementById('sky-view-btn').addEventListener('click', () => {
    document.getElementById('sky-modal').style.display = 'flex';
    drawSkyDome();
  });
  document.getElementById('sky-close-btn').addEventListener('click', () => {
    document.getElementById('sky-modal').style.display = 'none';
  });
  document.getElementById('sky-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('sky-modal'))
      document.getElementById('sky-modal').style.display = 'none';
  });
}
