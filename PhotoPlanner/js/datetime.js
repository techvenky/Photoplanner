// ─── Date / Time Controls ─────────────────────────────────────────────────────

function buildDateSlider() {
  const selectedDate = document.getElementById('plan-date').value;
  const anchor = state.dateSliderAnchor || selectedDate || new Date().toISOString().split('T')[0];
  const anchorDate = new Date(anchor + 'T12:00:00');
  const today = new Date().toISOString().split('T')[0];
  const container = document.getElementById('date-pills');
  container.innerHTML = '';

  for (let i = -3; i <= 3; i++) {
    const d = new Date(anchorDate);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    const dayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

    const pill = document.createElement('button');
    pill.className = 'date-pill';
    if (dateStr === selectedDate) pill.classList.add('active');
    if (dateStr === today) pill.classList.add('today');
    pill.innerHTML = `<span class="date-pill-day">${dayNames[d.getDay()]}</span><span class="date-pill-num">${d.getDate()}</span>`;
    pill.addEventListener('click', () => {
      document.getElementById('plan-date').value = dateStr;
      document.getElementById('sm-date').value   = dateStr;
      document.getElementById('mw-date').value   = dateStr;
      if (window._fpPlan) window._fpPlan.setDate(dateStr, false);
      if (window._fpSM)   window._fpSM.setDate(dateStr, false);
      if (window._fpMW)   window._fpMW.setDate(dateStr, false);
      state.dateSliderAnchor = null;
      buildDateSlider();
      drawSunPath();
      if (state.targetLat !== null) updateTargetInfo();
      updateSunMoon();
      updateMilkyWay();
    });
    container.appendChild(pill);
  }
}

function initDatePickers() {
  const today = new Date().toISOString().split('T')[0];

  // Native plan-date change handler
  document.getElementById('plan-date').addEventListener('change', () => {
    invalidateTlCache(); // invalidate altitude cache
    state.dateSliderAnchor = null;
    buildDateSlider();
    drawSunPath();
    if (state.targetLat !== null) updateTargetInfo();
    // Keep Sun & Moon and Milky Way tabs in sync
    const d = document.getElementById('plan-date').value;
    document.getElementById('sm-date').value = d;
    document.getElementById('mw-date').value = d;
    updateSunMoon();
    updateMilkyWay();
  });

  // Overlay toggles
  document.getElementById('show-sun').addEventListener('change', drawSunPath);
  document.getElementById('show-moon').addEventListener('change', drawSunPath);
  document.getElementById('show-golden').addEventListener('change', drawSunPath);
  document.getElementById('show-milkyway').addEventListener('change', drawSunPath);

  // Date prev/next week buttons
  document.getElementById('date-prev-week').addEventListener('click', () => {
    const anchor = state.dateSliderAnchor || document.getElementById('plan-date').value || new Date().toISOString().split('T')[0];
    const d = new Date(anchor + 'T12:00:00');
    d.setDate(d.getDate() - 7);
    state.dateSliderAnchor = d.toISOString().split('T')[0];
    buildDateSlider();
  });

  document.getElementById('date-next-week').addEventListener('click', () => {
    const anchor = state.dateSliderAnchor || document.getElementById('plan-date').value || new Date().toISOString().split('T')[0];
    const d = new Date(anchor + 'T12:00:00');
    d.setDate(d.getDate() + 7);
    state.dateSliderAnchor = d.toISOString().split('T')[0];
    buildDateSlider();
  });

  // Flatpickr calendar date pickers
  if (typeof flatpickr !== 'undefined') {
    const fpCfgBase = { dateFormat: 'Y-m-d', allowInput: true, disableMobile: false };

    window._fpPlan = flatpickr('#plan-date', {
      ...fpCfgBase,
      defaultDate: today,
      onChange(_dates, dateStr) {
        document.getElementById('sm-date').value = dateStr;
        document.getElementById('mw-date').value = dateStr;
        if (window._fpSM)  window._fpSM.setDate(dateStr, false);
        if (window._fpMW)  window._fpMW.setDate(dateStr, false);
        state.dateSliderAnchor = null;
        buildDateSlider();
        drawSunPath();
        if (state.targetLat !== null) updateTargetInfo();
        updateSunMoon();
        updateMilkyWay();
      }
    });

    window._fpSM = flatpickr('#sm-date', {
      ...fpCfgBase,
      defaultDate: today,
      onChange(_dates, dateStr) {
        document.getElementById('plan-date').value = dateStr;
        document.getElementById('mw-date').value   = dateStr;
        if (window._fpPlan) window._fpPlan.setDate(dateStr, false);
        if (window._fpMW)   window._fpMW.setDate(dateStr, false);
        updateSunMoon();
        updateMilkyWay();
        buildDateSlider();
      }
    });

    window._fpMW = flatpickr('#mw-date', {
      ...fpCfgBase,
      defaultDate: today,
      onChange(_dates, dateStr) {
        document.getElementById('plan-date').value = dateStr;
        document.getElementById('sm-date').value   = dateStr;
        if (window._fpPlan) window._fpPlan.setDate(dateStr, false);
        if (window._fpSM)   window._fpSM.setDate(dateStr, false);
        updateMilkyWay();
        updateSunMoon();
        buildDateSlider();
      }
    });
  }
}

function initTimezoneSelector() {
  document.getElementById('timezone-select').addEventListener('change', e => {
    state.selectedTimezone = e.target.value; // '' = local
    const tzLabel = document.getElementById('tz-offset-label');
    if (state.selectedTimezone && typeof dayjs !== 'undefined') {
      try {
        const now = dayjs().tz(state.selectedTimezone);
        const offset = now.utcOffset();
        const sign   = offset >= 0 ? '+' : '−';
        const absH   = Math.floor(Math.abs(offset) / 60);
        const absM   = Math.abs(offset) % 60;
        const offsetStr = `UTC${sign}${absH}${absM ? ':' + String(absM).padStart(2,'0') : ''}`;
        tzLabel.textContent = offsetStr + ' — ' + now.format('h:mm A') + ' now';
      } catch(err) { tzLabel.textContent = ''; }
    } else {
      tzLabel.textContent = '';
    }
    // Refresh all time displays
    if (state.currentLat !== null) { updateSunMoon(); updateMilkyWay(); }
  });
}
