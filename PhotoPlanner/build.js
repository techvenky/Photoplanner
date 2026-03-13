#!/usr/bin/env node
// ─── PhotoPlanner Build Script ────────────────────────────────────────────────
// Concatenates all local JS files in load order, then minifies with Terser.
// Output: dist/bundle.min.js
//
// Usage:  node build.js
//          npm run build

const fs   = require('fs');
const path = require('path');
const { minify } = require('terser');

// ─── JS load order (must match the <script> order in index.html) ──────────────
const JS_FILES = [
  // HTML templates (inject tab content before app code runs)
  'js/templates/tpl-planner.js',
  'js/templates/tpl-sunmoon.js',
  'js/templates/tpl-milkyway.js',
  'js/templates/tpl-calculators.js',
  'js/templates/tpl-modals.js',

  // Application modules
  'js/state.js',
  'js/utils.js',
  'js/celestial.js',
  'js/geo.js',
  'js/calculators.js',
  'js/compass.js',
  'js/timeline.js',
  'js/target.js',
  'js/skyview.js',
  'js/sunpath.js',
  'js/sunmoon.js',
  'js/milkyway.js',
  'js/location.js',
  'js/datetime.js',
  'js/finder.js',
  'js/main.js',
];

// ─── Terser options ───────────────────────────────────────────────────────────
const TERSER_OPTIONS = {
  compress: {
    drop_console: false,   // keep console.warn for error visibility
    drop_debugger: true,
    passes: 2,
    dead_code: true,
    unused: true,
  },
  mangle: {
    toplevel: false,       // preserve top-level names (globals used across files)
    eval: false,
  },
  format: {
    comments: false,       // strip all comments
    ascii_only: true,
  },
  sourceMap: {
    filename: 'bundle.min.js',
    url: 'bundle.min.js.map',
  },
};

async function build() {
  const outDir = path.join(__dirname, 'dist');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  // 1. Concatenate sources
  console.log('Concatenating JS files...');
  const codeMap = {};
  for (const file of JS_FILES) {
    const abs = path.join(__dirname, file);
    if (!fs.existsSync(abs)) {
      console.error(`  MISSING: ${file}`);
      process.exit(1);
    }
    codeMap[file] = fs.readFileSync(abs, 'utf8');
    console.log(`  + ${file}`);
  }

  // 2. Minify
  console.log('\nMinifying...');
  const result = await minify(codeMap, TERSER_OPTIONS);

  if (result.error) {
    console.error('Terser error:', result.error);
    process.exit(1);
  }

  // 3. Write outputs
  const bundlePath = path.join(outDir, 'bundle.min.js');
  const mapPath    = path.join(outDir, 'bundle.min.js.map');

  fs.writeFileSync(bundlePath, result.code, 'utf8');
  if (result.map) fs.writeFileSync(mapPath, result.map, 'utf8');

  const origKb   = Object.values(codeMap).join('').length / 1024;
  const minKb    = result.code.length / 1024;
  const savings  = (100 * (1 - minKb / origKb)).toFixed(1);

  console.log(`\nDone!`);
  console.log(`  Original : ${origKb.toFixed(1)} KB`);
  console.log(`  Minified : ${minKb.toFixed(1)} KB  (${savings}% smaller)`);
  console.log(`  Output   : dist/bundle.min.js`);
  if (result.map) console.log(`  Source map: dist/bundle.min.js.map`);
}

build().catch(err => { console.error(err); process.exit(1); });
