'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import styles from './star.module.css';

interface BiographyToggleProps {
  biography: string;
}

/** Bios shorter than this almost never overflow the clamp, so SSR skips the toggle. */
const LIKELY_OVERFLOW_CHARS = 260;

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function BiographyToggle({ biography }: BiographyToggleProps) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(() => biography.trim().length > LIKELY_OVERFLOW_CHARS);
  const bodyRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<Animation | null>(null);
  const bodyId = useId();

  const paragraphs = useMemo(
    () =>
      biography
        .split(/\n+/)
        .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
        .filter(Boolean),
    [biography]
  );

  // Only offer the toggle when the clamped text is actually cut off.
  useIsoLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el || expanded) return;
    const measure = () => setOverflows(el.scrollHeight - el.clientHeight > 2);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [expanded]);

  useEffect(() => () => animationRef.current?.cancel(), []);

  const toggle = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    animationRef.current?.cancel();
    const reduce = prefersReducedMotion();

    if (!expanded) {
      const from = el.getBoundingClientRect().height;
      flushSync(() => setExpanded(true));
      const to = el.scrollHeight;
      if (reduce || to <= from) return;
      animationRef.current = el.animate([{ height: `${from}px` }, { height: `${to}px` }], {
        duration: Math.min(560, Math.max(320, (to - from) * 0.9)),
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      });
      return;
    }

    // Collapse: animate down to the clamp height, then hand control back to CSS.
    const style = getComputedStyle(el);
    const lines = parseFloat(style.getPropertyValue('--bio-lines')) || 5;
    const lineHeight = parseFloat(style.lineHeight) || 24;
    const from = el.getBoundingClientRect().height;
    const to = Math.min(from, lines * lineHeight);
    const finish = () => {
      setExpanded(false);
      // If the reader scrolled deep into the bio, bring its top back into view.
      const top = el.getBoundingClientRect().top;
      const navClearance = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 80;
      if (top < navClearance) {
        el.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
      }
    };
    if (reduce) {
      finish();
      return;
    }
    const animation = el.animate([{ height: `${from}px` }, { height: `${to}px` }], {
      duration: Math.min(420, Math.max(240, (from - to) * 0.6)),
      easing: 'cubic-bezier(0.65, 0, 0.35, 1)',
    });
    animationRef.current = animation;
    animation.onfinish = finish;
  }, [expanded]);

  const clamped = !expanded && overflows;

  return (
    <div className={styles.biography}>
      <div
        ref={bodyRef}
        id={bodyId}
        className={`${styles.bioBody} ${clamped ? styles.bioClamped : ''} ${expanded ? styles.bioExpanded : ''}`}
      >
        {paragraphs.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>
      {overflows && (
        <button
          type="button"
          className={styles.readMoreButton}
          onClick={toggle}
          aria-expanded={expanded}
          aria-controls={bodyId}
        >
          <span>{expanded ? 'Show less' : 'Read more'}</span>
          <svg className={styles.readMoreChevron} viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      )}
    </div>
  );
}
