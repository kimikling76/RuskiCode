'use client';
import {motion, useReducedMotion} from 'framer-motion';

/**
 * A short light that travels along the border of its parent (which needs `position: relative` and a radius).
 * Adapted from Magic UI's «Border Beam» (MIT, magicui.design): the same idea, written for this project's
 * Tailwind 3 and framer-motion, with the colours from the site's tokens. Still for people who turned motion off.
 */
export function BorderBeam({size = 70, duration = 5, width = 1.5}: {size?: number; duration?: number; width?: number}) {
  const still = useReducedMotion();
  if (still) return null;
  return (
    <span className="ui-beam" style={{borderWidth: width}} aria-hidden="true">
      <motion.span
        className="ui-beam-light"
        style={{width: size, offsetPath: `rect(0 auto auto 0 round ${size}px)`}}
        initial={{offsetDistance: '0%'}}
        animate={{offsetDistance: '100%'}}
        transition={{repeat: Infinity, ease: 'linear', duration}}
      />
    </span>
  );
}
