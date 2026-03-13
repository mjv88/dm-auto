#!/usr/bin/env node
// scripts/generate-icons.js
// Generates placeholder PWA icons using pure Node.js (no native deps).
// Produces: icon-192.png, icon-512.png, icon-512-maskable.png
//
// Design: Blue (#0078D4) background, white circle, bold "R" letter.

'use strict';

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'public', 'icons');

// ── Minimal PNG encoder ───────────────────────────────────────────────────────

function crc32(buf) {
  let crc = 0xffffffff;
  const table = crc32.table || (crc32.table = buildCrcTable());
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildCrcTable() {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBytes, data]);
  const crcVal = Buffer.alloc(4);
  crcVal.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBytes, data, crcVal]);
}

function encodePNG(width, height, pixels) {
  // pixels: Uint8Array of RGBA values, row-major
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 6;  // color type: RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = chunk('IHDR', ihdrData);

  // Raw scanlines with filter byte 0 (None)
  const rowSize = width * 4;
  const raw = Buffer.alloc(height * (rowSize + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (rowSize + 1)] = 0; // filter: None
    const src = y * rowSize;
    const dst = y * (rowSize + 1) + 1;
    pixels.copy(raw, dst, src, src + rowSize);
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });
  const idat = chunk('IDAT', compressed);
  const iend = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

// ── Pixel drawing helpers ─────────────────────────────────────────────────────

function setPixel(buf, width, x, y, r, g, b, a = 255) {
  const idx = (y * width + x) * 4;
  buf[idx] = r;
  buf[idx + 1] = g;
  buf[idx + 2] = b;
  buf[idx + 3] = a;
}

function fillRect(buf, width, x0, y0, x1, y1, r, g, b, a = 255) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      setPixel(buf, width, x, y, r, g, b, a);
    }
  }
}

function fillCircle(buf, width, cx, cy, radius, r, g, b, a = 255) {
  const r2 = radius * radius;
  const x0 = Math.max(0, Math.floor(cx - radius));
  const x1 = Math.min(width - 1, Math.ceil(cx + radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const y1 = Math.min(width - 1, Math.ceil(cy + radius));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= r2) setPixel(buf, width, x, y, r, g, b, a);
    }
  }
}

// Rasterise the letter "R" at a given scale via a 5×7 bitmap glyph
const R_GLYPH = [
  [1, 1, 1, 1, 0],
  [1, 0, 0, 0, 1],
  [1, 0, 0, 0, 1],
  [1, 1, 1, 1, 0],
  [1, 0, 1, 0, 0],
  [1, 0, 0, 1, 0],
  [1, 0, 0, 0, 1],
];

function drawR(buf, imgWidth, cx, cy, scale, r, g, b, a = 255) {
  const gW = 5, gH = 7;
  const px = Math.round(cx - (gW * scale) / 2);
  const py = Math.round(cy - (gH * scale) / 2);
  for (let row = 0; row < gH; row++) {
    for (let col = 0; col < gW; col++) {
      if (R_GLYPH[row][col]) {
        fillRect(
          buf, imgWidth,
          px + col * scale, py + row * scale,
          px + (col + 1) * scale, py + (row + 1) * scale,
          r, g, b, a
        );
      }
    }
  }
}

// ── Icon generation ───────────────────────────────────────────────────────────

function generateIcon(size, maskable = false) {
  const pixels = Buffer.alloc(size * size * 4);
  const cx = size / 2, cy = size / 2;

  // Background: blue #0078D4
  fillRect(pixels, size, 0, 0, size, size, 0, 120, 212);

  // For maskable, content must be inside the 80% safe zone
  const circleRadius = maskable ? size * 0.35 : size * 0.42;
  const rScale = maskable ? Math.round(size / 22) : Math.round(size / 18);

  // White circle
  fillCircle(pixels, size, cx, cy, circleRadius, 255, 255, 255);

  // Blue "R" on white circle
  drawR(pixels, size, cx, cy, rScale, 0, 120, 212);

  return encodePNG(size, size, pixels);
}

// ── Write files ───────────────────────────────────────────────────────────────

fs.mkdirSync(OUT_DIR, { recursive: true });

const icons = [
  { name: 'icon-192.png', size: 192, maskable: false },
  { name: 'icon-512.png', size: 512, maskable: false },
  { name: 'icon-512-maskable.png', size: 512, maskable: true },
];

for (const { name, size, maskable } of icons) {
  const buf = generateIcon(size, maskable);
  const outPath = path.join(OUT_DIR, name);
  fs.writeFileSync(outPath, buf);
  console.log(`✓ ${name} (${size}×${size}${maskable ? ', maskable' : ''})`);
}

console.log(`\nIcons written to ${OUT_DIR}`);
