'use client';
import {create} from 'zustand';
import type {ReviewFinding} from '@/lib/manual/review';

// What «Revisar con IA» found in each page of a unit, while the editor is open in this browser. A new review of a
// page replaces its findings; applied and dismissed ones are remembered so they are not offered twice.

export type PageReview = {pageId: string; summary: string; findings: ReviewFinding[]; model: string; picture: boolean; credits?: number; at: number};

type ManualReview = {
  /** By `unitId:pageId`. */
  pages: Record<string, PageReview>;
  /** By finding key: what the author did with it. */
  done: Record<string, 'applied' | 'dismissed'>;
  put: (unitId: string, review: PageReview) => void;
  mark: (key: string, what: 'applied' | 'dismissed') => void;
  clear: (unitId: string) => void;
};

export const useManualReview = create<ManualReview>(set => ({
  pages: {},
  done: {},
  put: (unitId, review) => set(s => ({pages: {...s.pages, [unitId + ':' + review.pageId]: review}})),
  mark: (key, what) => set(s => ({done: {...s.done, [key]: what}})),
  clear: unitId => set(s => ({pages: Object.fromEntries(Object.entries(s.pages).filter(([k]) => !k.startsWith(unitId + ':')))})),
}));
