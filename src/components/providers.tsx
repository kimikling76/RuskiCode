"use client";
import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig, useReducedMotion } from 'framer-motion';
import Lenis from 'lenis';
import { useStudio } from '@/store/studio';
export function Providers({ children }: { children: React.ReactNode }) {
 const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 60000, retry: 1 } } }));
 const reduced = useReducedMotion(); const locale = useStudio(s => s.locale);
 useEffect(() => { document.documentElement.lang = locale; }, [locale]);
 useEffect(() => { if (reduced !== false) return; const lenis = new Lenis({ autoRaf: true, duration: 0.9 }); return () => lenis.destroy(); }, [reduced]);
 return <QueryClientProvider client={client}><MotionConfig reducedMotion="user">{children}</MotionConfig></QueryClientProvider>;
}
