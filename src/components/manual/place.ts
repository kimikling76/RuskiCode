'use client';
import {addComponent, addPage} from '@/lib/manual/edit';
import {composeComponent, contentWidth, placeOnPage} from '@/lib/manual/compose';
import {imageFromFile} from '@/lib/manual/browser';
import type {Component, Page, Unit} from '@/lib/manual/model';
import type {EditorFonts} from '@/lib/manual/fonts';

// New content goes below the last block of a page, with the unit's template, never over other content. A new page
// changes the numbers of the pages after it, so it is only made when the author asks for it.

export type Placed = {unit: Unit; pageIndex: number; blockId: string | null};

/** Where `c` fits on `page` (top-left corner), or null. */
export function fits(fonts: EditorFonts, unit: Unit, page: Page, c: Component) {
  const probe = composeComponent({fonts, template: unit.template, page, idPrefix: 'probe', z: 0}, c, [0, page.height]);
  return placeOnPage(fonts, unit.template, page, probe.height);
}

/**
 * The unit with `make(page)` placed on the page at `pageIndex`, or on a new page after it. `make` may offer smaller
 * versions (a picture at 60, 45 and 30 % of the width): the first that fits is used. Null when nothing fits.
 */
export function place(fonts: EditorFonts, unit: Unit, pageIndex: number, make: (page: Page) => Component[], onNewPage: boolean): Placed | null {
  let target = unit.pages[pageIndex], base = unit, index = pageIndex;
  if (onNewPage) {
    const made = addPage(fonts, unit, pageIndex);
    base = made.unit; target = made.page; index = pageIndex + 1;
  }
  for (const c of make(target)) {
    const at = fits(fonts, base, target, c);
    if (!at) continue;
    const {unit: out, block} = addComponent(fonts, base, target.id, c, at);
    return {unit: out, pageIndex: index, blockId: block?.id ?? null};
  }
  return null;
}

/** A generated picture as a photo of the manual: rounded corners, as wide as fits. */
export async function pictureComponents(blob: Blob, prompt: string, unit: Unit) {
  const image = await imageFromFile(new File([blob], 'ilustracion', {type: blob.type || 'image/png'}));
  return (page: Page): Component[] => {
    const full = contentWidth(unit.template, page);
    return [0.6, 0.45, 0.3].map(share => ({type: 'image', image, width: full * share, height: full * share * image.height / image.width, rounded: true, prompt: prompt.slice(0, 2000)}));
  };
}
