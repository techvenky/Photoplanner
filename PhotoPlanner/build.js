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
const pc     = require('picocolors');

// ─── HTML template → DOM element mapping (source files → generated tpl-*.js) ──
// Edit HTML in templates/*.html — build auto-generates js/templates/tpl-*.js
const TEMPLATE_MAP = [
  { src: 'templates/planner.html',     id: 'tab-planner',     out: 'js/templates/tpl-planner.js'     },
  { src: 'templates/sunmoon.html',     id: 'tab-sunmoon',     out: 'js/templates/tpl-sunmoon.js'     },
  { src: 'templates/milkyway.html',    id: 'tab-milkyway',    out: 'js/templates/tpl-milkyway.js'    },
  { src: 'templates/calculators.html', id: 'tab-calculators', out: 'js/templates/tpl-calculators.js' },
  { src: 'templates/modals.html',      id: 'modals-root',     out: 'js/templates/tpl-modals.js'      },
];

function compileTemplates() {
  const outDir = path.join(__dirname, 'js', 'templates');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  for (const { src, id, out } of TEMPLATE_MAP) {
    const srcPath = path.join(__dirname, src);
    const outPath = path.join(__dirname, out);
    if (!fs.existsSync(srcPath)) {
      console.error(pc.red(`  MISSING template: ${src}`));
      process.exit(1);
    }
    // Escape backticks and template-literal interpolation markers in raw HTML
    const html = fs.readFileSync(srcPath, 'utf8')
      .replace(/\\/g, '\\\\')
      .replace(/`/g, '\\`')
      .replace(/\$\{/g, '\\${');
    const js = `// AUTO-GENERATED — edit ${src}, not this file\ndocument.getElementById('${id}').innerHTML = \`${html}\`;\n`;
    fs.writeFileSync(outPath, js, 'utf8');
    console.log(pc.dim(`  ${src} → ${out}`));
  }
}

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
  'js/favorites.js',
  'js/weather.js',
  'js/ar.js',
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

  // ── 0. Compile HTML templates → js/templates/tpl-*.js ─────────────────────
  console.log(pc.cyan('Compiling HTML templates...'));
  compileTemplates();

  // ── 1. Concatenate + minify JS ─────────────────────────────────────────────
  console.log(pc.cyan('\nConcatenating JS files...'));
  const codeMap = {};
  for (const file of JS_FILES) {
    const abs = path.join(__dirname, file);
    if (!fs.existsSync(abs)) {
      console.error(pc.red(`  MISSING: ${file}`));
      process.exit(1);
    }
    codeMap[file] = fs.readFileSync(abs, 'utf8');
    console.log(pc.dim(`  + ${file}`));
  }

  console.log(pc.cyan('\nMinifying JS...'));
  const result = await minify(codeMap, TERSER_OPTIONS);
  if (result.error) {
    console.error(pc.red('Terser error:'), result.error);
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
  console.log(pc.cyan('\nMinifying CSS...'));
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
  console.log(pc.green('\n✔ Build complete!'));
  console.log(`  ${pc.yellow('JS')}  : ${origJsKb.toFixed(1)} KB → ${pc.green(minJsKb.toFixed(1) + ' KB')}  (${pc.cyan(jsSavings + '% smaller')})  ${pc.dim('[?v=' + jsHash + ']')}`);
  console.log(`  ${pc.yellow('CSS')} : ${origCssKb.toFixed(1)} KB → ${pc.green(minCssKb.toFixed(1) + ' KB')}  (${pc.cyan(cssSavings + '% smaller')})  ${pc.dim('[?v=' + cssHash + ']')}`);
  console.log(`  ${pc.dim('index.html cache refs updated')}`);
}

// Run directly or export for the dev server
if (require.main === module) {
  build().catch(err => { console.error(err); process.exit(1); });
}

module.exports = { build };
