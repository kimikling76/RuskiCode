'use client';
import {useMemo, useState} from 'react';
import {useBalance, balanceErrors} from '@/lib/ai/balance';
import {ArrowUpRight, RefreshCw} from 'lucide-react';
import {usePersonal} from '@/store/personal-chat';
import {summarizeUsage, studioNames, type UsageDay} from '@/lib/usage/summary';
import {Group, Row, numberFormat, timeFormat} from './parts';

const dayFormat = new Intl.DateTimeFormat('es-AR', {weekday: 'long', day: 'numeric', month: 'long'});
const yearFormat = new Intl.DateTimeFormat('es-AR', {day: 'numeric', month: 'long', year: 'numeric'});

function credits(value: number) {
  return numberFormat.format(value) + (value === 1 ? ' crédito' : ' créditos');
}

function dayLabel(day: UsageDay) {
  if (!day.date) return 'Sin fecha';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - day.date.getTime()) / 86400000);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Ayer';
  return day.date.getFullYear() === today.getFullYear() ? dayFormat.format(day.date) : yearFormat.format(day.date);
}

export function UsageSection() {
  const usage = usePersonal(s => s.data.usage);
  const hydrated = usePersonal(s => s.hydrated);
  const summary = useMemo(() => summarizeUsage(usage), [usage]);
  const [shown, setShown] = useState(7);
  const balance = useBalance();

  return (
    <>
      <Group
        title="Saldo en Kie"
        description="Lo que queda en la cuenta de Kie del estudio, según Kie. Se consulta solo cuando abrís esta página o tocás Actualizar."
        action={
          <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" disabled={balance.isFetching} onClick={() => void balance.refresh()}>
            <RefreshCw aria-hidden="true" />{balance.isFetching ? 'Consultando…' : 'Actualizar'}
          </button>
        }
      >
        <div className="rc-set-balance" aria-live="polite">
          {balance.data ? (
            <>
              <strong>{credits(balance.data.credits)}</strong>
              <span className="rc-hint">Consultado a las {timeFormat.format(new Date(balance.data.checkedAt))}</span>
              {balance.isError && !balance.isFetching ? <p className="rc-set-balance-error" role="status">No se pudo actualizar. {balanceErrors[balance.error.message] || 'Probá de nuevo.'}</p> : null}
            </>
          ) : balance.isPending ? (
            <span className="rc-skeleton rc-set-balance-skeleton" role="status" aria-label="Consultando el saldo" />
          ) : (
            <p className="rc-set-quiet" role="status">{balanceErrors[balance.error?.message || ''] || 'No se pudo consultar el saldo. Probá de nuevo.'}</p>
          )}
        </div>
      </Group>

      <Group
        title="Pedidos registrados"
        description="Suma solo el costo real que Kie informó en cada pedido, desde esta computadora y las otras de tu cuenta. No hay estimaciones."
        action={<a className="rc-btn rc-btn--ghost rc-btn--sm" href="https://kie.ai/logs" target="_blank" rel="noreferrer">Registro oficial en Kie<ArrowUpRight aria-hidden="true" /></a>}
      >
        {!hydrated ? (
          <div className="rc-history-loading" role="status" aria-label="Cargando el registro"><span className="rc-skeleton" /><span className="rc-skeleton" /></div>
        ) : !summary.requests ? (
          <p className="rc-set-quiet">Todavía no hay pedidos a Kie registrados.</p>
        ) : (
          <>
            <dl className="rc-set-totals">
              <div><dt>Créditos informados</dt><dd>{numberFormat.format(summary.credits)}</dd></div>
              <div><dt>Pedidos</dt><dd>{numberFormat.format(summary.requests)}</dd></div>
              {summary.unreported ? <div><dt>Sin costo informado</dt><dd>{numberFormat.format(summary.unreported)}</dd></div> : null}
            </dl>
            {summary.byStudio.length ? summary.byStudio.map(s => (
              <Row key={s.studio} label={studioNames[s.studio]} detail={s.requests + (s.requests === 1 ? ' pedido' : ' pedidos')}>
                <span className="rc-set-number">{credits(s.credits)}</span>
              </Row>
            )) : null}
          </>
        )}
      </Group>

      {summary.days.length ? (
        <Group title="Detalle por día" description={summary.unreported ? '«Sin informar» quiere decir que Kie no envió el costo de ese pedido. Puede haber costado créditos igual.' : undefined}>
          {summary.days.slice(0, shown).map(day => (
            <div key={day.key} className="rc-set-day">
              <h3>
                <span>{dayLabel(day)}</span>
                <span className="rc-set-number">{day.credits || !day.unreported ? credits(day.credits) : 'Sin informar'}</span>
              </h3>
              {day.date ? null : <p className="rc-hint">Pedidos registrados antes de que se guardara la fecha y el estudio.</p>}
              <table className="rc-set-table">
                <thead className="sr-only">
                  <tr><th scope="col">Hora</th><th scope="col">Estudio</th><th scope="col">Pedido</th><th scope="col">Créditos</th></tr>
                </thead>
                <tbody>
                  {day.entries.map(entry => (
                    <tr key={entry.id}>
                      <td className="rc-set-number">{entry.at ? timeFormat.format(new Date(entry.at)) : '—'}</td>
                      <td>{entry.studio ? studioNames[entry.studio] : '—'}</td>
                      <td className="rc-set-table-label">{entry.label || 'Pedido a Kie'}</td>
                      <td className="rc-set-number">{typeof entry.credits === 'number' ? numberFormat.format(entry.credits) : <span className="rc-set-quiet">Sin informar</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {summary.days.length > shown ? (
            <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm rc-set-more" onClick={() => setShown(n => n + 14)}>Mostrar días anteriores</button>
          ) : null}
        </Group>
      ) : null}
    </>
  );
}
