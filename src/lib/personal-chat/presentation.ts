/** Provider usage is optional; absent, negative or malformed amounts are never a price. */
export function hasCredits(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function formatCredits(value: number) {
  return new Intl.NumberFormat('es-AR', {maximumFractionDigits: 4}).format(value);
}
