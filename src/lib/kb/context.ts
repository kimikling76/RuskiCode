'use client';
import {getProject, listEntries, projectOfAssistant, projectOfUnit} from './store';
import {retrieve, type BookContext, type BookTask} from './retrieve';
import type {BookPayload} from './prompt';
import type {KbProject} from './model';

// The book data of a request, made in this browser from the base of the project the request belongs to. A unit
// belongs to a project only when the author linked it; an assistant brings a project only when the author chose so; a
// chat brings one only when the person turned on «Contexto del libro» in it. Anything else gets nothing.

export type BookRequest = {project: KbProject; context: BookContext; payload: BookPayload};

/** What the person sees about the data that went with an answer. */
export type BookUsed = {project: string; items: {id: string; title: string; status: string}[]; omitted?: number};
export const usedOf = (r: BookRequest): BookUsed => ({project: r.project.name, items: r.payload.items.map(i => ({id: i.id, title: i.title, status: i.status})), ...(r.context.omitted ? {omitted: r.context.omitted} : {})});

async function build(project: KbProject | null, task: BookTask): Promise<BookRequest | null> {
  if (!project) return null;
  const entries = await listEntries(project.id);
  if (!entries.length) return null;
  const context = retrieve(entries, task);
  const name = (id: string) => entries.find(e => e.id === 'char.' + id)?.title || id;
  return {project, context, payload: {project: project.name, items: context.items, ...(context.ambiguous.length ? {ambiguous: context.ambiguous.map(a => ({alias: a.alias, names: a.ids.map(name)}))} : {})}};
}

/** For a manual unit: its book's data, with the unit number the project gives it. */
export async function bookForUnit(unitId: string, task: BookTask) {
  const project = await projectOfUnit(unitId).catch(() => null);
  return build(project, {...task, unit: task.unit ?? (project ? project.units[unitId] || undefined : undefined)});
}

/** For a saved assistant the person chose: the book it brings, if any. */
export async function bookForAssistant(assistantId: string, task: BookTask) {
  return build(await projectOfAssistant(assistantId).catch(() => null), task);
}

/** For a chat where the person turned on «Contexto del libro» for this book. */
export async function bookForProject(projectId: string, task: BookTask) {
  return build((await getProject(projectId).catch(() => undefined)) || null, task);
}
