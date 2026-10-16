import localFont from 'next/font/local';

// Three families, all with complete Cyrillic, Latin and Spanish punctuation
// (Ё/ё, ñ, accents, ¿, ¡) plus U+0301 for Russian stress marks.
export const fontUi = localFont({
  src: './fonts/onest.woff2',
  weight: '100 900',
  variable: '--font-onest',
  display: 'swap',
  fallback: ['system-ui', 'sans-serif'],
});

// Subset of Geologica with wght 300–700 and its SHRP (sharpness) axis.
export const fontDisplay = localFont({
  src: './fonts/geologica.woff2',
  weight: '300 700',
  variable: '--font-geologica',
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
