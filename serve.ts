// A static server for app/ (Node 22, standard library only) — a development convenience that behaves
// like the host the app is meant for: correct MIME types, gzip for text, and no path outside app/.
//
//   node serve.ts            http://localhost:8080
//   node serve.ts --port 8123

import { createReadStream, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = resolve(fileURLToPath(new URL('./app', import.meta.url)));
const args = process.argv.slice(2);
const at = args.indexOf('--port');
const asked = at === -1 ? 8080 : Number(args[at + 1]);
const port = Number.isInteger(asked) && asked > 0 && asked < 65536 ? asked : 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg']);
const zipped = new Map(); // "file|mtime|size" -> gzipped Buffer, so an edited file is never served stale

createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  let path;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400).end('bad request');
    return;
  }
  if (path.endsWith('/')) path += 'index.html';
  const file = resolve(join(root, normalize(path)));
  if (file !== root && !file.startsWith(root + sep)) {
    response.writeHead(403).end('forbidden');
    return;
  }

  let size;
  let mtime;
  try {
    const stats = statSync(file);
    if (!stats.isFile()) throw new Error('not a file');
    size = stats.size;
    mtime = stats.mtimeMs;
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
    return;
  }

  const ext = extname(file).toLowerCase();
  const headers = {
    'content-type': MIME[ext] ?? 'application/octet-stream',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  };

  if (COMPRESSIBLE.has(ext) && String(request.headers['accept-encoding'] ?? '').includes('gzip')) {
    const key = `${file}|${mtime}|${size}`;
    let body = zipped.get(key);
    if (!body) {
      body = gzipSync(readFileSync(file), { level: 9 });
      zipped.set(key, body);
    }
    response.writeHead(200, { ...headers, 'content-encoding': 'gzip', 'content-length': body.length, vary: 'accept-encoding' });
    if (request.method === 'HEAD') response.end();
    else response.end(body);
    return;
  }

  response.writeHead(200, { ...headers, 'content-length': size });
  if (request.method === 'HEAD') response.end();
  else createReadStream(file).pipe(response);
}).listen(port, '127.0.0.1', () => {
  console.log(`app/ is on http://localhost:${port}`);
});
