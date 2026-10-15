"use client";
import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useStudio } from '@/store/studio';
export function Providers({ children }: { children: React.ReactNode }) {
 const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 60000, retry: 1 } } }));
 const locale = useStudio(s => s.locale);
 useEffect(() => { document.documentElement.lang = locale; }, [locale]);
 return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
