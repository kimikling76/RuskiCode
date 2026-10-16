import type { Metadata, Viewport } from 'next';
import { Providers } from '@/components/providers';
import { fontUi, fontDisplay, fontCode } from './fonts';
import './globals.css';
import '../styles/landing.css';
import '../styles/system.css';
import '../styles/shell.css';
import '../styles/chat.css';

export const metadata: Metadata = {
  title: 'Russian Code · Русский код',
  description: 'Estudio creativo con IA: chat, libros y documentos, imagen y video.',
};

export const viewport: Viewport = {
  themeColor: '#0B0C0E',
  colorScheme: 'dark',
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${fontUi.variable} ${fontDisplay.variable} ${fontCode.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
