// Screenshots of the app on live data, plus a luma/contrast reading of each render.
// Run from this repository with the app already served:
//   node tools/shots.mjs --base http://127.0.0.1:8123 --out screenshots
// playwright-core is resolved from the browser folder that has it installed.

import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const require = createRequire('D:/dipsik/bugbounty/browser/');
const { chromium } = require('playwright-core');

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const at = args.indexOf(name);
  return at === -1 ? fallback : args[at + 1];
};

const base = arg('--base', 'http://127.0.0.1:8123');
const out = arg('--out', 'screenshots');
const width = Number(arg('--width', '1280'));
const height = Number(arg('--height', '800'));

const SHOTS = [
  { file: '1-board.jpg', hash: '#/', label: 'board' },
  { file: '2-bounty.jpg', hash: '#/bounty/makefun-frontend-01', label: 'bounty' },
  { file: '3-leaderboard.jpg', hash: '#/bounty/makefun-frontend-01/leaderboard', label: 'leaderboard' },
];

/** Decode an 8-bit RGB/RGBA PNG: enough to read the pixels the app actually drew. */
function decodePng(buffer) {
  let at = 8;
  let w = 0;
  let h = 0;
  let color = 6;
  const chunks = [];
  while (at < buffer.length) {
    const length = buffer.readUInt32BE(at);
    const type = buffer.toString('ascii', at + 4, at + 8);
    const body = buffer.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      w = body.readUInt32BE(0);
      h = body.readUInt32BE(4);
      color = body.readUInt8(9);
    } else if (type === 'IDAT') chunks.push(body);
    else if (type === 'IEND') break;
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(chunks));
  const bpp = color === 6 ? 4 : 3;
  const stride = w * bpp;
  const pixels = Buffer.alloc(h * stride);
  let pos = 0;
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y += 1) {
    const filter = raw[pos];
    pos += 1;
    const line = Buffer.from(raw.subarray(pos, pos + stride));
    pos += stride;
    for (let x = 0; x < stride; x += 1) {
      const a = x >= bpp ? line[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let value = line[x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[x] = value & 0xff;
    }
    line.copy(pixels, y * stride);
    prev = line;
  }
  return { w, h, bpp, pixels };
}

/** Mean relative luma and how much of the frame is ink vs background. */
function luma(png) {
  const { w, h, bpp, pixels } = png;
  const values = new Float64Array(w * h);
  let sum = 0;
  for (let i = 0, p = 0; i < pixels.length; i += bpp, p += 1) {
    const r = pixels[i] / 255;
    const g = pixels[i + 1] / 255;
    const b = pixels[i + 2] / 255;
    const lin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const y = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    values[p] = y;
    sum += y;
  }
  values.sort();
  const at = (q) => values[Math.min(values.length - 1, Math.floor(values.length * q))];
  return {
    mean: sum / values.length,
    p05: at(0.05),
    p50: at(0.5),
    p95: at(0.95),
    contrast: (at(0.95) + 0.05) / (at(0.05) + 0.05),
  };
}

mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--no-sandbox', '--force-color-profile=srgb'],
});
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });

const report = [];
for (const shot of SHOTS) {
  await page.goto(`${base}/${shot.hash}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__shotReady === true', null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(700);
  const png = await page.screenshot({ type: 'png' });
  const reading = luma(decodePng(png));
  await page.screenshot({ path: `${out}/${shot.file}`, type: 'jpeg', quality: 84 });
  const rendered = await page.evaluate(() => ({
    route: location.hash,
    cards: document.querySelectorAll('.card').length,
    rows: document.querySelectorAll('.lrow').length,
    lists: document.querySelectorAll('dl').length,
    title: document.title,
    requests: document.getElementById('nettext')?.textContent ?? '',
  }));
  report.push({ ...shot, ...rendered, luma: reading });
  console.log(
    `${shot.file}  ${png.readUInt32BE(16)}x${png.readUInt32BE(20)}  luma ${reading.mean.toFixed(1)}  ` +
      `contrast ${reading.contrast.toFixed(2)}  cards ${rendered.cards}  rows ${rendered.rows}  ${rendered.requests}`,
  );
}

await browser.close();
writeFileSync(`${out}/../tools/shot-report.json`, JSON.stringify(report, null, 2));
console.log('wrote tools/shot-report.json');
