import localFont from 'next/font/local';

// Loaded here: the fallback text face and the code face. The site's own faces (Golos Text, Sofia Sans Extra
// Condensed) are declared in src/styles/tokens.css. All with complete Cyrillic, Latin and Spanish punctuation
// (Ё/ё, ñ, accents, ¿, ¡) plus U+0301 for Russian stress marks.
export const fontUi = localFont({
  src: './fonts/onest.woff2',
  weight: '100 900',
  variable: '--font-onest',
  display: 'swap',
  fallback: ['system-ui', 'sans-serif'],
});

export const fontCode = localFont({
  src: './fonts/jetbrainsmono.woff2',
  weight: '100 800',
  variable: '--font-jetbrains',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  fallback: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
});
