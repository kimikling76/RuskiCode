/**
 * Russian Code brand.
 * The symbol is the Cyrillic letter Ж drawn as `>|<`: two code brackets around
 * a text cursor. The cursor stroke carries the single accent colour.
 */
export function BrandMark({size = 24, className = ''}: {size?: number; className?: string}) {
  return (
    <svg className={'rc-mark ' + className} width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M5 6.5 13 16 5 25.5M27 6.5 19 16l8 9.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="square" strokeLinejoin="miter" />
      <path d="M16 5v22" stroke="var(--accent)" strokeWidth="2.6" strokeLinecap="square" />
    </svg>
  );
}

export function Wordmark({sub = false, className = ''}: {sub?: boolean; className?: string}) {
  return (
    <span className={'rc-wordmark ' + className}>
      <BrandMark />
      <span className="rc-wordmark-text">
        <span className="rc-wordmark-name">Russian Code</span>
        {sub ? <span className="rc-wordmark-sub" lang="ru">Русский код</span> : null}
      </span>
    </span>
  );
}
