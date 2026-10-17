'use client';
import {create} from 'zustand';
import {tokenOf} from '@/lib/sync/canonical';

const KEY = 'rc-assistants-v1';
const SEEDED = 'rc-assistants-seeded';

export type AssistantScope = 'chat' | 'cinema' | 'pdf';

/** An assistant is saved instructions the person chooses on purpose. The neutral Chat never uses one by itself. */
export type Assistant = {
  id: string;
  name: string;
  description: string;
  instructions: string;
  /** Preferred text model id ('auto' or a catalog id). Kept even if that model stops being available. */
  model: string;
  scope: AssistantScope;
  /** Adds the verified image and video options of the catalog to the instructions. */
  mediaCatalog?: boolean;
  /** Set on the starter assistants; editing one clears nothing, it only marks where it came from. */
  seed?: string;
  createdAt: string;
  updatedAt: string;
};

export const MAX_INSTRUCTIONS = 8000;

// Fixed dates so two computers seeding on their own produce identical records (no false conflicts).
const SEED_DATE = '2026-10-17T00:00:00.000Z';

export const seedAssistants: Assistant[] = [
  {
    id: 'seed-book-editor',
    seed: 'book-editor',
    name: 'Editor del libro de ruso',
    description: 'Estructura, redacción, ejercicios y crítica pedagógica para «Русский код», A1.',
    scope: 'pdf',
    model: 'auto',
    createdAt: SEED_DATE,
    updatedAt: SEED_DATE,
    instructions: [
      'Sos el editor pedagógico de «Русский код», un libro de ruso nivel A1 para adultos hispanohablantes.',
      'Se usa sobre todo en clases individuales online entre un profesor y un alumno: los ejercicios no deben necesitar compañeros ni trabajo en grupo.',
      '',
      'Ayudás con la estructura de las unidades, la redacción en ruso y en español, los ejercicios y la crítica pedagógica.',
      '- Explicá en español; escribí el ruso con cirílico correcto, con la tilde de acento (´) cuando ayude a pronunciar.',
      '- Controlá que el vocabulario y la gramática sean de nivel A1 y que cada ejercicio tenga una consigna clara.',
      '- Sé honesto en la crítica: señalá problemas concretos y proponé una alternativa para cada uno.',
      '',
      'Límites:',
      '- No inventes decisiones editoriales (títulos, orden de unidades, estilo, contenidos aprobados): preguntá o proponé opciones.',
      '- No modifiques material aprobado sin confirmación explícita. Si algo ya está aprobado, sugerí el cambio y esperá un sí.',
      '- No digas que guardaste, publicaste o cambiaste nada en el libro: solo podés responder en esta conversación.',
    ].join('\n'),
  },
  {
    id: 'seed-prompt-coach',
    seed: 'prompt-coach',
    name: 'Coach de prompts para imagen y video',
    description: 'Hace preguntas breves y prepara prompts que el modelo elegido puede cumplir.',
    scope: 'cinema',
    model: 'auto',
    mediaCatalog: true,
    createdAt: SEED_DATE,
    updatedAt: SEED_DATE,
    instructions: [
      'Ayudás a preparar prompts para generar imágenes y videos.',
      '',
      '1. Si falta información, hacé como mucho tres preguntas breves: qué se ve, para qué es, y qué modelo se va a usar.',
      '2. Usá solo las opciones verificadas del modelo elegido (proporción, resolución, duración, referencias, variantes) que figuran en el catálogo que acompaña estas instrucciones. Si una opción no figura, decí que ese modelo no la ofrece en el estudio.',
      '3. Entregá el prompt final en un bloque aparte, en inglés salvo que pidan otro idioma, y debajo los ajustes recomendados.',
      '',
      'No digas que generaste una imagen o un video: solo preparás el texto. No prometas resultados exactos ni inventes precios.',
    ].join('\n'),
  },
  {
    id: 'seed-video-director',
    seed: 'video-director',
    name: 'Director de video',
    description: 'Desarrolla ideas, guiones, planos y prompts coherentes entre sí.',
    scope: 'cinema',
    model: 'auto',
    mediaCatalog: true,
    createdAt: SEED_DATE,
    updatedAt: SEED_DATE,
    instructions: [
      'Sos director de video. Desarrollás una idea hasta un plan filmable: logline, guion breve, lista de planos y un prompt por plano.',
      '',
      '- Mantené la coherencia: los mismos personajes, vestuario, lugar, luz y paleta en todos los planos; repetí esos rasgos en cada prompt.',
      '- Para cada plano indicá encuadre, movimiento de cámara, duración y qué pasa.',
      '- Ajustá duraciones, proporciones y referencias a lo que el modelo elegido ofrece según el catálogo que acompaña estas instrucciones. Si algo no está disponible, proponé una alternativa posible.',
      '- Preguntá lo mínimo necesario antes de empezar (duración total, público, tono).',
      '',
      'No digas que generaste, editaste o subiste videos: solo podés escribir el plan y los prompts en esta conversación.',
    ].join('\n'),
  },
];

const read = (): Assistant[] => {
  const value = JSON.parse(localStorage.getItem(KEY) || '[]');
  return Array.isArray(value) ? value.filter(a => a && typeof a.id === 'string' && typeof a.name === 'string' && typeof a.instructions === 'string') : [];
};

type Store = {
  assistants: Assistant[];
  hydrated: boolean;
  error: string;
  hydrate: () => void;
  create: (draft: Omit<Assistant, 'id' | 'createdAt' | 'updatedAt'>) => string;
  update: (id: string, patch: Partial<Omit<Assistant, 'id' | 'createdAt'>>) => void;
  duplicate: (id: string) => string | null;
  remove: (id: string) => Assistant | null;
  restore: (assistant: Assistant) => void;
  /** Sync only: replaces the list with the merged set. */
  replaceSynced: (assistants: Assistant[]) => void;
};

function persist(assistants: Assistant[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(assistants));
    useAssistants.setState({assistants, error: ''});
  } catch {
    useAssistants.setState({assistants, error: 'No se pudieron guardar los asistentes en este navegador.'});
  }
}

export const useAssistants = create<Store>((set, get) => ({
  assistants: [],
  hydrated: false,
  error: '',
  hydrate: () => {
    if (get().hydrated) return;
    try {
      let list = read();
      // Seed once per browser. Seeds have fixed ids and dates, so sync recognizes them on every computer.
      if (!localStorage.getItem(SEEDED)) {
        list = [...list, ...seedAssistants.filter(s => !list.some(a => a.id === s.id))];
        localStorage.setItem(KEY, JSON.stringify(list));
        localStorage.setItem(SEEDED, '1');
      }
      set({assistants: list, hydrated: true});
    } catch {
      set({hydrated: true, error: 'No se pudieron leer los asistentes guardados.'});
    }
    window.addEventListener('storage', e => { if (e.key === KEY) try { set({assistants: read()}); } catch {} });
  },
  create: draft => {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    persist([{...draft, id, createdAt: now, updatedAt: now}, ...get().assistants]);
    return id;
  },
  update: (id, patch) => persist(get().assistants.map(a => a.id === id ? {...a, ...patch, updatedAt: new Date().toISOString()} : a)),
  duplicate: id => {
    const source = get().assistants.find(a => a.id === id);
    if (!source) return null;
    const now = new Date().toISOString();
    const copy: Assistant = {...source, id: crypto.randomUUID(), seed: undefined, name: (source.name + ' (copia)').slice(0, 80), createdAt: now, updatedAt: now};
    const list = get().assistants;
    const at = list.findIndex(a => a.id === id);
    persist([...list.slice(0, at + 1), copy, ...list.slice(at + 1)]);
    return copy.id;
  },
  remove: id => {
    const found = get().assistants.find(a => a.id === id) || null;
    if (found) persist(get().assistants.filter(a => a.id !== id));
    return found;
  },
  restore: assistant => { if (!get().assistants.some(a => a.id === assistant.id)) persist([assistant, ...get().assistants]); },
  replaceSynced: assistants => persist(assistants),
}));

/** True when a starter assistant was never edited on this computer. */
export const isPristineSeed = (a: Assistant) => {
  const seed = seedAssistants.find(s => s.id === a.id);
  return Boolean(seed) && tokenOf(a) === tokenOf(seed);
};
