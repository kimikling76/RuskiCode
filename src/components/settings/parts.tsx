import type {ReactNode} from 'react';

/** A titled group of rows inside a settings section. */
export function Group({title, description, children, action}: {title: string; description?: ReactNode; children: ReactNode; action?: ReactNode}) {
  return (
    <section className="rc-set-group">
      <div className="rc-set-group-head">
        <div>
          <h2>{title}</h2>
          {description ? <p className="rc-hint">{description}</p> : null}
        </div>
        {action}
      </div>
      <div className="rc-set-rows">{children}</div>
    </section>
  );
}

/** One line: what it is on the left, its value or control on the right. */
export function Row({label, detail, children}: {label: ReactNode; detail?: ReactNode; children?: ReactNode}) {
  return (
    <div className="rc-set-row">
      <div className="rc-set-row-text">
        <div className="rc-set-row-label">{label}</div>
        {detail ? <div className="rc-set-row-detail">{detail}</div> : null}
      </div>
      {children !== undefined ? <div className="rc-set-row-value">{children}</div> : null}
    </div>
  );
}

export type Health = 'ok' | 'off' | 'error' | 'checking';

/** A status word with its dot. The word always carries the meaning; the color only repeats it. */
export function Status({health, children}: {health: Health; children: ReactNode}) {
  return (
    <span className="rc-set-status" data-health={health}>
      <span className={'rc-dot' + (health === 'ok' ? ' rc-dot--success' : health === 'error' ? ' rc-dot--danger' : '')} aria-hidden="true" />
      {children}
    </span>
  );
}

export const numberFormat = new Intl.NumberFormat('es-AR', {maximumFractionDigits: 2});
export const timeFormat = new Intl.DateTimeFormat('es-AR', {hour: '2-digit', minute: '2-digit', hourCycle: 'h23'});
