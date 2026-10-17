'use client';
import {useEffect, useRef} from 'react';
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {usePersonal} from '@/store/personal-chat';

export type Balance = {credits: number; checkedAt: string; cached?: boolean};

export const balanceKey = ['kie-credits'] as const;

/** The real Kie balance from the server. Never a guess: an invalid answer is an error, not zero. */
export async function fetchBalance(fresh = false): Promise<Balance> {
  const r = await fetch('/api/kie/credits' + (fresh ? '?fresh=1' : ''), {cache: 'no-store'});
  const body = await r.json().catch(() => ({}));
  if (!r.ok || typeof body.credits !== 'number' || !Number.isFinite(body.credits) || body.credits < 0) {
    throw Error(typeof body.error === 'string' ? body.error : 'PROVIDER_UNAVAILABLE');
  }
  return body;
}

export const balanceErrors: Record<string, string> = {
  AUTH_REQUIRED: 'Iniciá sesión para ver el saldo.',
  MODEL_NOT_CONFIGURED: 'Kie no está configurado en el servidor.',
  PROVIDER_AUTH_ERROR: 'Kie rechazó la clave guardada en el servidor.',
  RATE_LIMIT: 'Se consultó muchas veces seguidas. Probá en un minuto.',
  RATE_LIMIT_UNAVAILABLE: 'El servidor no tiene configurado el límite de consultas.',
};

/**
 * Balance shared by the sidebar and the Usage page: read on entry, kept 30 s, refreshed a moment after
 * any request that Kie reported (the usage record grows), and on demand.
 */
export function useBalance() {
  const client = useQueryClient();
  // The refresh button skips the server's short cache; the query keeps one state for every viewer.
  const fresh = useRef(false);
  const query = useQuery({queryKey: balanceKey, queryFn: () => fetchBalance(fresh.current), retry: false, staleTime: 30_000, refetchOnWindowFocus: false});
  const count = usePersonal(s => s.data.usage.length);
  useEffect(() => {
    if (!count) return;
    const t = setTimeout(() => void client.invalidateQueries({queryKey: balanceKey}), 2500);
    return () => clearTimeout(t);
  }, [count, client]);
  const refresh = async () => {
    fresh.current = true;
    try { await query.refetch(); } finally { fresh.current = false; }
  };
  return {...query, refresh};
}

const SESSION = 'rc-session-start';

/** When this browser session started (sessionStorage survives reloads, not closing the window). */
export function sessionStart() {
  try {
    const saved = Number(sessionStorage.getItem(SESSION));
    if (saved) return saved;
    const now = Date.now();
    sessionStorage.setItem(SESSION, String(now));
    return now;
  } catch {
    return Date.now();
  }
}
