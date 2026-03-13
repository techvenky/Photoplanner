// ─── Alignment Finder (Sun & Moon) ────────────────────────────────────────────

function _finderLightType(sunAltDeg) {
  if (sunAltDeg >= 6)   return { label: 'Day',           cls: 'day' };
  if (sunAltDeg >= 0)   return { label: 'Golden Hour',   cls: 'golden' };
  if (sunAltDeg >= -4)  return { label: 'Blue Hour',     cls: 'blue' };
  if (sunAltDeg >= -6)  return { label: 'Blue Hour',     cls: 'blue' };
  if (sunAltDeg >= -12) return { label: 'Twilight',      cls: 'twilight' };
  if (sunAltDeg >= -18) return { label: 'Astro Twilight',cls: 'astro' };
  return { label: 'Night', cls: 'night' };
}

function _moonPhaseEmoji(phase) {
  var idx = Math.round(phase * 8) % 8;
  return ['🌑','🌒','🌓','🌔','🌕','🌖','🌗','🌘'][idx];
}

// Moon apparent diameter in metres at a given shooting distance
function moonApparentSizeM(distKm) {
  // Moon angular diameter ≈ 0.5177° → half-angle ≈ 0.004515 rad
  return distKm * 1000 * 2 * Math.tan(0.004515);
}

// ─── Unified search (Moon or Sun) ─────────────────────────────────────────────
function searchAlignments(opts) {
  // opts: { startDate, endDate, targetAz, azTol, targetElevM, elevTolM, distKm, lat, lon, body }
  var results    = [];
  var STEP_MS    = 10 * 60 * 1000;  // 10-minute steps
  var MIN_GAP_MS = 60 * 60 * 1000;  // suppress duplicates closer than 1 h
  var lastResultT = -Infinity;

  var t    = opts.startDate.getTime();
  var endT = opts.endDate.getTime();
  var isMoon = (opts.body !== 'sun');

  while (t <= endT) {
    var d = new Date(t);
    var bodyPos = isMoon
      ? SunCalc.getMoonPosition(d, opts.lat, opts.lon)
      : SunCalc.getPosition(d, opts.lat, opts.lon);
    var bodyAltDeg = bodyPos.altitude * 180 / Math.PI;

    if (bodyAltDeg > 0) {
      var bodyAz = ((bodyPos.azimuth + Math.PI) * 180 / Math.PI + 360) % 360;
      var azDiff = Math.abs(((bodyAz - opts.targetAz + 180 + 360) % 360) - 180);

      if (azDiff <= opts.azTol) {
        var bodyElevM = opts.distKm * 1000 * Math.tan(bodyPos.altitude);
        var elevDiff  = Math.abs(bodyElevM - opts.targetElevM);

        if (elevDiff <= opts.elevTolM && t - lastResultT > MIN_GAP_MS) {
          var sunAltDeg = isMoon
            ? SunCalc.getPosition(d, opts.lat, opts.lon).altitude * 180 / Math.PI
            : bodyAltDeg;
          var light = _finderLightType(sunAltDeg);

          var result = {
            date:   new Date(t),
            az:     bodyAz,
            altDeg: bodyAltDeg,
            elevM:  bodyElevM,
            light:  light,
            body:   opts.body
          };

          if (isMoon) {
            var illum = SunCalc.getMoonIllumination(d);
            result.phase       = illum.phase;
            result.phaseEmoji  = _moonPhaseEmoji(illum.phase);
            result.illumination = Math.round(illum.fraction * 100);
            result.moonSizeM   = moonApparentSizeM(opts.distKm);
          }

          results.push(result);
          lastResultT = t;
        }
      }
    }
    t += STEP_MS;
  }
  return results;
}

// ─── Apply result to planner ───────────────────────────────────────────────────
function applyFinderResult(d, body) {
  // Use LOCAL calendar date (not UTC) so 11pm results don't land on the next day
  var dateStr = d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
  document.getElementById('plan-date').value = dateStr;
  document.getElementById('sm-date').value   = dateStr;
  document.getElementById('mw-date').value   = dateStr;

  if (window._fpPlan) window._fpPlan.setDate(dateStr, false);
  if (window._fpSM)   window._fpSM.setDate(dateStr, false);
  if (window._fpMW)   window._fpMW.setDate(dateStr, false);

  var minutes = d.getHours() * 60 + d.getMinutes();
  document.getElementById('plan-time-slider').value = minutes;
  document.getElementById('sky-time-slider').value  = minutes;
  updateSliderDisplay();

  // Auto-enable the matched body overlay so the ray & path are visible
  if (body === 'moon') {
    document.getElementById('show-moon').checked = true;
  } else if (body === 'sun') {
    document.getElementById('show-sun').checked = true;
  }

  state.dateSliderAnchor = null;
  buildDateSlider();
  invalidateTlCache();

  if (state.currentLat !== null) {
    drawSunPath();
    drawTimeIndicator();
    updatePlannerInfo();
    if (state.targetLat !== null) updateTargetInfo();
    drawSkyDomeIfOpen();
    var overlay = document.getElementById('timeline-overlay');
    if (overlay && !overlay.classList.contains('collapsed')) {
      drawTimelineOverlay(true);
    }
  }

  document.getElementById('finder-modal').style.display = 'none';

  var bodyLabel = body === 'moon' ? '🌕 Moon' : '☀️ Sun';
  showToast(bodyLabel + ' alignment: ' + d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + fmtTime(d), 'success');
}

// ─── Render results table ──────────────────────────────────────────────────────
function renderFinderResults(results) {
  var el = document.getElementById('finder-results');

  if (results.length === 0) {
    el.innerHTML = '<div class="text-secondary small p-3 text-center">No alignments found in this range.<br>Try wider tolerances, longer range, or adjust azimuth.</div>';
    return;
  }

  var isMoon = results[0].body !== 'sun';

  var rows = results.map(function(r) {
    var elevStr = Math.abs(r.elevM) >= 1000
      ? (r.elevM / 1000).toFixed(2) + ' km'
      : r.elevM.toFixed(0) + ' m';

    var bodyCell = isMoon
      ? (r.phaseEmoji + ' <span class="finder-illum">' + r.illumination + '%</span>')
      : '☀️ <span class="finder-illum">' + r.altDeg.toFixed(1) + '°</span>';

    var lastCell = isMoon
      ? '<td>' + r.moonSizeM.toFixed(1) + ' m</td>'
      : '<td>' + r.az.toFixed(1) + '°</td>';

    return '<tr class="finder-result-row" data-ts="' + r.date.getTime() + '" data-body="' + r.body + '">' +
      '<td>' + bodyCell + '</td>' +
      '<td>' + r.date.toLocaleDateString([], { weekday:'short', month:'short', day:'numeric' }) + '</td>' +
      '<td>' + fmtTime(r.date) + '</td>' +
      '<td><span class="finder-badge finder-badge-' + r.light.cls + '">' + r.light.label + '</span></td>' +
      '<td>' + elevStr + '</td>' +
      lastCell +
      '</tr>';
  }).join('');

  var lastHeader = isMoon ? '<th>Moon Size</th>' : '<th>Azimuth</th>';
  var firstHeader = isMoon ? '<th>Phase</th>' : '<th>Sun</th>';

  el.innerHTML =
    '<div style="overflow-x:auto">' +
    '<table class="finder-table">' +
    '<thead><tr>' +
      firstHeader + '<th>Date</th><th>Time</th><th>Light</th>' +
      '<th>Height</th>' + lastHeader +
    '</tr></thead>' +
    '<tbody>' + rows + '</tbody>' +
    '</table></div>' +
    '<div style="font-size:0.71rem;color:#484f58;padding:0.4rem 0.75rem">' +
      results.length + ' alignment' + (results.length !== 1 ? 's' : '') + ' found — click a row to apply' +
    '</div>';

  el.querySelectorAll('.finder-result-row').forEach(function(row) {
    row.addEventListener('click', function() {
      applyFinderResult(new Date(parseInt(this.dataset.ts)), this.dataset.body);
    });
  });
}

// ─── Sun/Moon pin label ────────────────────────────────────────────────────────
function updateFinderSourceLabel() {
  var label    = document.getElementById('finder-source-label');
  var clearBtn = document.getElementById('finder-clear-source-btn');
  if (!label) return;
  if (state.finderSourceLat !== null) {
    label.textContent = state.finderSourceLat.toFixed(5) + ', ' + state.finderSourceLon.toFixed(5);
    label.style.color = '#e3b341';
    if (clearBtn) clearBtn.style.display = 'inline-block';
  } else {
    label.textContent = 'Not set';
    label.style.color = '';
    if (clearBtn) clearBtn.style.display = 'none';
  }
}

// ─── Determine search origin and azimuth ──────────────────────────────────────
// Pin roles:
//   Camera pin  = subject being photographed (e.g. CN Tower)
//   Target pin  = photographer's position
//   Sun/Moon pin = where sun/moon should appear (near/behind the subject)
//
// For the photographer (Target) to see the moon behind the subject (Camera):
//   moon azimuth from Target must = bearing(Target → SunMoon pin)
//   Since moon is ~384,000 km away, azimuth from Camera ≈ azimuth from Target (negligible parallax).
//   So we search FROM Camera with azimuth = bearing(Target → SunMoon).
//
//   sm + tgt  → az = bearing(Target→SunMoon)  dist = Target→Camera
//   sm only   → az = bearing(Camera→SunMoon)  dist = Camera→SunMoon  (camera IS photographer)
//   tgt only  → az = bearing(Camera→Target)   dist = Camera→Target   (classic two-pin workflow)
//   neither   → manual azimuth
function _finderParams() {
  var sm  = state.finderSourceLat !== null;
  var tgt = state.targetLat !== null;
  var cam = state.currentLat !== null;

  if (sm && tgt && cam) {
    // Three-pin: photographer (Target) wants moon to appear at SunMoon pin when facing subject (Camera)
    // Azimuth = direction from photographer toward where moon should appear
    return {
      lat:  state.currentLat,
      lon:  state.currentLon,
      az:   calcBearing(state.targetLat, state.targetLon, state.finderSourceLat, state.finderSourceLon),
      dist: calcDistanceKm(state.targetLat, state.targetLon, state.currentLat, state.currentLon)
    };
  }
  if (sm && cam) {
    // Two-pin: camera IS photographer, SunMoon pin is where moon should appear
    return {
      lat:  state.currentLat,
      lon:  state.currentLon,
      az:   calcBearing(state.currentLat, state.currentLon, state.finderSourceLat, state.finderSourceLon),
      dist: calcDistanceKm(state.currentLat, state.currentLon, state.finderSourceLat, state.finderSourceLon)
    };
  }
  if (tgt && cam) {
    // Two-pin classic: camera = photographer, target = subject
    return {
      lat:  state.currentLat,
      lon:  state.currentLon,
      az:   calcBearing(state.currentLat, state.currentLon, state.targetLat, state.targetLon),
      dist: calcDistanceKm(state.currentLat, state.currentLon, state.targetLat, state.targetLon)
    };
  }
  return { lat: state.currentLat, lon: state.currentLon, az: null, dist: 1 };
}

// ─── Run search ────────────────────────────────────────────────────────────────
function runFinderSearch() {
  var p = _finderParams();

  if (p.lat === null) {
    showToast('Set a location on the map first.', 'warning');
    return;
  }

  var body        = document.querySelector('input[name="finder-body"]:checked').value;
  var startVal    = document.getElementById('finder-start-date').value;
  var endVal      = document.getElementById('finder-end-date').value;
  var targetAz    = parseFloat(document.getElementById('finder-azimuth').value);
  var azTol       = parseFloat(document.getElementById('finder-az-tol').value)   || 2;
  var targetElevM = parseFloat(document.getElementById('finder-elev-m').value)   || 0;
  var elevTolM    = parseFloat(document.getElementById('finder-elev-tol').value) || 30;

  if (!startVal || !endVal || isNaN(targetAz)) {
    showToast('Fill in all search fields.', 'warning');
    return;
  }

  var startDate = new Date(startVal + 'T00:00:00');
  var endDate   = new Date(endVal   + 'T23:59:59');

  if (endDate <= startDate) {
    showToast('End date must be after start date.', 'warning');
    return;
  }

  var MAX_RANGE_DAYS = 366 * 2; // 2-year cap to prevent browser freeze
  if ((endDate - startDate) / 86400000 > MAX_RANGE_DAYS) {
    showToast('Date range too large. Maximum search window is 2 years.', 'warning');
    return;
  }

  if (azTol <= 0 || azTol > 10) {
    showToast('Azimuth tolerance must be between 0 and 10°.', 'warning');
    return;
  }
  if (elevTolM < 0 || elevTolM > 10000) {
    showToast('Elevation tolerance must be between 0 and 10,000 m.', 'warning');
    return;
  }

  var el = document.getElementById('finder-results');
  el.innerHTML = '<div class="text-secondary small p-3 text-center">🔍 Searching…</div>';

  setTimeout(function() {
    var t0 = Date.now();
    var results = searchAlignments({
      startDate: startDate, endDate: endDate,
      targetAz: targetAz, azTol: azTol,
      targetElevM: targetElevM, elevTolM: elevTolM,
      distKm: p.dist,
      lat: p.lat, lon: p.lon,
      body: body
    });
    var ms = Date.now() - t0;
    renderFinderResults(results);
    if (results.length > 0) showToast('Found ' + results.length + ' alignments in ' + ms + 'ms', 'success');
  }, 30);
}

// ─── Open modal & auto-fill fields ────────────────────────────────────────────
function openFinderModal() {
  document.getElementById('finder-modal').style.display = 'flex';

  updateFinderSourceLabel();

  var p = _finderParams();

  // Auto-fill azimuth
  if (p.az !== null) {
    document.getElementById('finder-azimuth').value = p.az.toFixed(1);
    var distStr = p.dist < 1 ? (p.dist * 1000).toFixed(0) + ' m' : p.dist.toFixed(2) + ' km';

    var sm  = state.finderSourceLat !== null;
    var tgt = state.targetLat !== null;
    if (sm && tgt) {
      document.getElementById('finder-dist-label').textContent =
        '📏 Photographer (Target) → Subject (Camera): ' + distStr;
    } else if (sm) {
      document.getElementById('finder-dist-label').textContent =
        '📏 Camera → Sun/Moon pin: ' + distStr;
    } else {
      document.getElementById('finder-dist-label').textContent =
        '📏 Camera → Target: ' + distStr;
    }

    var body = document.querySelector('input[name="finder-body"]:checked');
    if (!body || body.value === 'moon') {
      document.getElementById('finder-moonsize-label').textContent =
        '🌕 Apparent moon diameter: ~' + moonApparentSizeM(p.dist).toFixed(1) + ' m';
    } else {
      document.getElementById('finder-moonsize-label').textContent = '';
    }
  } else {
    document.getElementById('finder-dist-label').textContent =
      '⚠ Pin Sun/Moon position + Target for azimuth auto-fill.';
    document.getElementById('finder-moonsize-label').textContent = '';
  }

  // Default date range if empty
  var today = new Date().toISOString().split('T')[0];
  var next  = new Date(); next.setFullYear(next.getFullYear() + 1);
  var nextStr = next.toISOString().split('T')[0];
  if (!document.getElementById('finder-start-date').value) document.getElementById('finder-start-date').value = today;
  if (!document.getElementById('finder-end-date').value)   document.getElementById('finder-end-date').value   = nextStr;
}

// ─── Init ──────────────────────────────────────────────────────────────────────
function initFinderModal() {
  document.getElementById('finder-open-btn').addEventListener('click', openFinderModal);

  document.getElementById('finder-close-btn').addEventListener('click', function() {
    document.getElementById('finder-modal').style.display = 'none';
  });

  document.getElementById('finder-search-btn').addEventListener('click', runFinderSearch);

  document.getElementById('finder-modal').addEventListener('click', function(e) {
    if (e.target === this) this.style.display = 'none';
  });

  // Body selector — update moon size hint
  document.querySelectorAll('input[name="finder-body"]').forEach(function(radio) {
    radio.addEventListener('change', function() {
      var distLbl = document.getElementById('finder-moonsize-label');
      var p = _finderParams();
      if (this.value === 'sun' || p.az === null) {
        distLbl.textContent = '';
      } else {
        distLbl.textContent = '🌕 Apparent moon diameter: ~' + moonApparentSizeM(p.dist).toFixed(1) + ' m';
      }
    });
  });

  // Sun/Moon pin button — hide modal, enter pin mode
  document.getElementById('finder-pin-source-btn').addEventListener('click', function() {
    document.getElementById('finder-modal').style.display = 'none';
    state.finderSourceMode = true;
    if (typeof _switchToSatellite === 'function') _switchToSatellite(); // also closes mobile sidebar
    showToast('🌕☀️ Click the map where sun/moon should appear', 'info');
  });

  // Clear sun/moon pin
  document.getElementById('finder-clear-source-btn').addEventListener('click', function() {
    state.finderSourceLat = null;
    state.finderSourceLon = null;
    if (state.finderSourceGroup) state.finderSourceGroup.clearLayers();
    updateFinderSourceLabel();
    openFinderModal();
  });
}
