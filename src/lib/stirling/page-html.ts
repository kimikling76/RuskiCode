import {escapeHtml} from '@/lib/books/layout-html';
import type {PageBlock} from './operations';

// New pages for an imported PDF, as HTML that Stirling turns into PDF (WeasyPrint).
// Stirling cleans the HTML it receives: <style> blocks, <font> tags and embedded images are removed,
// and only `style` attributes survive (checked on Stirling 3.2.0). So every element carries its own style.
// The page size is Stirling's default (A4) because @page rules are removed too.

const FONT = "'DejaVu Sans', 'Noto Sans', 'Liberation Sans', Arial, sans-serif";
const INK = '#1f2328';

const css = (rules: Record<string, string | number>) => Object.entries(rules).map(([k, v]) => k + ':' + v).join(';');
const text = (value: string) => escapeHtml(value).replace(/\n/g, '<br>');

export function pageHtml(blocks: PageBlock[], options: {accent?: string; lang?: string} = {}) {
  const accent = options.accent && /^#[0-9a-fA-F]{6}$/.test(options.accent) ? options.accent : '#216B5C';
  const base = {'font-family': FONT, color: INK, 'font-size': '11pt', 'line-height': 1.45};
  const body = blocks.map(block => {
    switch (block.type) {
      case 'heading': {
        const size = block.level === 1 ? '20pt' : block.level === 2 ? '15pt' : '12.5pt';
        const tag = 'h' + Math.min(3, block.level);
        return `<${tag} style="${css({...base, 'font-size': size, 'line-height': 1.2, color: block.level === 1 ? accent : INK, 'font-weight': 'bold', margin: '0 0 8pt'})}">${text(block.text)}</${tag}>`;
      }
      case 'paragraph':
        return `<p style="${css({...base, margin: '0 0 7pt'})}">${text(block.text)}</p>`;
      case 'callout':
        return `<div style="${css({...base, margin: '6pt 0 10pt', padding: '8pt 10pt', 'border-left': '3pt solid ' + accent, background: '#f2f6f4'})}">${text(block.text)}</div>`;
      case 'exercise':
        return `<div style="${css({margin: '8pt 0 10pt'})}"><p style="${css({...base, 'font-weight': 'bold', margin: '0 0 4pt'})}">${text(block.instruction)}</p>`
          + `<ol style="${css({...base, margin: '0', padding: '0 0 0 18pt'})}">${block.items.map(item => `<li style="${css({...base, margin: '0 0 3pt'})}">${text(item)}</li>`).join('')}</ol></div>`;
      case 'table': {
        const cell = {...base, 'font-size': '10.5pt', border: '0.75pt solid #9aa3a0', padding: '4pt 7pt', 'text-align': 'left', 'vertical-align': 'top'};
        return `<table style="${css({'border-collapse': 'collapse', width: '100%', margin: '6pt 0 10pt'})}"><tr>${block.headers.map(h => `<th style="${css({...cell, 'font-weight': 'bold', background: '#e8f0ed'})}">${text(h)}</th>`).join('')}</tr>`
          + block.rows.map(row => `<tr>${row.map(c => `<td style="${css(cell)}">${text(c)}</td>`).join('')}</tr>`).join('') + '</table>';
      }
      case 'writing': {
        const lines = Math.max(1, Math.min(10, Math.round(block.lines)));
        return `<div style="${css({margin: '6pt 0 10pt'})}"><p style="${css({...base, 'font-size': '15pt', margin: '0 0 4pt'})}">${text(block.text)}</p>`
          + `<div style="${css({height: '22pt', 'border-bottom': '0.75pt solid #9aa3a0'})}"></div>`.repeat(lines) + '</div>';
      }
    }
  }).join('\n');
  const lang = options.lang && /^[a-z]{2}$/.test(options.lang) ? options.lang : 'ru';
  return `<!doctype html>\n<html lang="${lang}"><head><meta charset="utf-8"><title>Página nueva</title></head><body>\n<div style="${css(base)}">\n${body}\n</div>\n</body></html>`;
}
