// Renders the extension icons (green rounded square with a white chain link) as PNGs, no dependencies.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '../chrome-extension/icons');

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function render(size) {
  const SS = 4;
  const buf = Buffer.alloc(size * size * 4);
  const d = [Math.SQRT1_2, -Math.SQRT1_2]; // diagonal, bottom-left → top-right
  const links = [-0.15, 0.15].map((o) => ({ cx: 0.5 + o * d[0], cy: 0.5 + o * d[1] }));
  const half = 0.1, ringR = 0.11, stroke = 0.075, corner = 0.22;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bg = 0, fg = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) / SS) / size, v = (y + (sy + 0.5) / SS) / size;
          const qx = Math.max(Math.abs(u - 0.5) - (0.5 - corner), 0);
          const qy = Math.max(Math.abs(v - 0.5) - (0.5 - corner), 0);
          if (Math.hypot(qx, qy) > corner) continue;
          bg++;
          for (const { cx, cy } of links) {
            const dist = distToSegment(u, v, cx - half * d[0], cy - half * d[1], cx + half * d[0], cy + half * d[1]);
            if (Math.abs(dist - ringR) < stroke / 2) { fg++; break; }
          }
        }
      }
      const n = SS * SS, a = bg / n, f = bg ? fg / bg : 0;
      const i = (y * size + x) * 4;
      buf[i] = Math.round(22 + (255 - 22) * f);
      buf[i + 1] = Math.round(163 + (255 - 163) * f);
      buf[i + 2] = Math.round(74 + (255 - 74) * f);
      buf[i + 3] = Math.round(255 * a);
    }
  }
  return png(size, buf);
}

for (const size of [16, 32, 48, 128]) writeFileSync(join(outDir, `icon${size}.png`), render(size));
console.log('Icons written to chrome-extension/icons/');
