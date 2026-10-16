import {defaultBookSpec, type BookSpec} from './spec';
import type {EditableBook} from './editable';
import type {Block, Chapter} from '../pipeline/types';

const id = () => crypto.randomUUID();
type Lang = BookSpec['language'];

// Placeholders the author replaces. Written in the book language so a template never mixes languages.
const words: Record<Lang, Record<string, string>> = {
  ru: {
    unit: 'Урок 1. Название урока', goals: 'Цели урока: …', vocab: 'Словарь', word: 'Слово', translation: 'Перевод', example: 'Пример',
    dialog: 'Диалог', dialogText: '— Привет! Как тебя зовут?\n— Меня зовут Анна. А тебя?\n— Я Марк. Очень приятно!',
    exercise: 'Прочитайте и ответьте.', review: 'Повторение', reviewTask: 'Вспомните и напишите.', check: 'Проверьте себя: …',
    writing: 'Пропись', writingModel: 'А а  Б б  В в', heading: 'Заголовок', paragraph: 'Текст…', callout: 'Важно: …', image: 'Описание изображения',
  },
  es: {
    unit: 'Unidad 1. Título', goals: 'Objetivos de la unidad: …', vocab: 'Vocabulario', word: 'Palabra', translation: 'Traducción', example: 'Ejemplo',
    dialog: 'Diálogo', dialogText: '— ¡Hola! ¿Cómo te llamás?\n— Me llamo Ana. ¿Y vos?\n— Soy Marcos. ¡Mucho gusto!',
    exercise: 'Leé y respondé.', review: 'Repaso', reviewTask: 'Recordá y escribí.', check: 'Comprobá: …',
    writing: 'Caligrafía', writingModel: 'A a  B b  C c', heading: 'Título', paragraph: 'Texto…', callout: 'Importante: …', image: 'Descripción de la imagen',
  },
  en: {
    unit: 'Unit 1. Title', goals: 'Unit goals: …', vocab: 'Vocabulary', word: 'Word', translation: 'Translation', example: 'Example',
    dialog: 'Dialogue', dialogText: '— Hi! What is your name?\n— My name is Anna. And yours?\n— I am Mark. Nice to meet you!',
    exercise: 'Read and answer.', review: 'Review', reviewTask: 'Remember and write.', check: 'Check yourself: …',
    writing: 'Handwriting', writingModel: 'A a  B b  C c', heading: 'Heading', paragraph: 'Text…', callout: 'Important: …', image: 'Image description',
  },
};

export type TemplateId = 'unit' | 'vocab' | 'dialog' | 'exercise' | 'review' | 'writing' | 'heading' | 'paragraph' | 'callout' | 'table' | 'image';

export const templateGroups: {label: string; items: {id: TemplateId; name: string; hint: string}[]}[] = [
  {label: 'Plantillas', items: [
    {id: 'unit', name: 'Encabezado de unidad', hint: 'Título y objetivos'},
    {id: 'vocab', name: 'Vocabulario', hint: 'Tabla palabra · traducción · ejemplo'},
    {id: 'dialog', name: 'Diálogo', hint: 'Título y réplicas'},
    {id: 'exercise', name: 'Ejercicio', hint: 'Consigna y lista numerada'},
    {id: 'review', name: 'Repaso', hint: 'Título, ejercicio y autocontrol'},
    {id: 'writing', name: 'Caligrafía', hint: 'Modelo y renglones para copiar'},
  ]},
  {label: 'Bloques', items: [
    {id: 'heading', name: 'Título', hint: ''},
    {id: 'paragraph', name: 'Párrafo', hint: ''},
    {id: 'callout', name: 'Recuadro', hint: ''},
    {id: 'table', name: 'Tabla', hint: ''},
    {id: 'image', name: 'Imagen', hint: ''},
  ]},
];

export function templateBlocks(template: TemplateId, language: Lang): Block[] {
  const w = words[language];
  const dots = ['…', '…', '…'];
  switch (template) {
    case 'unit': return [{type: 'heading', id: id(), level: 1, text: w.unit}, {type: 'callout', id: id(), text: w.goals}];
    case 'vocab': return [{type: 'heading', id: id(), level: 2, text: w.vocab}, {type: 'table', id: id(), headers: [w.word, w.translation, w.example], rows: [dots, dots, dots]}];
    case 'dialog': return [{type: 'heading', id: id(), level: 2, text: w.dialog}, {type: 'paragraph', id: id(), text: w.dialogText}];
    case 'exercise': return [{type: 'exercise', id: id(), instruction: w.exercise, items: [...dots]}];
    case 'review': return [{type: 'heading', id: id(), level: 2, text: w.review}, {type: 'exercise', id: id(), instruction: w.reviewTask, items: [...dots]}, {type: 'callout', id: id(), text: w.check}];
    case 'writing': return [{type: 'heading', id: id(), level: 2, text: w.writing}, {type: 'writing', id: id(), text: w.writingModel, lines: 4}];
    case 'heading': return [{type: 'heading', id: id(), level: 2, text: w.heading}];
    case 'paragraph': return [{type: 'paragraph', id: id(), text: w.paragraph}];
    case 'callout': return [{type: 'callout', id: id(), text: w.callout}];
    case 'table': return [{type: 'table', id: id(), headers: ['…', '…'], rows: [['…', '…'], ['…', '…']]}];
    case 'image': return [{type: 'image', id: id(), prompt: w.image, alt: w.image}];
  }
}

export function unitChapter(language: Lang, title?: string): Chapter {
  const blocks = (['unit', 'vocab', 'dialog', 'exercise', 'review'] as TemplateId[]).flatMap(t => templateBlocks(t, language));
  return {title: title || words[language].unit, summary: '—', blocks};
}

export function emptyChapter(language: Lang, title?: string): Chapter {
  return {title: title || words[language].heading, summary: '—', blocks: [{type: 'heading', id: id(), level: 1, text: title || words[language].heading}, {type: 'paragraph', id: id(), text: words[language].paragraph}]};
}

/** A new editable book: the default specification with the author's choices and one unit to start from. */
export function newBook({title, subtitle = '', author = '', language, level, pageFormat, goal}: {title: string; subtitle?: string; author?: string; language: Lang; level: BookSpec['level']; pageFormat: BookSpec['pageFormat']; goal?: string}): EditableBook {
  const base = defaultBookSpec();
  const spec: BookSpec = {
    ...base,
    title: title.trim().slice(0, 200) || 'Libro sin título',
    subtitle: subtitle.slice(0, 300),
    author: author.slice(0, 200),
    language,
    level,
    pageFormat,
    goal: (goal || base.goal).slice(0, 2000),
    estimatedChapters: 1,
    // Rules and memory belong to the Русский код project, not to a new book.
    styleRules: [],
    memory: [],
  };
  return {spec, chapters: [unitChapter(language)], assets: {}};
}
