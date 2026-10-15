import type { Metadata } from 'next';
import { Providers } from '@/components/providers';
import './globals.css';
import '../styles/landing.css';
import '../styles/studio-spec.css';
import '../styles/workspace-design.css';
import '../styles/redesign-foundation.css';
import '../styles/chat.css';
export const metadata: Metadata = { title: 'RuskiCode Studio', description: 'Estudio creativo para libros, imágenes y video. Русский код A1.' };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="es"><head><link rel="preload" href="/fonts/inter-ui.woff2" as="font" type="font/woff2" crossOrigin="anonymous"/></head><body><Providers>{children}</Providers></body></html>; }
