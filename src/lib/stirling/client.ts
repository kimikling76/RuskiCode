'use client';
import {operationErrors, operationInfo, type OperationId, type OperationParams} from './operations';

export class OperationError extends Error {
  constructor(public code: string) { super(operationErrors[code] || operationErrors.STIRLING_UNAVAILABLE); }
}

export type StirlingStatus = {configured: false} | {configured: true; cloud: boolean; reachable: boolean; version: string | null};

export async function stirlingStatus(): Promise<StirlingStatus> {
  const r = await fetch('/api/pdf/stirling', {cache: 'no-store'});
  if (!r.ok) throw new OperationError(r.status === 401 ? 'AUTH_REQUIRED' : 'STIRLING_UNAVAILABLE');
  return r.json();
}

export type OperationOutput = {bytes: ArrayBuffer; pages: number | null; calls: number; /** 'A4': new pages kept Stirling's A4 size. */ note: string | null};

/** Runs one operation through this site's server, which holds the Stirling key. Nothing is saved here. */
export async function runStirling<T extends OperationId>(op: T, params: OperationParams<T>, file: ArrayBuffer, second?: ArrayBuffer, signal?: AbortSignal): Promise<OperationOutput> {
  const form = new FormData();
  form.append('operation', op);
  form.append('params', JSON.stringify(params));
  const input = operationInfo[op].input === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf';
  form.append('file', new Blob([file], {type: input}), operationInfo[op].input === 'docx' ? 'documento.docx' : 'documento.pdf');
  if (second) form.append('second', new Blob([second], {type: 'application/pdf'}), 'otro.pdf');
  let r: Response;
  try {
    r = await fetch('/api/pdf/stirling', {method: 'POST', body: form, signal});
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new OperationError('STIRLING_UNAVAILABLE');
  }
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new OperationError(typeof body.error === 'string' ? body.error : 'STIRLING_UNAVAILABLE');
  }
  const pages = Number(r.headers.get('X-Page-Count'));
  return {bytes: await r.arrayBuffer(), pages: Number.isFinite(pages) && pages > 0 ? pages : null, calls: Number(r.headers.get('X-Stirling-Calls')) || operationInfo[op].calls, note: r.headers.get('X-Result-Note')};
}

/** From the published price: each processed file uses at least one Stirling credit (very long or large files use more). */
export function creditEstimate(op: OperationId) {
  const n = operationInfo[op].calls;
  return 'Stirling: al menos ' + n + (n === 1 ? ' crédito' : ' créditos');
}
