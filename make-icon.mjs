import fs from 'node:fs';
import zlib from 'node:zlib';

const size = 256;
const rgba = Buffer.alloc(size * size * 4, 0);

const cx = 127.5;
const cy = 127.5;

for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.hypot(dx, dy);
    const idx = (y * size + x) * 4;

    // Outer dark circle badge (radius 120)
    if (dist <= 120) {
      const edgeAlpha = dist > 118.5 ? Math.max(0, (120 - dist) / 1.5) : 1;
      // Subtle radial dark background
      const grad = Math.max(8, Math.round(24 - (dist / 120) * 14));
      rgba[idx] = grad;
      rgba[idx + 1] = grad;
      rgba[idx + 2] = grad + 2;
      rgba[idx + 3] = Math.round(255 * edgeAlpha);
    }

    // Subtle thin outer border ring (radius 118.5..120)
    if (dist >= 117.5 && dist <= 120) {
      rgba[idx] = 75;
      rgba[idx + 1] = 75;
      rgba[idx + 2] = 80;
      rgba[idx + 3] = 255;
    }

    // Crisp white Orbit progress ring (radius 84..95)
    if (dist >= 83 && dist <= 96) {
      const aa = dist < 84 ? dist - 83 : dist > 95 ? 96 - dist : 1;
      // Open arc (~285 degrees) starting from top-right
      const angle = (Math.atan2(dy, dx) * 180 / Math.PI + 450) % 360;
      if (angle <= 285) {
        rgba[idx] = 255;
        rgba[idx + 1] = 255;
        rgba[idx + 2] = 255;
        rgba[idx + 3] = Math.round(255 * Math.max(0, Math.min(1, aa)));
      }
    }

    // Glowing white orbital dot at arc tip (angle = 285 deg, radius = 89.5)
    const tipRad = (285 - 90) * Math.PI / 180;
    const tx = cx + 89.5 * Math.cos(tipRad);
    const ty = cy + 89.5 * Math.sin(tipRad);
    const tipDist = Math.hypot(x - tx, y - ty);
    if (tipDist <= 11) {
      const dotAlpha = tipDist > 9.5 ? Math.max(0, (11 - tipDist) / 1.5) : 1;
      rgba[idx] = 255;
      rgba[idx + 1] = 255;
      rgba[idx + 2] = 255;
      rgba[idx + 3] = Math.max(rgba[idx + 3], Math.round(255 * dotAlpha));
    }

    // Center minimalist core dot (radius 14)
    if (dist <= 14) {
      const coreAlpha = dist > 12.5 ? Math.max(0, (14 - dist) / 1.5) : 1;
      rgba[idx] = 255;
      rgba[idx + 1] = 255;
      rgba[idx + 2] = 255;
      rgba[idx + 3] = Math.round(255 * coreAlpha);
    }
  }
}

// Encode 256x256 PNG
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

const rawRows = Buffer.alloc(size * (size * 4 + 1));
for (let y = 0; y < size; y++) {
  rawRows[y * (size * 4 + 1)] = 0;
  rgba.copy(rawRows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(size, 0);
ihdr.writeUInt32BE(size, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(rawRows)),
  chunk('IEND', Buffer.alloc(0))
]);

// Wrap PNG inside a valid Windows .ico container
const icoHeader = Buffer.alloc(6);
icoHeader.writeUInt16LE(0, 0);
icoHeader.writeUInt16LE(1, 2); // 1 = ICON
icoHeader.writeUInt16LE(1, 4); // 1 image

const dirEntry = Buffer.alloc(16);
dirEntry[0] = 0; // 0 means 256px
dirEntry[1] = 0;
dirEntry[2] = 0;
dirEntry[3] = 0;
dirEntry.writeUInt16LE(1, 4);
dirEntry.writeUInt16LE(32, 6);
dirEntry.writeUInt32LE(png.length, 8);
dirEntry.writeUInt32LE(22, 12);

fs.mkdirSync('build', { recursive: true });
fs.writeFileSync('build/icon.ico', Buffer.concat([icoHeader, dirEntry, png]));
fs.writeFileSync('build/icon.png', png);
console.log('Created build/icon.ico successfully!');