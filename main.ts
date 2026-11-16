// makefun-frontend-01 entry (Node 22, standard library only).
//
// The app is plain static files in app/: index.html, style.css, app.js and the view modules
// app.js imports on demand. This program hands it in: it copies app/ and screenshots/ to
// /output and writes /output/dossier.json, the one text the judge reads, with buildDossier
// from the kit's vendored library (vendor/makefun-frontend.ts, unchanged).
//
// Two runs write the same bytes: nothing here reads the clock, the network or a random
// source, and buildDossier walks the same tree in the same order every time.
//
// Run it outside the grader with an output directory:
//   node main.ts            (writes to /output when it exists, else ./out)
//   MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-frontend.ts';

const repo = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? (existsSync('/output') ? '/output' : join(repo, 'out'));

mkdirSync(out, { recursive: true });
cpSync(join(repo, 'app'), join(out, 'app'), { recursive: true });
if (existsSync(join(repo, 'screenshots'))) {
  cpSync(join(repo, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The dossier, built from what is now in out/. The caps are the scorer's own, so an entry
// the gate would refuse fails here instead of at the gate.
const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 3, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 16777216,
});

writeFileSync(join(out, 'dossier.json'), dossier);
console.log(`handed in ${out}: dossier.json ${dossier.length} bytes`);
