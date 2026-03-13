// ─── Alignment Finder (Sun & Moon) ────────────────────────────────────────────

function _finderLightType(sunAltDeg) {
  if (sunAltDeg >= 6)   return { label: 'Day',            cls: 'day' };
  if (sunAltDeg >= 0)   return { label: 'Golden Hour',    cls: 'golden' };
  if (sunAltDeg >= -6)  return { label: 'Blue Hour',      cls: 'blue' };
  if (sunAltDeg >= -12) return { label: 'Twilight',       cls: 'twilight' };
  if (sunAltDeg >= -18) return { label: 'Astro Twilight', cls: 'astro' };
  return { label: 'Night', cls: 'night' };
}

// Composite quality score (1-5) — higher = better shooting conditions
function _finderScore(r) {
  var score = 0;
  if (r.body === 'moon') {
    if      (r.light.cls === 'night')    score += 3;
    else if (r.light.cls === 'astro')    score += 2;
    else if (r.light.cls === 'twilight') score += 1;
    if      (r.illumination < 25)        score += 2;
    else if (r.illumination < 50)        score += 1;
  } else {
    if      (r.light.cls === 'golden')   score += 3;
    else if (r.light.cls === 'blue')     score += 2;
    else if (r.light.cls === 'twilight') score += 1;
  }
  if      (r.altDeg >= 30) score += 2;
  else if (r.altDeg >= 15) score += 1;
  return Math.max(1, Math.min(5, Math.ceil(score * 5 / 7)));
}

// ─── Map bearing line helpers ──────────────────────────────────────────────────
function _drawFinderBearingLine(lat, lon, azDeg) {
  _clearFinderBearingLine();
  if (!state.map) return;
  var R = 6371, d = 50 / R;
  var az   = azDeg * Math.PI / 180;
  var lat1 = lat * Math.PI / 180;
  var lon1 = lon * Math.PI / 180;
  var lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(az));
  var lon2 = lon1 + Math.atan2(Math.sin(az) * Math.sin(d) * Math.cos(lat1),
                               Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  state.finderBearingLayer = L.polyline(
    [[lat, lon], [lat2 * 180 / Math.PI, lon2 * 180 / Math.PI]],
    { color: '#e3b341', weight: 2, dashArray: '8 5', opacity: 0.9 }
  ).addTo(state.map);
}

function _clearFinderBearingLine() {
  if (state.finderBearingLayer) {
    state.map.removeLayer(state.finderBearingLayer);
    state.finderBearingLayer = null;
  }
}

// ─── .ics calendar export ─────────────────────────────────────────────────────
function _exportFinderICS(results) {
  function pad(n) { return String(n).padStart(2, '0'); }
  function toICSDate(d) {
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) +
           'T' + pad(d.getHours()) + pad(d.getMinutes()) + '00';
  }
  var lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0',
    'PRODID:-//PhotoPlanner//Alignment Finder//EN',
    'CALSCALE:GREGORIAN',
  ];
  results.forEach(function(r) {
    var endD      = new Date(r.date.getTime() + 30 * 60000);
    var bodyLabel = r.body === 'moon' ? 'Moon' : 'Sun';
    var desc = 'Azimuth: ' + r.az.toFixed(1) + 'deg | Alt: ' + r.altDeg.toFixed(1) + 'deg | ' + r.light.label;
    if (r.body === 'moon') desc += ' | Moon ' + r.illumination + '%';
    lines.push(
      'BEGIN:VEVENT',
      'DTSTART:' + toICSDate(r.date),
      'DTEND:'   + toICSDate(endD),
      'SUMMARY:' + bodyLabel + ' Alignment - ' + r.light.label,
      'DESCRIPTION:' + desc,
      'END:VEVENT'
    );
  });
  lines.push('END:VCALENDAR');
  var blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href = url; a.download = 'photoplanner-alignments.ics'; a.click();
  URL.revokeObjectURL(url);
}

// ─── Unified search (Moon or Sun) ─────────────────────────────────────────────
function searchAlignments(opts) {
  // opts: { startDate, endDate, targetAz, azTol, targetAltDeg, altTolDeg,
  //         distKm, lat, lon, body, stepMin?, minAltDeg? }
  var results     = [];
  var stepMs      = (opts.stepMin || 10) * 60 * 1000;
  var MIN_GAP_MS  = 60 * 60 * 1000;  // suppress duplicates within 1 h
  var minAltDeg   = opts.minAltDeg || 0;
  var lastResultT = -Infinity;

  var t      = opts.startDate.getTime();
  var endT   = opts.endDate.getTime();
  var isMoon = (opts.body !== 'sun');

  while (t <= endT) {
    var d = new Date(t);
    var bodyPos = isMoon
      ? SunCalc.getMoonPosition(d, opts.lat, opts.lon)
      : SunCalc.getPosition(d, opts.lat, opts.lon);
    var bodyAltDeg = bodyPos.altitude * 180 / Math.PI;

    if (bodyAltDeg > minAltDeg) {
      var bodyAz = ((bodyPos.azimuth + Math.PI) * 180 / Math.PI + 360) % 360;
      if (circularAzDiff(bodyAz, opts.targetAz) <= opts.azTol) {
        var altDiff = Math.abs(bodyAltDeg - opts.targetAltDeg);

        if (altDiff <= opts.altTolDeg && t - lastResultT > MIN_GAP_MS) {
          var sunAltDeg = isMoon
            ? SunCalc.getPosition(d, opts.lat, opts.lon).altitude * 180 / Math.PI
            : bodyAltDeg;
          var light = _finderLightType(sunAltDeg);

          var heightM = opts.distKm ? opts.distKm * 1000 * Math.tan(bodyPos.altitude) : null;
          var result = {
            date:      new Date(t),
            az:        bodyAz,
            altDeg:    bodyAltDeg,
            heightM:   heightM,
            light:     light,
            body:      opts.body,
            sunAltDeg: sunAltDeg,
          };

          if (isMoon) {
            var illum = SunCalc.getMoonIllumination(d);
            result.phase        = illum.phase;
            result.phaseEmoji   = moonPhaseEmoji(illum.phase);
            result.illumination = Math.round(illum.fraction * 100);
            result.moonSizeM    = moonApparentSizeM(opts.distKm);
          }

          result.score = _finderScore(result);
          results.push(result);
          lastResultT = t;
        }
      }
    }
    t += stepMs;
  }
  return results;
}

// ─── Apply result to planner ───────────────────────────────────────────────────
function applyFinderResult(d, body) {
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

  if (body === 'moon')     document.getElementById('show-moon').checked = true;
  else if (body === 'sun') document.getElementById('show-sun').checked  = true;

  state.dateSliderAnchor = null;
  buildDateSlider();
  invalidateTlCache();
  _clearFinderBearingLine();

  if (state.currentLat !== null) {
    drawSunPath();
    drawTimeIndicator();
    updatePlannerInfo();
    if (state.targetLat !== null) updateTargetInfo();
    drawSkyDomeIfOpen();
    var overlay = document.getElementById('timeline-overlay');
    if (overlay && !overlay.classList.contains('collapsed')) drawTimelineOverlay(true);
  }

  document.getElementById('finder-modal').style.display = 'none';
  var bodyLabel = body === 'moon' ? '🌕 Moon' : '☀️ Sun';
  showToast(bodyLabel + ' alignment: ' +
    d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + fmtTime(d), 'success');
}

// ─── Render results table ──────────────────────────────────────────────────────
function renderFinderResults(results) {
  var el = document.getElementById('finder-results');

  if (results.length === 0) {
    el.innerHTML = '<div class="text-secondary small p-3 text-center">No alignments found.<br>Try wider tolerances, longer range, or adjust azimuth.</div>';
    return;
  }

  var isMoon = results[0].body !== 'sun';

  // Light-type filter chips
  var seenCls = [];
  results.forEach(function(r) { if (!seenCls.includes(r.light.cls)) seenCls.push(r.light.cls); });
  var chips = seenCls.map(function(cls) {
    var label = results.find(function(r) { return r.light.cls === cls; }).light.label;
    return '<button class="finder-filter-chip active" data-cls="' + cls + '">' + label + '</button>';
  }).join('');

  // Table rows
  var skyHeader = isMoon ? '<th>Sky</th>' : '';
  var rows = results.map(function(r) {
    var elevStr = r.altDeg.toFixed(2) + '°';
    if (r.heightM !== null) {
      var hAbs = Math.abs(r.heightM);
      var hStr = hAbs >= 1000 ? (r.heightM / 1000).toFixed(2) + ' km' : r.heightM.toFixed(0) + ' m';
      elevStr += ' <span style="color:#484f58;font-size:0.78em">(~' + hStr + ')</span>';
    }
    var bodyCell = isMoon
      ? (r.phaseEmoji + ' <span class="finder-illum">' + r.illumination + '%</span>')
      : '☀️ <span class="finder-illum">' + r.altDeg.toFixed(1) + '°</span>';
    var lastCell = isMoon
      ? '<td>' + r.moonSizeM.toFixed(1) + ' m</td>'
      : '<td>' + r.az.toFixed(1) + '°</td>';
    var skyCell = isMoon
      ? '<td><span class="finder-badge finder-badge-' + r.light.cls + '">' + r.light.label + '</span></td>'
      : '';
    var stars = '●'.repeat(r.score) + '○'.repeat(5 - r.score);
    return '<tr class="finder-result-row"' +
      ' data-cls="'  + r.light.cls + '"' +
      ' data-ts="'   + r.date.getTime() + '"' +
      ' data-body="' + r.body + '"' +
      ' data-az="'   + r.az.toFixed(2) + '">' +
      '<td>' + bodyCell + '</td>' +
      '<td>' + r.date.toLocaleDateString([], { weekday:'short', month:'short', day:'numeric' }) + '</td>' +
      '<td>' + fmtTime(r.date) + '</td>' +
      skyCell +
      '<td><span class="finder-badge finder-badge-' + r.light.cls + '">' + r.light.label + '</span></td>' +
      '<td>' + elevStr + '</td>' +
      lastCell +
      '<td class="finder-score" title="Quality">' + stars + '</td>' +
      '</tr>';
  }).join('');

  var firstHeader = isMoon ? '<th>Phase</th>' : '<th>Sun</th>';
  var lastHeader  = isMoon ? '<th>Moon</th>'  : '<th>Azimuth</th>';

  el.innerHTML =
    '<div class="finder-filter-row">' + chips +
      '<div class="finder-actions">' +
        '<button class="btn btn-sm btn-outline-secondary finder-copy-btn">📋 Copy</button>' +
        '<button class="btn btn-sm btn-outline-secondary finder-ics-btn">📅 .ics</button>' +
      '</div>' +
    '</div>' +
    '<div style="overflow-x:auto"><table class="finder-table"><thead><tr>' +
      firstHeader + '<th>Date</th><th>Time</th>' + skyHeader +
      '<th>Light</th><th>Alt</th>' + lastHeader + '<th>★</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '<div style="font-size:0.71rem;color:#484f58;padding:0.4rem 0.75rem">' +
      results.length + ' alignment' + (results.length !== 1 ? 's' : '') +
      ' found — click row to apply to planner' +
    '</div>';

  // Row events: click → apply; hover → map bearing line
  el.querySelectorAll('.finder-result-row').forEach(function(row) {
    row.addEventListener('click', function() {
      applyFinderResult(new Date(parseInt(this.dataset.ts)), this.dataset.body);
    });
    row.addEventListener('mouseenter', function() {
      if (state.currentLat !== null)
        _drawFinderBearingLine(state.currentLat, state.currentLon, parseFloat(this.dataset.az));
    });
    row.addEventListener('mouseleave', _clearFinderBearingLine);
  });

  // Filter chips
  el.querySelectorAll('.finder-filter-chip').forEach(function(chip) {
    chip.addEventListener('click', function() {
      this.classList.toggle('active');
      var active = Array.from(el.querySelectorAll('.finder-filter-chip.active'))
                       .map(function(c) { return c.dataset.cls; });
      el.querySelectorAll('.finder-result-row').forEach(function(row) {
        row.style.display = active.includes(row.dataset.cls) ? '' : 'none';
      });
    });
  });

  // Copy dates
  el.querySelector('.finder-copy-btn').addEventListener('click', function() {
    var visible = Array.from(el.querySelectorAll('.finder-result-row'))
      .filter(function(r) { return r.style.display !== 'none'; });
    var text = visible.map(function(row) {
      return new Date(parseInt(row.dataset.ts))
        .toLocaleString([], { weekday:'short', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
    }).join('\n');
    navigator.clipboard.writeText(text)
      .then(function()  { showToast('Dates copied (' + visible.length + ')', 'success'); })
      .catch(function() { showToast('Clipboard access denied.', 'warning'); });
  });

  // Export .ics
  el.querySelector('.finder-ics-btn').addEventListener('click', function() {
    var visible = Array.from(el.querySelectorAll('.finder-result-row'))
      .filter(function(r) { return r.style.display !== 'none'; });
    var visibleResults = visible.map(function(row) {
      var ts = parseInt(row.dataset.ts);
      return results.find(function(r) { return r.date.getTime() === ts; });
    }).filter(Boolean);
    _exportFinderICS(visibleResults);
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
//   Camera pin   = subject / landmark (map click location)
//   Target pin   = photographer's position
//   Sun/Moon pin = where the body should appear in the sky
//
//   sm + tgt + cam -> 3-pin: az = bearing(Target->SunMoon), dist = Target->Camera
//   sm + cam       -> 2-pin: az = bearing(Camera->SunMoon), dist = Camera->SunMoon
//   tgt + cam      -> classic: az = bearing(Camera->Target), dist = Camera->Target
//   none           -> manual azimuth entry
function _finderParams() {
  var sm  = state.finderSourceLat !== null;
  var tgt = state.targetLat !== null;
  var cam = state.currentLat !== null;

  if (sm && tgt && cam) {
    return {
      lat: state.currentLat, lon: state.currentLon,
      az:   calcBearing(state.targetLat, state.targetLon, state.finderSourceLat, state.finderSourceLon),
      dist: calcDistanceKm(state.targetLat, state.targetLon, state.currentLat, state.currentLon),
    };
  }
  if (sm && cam) {
    return {
      lat: state.currentLat, lon: state.currentLon,
      az:   calcBearing(state.currentLat, state.currentLon, state.finderSourceLat, state.finderSourceLon),
      dist: calcDistanceKm(state.currentLat, state.currentLon, state.finderSourceLat, state.finderSourceLon),
    };
  }
  if (tgt && cam) {
    return {
      lat: state.currentLat, lon: state.currentLon,
      az:   calcBearing(state.currentLat, state.currentLon, state.targetLat, state.targetLon),
      dist: calcDistanceKm(state.currentLat, state.currentLon, state.targetLat, state.targetLon),
    };
  }
  return { lat: state.currentLat, lon: state.currentLon, az: null, dist: 1 };
}

// ─── Run search ────────────────────────────────────────────────────────────────
function runFinderSearch() {
  var p = _finderParams();
  if (p.lat === null) { showToast('Set a location on the map first.', 'warning'); return; }

  var body        = document.querySelector('input[name="finder-body"]:checked').value;
  var startVal    = document.getElementById('finder-start-date').value;
  var endVal      = document.getElementById('finder-end-date').value;
  var targetAz    = parseFloat(document.getElementById('finder-azimuth').value);
  var azTol       = parseFloat(document.getElementById('finder-az-tol').value)   || 2;
  var targetAltDeg = parseFloat(document.getElementById('finder-target-alt').value) || 0;
  var altTolDeg    = parseFloat(document.getElementById('finder-alt-tol').value)   || 1;
  var stepMin     = parseInt(document.getElementById('finder-step').value)        || 10;
  var minAltDeg   = parseFloat(document.getElementById('finder-min-alt').value)  || 0;

  if (!startVal || !endVal || isNaN(targetAz)) {
    showToast('Fill in all search fields.', 'warning'); return;
  }
  var startDate = new Date(startVal + 'T00:00:00');
  var endDate   = new Date(endVal   + 'T23:59:59');
  if (endDate <= startDate) { showToast('End date must be after start date.', 'warning'); return; }
  if ((endDate - startDate) / 86400000 > 732) { showToast('Maximum search window is 2 years.', 'warning'); return; }
  if (azTol <= 0 || azTol > 10) { showToast('Azimuth tolerance must be 0–10°.', 'warning'); return; }

  var el = document.getElementById('finder-results');
  el.innerHTML = '<div class="text-secondary small p-3 text-center">🔍 Searching…</div>';

  setTimeout(function() {
    var t0 = Date.now();
    var results = searchAlignments({
      startDate: startDate, endDate: endDate,
      targetAz: targetAz, azTol: azTol,
      targetAltDeg: targetAltDeg, altTolDeg: altTolDeg,
      distKm: p.dist, lat: p.lat, lon: p.lon,
      body: body, stepMin: stepMin, minAltDeg: minAltDeg,
    });
    renderFinderResults(results);
    if (results.length > 0)
      showToast('Found ' + results.length + ' alignments in ' + (Date.now() - t0) + ' ms', 'success');
  }, 30);
}

// ─── Open modal & auto-fill fields ────────────────────────────────────────────
function openFinderModal() {
  document.getElementById('finder-modal').style.display = 'flex';
  updateFinderSourceLabel();

  var p = _finderParams();
  if (p.az !== null) {
    document.getElementById('finder-azimuth').value = p.az.toFixed(1);
    var distStr = p.dist < 1 ? (p.dist * 1000).toFixed(0) + ' m' : p.dist.toFixed(2) + ' km';
    var sm = state.finderSourceLat !== null, tgt = state.targetLat !== null;
    document.getElementById('finder-dist-label').textContent =
      sm && tgt ? '📏 Photographer -> Subject: '  + distStr :
      sm        ? '📏 Camera -> Sun/Moon pin: '   + distStr :
                  '📏 Camera -> Target: '          + distStr;

    var body = document.querySelector('input[name="finder-body"]:checked');
    document.getElementById('finder-moonsize-label').textContent =
      (!body || body.value === 'moon')
        ? '🌕 Apparent moon diameter: ~' + moonApparentSizeM(p.dist).toFixed(1) + ' m' : '';

    // Sync height field from current alt value
    var altVal = parseFloat(document.getElementById('finder-target-alt').value);
    if (!isNaN(altVal) && p.dist > 0) {
      document.getElementById('finder-height-m').value = (p.dist * 1000 * Math.tan(altVal * Math.PI / 180)).toFixed(0);
    }
    var distStr2 = p.dist < 1 ? (p.dist * 1000).toFixed(0) + ' m' : p.dist.toFixed(3) + ' km';
    document.getElementById('finder-height-dist-note').textContent = '(at ' + distStr2 + ')';

    _drawFinderBearingLine(p.lat, p.lon, p.az);
  } else {
    document.getElementById('finder-dist-label').textContent = '⚠ Pin Sun/Moon + Target for auto-fill.';
    document.getElementById('finder-moonsize-label').textContent = '';
    document.getElementById('finder-height-dist-note').textContent = '(set pins for distance)';
  }

  var today  = new Date().toISOString().split('T')[0];
  var nextYr = new Date(); nextYr.setFullYear(nextYr.getFullYear() + 1);
  if (!document.getElementById('finder-start-date').value)
    document.getElementById('finder-start-date').value = today;
  if (!document.getElementById('finder-end-date').value)
    document.getElementById('finder-end-date').value = nextYr.toISOString().split('T')[0];
}

// ─── Init ──────────────────────────────────────────────────────────────────────
function initFinderModal() {
  document.getElementById('finder-open-btn').addEventListener('click', openFinderModal);

  document.getElementById('finder-close-btn').addEventListener('click', function() {
    document.getElementById('finder-modal').style.display = 'none';
    _clearFinderBearingLine();
  });

  document.getElementById('finder-search-btn').addEventListener('click', runFinderSearch);

  // Two-way conversion: Alt (°) ↔ Apparent Height (m) using pin-to-pin distance
  document.getElementById('finder-target-alt').addEventListener('input', function() {
    var alt = parseFloat(this.value);
    var p   = _finderParams();
    if (!isNaN(alt) && p.dist > 0) {
      document.getElementById('finder-height-m').value = (p.dist * 1000 * Math.tan(alt * Math.PI / 180)).toFixed(0);
    }
  });

  document.getElementById('finder-height-m').addEventListener('input', function() {
    var h = parseFloat(this.value);
    var p = _finderParams();
    if (!isNaN(h) && h >= 0 && p.dist > 0) {
      document.getElementById('finder-target-alt').value = (Math.atan(h / (p.dist * 1000)) * 180 / Math.PI).toFixed(2);
    }
  });

  document.getElementById('finder-modal').addEventListener('click', function(e) {
    if (e.target === this) { this.style.display = 'none'; _clearFinderBearingLine(); }
  });

  document.querySelectorAll('input[name="finder-body"]').forEach(function(radio) {
    radio.addEventListener('change', function() {
      var p = _finderParams();
      document.getElementById('finder-moonsize-label').textContent =
        (this.value !== 'sun' && p.az !== null)
          ? '🌕 Apparent moon diameter: ~' + moonApparentSizeM(p.dist).toFixed(1) + ' m' : '';
    });
  });

  document.getElementById('finder-pin-source-btn').addEventListener('click', function() {
    document.getElementById('finder-modal').style.display = 'none';
    state.finderSourceMode = true;
    if (typeof _switchToSatellite === 'function') _switchToSatellite();
    showToast('🌕☀️ Click the map where sun/moon should appear', 'info');
  });

  document.getElementById('finder-clear-source-btn').addEventListener('click', function() {
    state.finderSourceLat = null;
    state.finderSourceLon = null;
    if (state.finderSourceGroup) state.finderSourceGroup.clearLayers();
    _clearFinderBearingLine();
    updateFinderSourceLabel();
    openFinderModal();
  });
}
