'use client';
import {useEffect, useState} from 'react';
import type {BookSpec} from '@/lib/books/spec';
import {Segmented} from '@/components/cinema/controls';
import type {EditorApi} from './editor-api';

const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(v) ? v : min));

/** Cover and design. Ranges match the book specification the composer validates. */
export function BookPanel({api}: {api: EditorApi}) {
  const spec = api.book.spec;
  const d = spec.designTokens;
  const tokens = (patch: Partial<BookSpec['designTokens']>, key: string) => api.updateSpec({designTokens: {...d, ...patch}}, 'design:' + key);
  const margins = (patch: Partial<BookSpec['marginsMm']>) => api.updateSpec({marginsMm: {...spec.marginsMm, ...patch}}, 'margins');

  return (
    <div className="rc-pdf-form">
      <div className="rc-pdf-form-head"><span className="rc-pdf-kind">Portada</span></div>
      <label className="rc-field"><span>Título</span>
        <input className="rc-input" maxLength={200} value={spec.title} onChange={e => api.updateSpec({title: e.target.value}, 'title')} />
        {!spec.title.trim() ? <small className="rc-pdf-warn">El título no puede quedar vacío.</small> : null}
      </label>
      <label className="rc-field"><span>Subtítulo</span><input className="rc-input" maxLength={300} value={spec.subtitle} onChange={e => api.updateSpec({subtitle: e.target.value}, 'subtitle')} /></label>
      <label className="rc-field"><span>Autor</span><input className="rc-input" maxLength={200} value={spec.author} onChange={e => api.updateSpec({author: e.target.value}, 'author')} /></label>
      <div className="rc-field"><span>Nivel</span>
        <Segmented name="book-level" label="Nivel" value={spec.level} onChange={level => api.updateSpec({level}, 'level')} options={levels.map(l => ({value: l, label: l}))} />
      </div>

      <div className="rc-pdf-form-head rc-pdf-form-head--section"><span className="rc-pdf-kind">Diseño</span></div>
      <div className="rc-pdf-two">
        <label className="rc-field"><span>Color principal</span><input type="color" className="rc-pdf-color" value={d.primary} onChange={e => tokens({primary: e.target.value}, 'primary')} /></label>
        <label className="rc-field"><span>Color de acento</span><input type="color" className="rc-pdf-color" value={d.accent} onChange={e => tokens({accent: e.target.value}, 'accent')} /></label>
      </div>
      <div className="rc-pdf-two">
        <Num label="Texto (pt)" value={d.bodySizePt} min={8} max={24} step={0.5} onChange={v => tokens({bodySizePt: v}, 'body')} />
        <Num label="Títulos (pt)" value={d.headingSizePt} min={12} max={60} step={1} onChange={v => tokens({headingSizePt: v}, 'heading')} />
      </div>
      <div className="rc-pdf-two">
        <Num label="Interlineado" value={d.lineHeight} min={1} max={2.5} step={0.05} onChange={v => tokens({lineHeight: v}, 'line')} />
        <div className="rc-field"><span>Columnas de listas</span>
          <Segmented name="columns" label="Columnas" value={d.columns} onChange={columns => tokens({columns}, 'columns')} options={[1, 2, 3].map(n => ({value: n, label: String(n)}))} />
        </div>
      </div>

      <div className="rc-pdf-form-head rc-pdf-form-head--section"><span className="rc-pdf-kind">Página</span></div>
      <div className="rc-field"><span>Formato</span>
        <Segmented name="format" label="Formato" value={spec.pageFormat} onChange={pageFormat => api.updateSpec({pageFormat}, 'format')} options={[{value: 'A4', label: 'A4'}, {value: 'A5', label: 'A5'}, {value: '6x9in', label: '6 × 9 in'}]} />
      </div>
      <div className="rc-pdf-two">
        <Num label="Margen superior (mm)" value={spec.marginsMm.top} min={8} max={40} step={1} onChange={top => margins({top})} />
        <Num label="Margen inferior (mm)" value={spec.marginsMm.bottom} min={8} max={40} step={1} onChange={bottom => margins({bottom})} />
      </div>
      <div className="rc-pdf-two">
        <Num label="Margen izquierdo (mm)" value={spec.marginsMm.left} min={8} max={40} step={1} onChange={left => margins({left})} />
        <Num label="Margen derecho (mm)" value={spec.marginsMm.right} min={8} max={40} step={1} onChange={right => margins({right})} />
      </div>
    </div>
  );
}

function Num({label, value, min, max, step, onChange}: {label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void}) {
  // Typing «12» passes through «1»: only commit values in range, and restore on blur.
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);
  return (
    <label className="rc-field"><span>{label}</span>
      <input
        className="rc-input" type="number" inputMode="decimal" min={min} max={max} step={step} value={text}
        onChange={e => { setText(e.target.value); const v = parseFloat(e.target.value); if (Number.isFinite(v) && v >= min && v <= max) onChange(v); }}
        onBlur={() => { const v = clamp(parseFloat(text), min, max); setText(String(v)); if (v !== value) onChange(v); }}
      />
    </label>
  );
}
