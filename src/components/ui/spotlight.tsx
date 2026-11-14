'use client';
import {useEffect, useRef, useState} from 'react';
import {motion, useReducedMotion, useSpring, useTransform} from 'framer-motion';

/**
 * A soft light that follows the pointer inside its parent (which needs `position: relative; overflow: hidden`).
 * Adapted from Motion Primitives' «Spotlight» (MIT, motion-primitives.com) for this project's CSS and tokens.
 */
export function Spotlight({size = 260}: {size?: number}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [on, setOn] = useState(false);
  const still = useReducedMotion();
  const x = useSpring(0, {bounce: 0});
  const y = useSpring(0, {bounce: 0});
  const left = useTransform(x, v => v - size / 2 + 'px');
  const top = useTransform(y, v => v - size / 2 + 'px');
  useEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent || still) return;
    const stop = new AbortController();
    parent.addEventListener('mousemove', e => { const r = parent.getBoundingClientRect(); x.set(e.clientX - r.left); y.set(e.clientY - r.top); }, {signal: stop.signal});
    parent.addEventListener('mouseenter', () => setOn(true), {signal: stop.signal});
    parent.addEventListener('mouseleave', () => setOn(false), {signal: stop.signal});
    return () => stop.abort();
  }, [still, x, y]);
  if (still) return null;
  return <motion.span ref={ref} className="ui-spot" data-on={on ? 'true' : undefined} style={{width: size, height: size, left, top}} aria-hidden="true" />;
}
