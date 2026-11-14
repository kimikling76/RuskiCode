'use client';
import {motion, useReducedMotion} from 'framer-motion';

/**
 * Text with a light that sweeps across it, for «working on it» labels.
 * Adapted from Motion Primitives' «Text Shimmer» (MIT, motion-primitives.com) for this project's CSS and tokens.
 */
export function TextShimmer({children, duration = 1.8}: {children: string; duration?: number}) {
  const still = useReducedMotion();
  if (still) return <span>{children}</span>;
  return (
    <motion.span
      className="ui-shimmer"
      style={{['--spread' as string]: children.length * 2 + 'px'}}
      initial={{backgroundPosition: '100% center'}}
      animate={{backgroundPosition: '0% center'}}
      transition={{repeat: Infinity, duration, ease: 'linear'}}
    >
      {children}
    </motion.span>
  );
}
