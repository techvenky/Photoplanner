// ─── Geo helpers (Turf.js-powered with fallback) ──────────────────────────────

function calcBearing(lat1, lon1, lat2, lon2) {
  if (typeof turf !== 'undefined') {
    const b = turf.bearing(turf.point([lon1, lat1]), turf.point([lon2, lat2]));
    return (b + 360) % 360;
  }
  // Fallback haversine
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const rlat1 = lat1 * Math.PI / 180, rlat2 = lat2 * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(rlat2);
  const x = Math.cos(rlat1) * Math.sin(rlat2) - Math.sin(rlat1) * Math.cos(rlat2) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function calcDistanceKm(lat1, lon1, lat2, lon2) {
  if (typeof turf !== 'undefined') {
    return turf.distance(turf.point([lon1, lat1]), turf.point([lon2, lat2]), { units: 'kilometers' });
  }
  // Fallback haversine
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Find times today (and within 365 days) when sun/moon azimuth matches target bearing
function findAlignments(bearing, date) {
  const results = [];
  const tol = 0.8; // degrees tolerance

  for (let h = 0; h < 24; h += 0.05) {
    const d = new Date(date);
    d.setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0);
    const sunPos  = SunCalc.getPosition(d, state.currentLat, state.currentLon);
    const sunAz   = ((sunPos.azimuth + Math.PI) * 180 / Math.PI + 360) % 360;
    const angDiff = Math.abs(((sunAz - bearing + 180 + 360) % 360) - 180);
    if (angDiff < tol && sunPos.altitude > 0) {
      if (!results.find(r => r.type === 'Sun' && Math.abs(r.h - h) < 0.5)) {
        results.push({ type: 'Sun', time: d, az: sunAz, alt: toDeg(sunPos.altitude), h });
      }
    }
    const moonPos = SunCalc.getMoonPosition(d, state.currentLat, state.currentLon);
    const moonAz  = ((moonPos.azimuth + Math.PI) * 180 / Math.PI + 360) % 360;
    const mDiff   = Math.abs(((moonAz - bearing + 180 + 360) % 360) - 180);
    if (mDiff < tol && moonPos.altitude > 0) {
      if (!results.find(r => r.type === 'Moon' && Math.abs(r.h - h) < 0.5)) {
        results.push({ type: 'Moon', time: d, az: moonAz, alt: toDeg(moonPos.altitude), h });
      }
    }
  }
  return results;
}
