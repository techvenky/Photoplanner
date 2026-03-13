// ─── Sun/Moon Path on Map ─────────────────────────────────────────────────────

// SunCalc azimuth: radians from south, positive westward.
// lat/lon offset: lat -= cos(az)*R,  lon -= sin(az)*R
function azToLatLon(az, r) {
  return [state.currentLat - r * Math.cos(az), state.currentLon - r * Math.sin(az)];
}

function getDateAtMinutes(minutes) {
  const base = getSelectedDate();
  const dt = new Date(base);
  dt.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return dt;
}

// Draws the static full-day arc + key-time markers. Called on date/location change.
function drawSunPath() {
  if (state.currentLat === null) return;
  state.sunPathGroup.clearLayers();
  state.moonPathGroup.clearLayers();
  state.keyTimesGroup.clearLayers();
  state.milkyWayGroup.clearLayers();

  const date = getSelectedDate();
  const R = 1.5; // arc radius in degrees

  if (document.getElementById('show-sun').checked) {
    // Full-day arc
    const sunPoints = [];
    for (let h = 0; h <= 24; h += 0.1) {
      const d = new Date(date);
      d.setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0);
      const pos = SunCalc.getPosition(d, state.currentLat, state.currentLon);
      if (pos.altitude > 0) sunPoints.push(azToLatLon(pos.azimuth, R));
    }
    if (sunPoints.length > 1) {
      addStrokedPolyline(sunPoints, { color: '#e3b341', weight: 2.5, opacity: 0.85 }, state.sunPathGroup);
    }

    // Key-time markers + dashed direction lines
    if (document.getElementById('show-golden').checked) {
      const times = SunCalc.getTimes(date, state.currentLat, state.currentLon);
      const keyEvents = [
        { t: times.sunrise,      color: '#e3b341', label: '☀️ Sunrise' },
        { t: times.sunset,       color: '#f78166', label: '🌅 Sunset' },
        { t: times.goldenHour,   color: '#f0a500', label: '🌟 Golden Hour AM' },
        { t: times.goldenHourEnd,color: '#f0a500', label: '🌟 Golden Hour PM' },
        { t: times.dawn,         color: '#58a6ff', label: '🔵 Blue Hour AM' },
        { t: times.dusk,         color: '#58a6ff', label: '🔵 Blue Hour PM' },
      ];
      keyEvents.forEach(({ t, color, label }) => {
        if (!t || isNaN(t)) return;
        const pos = SunCalc.getPosition(t, state.currentLat, state.currentLon);
        const pt = azToLatLon(pos.azimuth, R);
        // Dashed line from location pin to arc
        L.polyline([[state.currentLat, state.currentLon], pt], {
          color, weight: 1.5, opacity: 0.5, dashArray: '5 5'
        }).addTo(state.keyTimesGroup);
        // Dot on arc
        L.circleMarker(pt, { color, fillColor: color, fillOpacity: 1, radius: 5, weight: 2 })
          .bindTooltip(`${label}: ${fmtTimeLocal(t)}`, { sticky: true })
          .addTo(state.keyTimesGroup);
      });
    }
  }

  if (document.getElementById('show-moon').checked) {
    const moonPoints = [];
    for (let h = 0; h <= 24; h += 0.25) {
      const d = new Date(date);
      d.setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0);
      const pos = SunCalc.getMoonPosition(d, state.currentLat, state.currentLon);
      if (pos.altitude > 0) moonPoints.push(azToLatLon(pos.azimuth, R * 0.75));
    }
    if (moonPoints.length > 1) {
      addStrokedPolyline(moonPoints, { color: '#a8d8ea', weight: 2, opacity: 0.8, dashArray: '6 4' }, state.moonPathGroup);
    }
  }

  // Milky Way galactic centre arc (visible during astronomical night)
  if (document.getElementById('show-milkyway').checked) {
    const dateNow = getSelectedDate();
    const times = SunCalc.getTimes(dateNow, state.currentLat, state.currentLon);
    const mwPoints = [];
    let gcPeak = null; // { point, alt, time } — highest altitude GC moment during night
    for (let h = 0; h <= 24; h += 0.1) {
      const d = new Date(dateNow);
      d.setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0);
      const sunPos = SunCalc.getPosition(d, state.currentLat, state.currentLon);
      const mwPos  = getGalacticCenterPos(d, state.currentLat, state.currentLon);
      if (toDeg(sunPos.altitude) < -12 && mwPos.altitude > 0) {
        const pt = azToLatLon(mwPos.azimuth, R);
        mwPoints.push(pt);
        const altDeg = toDeg(mwPos.altitude);
        if (!gcPeak || altDeg > gcPeak.alt) gcPeak = { pt, alt: altDeg, az: mwPos.azimuth_north_deg, time: d };
      }
    }

    if (mwPoints.length > 1) {
      // Outer glow band
      L.polyline(mwPoints, { color: '#c678dd', weight: 18, opacity: 0.08 }).addTo(state.milkyWayGroup);
      // Mid glow
      L.polyline(mwPoints, { color: '#c678dd', weight: 8,  opacity: 0.18 }).addTo(state.milkyWayGroup);
      // Core line
      L.polyline(mwPoints, { color: '#e2b3ff', weight: 2.5, opacity: 0.85, dashArray: '6 3' }).addTo(state.milkyWayGroup);
    }

    // Galactic core marker at peak altitude
    if (gcPeak) {
      // Direction ray to peak
      L.polyline([[state.currentLat, state.currentLon], gcPeak.pt], {
        color: '#c678dd', weight: 1.5, opacity: 0.45, dashArray: '5 4'
      }).addTo(state.milkyWayGroup);

      // Glowing core icon
      const gcIcon = L.divIcon({
        html: `<div style="position:relative;width:36px;height:36px">
          <div style="position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle,rgba(198,120,221,0.55) 0%,rgba(198,120,221,0) 70%)"></div>
          <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:18px;line-height:1;filter:drop-shadow(0 0 6px #c678dd)">🌌</div>
        </div>`,
        className: '',
        iconAnchor: [18, 18]
      });
      L.marker(gcPeak.pt, { icon: gcIcon })
        .bindTooltip(`🌌 Galactic Core Peak<br>Alt: ${gcPeak.alt.toFixed(1)}°  Az: ${gcPeak.az.toFixed(1)}°<br>${fmtTimeLocal(gcPeak.time)}`, { sticky: true })
        .addTo(state.milkyWayGroup);
    }

    // Rise / set boundary markers
    [times.night, times.nightEnd].forEach((t, idx) => {
      if (!t || isNaN(t)) return;
      const mwPos = getGalacticCenterPos(t, state.currentLat, state.currentLon);
      if (mwPos.altitude > 0) {
        const pt = azToLatLon(mwPos.azimuth, R);
        L.circleMarker(pt, { color: '#c678dd', fillColor: '#c678dd', fillOpacity: 0.8, radius: 5, weight: 1.5 })
          .bindTooltip(`🌌 ${idx === 0 ? 'Astro Night Start' : 'Astro Night End'}: ${fmtTimeLocal(t)}`)
          .addTo(state.milkyWayGroup);
      }
    });
  }

  drawTimeIndicator();
}

// Local helper to avoid circular import — uses state.selectedTimezone same as fmtTime
function fmtTimeLocal(date) {
  if (!date || isNaN(date)) return '—';
  if (typeof dayjs !== 'undefined' && state.selectedTimezone) {
    try { return dayjs(date).tz(state.selectedTimezone).format('h:mm A'); } catch(e) {}
  }
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Draws the moving direction ray + position marker at the selected time.
function drawTimeIndicator() {
  if (state.currentLat === null) return;
  state.timeIndicatorGroup.clearLayers();

  const minutes = parseInt(document.getElementById('plan-time-slider').value);
  const dt = getDateAtMinutes(minutes);
  const RAY = 4.0;           // ray extends well off-screen
  const DOT = getAdaptiveDot(); // scales with zoom so icon stays ~90px from pin

  function drawRay(pos, color, emoji, name) {
    const az = pos.azimuth;
    const isAboveHorizon = pos.altitude > 0;
    const opacity = isAboveHorizon ? 0.95 : 0.35;
    const endPt = azToLatLon(az, RAY);
    const dotPt = azToLatLon(az, DOT);

    // Direction ray from pin (with dark outline)
    addStrokedPolyline([[state.currentLat, state.currentLon], endPt], {
      color, weight: 3, opacity,
      dashArray: isAboveHorizon ? null : '8 6'
    }, state.timeIndicatorGroup);

    // Emoji marker at fixed distance
    const icon = L.divIcon({
      html: `<div style="font-size:22px;line-height:1;filter:drop-shadow(0 0 4px ${color})">${emoji}</div>`,
      className: '',
      iconAnchor: [11, 11]
    });
    const azDeg = ((az + Math.PI) * 180 / Math.PI + 360) % 360;
    const altDeg = toDeg(pos.altitude).toFixed(1);
    L.marker(dotPt, { icon })
      .bindTooltip(`${name}<br>Az: ${azDeg.toFixed(1)}°  Alt: ${altDeg}°<br>${isAboveHorizon ? 'Above horizon' : 'Below horizon'}`, { sticky: true })
      .addTo(state.timeIndicatorGroup);
  }

  if (document.getElementById('show-sun').checked) {
    const sunPos = SunCalc.getPosition(dt, state.currentLat, state.currentLon);
    drawRay(sunPos, '#e3b341', '☀️', 'Sun');
  }
  if (document.getElementById('show-moon').checked) {
    const moonPos = SunCalc.getMoonPosition(dt, state.currentLat, state.currentLon);
    drawRay(moonPos, '#a8d8ea', '🌕', 'Moon');
  }
  if (document.getElementById('show-milkyway').checked) {
    const mwPos    = getGalacticCenterPos(dt, state.currentLat, state.currentLon);
    const sunAltNow = toDeg(SunCalc.getPosition(dt, state.currentLat, state.currentLon).altitude);
    if (sunAltNow < -12 && mwPos.altitude > 0) {
      const az = mwPos.azimuth;
      const dotPt = azToLatLon(az, getAdaptiveDot());
      const endPt = azToLatLon(az, 4.0);
      // Glow band ray
      L.polyline([[state.currentLat, state.currentLon], endPt], { color: '#c678dd', weight: 10, opacity: 0.12 }).addTo(state.timeIndicatorGroup);
      L.polyline([[state.currentLat, state.currentLon], endPt], { color: '#c678dd', weight: 4,  opacity: 0.35 }).addTo(state.timeIndicatorGroup);
      L.polyline([[state.currentLat, state.currentLon], endPt], { color: '#e2b3ff', weight: 1.5, opacity: 0.9 }).addTo(state.timeIndicatorGroup);
      // Glowing core icon
      const gcIcon = L.divIcon({
        html: `<div style="position:relative;width:40px;height:40px">
          <div style="position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle,rgba(198,120,221,0.6) 0%,rgba(198,120,221,0) 70%);animation:mw-pulse 2s ease-in-out infinite"></div>
          <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:20px;filter:drop-shadow(0 0 8px #c678dd)">🌌</div>
        </div>`,
        className: '',
        iconAnchor: [20, 20]
      });
      const azDeg = mwPos.azimuth_north_deg.toFixed(1);
      const altDeg = toDeg(mwPos.altitude).toFixed(1);
      L.marker(dotPt, { icon: gcIcon })
        .bindTooltip(`🌌 Galactic Core<br>Az: ${azDeg}°  Alt: ${altDeg}°`, { sticky: true })
        .addTo(state.timeIndicatorGroup);
    }
  }

  updatePlannerInfo(dt);
}

function updatePlannerInfo(dt) {
  if (state.currentLat === null) return;
  const date = getSelectedDate();
  const times = SunCalc.getTimes(date, state.currentLat, state.currentLon);
  const moonTimes = SunCalc.getMoonTimes(date, state.currentLat, state.currentLon);

  const targetDt = dt || getDateAtMinutes(parseInt(document.getElementById('plan-time-slider').value));
  const sunPos  = SunCalc.getPosition(targetDt, state.currentLat, state.currentLon);
  const moonPos = SunCalc.getMoonPosition(targetDt, state.currentLat, state.currentLon);
  const sunAzDeg  = ((sunPos.azimuth  + Math.PI) * 180 / Math.PI + 360) % 360;
  const moonAzDeg = ((moonPos.azimuth + Math.PI) * 180 / Math.PI + 360) % 360;

  // Determine sun status at selected time
  const sunStatus = sunPos.altitude > 0 ? '☀️ Above horizon'
    : toDeg(sunPos.altitude) > -6  ? '🌅 Civil twilight'
    : toDeg(sunPos.altitude) > -12 ? '🌆 Nautical twilight'
    : toDeg(sunPos.altitude) > -18 ? '🌃 Astronomical twilight'
    : '🌑 Night';
  document.getElementById('plan-time-status').textContent = sunStatus;

  const panel = document.getElementById('planner-info');
  panel.innerHTML = `
    <div class="info-row"><span class="info-label">☀️ Sun Az</span><span class="info-val">${sunAzDeg.toFixed(1)}°</span></div>
    <div class="info-row"><span class="info-label">☀️ Sun Alt</span><span class="info-val">${toDeg(sunPos.altitude).toFixed(1)}°</span></div>
    <div class="info-row"><span class="info-label">🌕 Moon Az</span><span class="info-val">${moonAzDeg.toFixed(1)}°</span></div>
    <div class="info-row"><span class="info-label">🌕 Moon Alt</span><span class="info-val">${toDeg(moonPos.altitude).toFixed(1)}°</span></div>
    <hr style="border-color:#30363d;margin:0.4rem 0"/>
    <div class="info-row"><span class="info-label">Sunrise</span><span class="info-val">${fmtTimeLocal(times.sunrise)}</span></div>
    <div class="info-row"><span class="info-label">Sunset</span><span class="info-val">${fmtTimeLocal(times.sunset)}</span></div>
    <div class="info-row"><span class="info-label">Golden AM</span><span class="info-val">${fmtTimeLocal(times.goldenHourEnd)}</span></div>
    <div class="info-row"><span class="info-label">Golden PM</span><span class="info-val">${fmtTimeLocal(times.goldenHour)}</span></div>
    <div class="info-row"><span class="info-label">Moonrise</span><span class="info-val">${moonTimes.rise ? fmtTimeLocal(moonTimes.rise) : '—'}</span></div>
    <div class="info-row"><span class="info-label">Moonset</span><span class="info-val">${moonTimes.set ? fmtTimeLocal(moonTimes.set) : '—'}</span></div>
  `;
}
