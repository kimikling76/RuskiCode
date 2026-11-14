import type { Metadata, Viewport } from 'next';
import { Providers } from '@/components/providers';
import { fontUi, fontCode } from './fonts';
import { themeScript } from '@/lib/theme';
import './globals.css';
import '../styles/system.css';
import '../styles/shell.css';
import '../styles/chat.css';
import '../styles/cinema.css';
import '../styles/estudio.css';
import '../styles/pdf.css';
import '../styles/pdf-doc.css';
import '../styles/manual.css';
import '../styles/skills.css';
import '../styles/kb.css';
import '../styles/settings.css';
import '../styles/site.css';
import '../styles/afisha.css';
import '../styles/diseno.css';
import '../styles/side.css';

export const metadata: Metadata = {
  title: 'Русский код · Russian Code',
  description: 'Estudio creativo con IA: chat, libros y documentos, imagen y video.',
};

export const viewport: Viewport = {
  themeColor: [{media: '(prefers-color-scheme: dark)', color: '#0C0B0A'}, {media: '(prefers-color-scheme: light)', color: '#0C0B0A'}],
  colorScheme: 'dark light',
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The theme chosen in this browser is applied before the first paint (see src/lib/theme.ts): dark unless the person chose light.
    <html lang="es" className={`${fontUi.variable} ${fontCode.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{__html: themeScript}} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
