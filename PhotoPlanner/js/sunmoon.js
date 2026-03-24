// ─── Sun & Moon Tab ───────────────────────────────────────────────────────────

// ── Precise sun times cache (sunrise-sunset.org, free, no key) ────────────────
// SunCalc has ±1-2 min error; this API uses high-precision USNO ephemeris.
let _sunApiCache = null; // { key, data } — single-entry cache

async function _applyPreciseSunTimes(lat, lon, dateStr) {
  const key = `${lat.toFixed(4)}:${lon.toFixed(4)}:${dateStr}`;
  let data;

  if (_sunApiCache && _sunApiCache.key === key) {
    data = _sunApiCache.data;
  } else {
    try {
      const ctrl    = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(
        `https://api.sunrise-sunset.org/json?lat=${lat.toFixed(4)}&lng=${lon.toFixed(4)}&date=${dateStr}&formatted=0`,
        { signal: ctrl.signal }
      );
      clearTimeout(timeout);
      if (!res.ok) return;
      const json = await res.json();
      if (json.status !== 'OK') return;
      data = json.results;
      _sunApiCache = { key, data };
    } catch(e) {
      return; // silently fall back to SunCalc times already displayed
    }
  }

  // Stale-check: location or date may have changed while request was in flight
  if (document.getElementById('sm-date').value !== dateStr ||
      state.currentLat !== lat || state.currentLon !== lon) return;

  // Replace SunCalc estimates with precise API times (UTC ISO strings → fmtTime)
  const f = s => (s && s !== '1970-01-01T00:00:01+00:00') ? fmtTime(new Date(s)) : '—';
  document.getElementById('astro-dawn').textContent         = f(data.astronomical_twilight_begin);
  document.getElementById('naut-dawn').textContent          = f(data.nautical_twilight_begin);
  document.getElementById('civil-dawn').textContent         = f(data.civil_twilight_begin);
  document.getElementById('civil-dusk').textContent         = f(data.civil_twilight_end);
  document.getElementById('naut-dusk').textContent          = f(data.nautical_twilight_end);
  document.getElementById('astro-dusk').textContent         = f(data.astronomical_twilight_end);
  // golden-hour-am-end / golden-hour-pm-start: keep SunCalc (+6° crossing not in API)
  document.getElementById('solar-noon').textContent         = f(data.solar_noon);

  // For sunrise & sunset, prefer Open-Meteo (higher accuracy) over sunrise-sunset.org,
  // using it only when we have a matching date entry and can parse the local time string.
  let srDate = new Date(data.sunrise);
  let ssDate = new Date(data.sunset);
  const w = state.weather;
  if (w && w.sunriseMap && w.sunriseMap[dateStr] && w.sunsetMap[dateStr] && state.locationTz) {
    try {
      const omSr = dayjs.tz(w.sunriseMap[dateStr], state.locationTz).toDate();
      const omSs = dayjs.tz(w.sunsetMap[dateStr],  state.locationTz).toDate();
      if (!isNaN(omSr) && !isNaN(omSs)) { srDate = omSr; ssDate = omSs; }
    } catch(e) { /* keep sunrise-sunset.org values */ }
  }

  document.getElementById('blue-hour-am-end').textContent   = fmtTime(srDate);
  document.getElementById('sunrise').textContent            = fmtTime(srDate);
  document.getElementById('sunset').textContent             = fmtTime(ssDate);
  document.getElementById('blue-hour-pm-start').textContent = fmtTime(ssDate);

  const dayLen = ssDate - srDate;
  if (dayLen > 0) document.getElementById('day-length').textContent = fmtDuration(dayLen);
}

function updateSunMoon() {
  if (state.currentLat === null) return;
  const dateStr = document.getElementById('sm-date').value;
  if (!dateStr) return;
  const date = new Date(dateStr + 'T12:00:00Z');
  const times = SunCalc.getTimes(date, state.currentLat, state.currentLon);
  const moonTimes = SunCalc.getMoonTimes(date, state.currentLat, state.currentLon);
  const moonIllum = SunCalc.getMoonIllumination(date);

  // Sun times — SunCalc renders immediately; precise API times overwrite below
  document.getElementById('astro-dawn').textContent = fmtTime(times.nightEnd);
  document.getElementById('naut-dawn').textContent = fmtTime(times.nauticalDawn);
  document.getElementById('civil-dawn').textContent = fmtTime(times.dawn);
  document.getElementById('blue-hour-am-end').textContent = fmtTime(times.sunrise);
  document.getElementById('sunrise').textContent = fmtTime(times.sunrise);
  document.getElementById('golden-hour-am-end').textContent = fmtTime(times.goldenHourEnd);
  document.getElementById('solar-noon').textContent = fmtTime(times.solarNoon);
  document.getElementById('golden-hour-pm-start').textContent = fmtTime(times.goldenHour);
  document.getElementById('sunset').textContent = fmtTime(times.sunset);
  document.getElementById('blue-hour-pm-start').textContent = fmtTime(times.sunset);
  document.getElementById('civil-dusk').textContent = fmtTime(times.dusk);
  document.getElementById('naut-dusk').textContent = fmtTime(times.nauticalDusk);
  document.getElementById('astro-dusk').textContent = fmtTime(times.night);

  const dayLen = times.sunset - times.sunrise;
  document.getElementById('day-length').textContent = isNaN(dayLen) ? '—' : fmtDuration(dayLen);

  // Fetch high-precision sun times and overwrite SunCalc estimates
  _applyPreciseSunTimes(state.currentLat, state.currentLon, dateStr);

  // Moon times
  document.getElementById('moonrise').textContent = moonTimes.rise ? fmtTime(moonTimes.rise) : '—';
  document.getElementById('moonset').textContent = moonTimes.set ? fmtTime(moonTimes.set) : '—';

  // Moon noon
  if (moonTimes.rise && moonTimes.set) {
    const moonNoon = new Date((moonTimes.rise.getTime() + moonTimes.set.getTime()) / 2);
    document.getElementById('moon-noon').textContent = fmtTime(moonNoon);
  }

  // Moon phase
  const phase = moonIllum.phase;
  const phaseNames = ['New Moon','Waxing Crescent','First Quarter','Waxing Gibbous','Full Moon','Waning Gibbous','Last Quarter','Waning Crescent'];
  const phaseIdx = Math.round(phase * 8) % 8;
  document.getElementById('moon-phase').textContent = phaseNames[phaseIdx];
  document.getElementById('moon-visual').textContent = moonPhaseEmoji(phase);
  document.getElementById('moon-illum').textContent = (moonIllum.fraction * 100).toFixed(1) + '%';

  // Moon age (days since new moon)
  const moonAge = phase * 29.53;
  document.getElementById('moon-age').textContent = moonAge.toFixed(1) + ' days';

  // Next full and new moons
  const tomorrow = new Date(date.getTime() + 86400000);
  const nfm = nextFullMoon(tomorrow);
  const nnm = nextNewMoons(tomorrow, 1)[0];
  const fmtMoonDate = d => d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  document.getElementById('next-full-moon').textContent = fmtMoonDate(nfm);
  document.getElementById('next-new-moon').textContent  = fmtMoonDate(nnm);

  drawTimelineOverlay(false);
  updateCompass();
}

function initSunMoonListeners() {
  document.getElementById('sm-date').addEventListener('change', updateSunMoon);
  document.getElementById('sm-time').addEventListener('input', updateSunMoon);
}
