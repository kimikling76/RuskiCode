// The site's theme. Dark is the main one; light applies only when the person chooses it, and the choice stays in
// this browser. `themeScript` runs in <head> before the first paint, so the page never flashes the other theme.

export type Theme = 'dark' | 'light';
export const THEME_KEY = 'rc-theme';

export const themeScript = `try{if(localStorage.getItem('${THEME_KEY}')==='light')document.documentElement.dataset.theme='light'}catch(e){}`;

export function currentTheme(): Theme {
  return typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export function applyTheme(theme: Theme) {
  if (theme === 'light') document.documentElement.dataset.theme = 'light';
  else delete document.documentElement.dataset.theme;
  try { localStorage.setItem(THEME_KEY, theme); } catch {}
  window.dispatchEvent(new Event('rc-theme'));
}
