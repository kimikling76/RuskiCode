'use client';
import {openPdf} from '@/lib/pdf/viewer';
import {attachFile} from '@/lib/personal-chat/attach-browser';
import type {ChatAttachment} from '@/lib/personal-chat/attachments';
import type {EditorFonts} from './fonts';
import type {Unit} from './model';
import {renderUnit} from './render';
import {getAsset} from './store';

/** Longest side of the page picture a model gets: enough to read small print and the text inside pictures. */
const SIDE = 1600;

/**
 * One page as it prints, as a JPEG stored like a Chat attachment, so a model that sees images gets the page itself:
 * its photos, colours, layout and the text inside pictures.
 */
export async function pagePicture(unit: Unit, fonts: EditorFonts, index: number): Promise<ChatAttachment> {
  const {bytes} = await renderUnit(unit, {fonts, asset: getAsset, pages: [index]});
  const doc = await openPdf(bytes.slice().buffer);
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({scale: 1});
    const viewport = page.getViewport({scale: SIDE / Math.max(base.width, base.height)});
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({canvas, viewport}).promise;
    const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', 0.88));
    if (!blob) throw Error('PICTURE_FAILED');
    return attachFile(new File([blob], 'pagina-' + (index + 1) + '.jpg', {type: 'image/jpeg'}));
  } finally {
    void doc.loadingTask.destroy();
  }
}
