'use client';
import {useMemo, useState} from 'react';
import Link from 'next/link';
import {AlertTriangle, ArrowUpRight, Check, CloudOff, Loader2, RefreshCw} from 'lucide-react';
import {useSync, syncNow} from '@/lib/sync/engine';
import {useBalance, balanceErrors, sessionStart} from '@/lib/ai/balance';
import {usePersonal} from '@/store/personal-chat';
import {Tip} from '@/components/ui/tooltip';
import {SyncConflicts} from './sync-conflicts';

const time = new Intl.DateTimeFormat('es-AR', {hour: '2-digit', minute: '2-digit', hourCycle: 'h23'});
const number = new Intl.NumberFormat('es-AR', {maximumFractionDigits: 2});
const credits = (n: number) => number.format(n) + (n === 1 ? ' crédito' : ' créditos');

/** Save state of the work on the server. Always a word, never only an icon or a color. */
function SyncLine({rail}: {rail: boolean}) {
  const status = useSync(s => s.status);
  const savedAt = useSync(s => s.savedAt);
  const conflicts = useSync(s => s.conflicts.length);
  const [open, setOpen] = useState(false);

  const view = conflicts
    ? {icon: AlertTriangle, text: conflicts === 1 ? '1 cambio para revisar' : conflicts + ' cambios para revisar', tone: 'warn', hint: 'Lo mismo cambió en dos computadoras. Se conservaron las dos versiones hasta que elijas.'}
    : status === 'saving' || status === 'starting'
      ? {icon: Loader2, text: 'Guardando…', tone: 'busy', hint: 'Guardando tus cambios en el servidor.'}
      : status === 'saved'
        ? {icon: Check, text: 'Guardado' + (savedAt ? ' · ' + time.format(savedAt) : ''), tone: 'ok', hint: 'Chats, libros, Cinema y asistentes guardados en tu cuenta. Los ves desde cualquier computadora.'}
        : status === 'offline'
          ? {icon: CloudOff, text: 'Sin conexión · reintentar', tone: 'error', hint: 'No se pudo llegar al servidor. Tus cambios siguen en este navegador y se guardan al volver la conexión.'}
          : status === 'disabled'
            ? {icon: CloudOff, text: 'Solo en este navegador', tone: 'quiet', hint: 'El servidor todavía no tiene activada la sincronización (falta aplicar la tabla nueva en la base de datos). Nada se pierde: todo sigue en este navegador.'}
            : status === 'signed-out'
              ? {icon: CloudOff, text: 'Sesión cerrada', tone: 'error', hint: 'Volvé a iniciar sesión para guardar en el servidor.'}
              : {icon: AlertTriangle, text: 'No se pudo guardar · reintentar', tone: 'error', hint: 'Tus cambios siguen en este navegador. Tocá para intentar de nuevo.'};
  const Icon = view.icon;
  const action = conflicts ? () => setOpen(true) : status === 'signed-out' ? undefined : () => void syncNow();
  const body = (
    <button type="button" className="rc-sync" data-tone={view.tone} onClick={action} disabled={!action} aria-label={rail ? view.text : undefined}>
      <Icon className={view.tone === 'busy' ? 'rc-spin' : undefined} aria-hidden="true" />
      {rail ? null : <span>{view.text}</span>}
    </button>
  );
  return (
    <>
      <div role="status" aria-live="polite" className="rc-sync-wrap">
        <Tip label={view.hint} side={rail ? 'right' : 'top'}>{body}</Tip>
      </div>
      <SyncConflicts open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/**
 * «Saldo disponible» is the real Kie balance. «Gasto de esta sesión» adds only what Kie reported since this
 * browser session started. Neither is computed by subtracting balances.
 */
function BalanceBlock() {
  const balance = useBalance();
  const usage = usePersonal(s => s.data.usage);
  const start = useMemo(() => sessionStart(), []);
  const session = useMemo(() => {
    const own = usage.filter(e => (e.at || 0) >= start);
    return {credits: own.reduce((n, e) => n + (e.credits ?? 0), 0), unreported: own.filter(e => e.credits === undefined).length, count: own.length};
  }, [usage, start]);
  const data = balance.data;
  const failed = balance.isError && !balance.isFetching;

  return (
    <div className="rc-balance">
      <div className="rc-balance-row">
        <span className="rc-balance-label">Saldo disponible</span>
        <Tip label={balance.isFetching ? 'Consultando…' : 'Actualizar el saldo'} side="top">
          <button type="button" className="rc-icon-btn rc-icon-btn--sm" aria-label="Actualizar el saldo" disabled={balance.isFetching} onClick={() => void balance.refresh()}>
            <RefreshCw className={balance.isFetching ? 'rc-spin' : undefined} />
          </button>
        </Tip>
      </div>
      {data ? (
        <p className="rc-balance-value">
          <span>{credits(data.credits)}</span>
          <small>{failed ? 'Último saldo, ' : ''}consultado {time.format(new Date(data.checkedAt))}</small>
        </p>
      ) : balance.isPending ? (
        <span className="rc-skeleton rc-balance-skeleton" aria-label="Consultando el saldo" role="status" />
      ) : (
        <p className="rc-balance-error" role="status">{balanceErrors[balance.error?.message || ''] || 'No se pudo consultar el saldo.'}</p>
      )}
      {failed && data ? <p className="rc-balance-error">No se pudo actualizar. {balanceErrors[balance.error.message] || ''}</p> : null}
      {data && data.credits === 0 ? <p className="rc-balance-error">Sin saldo: las generaciones van a fallar hasta que cargues créditos en Kie.</p> : null}
      <div className="rc-balance-row rc-balance-session">
        <Tip label="Suma solo lo que Kie informó desde que abriste el estudio en esta ventana." side="top">
          <span className="rc-balance-label" tabIndex={0}>Gasto de esta sesión</span>
        </Tip>
        <span className="rc-balance-number">{session.count ? credits(session.credits) : '—'}</span>
      </div>
      {session.unreported ? <p className="rc-balance-note">{session.unreported === 1 ? '1 pedido sin costo informado' : session.unreported + ' pedidos sin costo informado'}</p> : null}
      <div className="rc-balance-links">
        <Link href="/workspace/ajustes?seccion=uso">Detalle</Link>
        <a href="https://kie.ai/logs" target="_blank" rel="noreferrer">Registro en Kie<ArrowUpRight aria-hidden="true" /></a>
      </div>
    </div>
  );
}

export function SidebarStatus({rail}: {rail: boolean}) {
  return (
    <>
      <SyncLine rail={rail} />
      {rail ? null : <BalanceBlock />}
    </>
  );
}
