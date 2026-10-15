import type { Metadata } from 'next';
import { Providers } from '@/components/providers';
import './globals.css';
import '../styles/landing.css';
import '../styles/studio-spec.css';
export const metadata: Metadata = { title: 'RuskiCode Studio', description: 'Estudio creativo para libros, imágenes y video. Русский код A1.' };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="es"><body><Providers>{children}</Providers></body></html>; }
