#!/usr/bin/env node
// ─── PhotoPlanner Dev Server ───────────────────────────────────────────────────
// Serves the app on http://localhost:3000 with automatic live reload.
// Watches js/ and style.css — rebuilds on change, reloads the open browser tab.
//
// No extra dependencies — uses only Node.js built-in modules.
//
// Usage:   node dev.js
//           npm run dev

const http = require('http');
const fs   = require('fs');
const path = require('path');

const { build } = require('./build');

const PORT = 3000;
const ROOT = __dirname;

let buildVersion = 0;   // incremented after every successful rebuild
let building     = false;

// ─── MIME types ───────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css' : 'text/css',
  '.js'  : 'application/javascript',
  '.json': 'application/json',
  '.png' : 'image/png',
  '.jpg' : 'image/jpeg',
  '.ico' : 'image/x-icon',
  '.svg' : 'image/svg+xml',
  '.webp': 'image/webp',
  '.map' : 'application/json',
};

// ─── Live-reload snippet (injected into every HTML response) ──────────────────
// Polls /__dev__ once per second; reloads the page if the build version changed.
const LIVE_RELOAD_SCRIPT = `
<script>
(function(){
  var v = null;
  setInterval(function(){
    fetch('/__dev__').then(function(r){ return r.text(); }).then(function(n){
      if (v === null) { v = n; return; }
      if (v !== n) location.reload();
    }).catch(function(){});
  }, 1000);
})();
</script>`;

// ─── Rebuild helper ───────────────────────────────────────────────────────────
async function rebuild() {
  if (building) return;
  building = true;
  const t = Date.now();
  try {
    await build();
    buildVersion++;
    console.log(`[dev] Built in ${Date.now() - t} ms  (v${buildVersion})`);
  } catch (e) {
    console.error('[dev] Build error:', e.message);
  } finally {
    building = false;
  }
}

// ─── File watcher ─────────────────────────────────────────────────────────────
function watch(target, label) {
  try {
    fs.watch(target, { recursive: true }, (_evt, filename) => {
      if (!filename || !/\.(js|css)$/.test(filename)) return;
      // Ignore changes inside dist/ — those are our own build outputs
      if (filename.startsWith('dist')) return;
      console.log(`[dev] Changed: ${label ? label + '/' : ''}${filename}`);
      rebuild();
    });
  } catch {
    // fs.watch with recursive may not be supported on all platforms; fail silently
  }
}

// ─── HTTP server ──────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  // Live-reload version endpoint (polled by the injected browser script)
  if (req.url === '/__dev__') {
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
    return res.end(String(buildVersion));
  }

  let urlPath = req.url.split('?')[0];       // strip query strings
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.resolve(ROOT, '.' + urlPath);

  // Path-traversal guard
  if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end(`Not found: ${urlPath}`);
    }

    const ext  = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store' });

    // Inject live-reload script before </body> in HTML responses
    if (ext === '.html') {
      data = Buffer.from(data.toString().replace('</body>', LIVE_RELOAD_SCRIPT + '\n</body>'));
    }

    res.end(data);
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────
console.log('\nPhotoPlanner dev server — building...\n');

rebuild().then(() => {
  // Watch js/ directory and the root (catches style.css changes)
  watch(path.join(ROOT, 'js'), 'js');
  watch(ROOT, '');   // style.css lives here; ignores dist/ via filter above

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`\n  PhotoPlanner dev server ready`);
    console.log(`  →  http://localhost:${PORT}`);
    console.log(`  →  Watching js/**/*.js and style.css`);
    console.log(`  →  Press Ctrl+C to stop\n`);
  });
});
