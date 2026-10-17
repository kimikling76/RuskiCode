// Copies browser files of two libraries to public/vendor, so the browser loads the exact versions installed.
// Runs on install and build; the copies are not committed (see .gitignore).
// - pdf.js (legacy build): worker, character maps, standard fonts and wasm decoders, for importing PDFs.
// - Nutrient Web SDK: its engine (wasm, workers, fonts, translations) for editing PDFs as they are.
//   The Office conversion engine (gdpicture, about 130 MB) is left out: the studio only opens PDFs.
import {cp, mkdir, readdir, rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const vendor = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'public', 'vendor');

const pdfjs = path.dirname(require.resolve('pdfjs-dist/package.json'));
const pdfjsTarget = path.join(vendor, 'pdfjs');
await rm(pdfjsTarget, {recursive: true, force: true});
await mkdir(pdfjsTarget, {recursive: true});
await cp(path.join(pdfjs, 'legacy', 'build', 'pdf.worker.min.mjs'), path.join(pdfjsTarget, 'pdf.worker.min.mjs'));
for (const dir of ['cmaps', 'standard_fonts', 'wasm']) await cp(path.join(pdfjs, dir), path.join(pdfjsTarget, dir), {recursive: true});

const nutrient = path.join(path.dirname(require.resolve('@nutrient-sdk/viewer/package.json')), 'dist', 'nutrient-viewer-lib');
const nutrientTarget = path.join(vendor, 'nutrient', 'nutrient-viewer-lib');
await rm(path.join(vendor, 'nutrient'), {recursive: true, force: true});
await mkdir(nutrientTarget, {recursive: true});
for (const entry of await readdir(nutrient)) {
  if (entry.startsWith('gdpicture-')) continue;
  await cp(path.join(nutrient, entry), path.join(nutrientTarget, entry), {recursive: true});
}
console.log('Vendor files copied to public/vendor (pdf.js, Nutrient)');
