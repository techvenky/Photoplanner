// ─── Pure astronomical calculation functions ──────────────────────────────────

// Galactic centre: RA 266.405°, Dec −29.008°
function getGalacticCenterPos(date, lat, lon) {
  const RA  = 266.405 * Math.PI / 180;
  const DEC = -29.0078 * Math.PI / 180;
  const latr = lat * Math.PI / 180;

  const JD = date.getTime() / 86400000 + 2440587.5;
  const D  = JD - 2451545.0;
  // Greenwich Mean Sidereal Time → Local Sidereal Time (radians)
  const LST = ((280.46061837 + 360.98564736629 * D) + lon) * Math.PI / 180;
  const HA  = LST - RA;

  const sinAlt = Math.sin(DEC) * Math.sin(latr) + Math.cos(DEC) * Math.cos(latr) * Math.cos(HA);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));

  // North-based clockwise azimuth
  const cosAz = (Math.sin(DEC) - Math.sin(alt) * Math.sin(latr)) / (Math.cos(alt) * Math.cos(latr));
  let az_north = Math.acos(Math.max(-1, Math.min(1, cosAz)));
  if (Math.sin(HA) > 0) az_north = 2 * Math.PI - az_north;

  // Convert to SunCalc convention (from south, positive westward)
  return { altitude: alt, azimuth: az_north - Math.PI, azimuth_north_deg: az_north * 180 / Math.PI };
}

// Returns next `count` new moon dates on or after fromDate
function nextNewMoons(fromDate, count) {
  const REF = new Date('2000-01-06T18:14:00Z').getTime(); // known new moon
  const SYN = 29.530588853 * 86400000; // synodic month in ms
  const n = Math.ceil((fromDate.getTime() - REF) / SYN);
  const moons = [];
  for (let i = n; moons.length < count; i++) {
    const d = new Date(REF + i * SYN);
    if (d >= fromDate) moons.push(d);
  }
  return moons;
}

// Returns the next full moon on or after fromDate
function nextFullMoon(fromDate) {
  const REF = new Date('2000-01-06T18:14:00Z').getTime(); // known new moon
  const SYN = 29.530588853 * 86400000;
  const HALF = SYN / 2; // new → full = half synodic month
  // full moon reference = new moon ref + half synodic
  const FULL_REF = REF + HALF;
  const n = Math.ceil((fromDate.getTime() - FULL_REF) / SYN);
  for (let i = n; ; i++) {
    const d = new Date(FULL_REF + i * SYN);
    if (d >= fromDate) return d;
  }
}
