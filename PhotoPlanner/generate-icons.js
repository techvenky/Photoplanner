#!/usr/bin/env node
// Generates icons/icon-192.png, icons/icon-512.png, and favicon.ico
// using only Node.js built-in modules (no canvas / sharp required).
//
// Design: dark background (#0d1117) + brand-orange lens circle (#f78166)
//         with a camera-body rectangle — readable at all sizes.

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

// ─── CRC-32 ───────────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// ─── PNG helpers ──────────────────────────────────────────────────────────────
function chunk(type, data) {
  const tb  = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([tb, data])));
  return Buffer.concat([len, tb, data, crc]);
}

function makePNG(pixels, size) {
  // pixels: Uint8Array of length size*size*3 (R,G,B per pixel, row-major)
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB

  // Prepend filter byte 0 to each row
  const raw = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 3)] = 0; // filter: None
    for (let x = 0; x < size; x++) {
      const src = (y * size + x) * 3;
      const dst = y * (1 + size * 3) + 1 + x * 3;
      raw[dst]     = pixels[src];
      raw[dst + 1] = pixels[src + 1];
      raw[dst + 2] = pixels[src + 2];
    }
  }

  const idat = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ─── Icon pixel renderer ──────────────────────────────────────────────────────
// Draws a camera icon: dark bg + rounded rect body + lens circle + brand colours.
function renderIcon(size) {
  const px = new Uint8Array(size * size * 3);

  // Brand colours
  const BG    = [0x0d, 0x11, 0x17]; // #0d1117
  const BODY  = [0x21, 0x26, 0x2d]; // #21262d  camera body
  const BUMP  = [0x30, 0x36, 0x3d]; // #30363d  viewfinder bump
  const LENS  = [0xf7, 0x81, 0x66]; // #f78166  lens (brand orange)
  const GLINT = [0xff, 0xd0, 0xc0]; // light glint on lens

  const s  = size;
  const cx = s / 2, cy = s / 2;

  // Helper: anti-aliased circle fill
  function circleFill(x, y, r, col) {
    for (let py = Math.floor(cy - r - 1); py <= cy + r + 1; py++) {
      for (let px_ = Math.floor(cx - r - 1); px_ <= cx + r + 1; px_++) {
        const dist  = Math.hypot(px_ - cx, py - cy);
        const alpha = Math.max(0, Math.min(1, r - dist + 0.5));
        if (alpha <= 0 || px_ < 0 || px_ >= s || py < 0 || py >= s) continue;
        const idx = (py * s + px_) * 3;
        for (let c = 0; c < 3; c++) {
          px[idx + c] = Math.round(px[idx + c] * (1 - alpha) + col[c] * alpha);
        }
      }
    }
  }

  // Fill background
  for (let i = 0; i < s * s * 3; i += 3) {
    px[i] = BG[0]; px[i + 1] = BG[1]; px[i + 2] = BG[2];
  }

  // Camera body rectangle (rounded via pixel blending)
  const bx1 = Math.round(s * 0.10), by1 = Math.round(s * 0.28);
  const bx2 = Math.round(s * 0.90), by2 = Math.round(s * 0.78);
  const brad = Math.round(s * 0.10); // corner radius
  for (let py = by1; py < by2; py++) {
    for (let px_ = bx1; px_ < bx2; px_++) {
      // simple inside-rounded-rect test
      const dx = Math.max(0, Math.max(bx1 + brad - px_, px_ - (bx2 - brad)));
      const dy = Math.max(0, Math.max(by1 + brad - py, py - (by2 - brad)));
      if (dx * dx + dy * dy <= brad * brad) {
        const idx = (py * s + px_) * 3;
        px[idx] = BODY[0]; px[idx + 1] = BODY[1]; px[idx + 2] = BODY[2];
      }
    }
  }

  // Viewfinder bump (small rect top-center)
  const vx1 = Math.round(s * 0.36), vy1 = Math.round(s * 0.18);
  const vx2 = Math.round(s * 0.64), vy2 = Math.round(s * 0.30);
  for (let py = vy1; py < vy2; py++) {
    for (let px_ = vx1; px_ < vx2; px_++) {
      if (px_ >= 0 && px_ < s && py >= 0 && py < s) {
        const idx = (py * s + px_) * 3;
        px[idx] = BUMP[0]; px[idx + 1] = BUMP[1]; px[idx + 2] = BUMP[2];
      }
    }
  }

  // Lens outer ring
  circleFill(cx, cy + s * 0.02, s * 0.29, BUMP);
  // Lens fill
  circleFill(cx, cy + s * 0.02, s * 0.23, LENS);
  // Lens glint
  circleFill(cx - s * 0.07, cy - s * 0.06, s * 0.05, GLINT);

  return px;
}

// ─── ICO wrapper (PNG-inside-ICO for modern browsers) ─────────────────────────
function makeICO(pngBuf) {
  // One image, 32×32
  const dir = Buffer.alloc(16);
  dir[0] = 32; dir[1] = 32;          // width, height (0 = 256 for larger)
  dir[2] = 0;  dir[3] = 0;           // color count, reserved
  dir.writeUInt16LE(1, 4);           // planes
  dir.writeUInt16LE(32, 6);          // bit count
  dir.writeUInt32LE(pngBuf.length, 8); // PNG data size
  dir.writeUInt32LE(6 + 16, 12);    // offset to PNG data

  const header = Buffer.from([
    0, 0,  // reserved
    1, 0,  // type: icon
    1, 0,  // image count
  ]);

  return Buffer.concat([header, dir, pngBuf]);
}

// ─── Generate ─────────────────────────────────────────────────────────────────
const outDir = path.join(__dirname, 'icons');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

for (const size of [192, 512]) {
  const pixels = renderIcon(size);
  const png    = makePNG(pixels, size);
  const file   = path.join(outDir, `icon-${size}.png`);
  fs.writeFileSync(file, png);
  console.log(`  ✔ icons/icon-${size}.png  (${png.length} bytes)`);
}

// Favicon: 32×32 PNG inside .ico
const fav32  = renderIcon(32);
const png32  = makePNG(fav32, 32);
const ico    = makeICO(png32);
fs.writeFileSync(path.join(__dirname, 'favicon.ico'), ico);
console.log(`  ✔ favicon.ico            (${ico.length} bytes)`);

// Also write a standalone 32×32 PNG as favicon.png (optional but handy)
fs.writeFileSync(path.join(__dirname, 'icons', 'icon-32.png'), png32);
console.log(`  ✔ icons/icon-32.png      (${png32.length} bytes)`);
