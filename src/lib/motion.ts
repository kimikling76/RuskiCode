import type { Variants } from 'framer-motion';
export const ease = [0.22, 1, 0.36, 1] as const;
export const reveal: Variants = { hidden: { opacity: 0, y: 14 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease } } };
export const stagger: Variants = { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } };
export const panel: Variants = { hidden: { opacity: 0, x: -16 }, visible: { opacity: 1, x: 0, transition: { duration: 0.25, ease } } };
