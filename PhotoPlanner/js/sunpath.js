// ─── Sun/Moon Path on Map ─────────────────────────────────────────────────────

// SunCalc azimuth: radians from south, positive westward.
// lat/lon offset: lat -= cos(az)*R,  lon -= sin(az)*R / cos(lat)
// The longitude divisor corrects for Mercator scaling — without it east/west
// directions are visually stretched, misplacing markers at higher latitudes.
function azToLatLon(az, r) {
  const lonScale = Math.cos(state.currentLat * Math.PI / 180);
  return [
    state.currentLat - r * Math.cos(az),
    state.currentLon - r * Math.sin(az) / lonScale,
  ];
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
  const R = getAdaptiveArcR(); // arc radius scales with zoom (~200px on screen)

  if (document.getElementById('show-sun').checked) {
    // Full-day arc — split into separate segments so a below-horizon gap never
    // creates a false line connecting two unrelated above-horizon positions.
    const sunSegs = [[]];
    for (let h = 0; h <= 24; h += 0.1) {
      const d = new Date(date);
      d.setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0);
      const pos = SunCalc.getPosition(d, state.currentLat, state.currentLon);
      const last = sunSegs[sunSegs.length - 1];
      if (pos.altitude > 0) {
        last.push(azToLatLon(pos.azimuth, R));
      } else if (last.length > 0) {
        sunSegs.push([]);
      }
    }
    sunSegs.forEach(seg => {
      if (seg.length > 1)
        addStrokedPolyline(seg, { color: '#e3b341', weight: 2.5, opacity: 0.85 }, state.sunPathGroup);
    });

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
          .bindTooltip(`${label}: ${fmtTime(t)}`, { sticky: true })
          .addTo(state.keyTimesGroup);
        // Time label floating next to dot
        const shortName = label.replace(/[☀️🌅🌟🔵]/gu, '').trim()
          .replace('Sunrise','SR').replace('Sunset','SS')
          .replace('Golden Hour AM','GH↑').replace('Golden Hour PM','GH↓')
          .replace('Blue Hour AM','BH↑').replace('Blue Hour PM','BH↓');
        L.marker(pt, {
          icon: L.divIcon({
            html: `<span style="font-size:9px;color:${color};text-shadow:0 1px 3px rgba(0,0,0,0.95);background:rgba(0,0,0,0.5);padding:1px 4px;border-radius:2px;white-space:nowrap;line-height:1.4">${shortName} ${fmtTime(t)}</span>`,
            className: '', iconAnchor: [-7, 6]
          })
        }).addTo(state.keyTimesGroup);
      });
    }
  }

  if (document.getElementById('show-moon').checked) {
    // Split into segments so a set→rise gap never creates a false connecting line.
    const moonSegs = [[]];
    for (let h = 0; h <= 24; h += 0.1) {
      const d = new Date(date);
      d.setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0);
      const pos = SunCalc.getMoonPosition(d, state.currentLat, state.currentLon);
      const last = moonSegs[moonSegs.length - 1];
      if (pos.altitude > 0) {
        last.push(azToLatLon(pos.azimuth, R));
      } else if (last.length > 0) {
        moonSegs.push([]);
      }
    }
    moonSegs.forEach(seg => {
      if (seg.length > 1)
        addStrokedPolyline(seg, { color: '#a8d8ea', weight: 2, opacity: 0.8, dashArray: '6 4' }, state.moonPathGroup);
    });
  }

  // Milky Way galactic centre arc (visible during astronomical night)
  if (document.getElementById('show-milkyway').checked) {
    const times = SunCalc.getTimes(date, state.currentLat, state.currentLon);
    const mwPoints = [];
    let gcPeak = null; // { point, alt, time } — highest altitude GC moment during night
    for (let h = 0; h <= 24; h += 0.1) {
      const d = new Date(date);
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
        .bindTooltip(`🌌 Galactic Core Peak<br>Alt: ${gcPeak.alt.toFixed(1)}°  Az: ${gcPeak.az.toFixed(1)}°<br>${fmtTime(gcPeak.time)}`, { sticky: true })
        .addTo(state.milkyWayGroup);
    }

    // Rise / set boundary markers
    [times.night, times.nightEnd].forEach((t, idx) => {
      if (!t || isNaN(t)) return;
      const mwPos = getGalacticCenterPos(t, state.currentLat, state.currentLon);
      if (mwPos.altitude > 0) {
        const pt = azToLatLon(mwPos.azimuth, R);
        L.circleMarker(pt, { color: '#c678dd', fillColor: '#c678dd', fillOpacity: 0.8, radius: 5, weight: 1.5 })
          .bindTooltip(`🌌 ${idx === 0 ? 'Astro Night Start' : 'Astro Night End'}: ${fmtTime(t)}`)
          .addTo(state.milkyWayGroup);
      }
    });
  }

  drawTimeIndicator();
  drawCardinalLines();
  drawDistanceRings();
  drawFOVCone();
}

// Draws the moving direction ray + position marker at the selected time.
function drawTimeIndicator() {
  if (state.currentLat === null) return;
  state.timeIndicatorGroup.clearLayers();

  const minutes = parseInt(document.getElementById('plan-time-slider').value);
  const dt = getDateAtMinutes(minutes);
  const RAY = getAdaptiveRay(); // ray extends past viewport edges at any zoom
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
    // Shadow direction ray (anti-sun, only when sun above horizon)
    if (document.getElementById('show-shadow')?.checked && sunPos.altitude > 0) {
      const shadowAz = sunPos.azimuth + Math.PI;
      addStrokedPolyline([[state.currentLat, state.currentLon], azToLatLon(shadowAz, RAY)], {
        color: '#6e7681', weight: 2, opacity: 0.55, dashArray: '5 7'
      }, state.timeIndicatorGroup);
      L.circleMarker(azToLatLon(shadowAz, DOT * 1.2), {
        color: '#6e7681', fillColor: '#1c2028', fillOpacity: 0.9, radius: 5, weight: 1.5
      }).bindTooltip('🌑 Shadow Direction', { sticky: true }).addTo(state.timeIndicatorGroup);
    }
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
      const endPt = azToLatLon(az, RAY);
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
  const statusEl = document.getElementById('plan-time-status');
  if (statusEl) statusEl.textContent = sunStatus;

  const panel = document.getElementById('planner-info');
  if (!panel) return;
  panel.innerHTML = `
    <div class="info-row"><span class="info-label">☀️ Sun Az</span><span class="info-val">${sunAzDeg.toFixed(1)}°</span></div>
    <div class="info-row"><span class="info-label">☀️ Sun Alt</span><span class="info-val">${toDeg(sunPos.altitude).toFixed(1)}°</span></div>
    <div class="info-row"><span class="info-label">🌕 Moon Az</span><span class="info-val">${moonAzDeg.toFixed(1)}°</span></div>
    <div class="info-row"><span class="info-label">🌕 Moon Alt</span><span class="info-val">${toDeg(moonPos.altitude).toFixed(1)}°</span></div>
    <hr style="border-color:#30363d;margin:0.4rem 0"/>
    <div class="info-row"><span class="info-label">Sunrise</span><span class="info-val">${fmtTime(times.sunrise)}</span></div>
    <div class="info-row"><span class="info-label">Sunset</span><span class="info-val">${fmtTime(times.sunset)}</span></div>
    <div class="info-row"><span class="info-label">Golden AM</span><span class="info-val">${fmtTime(times.goldenHourEnd)}</span></div>
    <div class="info-row"><span class="info-label">Golden PM</span><span class="info-val">${fmtTime(times.goldenHour)}</span></div>
    <div class="info-row"><span class="info-label">Moonrise</span><span class="info-val">${moonTimes.rise ? fmtTime(moonTimes.rise) : '—'}</span></div>
    <div class="info-row"><span class="info-label">Moonset</span><span class="info-val">${moonTimes.set ? fmtTime(moonTimes.set) : '—'}</span></div>
  `;
}

// ─── Cardinal direction reference lines ──────────────────────────────────────
function drawCardinalLines() {
  if (!state.cardinalGroup) return;
  state.cardinalGroup.clearLayers();
  if (!document.getElementById('show-cardinal')?.checked) return;
  if (state.currentLat === null) return;

  const RAY = getAdaptiveRay();
  const lonScale = Math.cos(state.currentLat * Math.PI / 180);
  const dirs = [
    { lat: state.currentLat + RAY, lon: state.currentLon,              label: 'N', color: '#ff6b6b' },
    { lat: state.currentLat - RAY, lon: state.currentLon,              label: 'S', color: '#8b949e' },
    { lat: state.currentLat,       lon: state.currentLon + RAY / lonScale, label: 'E', color: '#8b949e' },
    { lat: state.currentLat,       lon: state.currentLon - RAY / lonScale, label: 'W', color: '#8b949e' },
  ];
  dirs.forEach(({ lat, lon, label, color }) => {
    L.polyline([[state.currentLat, state.currentLon], [lat, lon]], {
      color, weight: 1, opacity: 0.3, dashArray: '4 10'
    }).addTo(state.cardinalGroup);
    const icon = L.divIcon({
      html: `<span style="font-size:11px;font-weight:700;color:${color};text-shadow:0 1px 3px rgba(0,0,0,0.9);background:rgba(0,0,0,0.45);padding:1px 4px;border-radius:3px;line-height:1.4">${label}</span>`,
      className: '', iconAnchor: [8, 8]
    });
    L.marker([lat, lon], { icon }).addTo(state.cardinalGroup);
  });
}

// ─── Distance rings ───────────────────────────────────────────────────────────
function drawDistanceRings() {
  if (!state.distanceRingGroup) return;
  state.distanceRingGroup.clearLayers();
  if (!document.getElementById('show-rings')?.checked) return;
  if (state.currentLat === null) return;

  const degPerMeter = 1 / 111111;
  const lonScale = Math.cos(state.currentLat * Math.PI / 180);
  [
    { r: 500,   label: '500 m' },
    { r: 1000,  label: '1 km'  },
    { r: 5000,  label: '5 km'  },
    { r: 10000, label: '10 km' },
  ].forEach(({ r, label }) => {
    L.circle([state.currentLat, state.currentLon], {
      radius: r, color: '#58a6ff', weight: 1, opacity: 0.45, fill: false, dashArray: '3 8'
    }).bindTooltip(label, { sticky: true }).addTo(state.distanceRingGroup);

    // Label at top of ring
    const labelLat = state.currentLat + r * degPerMeter;
    L.marker([labelLat, state.currentLon], {
      icon: L.divIcon({
        html: `<span style="font-size:9px;color:#58a6ff;opacity:0.85;text-shadow:0 1px 2px rgba(0,0,0,0.9);white-space:nowrap;background:rgba(0,0,0,0.4);padding:0 3px;border-radius:2px">${label}</span>`,
        className: '', iconAnchor: [0, 4]
      })
    }).addTo(state.distanceRingGroup);
  });
}

// ─── Camera FOV cone ─────────────────────────────────────────────────────────
function drawFOVCone() {
  if (!state.fovGroup) return;
  state.fovGroup.clearLayers();
  if (!document.getElementById('show-fov')?.checked) return;
  if (state.currentLat === null) return;

  const focal   = Math.max(8, parseFloat(document.getElementById('fov-focal')?.value)   || 50);
  const sKey    = document.getElementById('fov-sensor')?.value  || 'ff';
  const bearing = parseFloat(document.getElementById('fov-bearing')?.value) || 0;

  const sensorW = { ff: 36, apsc: 23.6, mft: 17.3, one: 13.2, phone: 6.3 };
  const sw = sensorW[sKey] || 36;
  const hfovRad = 2 * Math.atan(sw / (2 * focal));
  const hfovDeg = (hfovRad * 180 / Math.PI).toFixed(1);

  const dist = getAdaptiveArcR() * 2.5;
  const lonScale = Math.cos(state.currentLat * Math.PI / 180);
  const bRad = bearing * Math.PI / 180;

  // Cone polygon (apex at pin)
  const steps = 50;
  const pts = [[state.currentLat, state.currentLon]];
  for (let i = 0; i <= steps; i++) {
    const a = bRad - hfovRad / 2 + hfovRad * i / steps;
    pts.push([
      state.currentLat + dist * Math.cos(a),
      state.currentLon + dist * Math.sin(a) / lonScale
    ]);
  }
  L.polygon(pts, {
    color: '#f78166', weight: 1.5, opacity: 0.75,
    fillColor: '#f78166', fillOpacity: 0.1
  }).bindTooltip(`📷 ${focal}mm · ${hfovDeg}° H-FOV · ${bearing}°`, { sticky: true })
   .addTo(state.fovGroup);

  // Center-line axis
  L.polyline([
    [state.currentLat, state.currentLon],
    [state.currentLat + dist * Math.cos(bRad), state.currentLon + dist * Math.sin(bRad) / lonScale]
  ], { color: '#f78166', weight: 1.5, opacity: 0.5, dashArray: '5 5' }).addTo(state.fovGroup);
}
