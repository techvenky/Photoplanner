// ─── Sun & Moon Tab ───────────────────────────────────────────────────────────

function updateSunMoon() {
  if (state.currentLat === null) return;
  const dateStr = document.getElementById('sm-date').value;
  if (!dateStr) return;
  const date = new Date(dateStr + 'T12:00:00');
  const times = SunCalc.getTimes(date, state.currentLat, state.currentLon);
  const moonTimes = SunCalc.getMoonTimes(date, state.currentLat, state.currentLon);
  const moonIllum = SunCalc.getMoonIllumination(date);

  // Sun times
  document.getElementById('astro-dawn').textContent = fmtTime(times.nightEnd);
  document.getElementById('naut-dawn').textContent = fmtTime(times.nauticalDawn);
  // Morning blue hour: civil dawn → sunrise
  document.getElementById('civil-dawn').textContent = fmtTime(times.dawn);        // Blue Hour Start (AM)
  document.getElementById('blue-hour-am-end').textContent = fmtTime(times.sunrise); // Blue Hour End = Sunrise
  // Morning golden hour: sunrise → goldenHourEnd (sun ascending to +6°)
  document.getElementById('sunrise').textContent = fmtTime(times.sunrise);             // Golden Hour Start (AM)
  document.getElementById('golden-hour-am-end').textContent = fmtTime(times.goldenHourEnd); // Golden Hour End (AM)
  document.getElementById('solar-noon').textContent = fmtTime(times.solarNoon);
  // Evening golden hour: goldenHour (sun descends to +6°) → sunset
  document.getElementById('golden-hour-pm-start').textContent = fmtTime(times.goldenHour); // Golden Hour Start (PM)
  document.getElementById('sunset').textContent = fmtTime(times.sunset);               // Golden Hour End = Sunset
  // Evening blue hour: sunset → civil dusk
  document.getElementById('blue-hour-pm-start').textContent = fmtTime(times.sunset); // Blue Hour Start = Sunset
  document.getElementById('civil-dusk').textContent = fmtTime(times.dusk);           // Blue Hour End (PM)
  document.getElementById('naut-dusk').textContent = fmtTime(times.nauticalDusk);
  document.getElementById('astro-dusk').textContent = fmtTime(times.night);

  const dayLen = times.sunset - times.sunrise;
  document.getElementById('day-length').textContent = isNaN(dayLen) ? '—' : fmtDuration(dayLen);

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
  const phaseEmojis = ['🌑','🌒','🌓','🌔','🌕','🌖','🌗','🌘'];
  const phaseIdx = Math.round(phase * 8) % 8;
  document.getElementById('moon-phase').textContent = phaseNames[phaseIdx];
  document.getElementById('moon-visual').textContent = phaseEmojis[phaseIdx];
  document.getElementById('moon-illum').textContent = (moonIllum.fraction * 100).toFixed(1) + '%';

  // Moon age (days since new moon)
  const moonAge = phase * 29.53;
  document.getElementById('moon-age').textContent = moonAge.toFixed(1) + ' days';

  // Next full and new moons
  const tomorrow = new Date(date.getTime() + 86400000); // start search from day after selected
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
