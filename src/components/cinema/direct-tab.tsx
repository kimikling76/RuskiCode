'use client';
import {useEffect, useMemo, useRef, useState} from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import {DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent} from '@dnd-kit/core';
import {SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable, arrayMove} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';
import {GripVertical, MoreHorizontal, Plus, ChevronRight} from 'lucide-react';
import {useCinema, isActive, isDone, type Board, type CinemaJob, type Shot} from '@/store/cinema';
import {useCinemaUi} from '@/store/cinema-ui';
import {imageModel, ratioValue, type AspectRatio} from '@/lib/cinema/capabilities';
import {startGeneration, textRequest} from '@/lib/cinema/client';
import {errorDetail} from '@/lib/cinema/errors';
import {parsePlan} from '@/lib/cinema/plan';
import {Menu, MenuTrigger, MenuContent, MenuItem, MenuSeparator} from '@/components/ui/menu';
import {ConfirmDialog} from '@/components/ui/dialog';
import {AspectPicker, Field} from './controls';
import {Elapsed, KieImage, credits} from './job-card';

const SHOT_RESOLUTION = '1K' as const;
const boardAspects: AspectRatio[] = ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9'];
const dateFormat = new Intl.DateTimeFormat('es-AR', {day: 'numeric', month: 'short'});

export type CinemaProject = {id: string; name: string; brief: string};

export function DirectTab({projects, legacy, onOpenLegacy}: {projects: CinemaProject[]; legacy: {id: string; brief: string}[]; onOpenLegacy: (id: string) => void}) {
  const boards = useCinema(s => s.data.boards);
  const saveBoard = useCinema(s => s.saveBoard);
  const boardId = useCinemaUi(s => s.boardId);
  const setBoard = useCinemaUi(s => s.setBoard);
  const [idea, setIdea] = useState('');
  const [aspect, setAspect] = useState<AspectRatio>('16:9');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const abort = useRef<AbortController | null>(null);
  const board = boards.find(b => b.id === boardId) || null;

  useEffect(() => () => abort.current?.abort(), []);

  async function createPlan() {
    if (!idea.trim() || busy) return;
    setBusy(true); setError('');
    const controller = new AbortController();
    abort.current = controller;
    try {
      const plan = parsePlan(await textRequest('storyboard', idea.trim(), controller.signal));
      if (!plan) throw Error('INVALID_PLAN');
      const now = Date.now();
      const next: Board = {
        id: crypto.randomUUID(), title: plan.title, idea: idea.trim(), script: plan.script, aspect,
        shots: plan.shots.map(s => ({id: crypto.randomUUID(), ...s})), createdAt: now, updatedAt: now,
      };
      saveBoard(next);
      setBoard(next.id);
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'PROVIDER_UNAVAILABLE');
    } finally {
      setBusy(false);
      abort.current = null;
    }
  }

  return (
    <div className="rc-cine-layout">
      <section className="rc-cine-panel" aria-label="Idea y planes">
        <div className="rc-cine-panel-scroll">
          <Field label="Idea" hint="El modelo de chat propone guion y planos. Usa Kie y puede consumir créditos.">
            <TextareaAutosize
              aria-label="Idea"
              className="rc-textarea rc-cine-prompt"
              minRows={4}
              maxRows={12}
              maxLength={6000}
              value={idea}
              disabled={busy}
              onChange={e => setIdea(e.target.value)}
              placeholder="De qué se trata, para quién es y cuánto debería durar"
            />
          </Field>
          {projects.length ? (
            <Field label="Partir de un proyecto">
              <ul className="rc-cine-list">
                {projects.map(p => (
                  <li key={p.id}><button type="button" onClick={() => setIdea(p.name + '\n\n' + p.brief)}><span>{p.name}</span><ChevronRight aria-hidden="true" /></button></li>
                ))}
              </ul>
            </Field>
          ) : null}
          <Field label="Formato de los planos"><AspectPicker name="board-aspect" value={aspect} onChange={setAspect} options={boardAspects} /></Field>
          {error ? (
            <div className="rc-msg-error" role="alert">
              <span className="rc-dot rc-dot--danger" aria-hidden="true" />
              <span className="rc-msg-error-text">No pude armar el plan.</span>
              <details className="rc-msg-error-details"><summary>Detalles</summary><p>{errorDetail(error)}</p></details>
            </div>
          ) : null}
          {boards.length ? (
            <Field label="Planes">
              <ul className="rc-cine-list">
                {boards.map(b => (
                  <li key={b.id}>
                    <button type="button" aria-current={b.id === boardId ? 'true' : undefined} onClick={() => setBoard(b.id)}>
                      <span>{b.title}</span><small>{b.shots.length} planos · {dateFormat.format(new Date(b.updatedAt))}</small>
                    </button>
                  </li>
                ))}
              </ul>
            </Field>
          ) : null}
          {legacy.length ? (
            <Field label="Herramientas anteriores">
              <ul className="rc-cine-list">
                {legacy.map(p => <li key={p.id}><button type="button" onClick={() => onOpenLegacy(p.id)}><span>{p.brief}</span><ChevronRight aria-hidden="true" /></button></li>)}
              </ul>
            </Field>
          ) : null}
        </div>
        <div className="rc-cine-generate">
          <button type="button" className="rc-btn rc-btn--primary" disabled={busy || !idea.trim()} onClick={createPlan}>{busy ? 'Armando el plan…' : 'Crear plan'}</button>
        </div>
      </section>

      <section className="rc-cine-stage rc-cine-stage--board" tabIndex={0} aria-label="Plan">
        {board ? <BoardView key={board.id} board={board} /> : (
          <div className="rc-cine-empty">
            <div className="rc-cine-empty-frame rc-cine-empty-frame--wide" aria-hidden="true" />
            <p>Escribí una idea y el plan aparece acá: guion, lista de planos y una imagen por plano.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function BoardView({board}: {board: Board}) {
  const saveBoard = useCinema(s => s.saveBoard);
  const removeBoard = useCinema(s => s.removeBoard);
  const allJobs = useCinema(s => s.data.jobs);
  const setBoard = useCinemaUi(s => s.setBoard);
  const askFirst = useCinemaUi(s => s.askFirst);
  const [pending, setPending] = useState<Shot[] | null>(null);
  const [remove, setRemove] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, {activationConstraint: {distance: 4}}), useSensor(KeyboardSensor, {coordinateGetter: sortableKeyboardCoordinates}));

  const latest = useMemo(() => {
    const map = new Map<string, CinemaJob>();
    for (const job of allJobs) if (job.boardId === board.id && job.shotId && !map.has(job.shotId)) map.set(job.shotId, job);
    return map;
  }, [allJobs, board.id]);

  function update(patch: Partial<Board>) { saveBoard({...board, ...patch, updatedAt: Date.now()}); }
  function updateShot(id: string, patch: Partial<Shot>) { update({shots: board.shots.map(s => s.id === id ? {...s, ...patch} : s)}); }
  function move(id: string, by: number) {
    const i = board.shots.findIndex(s => s.id === id);
    const j = i + by;
    if (i < 0 || j < 0 || j >= board.shots.length) return;
    update({shots: arrayMove(board.shots, i, j)});
  }
  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const from = board.shots.findIndex(s => s.id === e.active.id);
    const to = board.shots.findIndex(s => s.id === e.over!.id);
    update({shots: arrayMove(board.shots, from, to)});
  }

  async function run(shots: Shot[]) {
    // Spaced out so a long plan stays under the per-10-seconds limit for new Kie tasks.
    for (const [i, shot] of shots.entries()) {
      if (i) await new Promise(r => setTimeout(r, 1300));
      void startGeneration({mode: 'shot', prompt: shot.prompt.trim(), aspect: board.aspect, resolution: SHOT_RESOLUTION, references: [], count: 1, boardId: board.id, shotId: shot.id});
    }
  }
  function request(shots: Shot[]) {
    const ready = shots.filter(s => s.prompt.trim());
    if (!ready.length) return;
    if (askFirst) setPending(ready); else void run(ready);
  }

  const missing = board.shots.filter(s => {
    const job = latest.get(s.id);
    return s.prompt.trim() && (!job || job.state === 'error' || job.state === 'fail');
  });

  return (
    <div className="rc-board">
      <header className="rc-board-head">
        <input className="rc-board-title" aria-label="Título del plan" value={board.title} maxLength={120} onChange={e => update({title: e.target.value})} />
        <Menu>
          <MenuTrigger asChild><button type="button" className="rc-icon-btn" aria-label="Opciones del plan"><MoreHorizontal /></button></MenuTrigger>
          <MenuContent>
            <MenuItem danger onSelect={() => setRemove(true)}>Borrar plan</MenuItem>
          </MenuContent>
        </Menu>
      </header>
      <label className="rc-field rc-board-script">
        <span>Guion</span>
        <TextareaAutosize className="rc-textarea" minRows={2} maxRows={10} value={board.script} onChange={e => update({script: e.target.value})} />
      </label>

      <div className="rc-board-bar">
        <span className="rc-hint">{board.shots.length} planos · {board.aspect} · {imageModel.name} · {SHOT_RESOLUTION}</span>
        <button type="button" className="rc-btn rc-btn--secondary rc-btn--sm" disabled={!missing.length} onClick={() => request(missing)}>
          {missing.length ? 'Generar ' + missing.length + (missing.length === 1 ? ' imagen' : ' imágenes') : 'Todos los planos tienen imagen'}
        </button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
        accessibility={{
          screenReaderInstructions: {draggable: 'Para mover un plano, apretá espacio, usá las flechas y apretá espacio otra vez para soltarlo. Escape cancela.'},
          announcements: {
            onDragStart: ({active}) => 'Moviendo el plano ' + (board.shots.findIndex(s => s.id === active.id) + 1),
            onDragOver: ({over}) => over ? 'Sobre la posición ' + (board.shots.findIndex(s => s.id === over.id) + 1) : '',
            onDragEnd: ({over}) => over ? 'Plano soltado en la posición ' + (board.shots.findIndex(s => s.id === over.id) + 1) : 'Plano soltado',
            onDragCancel: () => 'Movimiento cancelado',
          },
        }}
      >
        <SortableContext items={board.shots.map(s => s.id)} strategy={verticalListSortingStrategy}>
          <ol className="rc-shots">
            {board.shots.map((shot, i) => (
              <ShotRow
                key={shot.id}
                shot={shot}
                index={i}
                total={board.shots.length}
                aspect={board.aspect}
                job={latest.get(shot.id)}
                onChange={patch => updateShot(shot.id, patch)}
                onMove={by => move(shot.id, by)}
                onRemove={() => update({shots: board.shots.filter(s => s.id !== shot.id)})}
                onGenerate={() => request([shot])}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm rc-board-add" onClick={() => update({shots: [...board.shots, {id: crypto.randomUUID(), title: 'Plano nuevo', description: '', prompt: ''}]})}>
        <Plus aria-hidden="true" />Agregar plano
      </button>

      <ConfirmDialog
        open={Boolean(pending)}
        onClose={() => setPending(null)}
        onConfirm={() => { if (pending) void run(pending); setPending(null); }}
        title="¿Generar en Kie?"
        description="Cada plano es una tarea en Kie y consume créditos. El costo real aparece al terminar, cuando Kie lo informa."
        confirmLabel={pending && pending.length > 1 ? 'Generar ' + pending.length : 'Generar'}
      >
        <dl className="rc-facts">
          <dt>Modelo</dt><dd>{imageModel.name}</dd>
          <dt>Imágenes</dt><dd>{pending?.length || 0}</dd>
          <dt>Formato</dt><dd>{board.aspect}</dd>
          <dt>Resolución</dt><dd>{SHOT_RESOLUTION}</dd>
        </dl>
      </ConfirmDialog>
      <ConfirmDialog
        open={remove}
        onClose={() => setRemove(false)}
        onConfirm={() => { removeBoard(board.id); setBoard(null); setRemove(false); }}
        title="¿Borrar este plan?"
        description="Se borran el guion y los planos de este navegador. Las imágenes generadas siguen en la galería."
        confirmLabel="Borrar plan"
        tone="danger"
      />
    </div>
  );
}

function ShotRow({shot, index, total, aspect, job, onChange, onMove, onRemove, onGenerate}: {shot: Shot; index: number; total: number; aspect: AspectRatio; job?: CinemaJob; onChange: (p: Partial<Shot>) => void; onMove: (by: number) => void; onRemove: () => void; onGenerate: () => void}) {
  const {attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging} = useSortable({id: shot.id});
  const active = job && isActive(job);
  const failed = job && (job.state === 'error' || job.state === 'fail');
  return (
    <li ref={setNodeRef} className="rc-shot" data-dragging={isDragging ? 'true' : undefined} style={{transform: CSS.Transform.toString(transform), transition}}>
      <div className="rc-shot-side">
        <button type="button" ref={setActivatorNodeRef} className="rc-icon-btn rc-icon-btn--sm rc-shot-handle" aria-label={'Mover el plano ' + (index + 1)} {...attributes} {...listeners}>
          <GripVertical />
        </button>
        <span className="rc-shot-num">{String(index + 1).padStart(2, '0')}</span>
      </div>
      <div className="rc-shot-frame" style={{aspectRatio: String(ratioValue(aspect))}}>
        {job && isDone(job) ? <KieImage src={job.urls[0]} alt={shot.title} /> : active ? (
          <span className="rc-job-status" role="status"><span className="rc-job-pulse" aria-hidden="true" />{job.state === 'generating' ? 'Generando' : job.state === 'sending' ? 'Enviando' : 'En cola'}<Elapsed since={job.createdAt} /></span>
        ) : failed ? (
          <span className="rc-shot-failed" role="alert"><span className="rc-dot rc-dot--danger" aria-hidden="true" />No pude generarla</span>
        ) : null}
      </div>
      <div className="rc-shot-body">
        <input className="rc-shot-title" aria-label={'Título del plano ' + (index + 1)} value={shot.title} maxLength={120} onChange={e => onChange({title: e.target.value})} />
        <TextareaAutosize className="rc-shot-desc" aria-label={'Descripción del plano ' + (index + 1)} minRows={1} maxRows={6} value={shot.description} onChange={e => onChange({description: e.target.value})} placeholder="Qué pasa en este plano" />
        <label className="rc-field">
          <span>Prompt</span>
          <TextareaAutosize className="rc-textarea" minRows={2} maxRows={8} value={shot.prompt} onChange={e => onChange({prompt: e.target.value})} />
        </label>
        <div className="rc-shot-bar">
          <span className="rc-job-meta">{imageModel.name}{job?.credits !== undefined ? ' · ' + credits(job.credits) : ''}</span>
          <span className="rc-shot-actions">
            <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" disabled={!shot.prompt.trim() || Boolean(active)} onClick={onGenerate}>
              {failed ? 'Reintentar' : job && isDone(job) ? 'Generar otra' : 'Generar imagen'}
            </button>
            <Menu>
              <MenuTrigger asChild><button type="button" className="rc-icon-btn rc-icon-btn--sm" aria-label={'Opciones del plano ' + (index + 1)}><MoreHorizontal /></button></MenuTrigger>
              <MenuContent>
                <MenuItem disabled={index === 0} onSelect={() => onMove(-1)}>Subir</MenuItem>
                <MenuItem disabled={index === total - 1} onSelect={() => onMove(1)}>Bajar</MenuItem>
                <MenuSeparator />
                <MenuItem danger onSelect={onRemove}>Borrar plano</MenuItem>
              </MenuContent>
            </Menu>
          </span>
        </div>
        {failed && job?.error ? <p className="rc-hint">{errorDetail(job.error)}{job.failMessage ? ' Kie: «' + job.failMessage + '»' : ''}</p> : null}
      </div>
    </li>
  );
}

