// makefun-frontend-01 hand-in (Node 22, standard library only).
//
// The frontend is app/ — plain static files, no build step: index.html, one stylesheet, one shell
// module and one module per view, fetched on demand. This program copies app/ and screenshots/ to
// the output directory and writes dossier.json with the kit's vendored buildDossier, which is what
// the judge reads and what the scorer rebuilds to compare byte for byte.
//
// Determinism: nothing here reads the clock, a random source or the network, the copy order is the
// filesystem's own, and the output directories are emptied first, so two runs write the same bytes.
//
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   node main.ts            -> /output when it exists, else ./out beside this file
//   MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Serve it locally with `node serve.ts` (port 8080, or --port <n>).

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-frontend.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? (existsSync('/output') ? '/output' : join(here, 'out'));
const app = join(here, 'app');
const shots = join(here, 'screenshots');

if (!existsSync(join(app, 'index.html'))) {
  console.error('app/index.html is missing: run this from the repository root');
  process.exit(1);
}

mkdirSync(out, { recursive: true });

// Start from an empty app/ and screenshots/ so a second run cannot inherit a stale file.
for (const folder of ['app', 'screenshots']) rmSync(join(out, folder), { recursive: true, force: true });

cpSync(app, join(out, 'app'), { recursive: true });
if (existsSync(shots)) cpSync(shots, join(out, 'screenshots'), { recursive: true });
else console.error('screenshots/ is missing: the entry needs 3 shots of the app on live data');

// The scorer's own caps. Only text_max_bytes shapes the text; the rest refuse an entry the gate
// would refuse rather than let it through here.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 3, max_bytes: 262144 },
    app_max_files: 993,
    app_max_bytes: 16777216,
  }),
);

console.log(`wrote ${out}`);
