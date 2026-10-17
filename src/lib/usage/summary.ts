import type {UsageEntry} from '@/lib/personal-chat/state';

export const studioNames: Record<NonNullable<UsageEntry['studio']>, string> = {chat: 'Chat', cinema: 'Cinema Studio', pdf: 'PDF Studio'};

export type UsageDay = {key: string; date: Date | null; entries: UsageEntry[]; credits: number; unreported: number};

export type UsageSummary = {
  credits: number;
  requests: number;
  unreported: number;
  byStudio: {studio: keyof typeof studioNames; credits: number; requests: number}[];
  days: UsageDay[];
};

function dayKey(time: number) {
  const d = new Date(time);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/**
 * Groups what Kie reported in this browser. Credits are only real reported values; a request without
 * a reported cost counts as "unreported", never as zero. Entries from before dates were recorded go last.
 */
export function summarizeUsage(entries: UsageEntry[]): UsageSummary {
  const days = new Map<string, UsageDay>();
  const studios = new Map<keyof typeof studioNames, {credits: number; requests: number}>();
  let credits = 0, unreported = 0;
  for (const entry of entries) {
    const reported = typeof entry.credits === 'number' && Number.isFinite(entry.credits);
    if (reported) credits += entry.credits!; else unreported++;
    const dated = typeof entry.at === 'number' && Number.isFinite(entry.at);
    const key = dated ? dayKey(entry.at!) : 'undated';
    const day = days.get(key) || {key, date: dated ? new Date(new Date(entry.at!).setHours(0, 0, 0, 0)) : null, entries: [], credits: 0, unreported: 0};
    day.entries.push(entry);
    if (reported) day.credits += entry.credits!; else day.unreported++;
    days.set(key, day);
    if (entry.studio && entry.studio in studioNames) {
      const s = studios.get(entry.studio) || {credits: 0, requests: 0};
      s.requests++;
      if (reported) s.credits += entry.credits!;
      studios.set(entry.studio, s);
    }
  }
  const sorted = [...days.values()].sort((a, b) => a.date && b.date ? b.date.getTime() - a.date.getTime() : a.date ? -1 : b.date ? 1 : 0);
  for (const day of sorted) day.entries.sort((a, b) => (b.at || 0) - (a.at || 0));
  return {
    credits,
    requests: entries.length,
    unreported,
    byStudio: (Object.keys(studioNames) as (keyof typeof studioNames)[]).filter(s => studios.has(s)).map(s => ({studio: s, ...studios.get(s)!})),
    days: sorted,
  };
}
