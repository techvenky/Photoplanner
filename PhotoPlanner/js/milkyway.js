// ─── Milky Way Tab ────────────────────────────────────────────────────────────

function updateMilkyWay() {
  const dateStr = document.getElementById('mw-date').value;
  if (!dateStr) return;
  const date = new Date(dateStr + 'T12:00:00');

  // Month badges
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const goodMonths = [2,3,4,5,6,7,8,9]; // Mar-Oct indices
  const bestMonths = [4,5,6,7,8]; // May-Sep
  const container = document.getElementById('mw-months');
  container.innerHTML = months.map((m, i) => {
    let cls = '';
    if (bestMonths.includes(i)) cls = 'best';
    else if (goodMonths.includes(i)) cls = 'good';
    return `<span class="month-badge ${cls}">${m}</span>`;
  }).join('');

  if (state.currentLat === null) return;

  // Moon illumination check
  const moonIllum = SunCalc.getMoonIllumination(date);
  const illumination = (moonIllum.fraction * 100).toFixed(0);
  const phase = moonIllum.phase;
  const phaseNames = ['New Moon','Waxing Crescent','First Quarter','Waxing Gibbous','Full Moon','Waning Gibbous','Last Quarter','Waning Crescent'];
  const phaseIdx = Math.round(phase * 8) % 8;

  const times = SunCalc.getTimes(date, state.currentLat, state.currentLon);

  // Estimate dark hours (astronomical night)
  const nightStart = times.night;
  const nightEnd = times.nightEnd ? new Date(times.nightEnd.getTime() + 86400000) : null;

  let visibilityHTML = `<div class="time-row"><span class="info-label">Moon Phase</span><span>${phaseNames[phaseIdx]}</span></div>`;
  visibilityHTML += `<div class="time-row"><span class="info-label">Moon Illumination</span><span>${illumination}%</span></div>`;

  const quality = moonIllum.fraction < 0.25 ? '⭐⭐⭐⭐⭐ Excellent' :
                  moonIllum.fraction < 0.5  ? '⭐⭐⭐ Good' :
                  moonIllum.fraction < 0.75 ? '⭐⭐ Fair' : '⭐ Poor (bright moon)';

  visibilityHTML += `<div class="time-row"><span class="info-label">Sky Darkness Quality</span><span>${quality}</span></div>`;
  if (nightStart) visibilityHTML += `<div class="time-row"><span class="info-label">Astronomical Night Start</span><span>${fmtTime(nightStart)}</span></div>`;
  if (nightEnd) visibilityHTML += `<div class="time-row"><span class="info-label">Astronomical Night End</span><span>${fmtTime(nightEnd)}</span></div>`;

  document.getElementById('mw-visibility').innerHTML = `<div style="display:flex;flex-direction:column;gap:0.25rem">${visibilityHTML}</div>`;

  // Galactic center rise/set scan during astronomical night
  const month = date.getMonth() + 1;
  const galacticVisible = state.currentLat > -60 && state.currentLat < 85;
  const galacticBestMonths = month >= 4 && month <= 10;

  // Scan every 4 minutes across the 24-hour window to find GC altitude crossings
  let gcRise = null, gcSet = null;
  let prevGcAlt = null;
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  for (let m = 0; m <= 1440; m += 4) {
    const t = new Date(dayStart.getTime() + m * 60000);
    const sunPos = SunCalc.getPosition(t, state.currentLat, state.currentLon);
    const sunAltDeg = toDeg(sunPos.altitude);
    // Only consider astronomical night (sun < -18°) or near it (< -12° nautical)
    if (sunAltDeg > -12) { prevGcAlt = null; continue; }
    const gcPos = getGalacticCenterPos(t, state.currentLat, state.currentLon);
    const gcAltDeg = toDeg(gcPos.altitude);
    if (prevGcAlt !== null) {
      if (prevGcAlt < 0 && gcAltDeg >= 0 && !gcRise) gcRise = new Date(t.getTime() - 2 * 60000);
      if (prevGcAlt >= 0 && gcAltDeg < 0 && !gcSet) gcSet = new Date(t.getTime() - 2 * 60000);
    }
    prevGcAlt = gcAltDeg;
  }

  // Check if GC is up at any point during astronomical night
  let gcPeakAlt = null;
  for (let m = 0; m <= 1440; m += 15) {
    const t = new Date(dayStart.getTime() + m * 60000);
    const sunPos = SunCalc.getPosition(t, state.currentLat, state.currentLon);
    if (toDeg(sunPos.altitude) > -18) continue;
    const gcPos = getGalacticCenterPos(t, state.currentLat, state.currentLon);
    const gcAltDeg = toDeg(gcPos.altitude);
    if (gcPeakAlt === null || gcAltDeg > gcPeakAlt) gcPeakAlt = gcAltDeg;
  }

  const gcRiseStr = gcRise ? fmtTime(gcRise) : (gcPeakAlt !== null && gcPeakAlt > 0 ? 'Up all night' : '—');
  const gcSetStr  = gcSet  ? fmtTime(gcSet)  : (gcPeakAlt !== null && gcPeakAlt > 0 ? 'Up all night' : '—');
  const gcVisible = galacticVisible && (gcRise !== null || (gcPeakAlt !== null && gcPeakAlt > 0));

  document.getElementById('mw-galactic').innerHTML = `
    <div class="time-row"><span>Latitude</span><span>${state.currentLat.toFixed(2)}°</span></div>
    <div class="time-row highlight gold"><span>🌌 Milky Way Rises</span><span>${gcRiseStr}</span></div>
    <div class="time-row highlight gold"><span>🌌 Milky Way Sets</span><span>${gcSetStr}</span></div>
    <div class="time-row"><span>Best Season</span><span>${galacticBestMonths ? '✅ In season' : '❌ Off season'}</span></div>
    <div class="time-row"><span>Recommended</span><span>${gcVisible && galacticBestMonths && moonIllum.fraction < 0.3 ? '🌟 Go shoot!' : 'Plan for better conditions'}</span></div>
  `;

  // Next best dates (next 4 new moons)
  const goodMWMonths = [4, 5, 6, 7, 8, 9, 10]; // Apr–Oct
  const nextMoons = nextNewMoons(date, 4);
  const mwDatesHTML = nextMoons.map(d => {
    const inSeason = goodMWMonths.includes(d.getMonth() + 1);
    const dateStrFmt = d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    const badge = inSeason
      ? '<span class="month-badge best">In season</span>'
      : '<span class="month-badge">Off season</span>';
    return `<div class="time-row" style="gap:0.5rem"><span>🌑 ${dateStrFmt}</span>${badge}</div>`;
  }).join('');
  document.getElementById('mw-next-dates').innerHTML = mwDatesHTML;
}

function initMilkyWayListeners() {
  document.getElementById('mw-date').addEventListener('change', updateMilkyWay);
}
