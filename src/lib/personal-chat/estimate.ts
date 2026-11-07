import type {UsageEntry} from './state';

// What a text request usually costs, from what Kie reported for the person's own earlier requests of the same kind
// with the same model. Kie does not publish the price of its text models, so this is the only honest estimate: it is
// shown as such, and the real cost appears when Kie reports it.

export type TextEstimate = {credits: number; from: number};

/** The median of the last six reported costs for this task (`label`) and model (as chosen, `auto` included). */
export function textEstimate(usage: UsageEntry[], label: string, model: string): TextEstimate | null {
  const costs = usage
    .filter(e => e.label === label && (e.asked === model || e.model === model) && typeof e.credits === 'number' && e.credits > 0)
    .sort((a, b) => (a.at || 0) - (b.at || 0)).slice(-6).map(e => e.credits as number).sort((a, b) => a - b);
  if (!costs.length) return null;
  const mid = costs.length >> 1;
  const median = costs.length % 2 ? costs[mid] : (costs[mid - 1] + costs[mid]) / 2;
  return {credits: median >= 10 ? Math.round(median) : Math.round(median * 10) / 10, from: costs.length};
}

/** «≈ 12 créditos (según tus últimos 4 pedidos con este modelo)», or what to expect when there is no history yet. */
export function estimateText(e: TextEstimate | null, per = '') {
  if (!e) return 'Kie no publica el precio de este modelo: lo vas a ver al terminar, y desde ahí el estudio lo estima.';
  return '≈ ' + e.credits.toLocaleString('es-AR') + ' créditos' + per + ' (según ' + (e.from === 1 ? 'tu último pedido' : 'tus últimos ' + e.from + ' pedidos') + ' de este tipo con este modelo)';
}

/** The same for a normal Chat answer: the person's earlier answers with this model (skills apart). */
export function chatEstimate(usage: UsageEntry[], model: string): TextEstimate | null {
  return textEstimate(usage.filter(e => e.studio === 'chat' && !(e.label || '').startsWith('/')).map(e => ({...e, label: 'chat'})), 'chat', model);
}
