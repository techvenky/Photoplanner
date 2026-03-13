// ─── Saved Locations (Favorites) ──────────────────────────────────────────────
// Persists up to 10 user-bookmarked locations in localStorage.

const FAVORITES_KEY = 'photoplanner_favorites';
const FAVORITES_MAX = 10;

function loadFavorites() {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
  } catch (e) {
    console.warn('loadFavorites: could not parse saved locations', e);
    return [];
  }
}

function saveFavorites(list) {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn('saveFavorites: could not write to localStorage', e);
    showToast('Could not save to local storage.', 'warning');
  }
}

function addFavorite() {
  if (state.currentLat === null || state.currentLon === null) {
    showToast('No location set. Click the map or search first.', 'warning');
    return;
  }

  const label = document.getElementById('sm-location-label')?.textContent.trim()
              || `${state.currentLat.toFixed(4)}, ${state.currentLon.toFixed(4)}`;

  const list = loadFavorites();

  // Reject duplicates (within ~11 m)
  const dup = list.some(f =>
    Math.abs(f.lat - state.currentLat) < 0.0001 &&
    Math.abs(f.lon - state.currentLon) < 0.0001
  );
  if (dup) { showToast('Already saved.', 'info'); return; }

  list.unshift({ lat: state.currentLat, lon: state.currentLon, label, savedAt: Date.now() });
  if (list.length > FAVORITES_MAX) list.pop();

  saveFavorites(list);
  renderFavorites();
  showToast('Location saved!', 'success');
}

function removeFavorite(index) {
  const list = loadFavorites();
  list.splice(index, 1);
  saveFavorites(list);
  renderFavorites();
}

function renderFavorites() {
  const container = document.getElementById('favorites-list');
  if (!container) return;

  const list = loadFavorites();

  if (list.length === 0) {
    container.innerHTML =
      '<div class="text-secondary small text-center py-1" style="font-size:0.72rem">No saved locations yet.</div>';
    return;
  }

  container.innerHTML = list.map((f, i) => `
    <div class="d-flex align-items-center gap-1 mb-1">
      <button class="btn btn-sm btn-link p-0 text-start flex-grow-1 text-truncate fav-goto"
              data-idx="${i}" title="${f.label.replace(/"/g, '&quot;')}"
              style="color:#a0c8ff;font-size:0.73rem;text-decoration:none">
        📍 ${f.label}
      </button>
      <button class="btn btn-sm p-0 fav-remove" data-idx="${i}"
              title="Remove" style="color:#da3633;font-size:0.75rem;line-height:1;flex-shrink:0">✕</button>
    </div>
  `).join('');

  container.querySelectorAll('.fav-goto').forEach(btn => {
    btn.addEventListener('click', () => {
      const f = loadFavorites()[+btn.dataset.idx];
      if (f) setLocation(f.lat, f.lon, f.label);
    });
  });

  container.querySelectorAll('.fav-remove').forEach(btn => {
    btn.addEventListener('click', () => removeFavorite(+btn.dataset.idx));
  });
}

// Enable / disable the Save button based on whether a location is set
function updateSaveBtnState() {
  const btn = document.getElementById('save-location-btn');
  if (!btn) return;
  const hasLocation = state.currentLat !== null && state.currentLon !== null;
  btn.disabled = !hasLocation;
  btn.title    = hasLocation ? 'Save current location' : 'Set a location first';
}

function initFavorites() {
  const saveBtn = document.getElementById('save-location-btn');
  if (saveBtn) saveBtn.addEventListener('click', addFavorite);
  updateSaveBtnState(); // disabled until a location is set
  renderFavorites();
}
