"use client";
import { create } from 'zustand';
import type { Locale } from '@/lib/i18n';
type State = { locale: Locale; collapsed: boolean; setLocale: (locale: Locale) => void; toggleSidebar: () => void };
export const useStudio = create<State>((set) => ({ locale: 'es', collapsed: false, setLocale: (locale) => set({ locale }), toggleSidebar: () => set(s => ({ collapsed: !s.collapsed })) }));
