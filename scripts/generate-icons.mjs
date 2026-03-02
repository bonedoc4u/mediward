/**
 * generate-icons.mjs
 * Generates MediWard PWA icons (192×192, 512×512, 180×180) as PNG files.
 * Uses only Node.js built-ins (zlib + fs) — no extra dependencies.
 * Run: node scripts/generate-icons.mjs
 */
import { deflateSync } from 'zlib';
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── CRC32 ──
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const tb = Buffer.from(type, 'ascii');
  const len = Buffer.allocUnsafe(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.allocUnsafe(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([tb, data])), 0);
  return Buffer.concat([len, tb, data, crcBuf]);
}

function buildPng(size, bg, fg) {
  // IHDR
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.writeUInt8(8, 8);   // bit depth
  ihdr.writeUInt8(2, 9);   // RGB
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);

  const rowBytes = 1 + size * 3;
  const raw = Buffer.allocUnsafe(size * rowBytes);
  const cx = size / 2, cy = size / 2;
  const r  = size * 0.40;   // circle radius
  const sw = size * 0.09;   // cross arm half-width

  for (let y = 0; y < size; y++) {
    const rowOff = y * rowBytes;
    raw[rowOff] = 0;
    for (let x = 0; x < size; x++) {
      const dx = x - cx, dy = y - cy;
      const dist2 = dx*dx + dy*dy;
      const inCircle = dist2 <= r*r;
      const onCross  = inCircle && (Math.abs(dx) <= sw || Math.abs(dy) <= sw);
      const px = rowOff + 1 + x * 3;
      if (onCross) {
        raw[px] = fg[0]; raw[px+1] = fg[1]; raw[px+2] = fg[2];
      } else if (inCircle) {
        // lighter ring inside circle
        raw[px] = Math.min(255, bg[0] + 25);
        raw[px+1] = Math.min(255, bg[1] + 30);
        raw[px+2] = Math.min(255, bg[2] + 45);
      } else {
        raw[px] = bg[0]; raw[px+1] = bg[1]; raw[px+2] = bg[2];
      }
    }
  }

  const compressed = deflateSync(raw, { level: 9 });
  const PNG_SIG = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
  return Buffer.concat([
    PNG_SIG,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// slate-800 bg, slate-50 cross
const BG = [30, 41, 59];
const FG = [248, 250, 252];

try { mkdirSync(join(__dirname, '../public'), { recursive: true }); } catch {}

const icons = [
  { size: 192, file: join(__dirname, '../public/icon-192.png') },
  { size: 512, file: join(__dirname, '../public/icon-512.png') },
  { size: 180, file: join(__dirname, '../public/apple-touch-icon.png') },
];

for (const { size, file } of icons) {
  writeFileSync(file, buildPng(size, BG, FG));
  console.log(`✓ Generated ${file.split('/').pop()} (${size}×${size})`);
}
console.log('PWA icons written to public/.');
