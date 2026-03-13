// ─── Calculators Tab Template ──────────────────────────────────────────────────
document.getElementById('tab-calculators').innerHTML = `
  <div class="page-container">
    <h2 class="mb-3">Photography Calculators</h2>
    <div class="d-flex flex-wrap gap-2 mb-4">
      <button class="calc-tab btn btn-sm active" data-calc="dof">Depth of Field</button>
      <button class="calc-tab btn btn-sm" data-calc="exposure">Exposure</button>
      <button class="calc-tab btn btn-sm" data-calc="timelapse">Time-Lapse</button>
      <button class="calc-tab btn btn-sm" data-calc="hyperfocal">Hyperfocal</button>
      <button class="calc-tab btn btn-sm" data-calc="ndr">500 Rule</button>
      <button class="calc-tab btn btn-sm" data-calc="fov">Field of View</button>
      <button class="calc-tab btn btn-sm" data-calc="startrail">Star Trails</button>
    </div>

    <!-- DOF -->
    <div id="calc-dof" class="calc-panel active">
      <div class="calc-grid">
        <div class="card bg-body-tertiary border-secondary">
          <div class="card-body">
            <h5 class="card-title">Depth of Field</h5>
            <div class="row g-2">
              <div class="col-12"><label class="form-label small">Sensor Format</label>
                <select id="dof-sensor" class="form-select form-select-sm">
                  <option value="0.029">Full Frame (35mm)</option>
                  <option value="0.019">APS-C (Canon)</option>
                  <option value="0.020">APS-C (Nikon/Sony)</option>
                  <option value="0.015">Micro Four Thirds</option>
                  <option value="0.047">Medium Format</option>
                </select></div>
              <div class="col-6"><label class="form-label small">Focal Length (mm)</label>
                <input type="number" id="dof-focal" value="50" min="1" max="2000" class="form-control form-control-sm"/></div>
              <div class="col-6"><label class="form-label small">Aperture (f/)</label>
                <input type="number" id="dof-aperture" value="2.8" min="0.7" max="64" step="0.1" class="form-control form-control-sm"/></div>
              <div class="col-12"><label class="form-label small">Subject Distance (m)</label>
                <input type="number" id="dof-distance" value="10" min="0.1" step="0.1" class="form-control form-control-sm"/></div>
              <div class="col-12"><button class="btn btn-sm btn-primary w-100" onclick="calcDOF()">Calculate</button></div>
            </div>
          </div>
        </div>
        <div class="calc-results card bg-body-tertiary border-secondary" id="dof-results"></div>
      </div>
    </div>

    <!-- EXPOSURE -->
    <div id="calc-exposure" class="calc-panel">
      <div class="calc-grid">
        <div class="card bg-body-tertiary border-secondary">
          <div class="card-body">
            <h5 class="card-title">Exposure Calculator</h5>
            <div class="row g-2">
              <div class="col-6"><label class="form-label small">Base Shutter</label>
                <select id="exp-shutter" class="form-select form-select-sm">
                  <option value="0.000125">1/8000</option><option value="0.000250">1/4000</option>
                  <option value="0.000500">1/2000</option><option value="0.001">1/1000</option>
                  <option value="0.002">1/500</option><option value="0.004">1/250</option>
                  <option value="0.008">1/125</option><option value="0.017">1/60</option>
                  <option value="0.033">1/30</option><option value="0.125">1/8</option>
                  <option value="0.25">1/4</option><option value="0.5">1/2</option>
                  <option value="1" selected>1"</option><option value="2">2"</option>
                  <option value="4">4"</option><option value="8">8"</option>
                  <option value="15">15"</option><option value="30">30"</option>
                </select></div>
              <div class="col-6"><label class="form-label small">Base ISO</label>
                <select id="exp-iso" class="form-select form-select-sm">
                  <option value="100" selected>100</option><option value="200">200</option>
                  <option value="400">400</option><option value="800">800</option>
                  <option value="1600">1600</option><option value="3200">3200</option>
                  <option value="6400">6400</option><option value="12800">12800</option>
                </select></div>
              <div class="col-6"><label class="form-label small">Base Aperture (f/)</label>
                <input type="number" id="exp-aperture" value="8" min="0.7" max="64" step="0.1" class="form-control form-control-sm"/></div>
              <div class="col-6"><label class="form-label small">New Aperture (f/)</label>
                <input type="number" id="exp-new-aperture" value="2.8" min="0.7" max="64" step="0.1" class="form-control form-control-sm"/></div>
              <div class="col-12"><label class="form-label small">New ISO</label>
                <select id="exp-new-iso" class="form-select form-select-sm">
                  <option value="100" selected>100</option><option value="200">200</option>
                  <option value="400">400</option><option value="800">800</option>
                  <option value="1600">1600</option><option value="3200">3200</option>
                  <option value="6400">6400</option><option value="12800">12800</option>
                </select></div>
              <div class="col-12"><button class="btn btn-sm btn-primary w-100" onclick="calcExposure()">Calculate</button></div>
            </div>
          </div>
        </div>
        <div class="calc-results card bg-body-tertiary border-secondary" id="exp-results"></div>
      </div>
    </div>

    <!-- TIMELAPSE -->
    <div id="calc-timelapse" class="calc-panel">
      <div class="calc-grid">
        <div class="card bg-body-tertiary border-secondary">
          <div class="card-body">
            <h5 class="card-title">Time-Lapse</h5>
            <div class="row g-2">
              <div class="col-12"><label class="form-label small">Shooting Duration (min)</label>
                <input type="number" id="tl-duration" value="60" min="1" class="form-control form-control-sm"/></div>
              <div class="col-6"><label class="form-label small">Interval (sec)</label>
                <input type="number" id="tl-interval" value="5" min="1" class="form-control form-control-sm"/></div>
              <div class="col-6"><label class="form-label small">Playback FPS</label>
                <select id="tl-fps" class="form-select form-select-sm">
                  <option value="24">24 fps</option><option value="25">25 fps</option>
                  <option value="30" selected>30 fps</option><option value="60">60 fps</option>
                </select></div>
              <div class="col-12"><button class="btn btn-sm btn-primary w-100" onclick="calcTimelapse()">Calculate</button></div>
            </div>
          </div>
        </div>
        <div class="calc-results card bg-body-tertiary border-secondary" id="tl-results"></div>
      </div>
    </div>

    <!-- HYPERFOCAL -->
    <div id="calc-hyperfocal" class="calc-panel">
      <div class="calc-grid">
        <div class="card bg-body-tertiary border-secondary">
          <div class="card-body">
            <h5 class="card-title">Hyperfocal Distance</h5>
            <div class="row g-2">
              <div class="col-12"><label class="form-label small">Sensor Format</label>
                <select id="hf-sensor" class="form-select form-select-sm">
                  <option value="0.029">Full Frame (35mm)</option>
                  <option value="0.019">APS-C (Canon)</option>
                  <option value="0.020">APS-C (Nikon/Sony)</option>
                  <option value="0.015">Micro Four Thirds</option>
                </select></div>
              <div class="col-6"><label class="form-label small">Focal Length (mm)</label>
                <input type="number" id="hf-focal" value="24" min="1" max="2000" class="form-control form-control-sm"/></div>
              <div class="col-6"><label class="form-label small">Aperture (f/)</label>
                <input type="number" id="hf-aperture" value="8" min="0.7" max="64" step="0.1" class="form-control form-control-sm"/></div>
              <div class="col-12"><button class="btn btn-sm btn-primary w-100" onclick="calcHyperfocal()">Calculate</button></div>
            </div>
          </div>
        </div>
        <div class="calc-results card bg-body-tertiary border-secondary" id="hf-results"></div>
      </div>
    </div>

    <!-- 500 RULE -->
    <div id="calc-ndr" class="calc-panel">
      <div class="calc-grid">
        <div class="card bg-body-tertiary border-secondary">
          <div class="card-body">
            <h5 class="card-title">500 Rule for Stars</h5>
            <div class="row g-2">
              <div class="col-12"><label class="form-label small">Sensor Format (Crop)</label>
                <select id="ndr-sensor" class="form-select form-select-sm">
                  <option value="1">Full Frame (×1)</option>
                  <option value="1.6">APS-C Canon (×1.6)</option>
                  <option value="1.5">APS-C Nikon (×1.5)</option>
                  <option value="2">Micro Four Thirds (×2)</option>
                </select></div>
              <div class="col-12"><label class="form-label small">Focal Length (mm)</label>
                <input type="number" id="ndr-focal" value="24" min="1" max="2000" class="form-control form-control-sm"/></div>
              <div class="col-12"><button class="btn btn-sm btn-primary w-100" onclick="calc500Rule()">Calculate</button></div>
            </div>
          </div>
        </div>
        <div class="calc-results card bg-body-tertiary border-secondary" id="ndr-results"></div>
      </div>
    </div>

    <!-- FIELD OF VIEW -->
    <div id="calc-fov" class="calc-panel">
      <div class="calc-grid">
        <div class="card bg-body-tertiary border-secondary">
          <div class="card-body">
            <h5 class="card-title">Field of View</h5>
            <div class="row g-2">
              <div class="col-12"><label class="form-label small">Sensor Format</label>
                <select id="fov-sensor" class="form-select form-select-sm">
                  <option value="36x24">Full Frame (36×24mm)</option>
                  <option value="22.3x14.9">APS-C Canon (22.3×14.9mm)</option>
                  <option value="23.5x15.6">APS-C Nikon (23.5×15.6mm)</option>
                  <option value="17.3x13">Micro Four Thirds (17.3×13mm)</option>
                  <option value="44x33">Medium Format (44×33mm)</option>
                </select></div>
              <div class="col-12"><label class="form-label small">Focal Length (mm)</label>
                <input type="number" id="fov-focal" value="35" min="1" max="2000" class="form-control form-control-sm"/></div>
              <div class="col-12"><button class="btn btn-sm btn-primary w-100" onclick="calcFOV()">Calculate</button></div>
            </div>
          </div>
        </div>
        <div class="calc-results card bg-body-tertiary border-secondary" id="fov-results"></div>
      </div>
    </div>

    <!-- STAR TRAILS -->
    <div id="calc-startrail" class="calc-panel">
      <div class="calc-grid">
        <div class="card bg-body-tertiary border-secondary">
          <div class="card-body">
            <h5 class="card-title">Star Trails</h5>
            <div class="row g-2">
              <div class="col-12"><label class="form-label small">Sensor / Crop Factor</label>
                <select id="st-sensor" class="form-select form-select-sm">
                  <option value="36x24x1">Full Frame (×1.0)</option>
                  <option value="22.3x14.9x1.6">APS-C Canon (×1.6)</option>
                  <option value="23.5x15.6x1.5">APS-C Nikon (×1.5)</option>
                  <option value="17.3x13x2">Micro Four Thirds (×2.0)</option>
                </select></div>
              <div class="col-6"><label class="form-label small">Focal Length (mm)</label>
                <input type="number" id="st-focal" value="24" min="1" max="2000" class="form-control form-control-sm"/></div>
              <div class="col-6"><label class="form-label small">Aperture (f/)</label>
                <input type="number" id="st-aperture" value="2.8" min="0.7" max="22" step="0.1" class="form-control form-control-sm"/></div>
              <div class="col-6"><label class="form-label small">ISO</label>
                <select id="st-iso" class="form-select form-select-sm">
                  <option value="400">400</option><option value="800">800</option>
                  <option value="1600" selected>1600</option><option value="3200">3200</option>
                  <option value="6400">6400</option>
                </select></div>
              <div class="col-6"><label class="form-label small">Trail Goal</label>
                <select id="st-trail" class="form-select form-select-sm">
                  <option value="5">Short (5°)</option>
                  <option value="15" selected>Medium (15°)</option>
                  <option value="30">Long (30°)</option>
                  <option value="90">Quarter circle (90°)</option>
                  <option value="180">Half circle (180°)</option>
                </select></div>
              <div class="col-12"><button class="btn btn-sm btn-primary w-100" onclick="calcStarTrail()">Calculate</button></div>
            </div>
          </div>
        </div>
        <div class="calc-results card bg-body-tertiary border-secondary" id="st-results"></div>
      </div>
    </div>

  </div>
`;
