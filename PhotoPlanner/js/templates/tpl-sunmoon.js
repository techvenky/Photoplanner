// ─── Sun & Moon Tab Template ───────────────────────────────────────────────────
document.getElementById('tab-sunmoon').innerHTML = `
  <div class="page-container">
    <h2 class="mb-3">Sun &amp; Moon Times</h2>
    <div class="d-flex align-items-center gap-3 flex-wrap mb-4">
      <input type="date" id="sm-date" class="form-control form-control-sm" style="width:auto" />
      <button id="sm-use-location" class="btn btn-sm btn-outline-info">📍 Use My Location</button>
      <span id="sm-location-label" class="text-secondary small">No location set</span>
    </div>

    <div class="cards-grid">
      <div class="card bg-body-tertiary border-secondary">
        <div class="card-body">
          <h5 class="card-title">☀️ Sun</h5>

          <div class="time-section-label">— Morning —</div>
          <div class="time-row"><span>Astronomical Dawn</span><span id="astro-dawn">—</span></div>
          <div class="time-row"><span>Nautical Dawn</span><span id="naut-dawn">—</span></div>
          <div class="time-row highlight blue"><span>🔵 Blue Hour Start</span><span id="civil-dawn">—</span></div>
          <div class="time-row highlight blue"><span>🔵 Blue Hour End</span><span id="blue-hour-am-end">—</span></div>
          <div class="time-row highlight gold"><span>🌅 Golden Hour Start</span><span id="sunrise">—</span></div>
          <div class="time-row highlight gold"><span>🌅 Golden Hour End</span><span id="golden-hour-am-end">—</span></div>

          <div class="time-row center-row"><span>☀️ Solar Noon</span><span id="solar-noon">—</span></div>

          <div class="time-section-label">— Evening —</div>
          <div class="time-row highlight gold"><span>🌅 Golden Hour Start</span><span id="golden-hour-pm-start">—</span></div>
          <div class="time-row highlight gold"><span>🌅 Golden Hour End</span><span id="sunset">—</span></div>
          <div class="time-row highlight blue"><span>🔵 Blue Hour Start</span><span id="blue-hour-pm-start">—</span></div>
          <div class="time-row highlight blue"><span>🔵 Blue Hour End</span><span id="civil-dusk">—</span></div>
          <div class="time-row"><span>Nautical Dusk</span><span id="naut-dusk">—</span></div>
          <div class="time-row"><span>Astronomical Dusk</span><span id="astro-dusk">—</span></div>

          <div class="time-row" style="margin-top:0.5rem;border-top:1px solid #30363d;padding-top:0.4rem">
            <span>Day Length</span><span id="day-length">—</span>
          </div>
        </div>
      </div>

      <div class="card bg-body-tertiary border-secondary">
        <div class="card-body">
          <h5 class="card-title">🌕 Moon</h5>
          <div class="time-row"><span>Moonrise</span><span id="moonrise">—</span></div>
          <div class="time-row"><span>Moon Noon</span><span id="moon-noon">—</span></div>
          <div class="time-row"><span>Moonset</span><span id="moonset">—</span></div>
          <div class="time-row"><span>Phase</span><span id="moon-phase">—</span></div>
          <div class="time-row"><span>Illumination</span><span id="moon-illum">—</span></div>
          <div class="time-row"><span>Age</span><span id="moon-age">—</span></div>
          <div class="time-row highlight gold"><span>🌕 Next Full Moon</span><span id="next-full-moon">—</span></div>
          <div class="time-row highlight blue"><span>🌑 Next New Moon</span><span id="next-new-moon">—</span></div>
          <div class="moon-phase-visual" id="moon-visual"></div>
        </div>
      </div>

      <div class="card bg-body-tertiary border-secondary">
        <div class="card-body">
          <h5 class="card-title">🧭 Directions at Selected Time</h5>
          <input type="time" id="sm-time" value="06:00" class="form-control form-control-sm mb-2" style="width:auto" />
          <div class="time-row"><span>Sun Azimuth</span><span id="sun-az">—</span></div>
          <div class="time-row"><span>Sun Altitude</span><span id="sun-alt">—</span></div>
          <div class="time-row"><span>Moon Azimuth</span><span id="moon-az">—</span></div>
          <div class="time-row"><span>Moon Altitude</span><span id="moon-alt">—</span></div>
          <div class="compass-wrap">
            <canvas id="compass" width="200" height="200"></canvas>
          </div>
        </div>
      </div>
    </div>
  </div>
`;
