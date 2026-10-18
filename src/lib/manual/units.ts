import type {EditorFonts} from './fonts';
import {componentLabel, composeComponent, newPage, placeOnPage, renumberPages, setCentredText} from './compose';
import {addComponent, addPage} from './edit';
import type {Component, Page, Unit} from './model';

// Whole units made from another one, in memory: a new unit with a model's design, and new content laid out on
// pages (used by /pdf-generator for its preview, and saved only when the author confirms).

const has = (p: Page, role: string) => p.blocks.some(b => b.elements.some(e => e.role === role));

const rowsOf = (c: Component) => c.type === 'gallery' ? Math.ceil(c.cells.length / c.columns) : c.type === 'comic' ? Math.ceil(c.panels.length / c.columns) : 1;

/** The first `rows` rows of a gallery or comic, and the rest; null when it cannot be split. */
function splitRows(c: Component, rows: number): Component[] | null {
  if (rows < 1 || rows >= rowsOf(c)) return null;
  if (c.type === 'gallery') {
    const n = rows * c.columns;
    return [{...c, cells: c.cells.slice(0, n)}, {...c, cells: c.cells.slice(n), ...(c.numbered ? {first: (c.first ?? 1) + n} : {})}];
  }
  if (c.type === 'comic') {
    const n = rows * c.columns;
    return [{...c, panels: c.panels.slice(0, n)}, {...c, panels: c.panels.slice(n)}];
  }
  return null;
}

/** A new unit with the design of `model`: one page with the frame of a lesson page, page 1, the new unit number. */
export function blankUnitFrom(fonts: EditorFonts, model: Unit, opts: {id: string; title: string; number?: string; now: number}): Unit {
  const usable = model.pages.filter(p => !p.conserved);
  const first = usable.find(p => has(p, 'page-number') && has(p, 'unit-tab')) ?? usable.find(p => has(p, 'page-number')) ?? usable.find(p => p.blocks.some(b => b.kind === 'footer')) ?? model.pages[0];
  const base: Unit = {
    schemaVersion: 1, id: opts.id, title: opts.title.trim().slice(0, 200) || 'Unidad nueva', ...(opts.number ? {number: opts.number} : {}),
    createdAt: opts.now, updatedAt: opts.now, pages: [], template: model.template, assets: model.assets,
  };
  const frame = newPage({...base, pages: [first]}, 0);
  const page = {...frame, blocks: frame.blocks.map(b => ({...b, elements: b.elements.map(el =>
    el.role === 'page-number' ? setCentredText(fonts, el, '1') : el.role === 'unit-tab' && opts.number ? setCentredText(fonts, el, opts.number) : el)}))};
  return {...base, pages: [page]};
}

/**
 * Lays out components one after the other from a fresh page at the end of `unit`: each goes under the previous
 * one, and a new page with the same frame starts when it does not fit. Returns the unit and the new pages' indexes.
 * `freshPage` false starts on the unit's last page (a new unit's empty first page).
 */
export function layOut(fonts: EditorFonts, unit: Unit, components: Component[], freshPage: boolean) {
  let u = unit;
  const first = freshPage ? unit.pages.length : unit.pages.length - 1;
  if (freshPage) u = addPage(fonts, u, u.pages.length - 1).unit;
  const overflow: string[] = [];
  const queue = [...components];
  while (queue.length) {
    const c = queue.shift()!;
    let page = u.pages[u.pages.length - 1];
    const probe = composeComponent({fonts, template: u.template, page, idPrefix: 'probe', z: 0}, c, [0, page.height]);
    // A gallery or a comic taller than a whole page goes on in the next one, by rows.
    const room = page.height - u.template.margins.top - u.template.margins.bottom;
    const parts = probe.height > room ? splitRows(c, Math.floor(rowsOf(c) * room / probe.height)) : null;
    if (parts) { queue.unshift(...parts); continue; }
    let at = placeOnPage(fonts, u.template, page, probe.height);
    if (!at) {
      u = addPage(fonts, u, u.pages.length - 1).unit;
      page = u.pages[u.pages.length - 1];
      at = placeOnPage(fonts, u.template, page, probe.height);
      // Taller than an empty page: it goes at the top and is reported.
      if (!at) { at = [u.template.margins.left, page.height - u.template.margins.top]; overflow.push(c.type === 'exercise' ? 'Ejercicio ' + c.number : componentLabel(c)); }
    }
    u = addComponent(fonts, u, page.id, c, at).unit;
  }
  const pages = Array.from({length: u.pages.length - first}, (_, i) => first + i);
  return {unit: renumberPages(fonts, u), pages, overflow};
}
