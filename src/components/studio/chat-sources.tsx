'use client';
import {ArrowUpRight} from 'lucide-react';
import type {Source} from '@/lib/ai/types';

/** Pages from several «sources» events, once each (the API may repeat them while it streams). */
export function mergeSources(list: Source[], more: Source[]) {
  const seen = new Set(list.map(x => x.url));
  return [...list, ...more.filter(x => !seen.has(x.url) && (seen.add(x.url), true))].slice(0, 20);
}

function host(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

/** The pages the API said the model used. Kie does not document this list, so it only shows when it arrives. */
export function MessageSources({sources}: {sources: Source[]}) {
  const safe = sources.filter(x => /^https?:\/\//i.test(x.url));
  if (!safe.length) return null;
  return (
    <details className="rc-msg-sources">
      <summary>Páginas consultadas ({safe.length})</summary>
      <ul>
        {safe.map(x => (
          <li key={x.url}>
            <a href={x.url} target="_blank" rel="noopener noreferrer">{x.title || host(x.url)}<ArrowUpRight aria-hidden="true" /></a>
            {x.title && x.title !== host(x.url) ? <span>{host(x.url)}</span> : null}
          </li>
        ))}
      </ul>
    </details>
  );
}
