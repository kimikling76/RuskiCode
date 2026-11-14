'use client';
import {useEffect, useMemo, useRef, useState} from 'react';
import Link from 'next/link';
import {Copy, Eye, Square} from 'lucide-react';
import {toast} from 'sonner';
import {textAnswer, usageLabelOf} from '@/lib/ai/text-request';
import {errorDetail} from '@/lib/cinema/errors';
import {fetchEditorFonts, type EditorFonts} from '@/lib/manual/fonts';
import type {Unit} from '@/lib/manual/model';
import {pagePicture} from '@/lib/manual/page-picture';
import {listUnits} from '@/lib/manual/store';
import {localPreview} from '@/lib/personal-chat/attach-browser';
import {estimateText, textEstimate} from '@/lib/personal-chat/estimate';
import {usePersonal} from '@/store/personal-chat';
import {ConfirmDialog} from '@/components/ui/dialog';
import {ChatModelPicker, usable, type ChatModel} from '@/components/studio/chat-model-picker';
import {NavTrigger} from '@/components/studio/sidebar';
import {useTextModels} from '@/components/pdf/use-doc-chat';

// A one-off comparison before choosing the model that looks at a page: the same three pages of a unit go, as
// pictures, to two models that see images, and their answers are shown side by side. Six requests at most, each one
// asked only after the author confirms with the estimate in view. Answers stay in this browser.

const PAGES = 3;
const LIMIT = PAGES * 2;
const STORE = 'rc-model-compare-v1';
type Answer = {text: string; model: string; credits?: number};
/** `sent`: requests that left for Kie, answered or not: the limit counts them all. */
type Saved = {unitId: string; pages: number[]; a: string; b: string; answers: Record<string, Answer>; sent: number};
const cell = (page: number, model: string) => page + '|' + model;
const reviewLabel = usageLabelOf('manual-review');
const critiqueLabel = usageLabelOf('page-critique');

function load(): Saved | null {
  try { const v = JSON.parse(localStorage.getItem(STORE) || 'null'); return v && typeof v.unitId === 'string' && Array.isArray(v.pages) && v.answers ? v : null; } catch { return null; }
}

export function ModelCompare() {
  const {models, failed} = useTextModels();
  const usage = usePersonal(s => s.data.usage);
  const seeing = useMemo(() => models.filter(m => usable(m) && m.inputs?.includes('image')), [models]);
  const [units, setUnits] = useState<Unit[] | null>(null);
  const [fonts, setFonts] = useState<EditorFonts | null>(null);
  const [unitId, setUnitId] = useState('');
  const [pages, setPages] = useState<number[]>([]);
  const [a, setA] = useState('kie-pro');
  const [b, setB] = useState('');
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [sent, setSent] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pictures, setPictures] = useState<Record<number, string>>({});
  /** How many requests the open confirmation is about (0: closed). The first page alone is 2. */
  const [asking, setAsking] = useState(0);
  const [busy, setBusy] = useState('');
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    const saved = load();
    if (saved) { setUnitId(saved.unitId); setPages(saved.pages); setA(saved.a); setB(saved.b); setAnswers(saved.answers); setSent(typeof saved.sent === 'number' ? saved.sent : Object.keys(saved.answers).length); }
    listUnits().then(setUnits).catch(() => setUnits([]));
    fetchEditorFonts().then(setFonts).catch(() => setFonts(null));
  }, []);
  // The second model: a GPT that sees images, the newest one listed, until the author picks another.
  useEffect(() => {
    if (b || !seeing.length) return;
    const gpt = seeing.filter(m => m.id.startsWith('gpt-')).map(m => m.id).sort().pop();
    setB(gpt || seeing.find(m => m.id !== a)?.id || '');
  }, [seeing, a, b]);

  const unit = units?.find(u => u.id === unitId) || null;
  const done = Object.keys(answers).length;
  const locked = sent > 0;
  const modelOf = (id: string): ChatModel | undefined => models.find(m => m.id === id);
  const nameOf = (id: string) => modelOf(id)?.name || id;
  const pending = pages.flatMap(p => [a, b].filter(Boolean).map(m => ({page: p, model: m}))).filter(c => !answers[cell(c.page, c.model)]);
  const allowed = Math.max(0, LIMIT - sent);
  const ready = Boolean(unit && fonts && pages.length === PAGES && a && b && a !== b);

  function save(next: Record<string, Answer>, count: number) {
    setAnswers(next);
    setSent(count);
    try { localStorage.setItem(STORE, JSON.stringify({unitId, pages, a, b, answers: next, sent: count} satisfies Saved)); } catch {}
  }
  function togglePage(i: number) {
    if (locked) return;
    setPages(p => p.includes(i) ? p.filter(x => x !== i) : p.length < PAGES ? [...p, i].sort((x, y) => x - y) : p);
  }

  /** What one request to this model usually costs: its own history, or the page reviews of the manual (the same kind of request). */
  function estimateFor(model: string) {
    const own = textEstimate(usage, critiqueLabel, model);
    if (own) return {credits: own.credits, text: estimateText(own, ' por página')};
    const like = textEstimate(usage, reviewLabel, model);
    if (like) return {credits: like.credits, text: '≈ ' + like.credits.toLocaleString('es-AR') + ' créditos por página (según ' + (like.from === 1 ? 'tu última revisión' : 'tus últimas ' + like.from + ' revisiones') + ' de página con este modelo, que es un pedido parecido)'};
    return {credits: null, text: 'Sin historia con este modelo: Kie no publica su precio y lo vas a ver al terminar el primer pedido.'};
  }
  const perA = estimateFor(a), perB = estimateFor(b);
  const inBatch = pending.slice(0, Math.min(asking, allowed));
  const countA = inBatch.filter(c => c.model === a).length, countB = inBatch.filter(c => c.model === b).length;
  const total = perA.credits !== null && perB.credits !== null ? Math.round((perA.credits * countA + perB.credits * countB) * 10) / 10 : null;

  async function run() {
    if (!unit || !fonts) return;
    const batch = pending.slice(0, Math.min(asking, allowed));
    setAsking(0);
    const controller = new AbortController();
    abort.current = controller;
    let current = answers, count = sent;
    const shots: Record<number, Awaited<ReturnType<typeof pagePicture>>> = {};
    try {
      for (const c of batch) {
        if (controller.signal.aborted) break;
        const key = cell(c.page, c.model);
        setBusy(key);
        setErrors(e => { const {[key]: _, ...rest} = e; return rest; });
        try {
          const shot = shots[c.page] ??= await pagePicture(unit, fonts, c.page);
          const src = localPreview(shot.hash);
          if (src) setPictures(p => ({...p, [c.page]: src}));
          save(current, ++count);
          const r = await textAnswer('page-critique', 'PAGE\nPágina ' + (c.page + 1) + ' de ' + unit.pages.length + ' de una unidad del manual. Va adjunta su imagen, tal como se imprime.', {signal: controller.signal, model: c.model, attachments: [shot]});
          if (!r.text.trim()) throw Error('EMPTY_ANSWER');
          current = {...current, [key]: {text: r.text, model: r.model || nameOf(c.model), ...(r.credits !== undefined ? {credits: r.credits} : {})}};
          save(current, count);
        } catch (e) {
          if (controller.signal.aborted) break;
          const code = e instanceof Error ? e.message : 'PROVIDER_UNAVAILABLE';
          setErrors(x => ({...x, [key]: code === 'EMPTY_ANSWER' ? 'El modelo contestó sin texto.' : errorDetail(code)}));
        }
      }
    } finally { setBusy(''); abort.current = null; }
  }

  async function copy() {
    const spent = Object.values(answers).reduce((n, x) => n + (x.credits || 0), 0);
    const text = pages.map(p => [a, b].map(m => { const r = answers[cell(p, m)]; return '=== Página ' + (p + 1) + ' · ' + nameOf(m) + (r?.credits !== undefined ? ' · ' + r.credits + ' créditos' : '') + ' ===\n' + (r?.text || '(sin respuesta)'); }).join('\n\n')).join('\n\n') + '\n\nTotal informado por Kie: ' + spent + ' créditos. Pedidos enviados: ' + sent + ', con respuesta: ' + done + '.';
    try { await navigator.clipboard.writeText(text); toast('Resultados copiados. Pegalos en el chat con Claude.'); } catch { toast('No se pudo copiar. Seleccioná el texto a mano.'); }
  }

  const spent = Object.values(answers).reduce((n, x) => n + (x.credits || 0), 0);
  return (
    <div className="rc-settings">
      <header className="rc-topbar rc-topbar--mobile-only">
        <NavTrigger />
        <div className="rc-studio-identity"><Eye aria-hidden="true" />Comparar modelos</div>
      </header>
      <div className="rc-main-scroll rc-settings-scroll">
        <div className="rc-settings-page rc-cmp">
          <h1 className="rc-page-title rc-settings-title">Comparar dos modelos que ven la página</h1>
          <p className="rc-page-lead">Tres páginas de una unidad van, como imagen, a dos modelos. Cada uno dice qué funciona, qué problemas ve y qué cambiaría. Son {LIMIT} pedidos a Kie como máximo, y ninguno sale sin que confirmes.</p>

          {units === null ? <div className="rc-history-loading" role="status" aria-label="Cargando"><span className="rc-skeleton" /></div>
            : !units.length ? <p className="rc-hint">Todavía no hay unidades del manual en esta cuenta. Importá una en <Link href="/workspace?studio=pdf">PDF Studio</Link> y volvé.</p>
            : (
              <>
                <section className="rc-cmp-setup" aria-label="Qué comparar">
                  <div className="rc-field">
                    <label htmlFor="cmp-unit">Unidad</label>
                    <select id="cmp-unit" className="rc-input" value={unitId} disabled={locked} onChange={e => { setUnitId(e.target.value); setPages([]); }}>
                      <option value="">Elegí una unidad</option>
                      {units.map(u => <option key={u.id} value={u.id}>{u.title} · {u.pages.length} páginas</option>)}
                    </select>
                  </div>
                  {unit ? (
                    <fieldset className="rc-field rc-cmp-pages" disabled={locked}>
                      <legend>Páginas ({pages.length} de {PAGES})</legend>
                      <div className="rc-pdf-inline">
                        {unit.pages.map((p, i) => (
                          <button key={p.id} type="button" className={'rc-btn rc-btn--sm ' + (pages.includes(i) ? 'rc-btn--secondary' : 'rc-btn--ghost')} aria-pressed={pages.includes(i)} disabled={!pages.includes(i) && pages.length >= PAGES} onClick={() => togglePage(i)}>{i + 1}</button>
                        ))}
                      </div>
                    </fieldset>
                  ) : null}
                  <div className="rc-cmp-models">
                    <div className="rc-field">
                      <span className="rc-label">Modelo A</span>
                      {seeing.length ? <ChatModelPicker models={seeing} value={a} onChange={setA} disabled={locked} allowAuto={false} title="Modelo A" /> : <span className="rc-hint">{failed ? 'No se pudo leer la lista de modelos.' : 'Cargando modelos…'}</span>}
                      <p className="rc-hint">{perA.text}</p>
                    </div>
                    <div className="rc-field">
                      <span className="rc-label">Modelo B</span>
                      {seeing.length ? <ChatModelPicker models={seeing} value={b} onChange={setB} disabled={locked} allowAuto={false} title="Modelo B" /> : null}
                      <p className="rc-hint">{perB.text}</p>
                    </div>
                  </div>
                  {a && a === b ? <p className="rc-hint" role="alert">Elegí dos modelos distintos.</p> : null}
                  {locked ? <p className="rc-hint">La unidad, las páginas y los modelos quedan fijos desde el primer pedido, para que la comparación sea pareja.</p> : null}
                </section>

                <div className="rc-cmp-bar">
                  <p className="rc-hint" role="status">
                    {sent} de {LIMIT} pedidos enviados · {done} con respuesta{done ? ' · ' + spent.toLocaleString('es-AR') + ' créditos informados por Kie' : ''}.
                    {sent >= LIMIT ? ' No se piden más.' : ''}
                  </p>
                  <span className="rc-pdf-inline">
                    {busy ? <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" onClick={() => abort.current?.abort()}><Square aria-hidden="true" />Detener</button>
                      : pending.length && allowed ? (
                        <>
                          {!sent ? <button type="button" className="rc-btn rc-btn--secondary" disabled={!ready} onClick={() => setAsking(2)}>Probar con la primera página (2 pedidos)…</button> : null}
                          <button type="button" className="rc-btn rc-btn--primary" disabled={!ready} onClick={() => setAsking(LIMIT)}>{sent ? 'Pedir lo que falta…' : 'Ver el precio y pedir los 6…'}</button>
                        </>
                      ) : null}
                    {done ? <button type="button" className="rc-btn rc-btn--secondary rc-btn--sm" onClick={() => void copy()}><Copy aria-hidden="true" />Copiar resultados</button> : null}
                  </span>
                </div>

                {pages.map(p => (
                  <section key={p} className="rc-cmp-row" aria-label={'Página ' + (p + 1)}>
                    <div className="rc-cmp-page">
                      <h2>Página {p + 1}</h2>
                      {pictures[p] ? <img src={pictures[p]} alt={'Página ' + (p + 1) + ' tal como la recibieron los modelos'} /> : <p className="rc-hint">La imagen aparece cuando se hace el pedido.</p>}
                    </div>
                    {[a, b].filter(Boolean).map(m => {
                      const key = cell(p, m), r = answers[key];
                      return (
                        <article key={m} className="rc-cmp-answer">
                          <h3>{nameOf(m)}</h3>
                          {r ? <><p className="rc-cmp-text">{r.text}</p><p className="rc-hint">{r.model}{r.credits !== undefined ? ' · ' + r.credits + ' créditos' : ' · Kie no informó el costo'}</p></>
                            : busy === key ? <p className="rc-hint" role="status">Mirando la página…</p>
                            : errors[key] ? <p className="rc-hint" role="alert">No respondió: {errors[key]} El pedido cuenta igual entre los {LIMIT}.</p>
                            : <p className="rc-hint">Sin pedir todavía.</p>}
                        </article>
                      );
                    })}
                  </section>
                ))}
              </>
            )}
        </div>
      </div>

      <ConfirmDialog
        open={asking > 0} onClose={() => setAsking(0)} onConfirm={() => void run()}
        title={'¿Hacer ' + inBatch.length + ' pedidos a Kie?'}
        confirmLabel={'Hacer ' + inBatch.length + ' pedidos'}
        description={'Cada pedido manda la imagen de una página a un modelo. La imagen se sube al almacenamiento temporal de Kie, que la borra a las 24 horas.'}
      >
        <ul className="rc-cmp-cost">
          <li><strong>{nameOf(a)}</strong>: {countA} {countA === 1 ? 'pedido' : 'pedidos'}. {perA.text}</li>
          <li><strong>{nameOf(b)}</strong>: {countB} {countB === 1 ? 'pedido' : 'pedidos'}. {perB.text}</li>
          <li><strong>Total estimado</strong>: {total !== null ? '≈ ' + total.toLocaleString('es-AR') + ' créditos.' : 'no se puede calcular todavía, porque falta historia de al menos un modelo. Si preferís saberlo antes, cancelá y probá primero con la primera página: después de eso el estudio ya tiene el precio real de cada modelo.'}</li>
        </ul>
        <p className="rc-hint">Es una estimación hecha con lo que Kie te cobró antes. El costo real aparece junto a cada respuesta. Después de {LIMIT} pedidos, esta página no pide más.</p>
      </ConfirmDialog>
    </div>
  );
}
