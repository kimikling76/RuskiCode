// Copies the pdf.js worker and its data files (character maps, standard fonts, wasm decoders) to
// public/vendor/pdfjs, so the browser loads the exact version installed. Runs on install and build;
// the copy is not committed (see .gitignore).
import {cp, mkdir, rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = path.dirname(require.resolve('pdfjs-dist/package.json'));
const target = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'public', 'vendor', 'pdfjs');

await rm(target, {recursive: true, force: true});
await mkdir(target, {recursive: true});
// The legacy build, like the library the browser loads (src/lib/books/import/browser.ts).
await cp(path.join(root, 'legacy', 'build', 'pdf.worker.min.mjs'), path.join(target, 'pdf.worker.min.mjs'));
for (const dir of ['cmaps', 'standard_fonts', 'wasm']) await cp(path.join(root, dir), path.join(target, dir), {recursive: true});
console.log('pdf.js assets copied to public/vendor/pdfjs');
