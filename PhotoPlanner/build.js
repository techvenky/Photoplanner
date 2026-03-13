#!/usr/bin/env node
// ─── PhotoPlanner Build Script ────────────────────────────────────────────────
// 1. Concatenates all local JS files in load order, minifies with Terser.
// 2. Minifies style.css (no extra dependencies — pure regex).
// 3. Stamps both assets in index.html with a short content-hash (?v=…) so
//    browsers never serve stale files after a deploy.
//
// Output:  dist/bundle.min.js   dist/bundle.min.js.map
//          dist/style.min.css
//          index.html           (script/link src updated in-place)
//
// Usage:   node build.js
//           npm run build

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
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

// ─── CSS minification (zero dependencies) ─────────────────────────────────────
function minifyCSS(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')          // strip /* block comments */
    .replace(/\s+/g, ' ')                       // collapse all whitespace to single space
    .replace(/\s*([{}:;,>~+])\s*/g, '$1')      // remove spaces around delimiters
    .replace(/;\}/g, '}')                       // drop trailing semicolons before }
    .trim();
}

// ─── Short content hash (first 8 hex chars of SHA-1) ─────────────────────────
function contentHash(str) {
  return crypto.createHash('sha1').update(str).digest('hex').slice(0, 8);
}

// ─── Main build function ──────────────────────────────────────────────────────
async function build() {
  const outDir = path.join(__dirname, 'dist');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  // ── 1. Concatenate + minify JS ─────────────────────────────────────────────
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

  console.log('\nMinifying JS...');
  const result = await minify(codeMap, TERSER_OPTIONS);
  if (result.error) {
    console.error('Terser error:', result.error);
    process.exit(1);
  }

  const bundlePath = path.join(outDir, 'bundle.min.js');
  const mapPath    = path.join(outDir, 'bundle.min.js.map');
  fs.writeFileSync(bundlePath, result.code, 'utf8');
  if (result.map) fs.writeFileSync(mapPath, result.map, 'utf8');

  const origJsKb  = Object.values(codeMap).join('').length / 1024;
  const minJsKb   = result.code.length / 1024;
  const jsSavings = (100 * (1 - minJsKb / origJsKb)).toFixed(1);
  const jsHash    = contentHash(result.code);

  // ── 2. Minify CSS ──────────────────────────────────────────────────────────
  console.log('\nMinifying CSS...');
  const cssSource  = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');
  const cssMin     = minifyCSS(cssSource);
  fs.writeFileSync(path.join(outDir, 'style.min.css'), cssMin, 'utf8');

  const origCssKb  = cssSource.length / 1024;
  const minCssKb   = cssMin.length / 1024;
  const cssSavings = (100 * (1 - minCssKb / origCssKb)).toFixed(1);
  const cssHash    = contentHash(cssMin);

  // ── 3. Stamp index.html with cache-busting hashes ─────────────────────────
  const htmlPath = path.join(__dirname, 'index.html');
  let html = fs.readFileSync(htmlPath, 'utf8');

  // style.css OR dist/style.min.css (±existing ?v=…) → dist/style.min.css?v=<hash>
  html = html.replace(
    /href="(?:dist\/)?style(?:\.min)?\.css(?:\?v=[^"]*)?"/,
    `href="dist/style.min.css?v=${cssHash}"`
  );
  // dist/bundle.min.js (±existing ?v=…) → dist/bundle.min.js?v=<hash>
  html = html.replace(
    /src="dist\/bundle\.min\.js(?:\?v=[^"]*)?"/,
    `src="dist/bundle.min.js?v=${jsHash}"`
  );
  fs.writeFileSync(htmlPath, html, 'utf8');

  // ── 4. Summary ─────────────────────────────────────────────────────────────
  console.log('\nDone!');
  console.log(`  JS  : ${origJsKb.toFixed(1)} KB → ${minJsKb.toFixed(1)} KB  (${jsSavings}% smaller)  [?v=${jsHash}]`);
  console.log(`  CSS : ${origCssKb.toFixed(1)} KB → ${minCssKb.toFixed(1)} KB  (${cssSavings}% smaller)  [?v=${cssHash}]`);
  console.log(`  index.html cache refs updated`);
}

// Run directly or export for the dev server
if (require.main === module) {
  build().catch(err => { console.error(err); process.exit(1); });
}

module.exports = { build };
