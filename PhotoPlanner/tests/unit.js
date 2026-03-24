// ─── PhotoPlanner Unit Tests ───────────────────────────────────────────────────
// Run with:  node tests/unit.js
// Uses only Node.js built-ins — no extra packages required.

'use strict';
const assert = require('assert');

let passed = 0, failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗  ${name}`);
    console.error(`       ${e.message}`);
    failed++;
  }
}

// ─── Inline copies of the pure functions under test ───────────────────────────
// These are identical to the originals in js/utils.js and js/weather.js so the
// tests can run in Node without a browser / DOM.

function moonPhaseEmoji(phase) {
  return ['🌑','🌒','🌓','🌔','🌕','🌖','🌗','🌘'][Math.round(phase * 8) % 8];
}

function moonApparentSizeM(distKm) {
  return distKm * 1000 * 2 * Math.tan(0.004515);
}

function circularAzDiff(a, b) {
  return Math.abs(((a - b + 180 + 360) % 360) - 180);
}

function fmtDuration(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

function deg(rad) { return (rad * 180 / Math.PI + 360) % 360; }
function toDeg(rad) { return rad * 180 / Math.PI; }

function minutesToAmPm(minutes) {
  const h24 = Math.floor(minutes / 60);
  const m   = minutes % 60;
  const period = h24 < 12 ? 'AM' : 'PM';
  const h12  = h24 % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function weatherCodeToDesc(code) {
  if (code === 0)  return 'Clear sky';
  if (code <= 2)   return 'Mainly clear';
  if (code === 3)  return 'Overcast';
  if (code <= 49)  return 'Fog';
  if (code <= 55)  return 'Drizzle';
  if (code <= 67)  return 'Rain';
  if (code <= 77)  return 'Snow';
  if (code <= 82)  return 'Rain showers';
  if (code <= 86)  return 'Snow showers';
  if (code <= 99)  return 'Thunderstorm';
  return 'Unknown';
}

function cloudCoverQuality(pct) {
  if (pct <= 10) return { stars: '⭐⭐⭐⭐⭐', label: 'Clear sky',     color: '#3fb950' };
  if (pct <= 25) return { stars: '⭐⭐⭐⭐',   label: 'Mostly clear', color: '#58a6ff' };
  if (pct <= 50) return { stars: '⭐⭐⭐',     label: 'Partly cloudy', color: '#e3b341' };
  if (pct <= 75) return { stars: '⭐⭐',       label: 'Mostly cloudy', color: '#f0883e' };
  return          { stars: '⭐',              label: 'Overcast',      color: '#da3633' };
}

// ─── moonPhaseEmoji ───────────────────────────────────────────────────────────
console.log('\nmoonPhaseEmoji');

test('phase=0 (new moon) → 🌑', () => assert.strictEqual(moonPhaseEmoji(0), '🌑'));
test('phase=0.125 (waxing crescent) → 🌒', () => assert.strictEqual(moonPhaseEmoji(0.125), '🌒'));
test('phase=0.25 (first quarter) → 🌓', () => assert.strictEqual(moonPhaseEmoji(0.25), '🌓'));
test('phase=0.375 (waxing gibbous) → 🌔', () => assert.strictEqual(moonPhaseEmoji(0.375), '🌔'));
test('phase=0.5 (full moon) → 🌕', () => assert.strictEqual(moonPhaseEmoji(0.5), '🌕'));
test('phase=0.625 (waning gibbous) → 🌖', () => assert.strictEqual(moonPhaseEmoji(0.625), '🌖'));
test('phase=0.75 (last quarter) → 🌗', () => assert.strictEqual(moonPhaseEmoji(0.75), '🌗'));
test('phase=0.875 (waning crescent) → 🌘', () => assert.strictEqual(moonPhaseEmoji(0.875), '🌘'));
test('phase=1.0 wraps back to 🌑 (same as 0)', () => assert.strictEqual(moonPhaseEmoji(1.0), '🌑'));
test('phase=0.99 (almost new) → 🌘 or 🌑', () => {
  const e = moonPhaseEmoji(0.99);
  assert.ok(e === '🌘' || e === '🌑', `got ${e}`);
});

// ─── circularAzDiff ───────────────────────────────────────────────────────────
console.log('\ncircularAzDiff');

test('same bearing → 0°', () => assert.strictEqual(circularAzDiff(90, 90), 0));
test('90° apart → 90°', () => assert.strictEqual(circularAzDiff(0, 90), 90));
test('opposite bearings → 180°', () => assert.strictEqual(circularAzDiff(0, 180), 180));
test('wrap-around: 350° and 10° → 20°', () => assert.strictEqual(circularAzDiff(350, 10), 20));
test('wrap-around: 10° and 350° → 20° (symmetric)', () => assert.strictEqual(circularAzDiff(10, 350), 20));
test('270° and 90° → 180°', () => assert.strictEqual(circularAzDiff(270, 90), 180));
test('1° and 359° → 2°', () => assert.strictEqual(circularAzDiff(1, 359), 2));

// ─── fmtDuration ─────────────────────────────────────────────────────────────
console.log('\nfmtDuration');

test('0ms → "0h 0m"', () => assert.strictEqual(fmtDuration(0), '0h 0m'));
test('1 hour → "1h 0m"', () => assert.strictEqual(fmtDuration(3600000), '1h 0m'));
test('90 minutes → "1h 30m"', () => assert.strictEqual(fmtDuration(5400000), '1h 30m'));
test('golden hour (69 min) → "1h 9m"', () => assert.strictEqual(fmtDuration(69 * 60000), '1h 9m'));
test('sub-minute ms rounds down → "0h 0m"', () => assert.strictEqual(fmtDuration(59999), '0h 0m'));
test('large value: 25h → "25h 0m"', () => assert.strictEqual(fmtDuration(25 * 3600000), '25h 0m'));

// ─── minutesToAmPm ────────────────────────────────────────────────────────────
console.log('\nminutesToAmPm');

test('0 → "12:00 AM"', () => assert.strictEqual(minutesToAmPm(0), '12:00 AM'));
test('60 → "1:00 AM"', () => assert.strictEqual(minutesToAmPm(60), '1:00 AM'));
test('719 → "11:59 AM"', () => assert.strictEqual(minutesToAmPm(719), '11:59 AM'));
test('720 → "12:00 PM"', () => assert.strictEqual(minutesToAmPm(720), '12:00 PM'));
test('780 → "1:00 PM"', () => assert.strictEqual(minutesToAmPm(780), '1:00 PM'));
test('1439 → "11:59 PM"', () => assert.strictEqual(minutesToAmPm(1439), '11:59 PM'));
test('minute padding: 65 → "1:05 AM"', () => assert.strictEqual(minutesToAmPm(65), '1:05 AM'));
test('noon: 720 starts with "12:"', () => assert.ok(minutesToAmPm(720).startsWith('12:')));
test('midnight: 0 is AM', () => assert.ok(minutesToAmPm(0).endsWith('AM')));
test('noon: 720 is PM', () => assert.ok(minutesToAmPm(720).endsWith('PM')));

// ─── deg / toDeg ─────────────────────────────────────────────────────────────
console.log('\ndeg / toDeg');

test('deg(0) → 0', () => assert.strictEqual(deg(0), 0));
test('deg(π) → 180', () => assert.ok(Math.abs(deg(Math.PI) - 180) < 1e-9));
test('deg(2π) → 0 (wraps)', () => assert.ok(Math.abs(deg(2 * Math.PI) - 0) < 1e-9));
test('deg(-π/2) → 270 (wraps negative)', () => assert.ok(Math.abs(deg(-Math.PI / 2) - 270) < 1e-9));
test('toDeg(0) → 0', () => assert.strictEqual(toDeg(0), 0));
test('toDeg(π) → 180', () => assert.ok(Math.abs(toDeg(Math.PI) - 180) < 1e-9));
test('toDeg(-π/2) → -90', () => assert.ok(Math.abs(toDeg(-Math.PI / 2) - (-90)) < 1e-9));
test('deg vs toDeg: differ by 360 wrap for negative rads', () => {
  // deg wraps to 0-360, toDeg gives signed result
  assert.ok(deg(-Math.PI / 2) === 270);
  assert.ok(toDeg(-Math.PI / 2) === -90);
});

// ─── moonApparentSizeM ────────────────────────────────────────────────────────
console.log('\nmoonApparentSizeM');

test('1 km → ~9.03 m', () => {
  const sz = moonApparentSizeM(1);
  assert.ok(sz > 9.0 && sz < 9.1, `got ${sz}`);
});
test('linearly scales: 2km is double 1km', () => {
  assert.ok(Math.abs(moonApparentSizeM(2) / moonApparentSizeM(1) - 2) < 1e-9);
});
test('400 km (typical moon distance in miniature) → positive', () => {
  assert.ok(moonApparentSizeM(400) > 0);
});
test('0 km → 0 m', () => assert.strictEqual(moonApparentSizeM(0), 0));

// ─── weatherCodeToDesc ────────────────────────────────────────────────────────
console.log('\nweatherCodeToDesc');

test('code 0 → "Clear sky"', () => assert.strictEqual(weatherCodeToDesc(0), 'Clear sky'));
test('code 1 → "Mainly clear"', () => assert.strictEqual(weatherCodeToDesc(1), 'Mainly clear'));
test('code 2 → "Mainly clear"', () => assert.strictEqual(weatherCodeToDesc(2), 'Mainly clear'));
test('code 3 → "Overcast"', () => assert.strictEqual(weatherCodeToDesc(3), 'Overcast'));
test('code 45 → "Fog"', () => assert.strictEqual(weatherCodeToDesc(45), 'Fog'));
test('code 51 → "Drizzle"', () => assert.strictEqual(weatherCodeToDesc(51), 'Drizzle'));
test('code 61 → "Rain"', () => assert.strictEqual(weatherCodeToDesc(61), 'Rain'));
test('code 71 → "Snow"', () => assert.strictEqual(weatherCodeToDesc(71), 'Snow'));
test('code 80 → "Rain showers"', () => assert.strictEqual(weatherCodeToDesc(80), 'Rain showers'));
test('code 85 → "Snow showers"', () => assert.strictEqual(weatherCodeToDesc(85), 'Snow showers'));
test('code 95 → "Thunderstorm"', () => assert.strictEqual(weatherCodeToDesc(95), 'Thunderstorm'));
test('code 999 → "Unknown"', () => assert.strictEqual(weatherCodeToDesc(999), 'Unknown'));
// Boundary: code 49 is last Fog code
test('code 49 → "Fog"', () => assert.strictEqual(weatherCodeToDesc(49), 'Fog'));
// Boundary: code 50 (not used by WMO but should fall into Drizzle bracket)
test('code 50 → "Drizzle"', () => assert.strictEqual(weatherCodeToDesc(50), 'Drizzle'));

// ─── cloudCoverQuality ────────────────────────────────────────────────────────
console.log('\ncloudCoverQuality');

test('0% → Clear sky, 5 stars', () => {
  const q = cloudCoverQuality(0);
  assert.strictEqual(q.label, 'Clear sky');
  assert.strictEqual(q.stars, '⭐⭐⭐⭐⭐');
});
test('10% → Clear sky (boundary)', () => assert.strictEqual(cloudCoverQuality(10).label, 'Clear sky'));
test('11% → Mostly clear', () => assert.strictEqual(cloudCoverQuality(11).label, 'Mostly clear'));
test('25% → Mostly clear (boundary)', () => assert.strictEqual(cloudCoverQuality(25).label, 'Mostly clear'));
test('26% → Partly cloudy', () => assert.strictEqual(cloudCoverQuality(26).label, 'Partly cloudy'));
test('50% → Partly cloudy (boundary)', () => assert.strictEqual(cloudCoverQuality(50).label, 'Partly cloudy'));
test('51% → Mostly cloudy', () => assert.strictEqual(cloudCoverQuality(51).label, 'Mostly cloudy'));
test('75% → Mostly cloudy (boundary)', () => assert.strictEqual(cloudCoverQuality(75).label, 'Mostly cloudy'));
test('76% → Overcast', () => assert.strictEqual(cloudCoverQuality(76).label, 'Overcast'));
test('100% → Overcast, 1 star', () => {
  const q = cloudCoverQuality(100);
  assert.strictEqual(q.label, 'Overcast');
  assert.strictEqual(q.stars, '⭐');
});
test('clear sky has green color', () => assert.strictEqual(cloudCoverQuality(0).color, '#3fb950'));
test('overcast has red color', () => assert.strictEqual(cloudCoverQuality(100).color, '#da3633'));

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(44)}`);
console.log(`  ${passed} passed   ${failed} failed   ${passed + failed} total`);
console.log('─'.repeat(44));
if (failed > 0) process.exit(1);
