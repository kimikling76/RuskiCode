// Brings src/lib/ai/kie-catalog.ts up to date with Kie's documentation, changing only what Kie changed:
//
//   node scripts/kie-catalog-update.mjs            downloads docs.kie.ai (as scripts/kie-catalog.mjs does)
//   node scripts/kie-catalog-update.mjs <folder>   uses pages already downloaded there
//
// It runs the generator into a temporary file and merges: a model Kie added comes in; a model whose options changed
// is replaced; a model that did not change keeps its line (and the day it was checked); a model whose page is gone is
// kept if the studio uses it (it may still work) and dropped if it was only listed. CATALOG_SUMMARY names a file
// where a summary in Spanish is written (the automatic pull request uses it as its description). Prints «sin cambios»
// and changes nothing when Kie's documentation says the same as the catalog.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const target = path.join(root, 'src', 'lib', 'ai', 'kie-catalog.ts');
const today = process.env.CATALOG_DATE || new Date().toISOString().slice(0, 10);
const tmp = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'kie-catalog-')), 'fresh.ts');
execFileSync(process.execPath, [path.join(root, 'scripts', 'kie-catalog.mjs'), ...process.argv.slice(2)], {stdio: 'inherit', env: {...process.env, CATALOG_OUT: tmp, CATALOG_DATE: today}});

const sections = ['docsText', 'docsImage', 'docsVideo', 'docsAudio'];
const entryLine = /^\s*(\{"id".*\}),?\s*$/;
/** The entries of each section, with their exact line, in order. */
function read(text) {
  const out = Object.fromEntries(sections.map(s => [s, []]));
  let current = null;
  for (const line of text.split('\n')) {
    const head = line.match(/^export const (docs\w+):/);
    if (head) { current = head[1]; continue; }
    const m = current && line.match(entryLine);
    if (m) out[current].push({entry: JSON.parse(m[1]), json: m[1]});
  }
  return out;
}
const before = await fs.readFile(target, 'utf8');
const cur = read(before), fresh = read(await fs.readFile(tmp, 'utf8'));
// Equal whatever the order of their keys; the day each was checked is not a change.
const canon = v => Array.isArray(v) ? '[' + v.map(canon).join(',') + ']' : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}' : JSON.stringify(v);
const same = (a, b) => { const {checked: _a, ...x} = a; const {checked: _b, ...y} = b; return canon(x) === canon(y); };
const kindName = {docsText: 'texto', docsImage: 'imagen', docsVideo: 'video', docsAudio: 'audio'};
const report = {added: [], changed: [], gone: [], dropped: []};
const merged = {};
for (const s of sections) {
  const old = new Map(cur[s].map(e => [e.entry.id, e]));
  const list = fresh[s].map(f => {
    const o = old.get(f.entry.id);
    if (!o) { report.added.push({s, e: f.entry}); return f; }
    if (same(o.entry, f.entry)) return o;
    report.changed.push({s, e: f.entry, was: o.entry});
    return f;
  });
  for (const o of cur[s]) {
    if (fresh[s].some(f => f.entry.id === o.entry.id)) continue;
    // Kie no longer documents it: a model the studio offers stays (it may still work); one only listed goes.
    if (o.entry.status === 'listed') report.dropped.push({s, e: o.entry}); else { report.gone.push({s, e: o.entry}); list.push(o); }
  }
  list.sort((a, b) => a.entry.provider.localeCompare(b.entry.provider) || a.entry.name.localeCompare(b.entry.name, 'en', {numeric: true}));
  merged[s] = list;
}
const total = report.added.length + report.changed.length + report.dropped.length;
if (!total) { console.log('sin cambios'); process.exit(0); }

// The header keeps its history and says what this update did.
const header = before.slice(0, before.indexOf('import type')).trimEnd().split('\n')
  .filter(l => !/^\/\/ (Do not edit by hand|run the script again)/.test(l))
  .map(l => l.replace(/\s*Do not edit by hand:\s*$/, ''))
  .filter(l => l.trim() !== '//');
const note = '// On ' + today + ' scripts/kie-catalog-update.mjs added ' + report.added.length + ', updated ' + report.changed.length + ' and dropped ' + report.dropped.length + ' entries.';
const lines = [...header, note, '// Do not edit by hand: run the scripts again, or override an entry in src/lib/ai/models.ts.'];
const types = {docsText: 'TextModel', docsImage: 'ImageModel', docsVideo: 'VideoModel', docsAudio: 'AudioModel'};
const body = sections.map(s => 'export const ' + s + ': ' + types[s] + '[] = [\n' + merged[s].map(e => '  ' + e.json + ',').join('\n') + '\n];\n').join('\n');
await fs.writeFile(target, lines.join('\n') + "\nimport type {TextModel, ImageModel, VideoModel, AudioModel} from './models';\n\n" + body);

// A summary for people: what came in, what changed, what went.
const usable = e => e.status === 'docs' ? 'se puede usar' : 'aparece apagado: ' + (e.missing || 'el estudio todavía no tiene su pantalla').replace(/\.+$/, '');
const md = ['## Modelos de Kie: actualización del ' + today, ''];
if (report.added.length) md.push('### Nuevos (' + report.added.length + ')', ...report.added.map(({s, e}) => '- **' + e.name + '** (' + kindName[s] + ', ' + e.provider + '): ' + usable(e) + '. [Documentación](' + e.docs + ')'), '');
if (report.changed.length) md.push('### Con cambios en su documentación (' + report.changed.length + ')', ...report.changed.map(({s, e, was}) => '- **' + e.name + '** (' + kindName[s] + ')' + (was.status !== e.status ? ': ahora ' + usable(e) : ': opciones actualizadas') + '.'), '');
if (report.dropped.length) md.push('### Quitados: Kie ya no los documenta y estaban apagados (' + report.dropped.length + ')', ...report.dropped.map(({s, e}) => '- ' + e.name + ' (' + kindName[s] + ')'), '');
if (report.gone.length) md.push('### Kie ya no los documenta, pero se mantienen (' + report.gone.length + ')', 'Siguen en el estudio por si todavía funcionan; conviene revisarlos.', ...report.gone.map(({s, e}) => '- ' + e.name + ' (' + kindName[s] + ')'), '');
if (process.env.CATALOG_SUMMARY) await fs.writeFile(process.env.CATALOG_SUMMARY, md.join('\n'));
console.log(md.join('\n'));
