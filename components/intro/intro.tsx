'use client';

import { useCallback, useEffect, useRef, useState, type AnimationEvent, type CSSProperties } from 'react';
import Logo from '../logo/logo';
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock';
import styles from './intro.module.css';

/**
 * Brand splash — plays once per browser session.
 *
 * No flash and no hydration mismatch:
 * - The server always renders the overlay, preceded by a tiny inline script.
 *   That script runs while the HTML is still being parsed — before the overlay
 *   exists or anything is painted — and records the decision on <html>:
 *   `data-intro="skip"` when this session has already seen the intro (or the
 *   user prefers reduced motion); otherwise it marks the session as seen and
 *   sets `data-intro="play"`.
 * - CSS hides the overlay under `html[data-intro="skip"]`, so returning
 *   visitors never get a single frame of it.
 * - React hydrates the exact same markup (<html> carries
 *   suppressHydrationWarning for the attribute), then reads the decision in an
 *   effect and either unmounts the overlay or lets it play.
 * - The timeline is pure CSS and starts at first paint rather than after
 *   hydration, so a slow JS boot can't stretch the splash, and the overlay
 *   hides itself even if JS never runs. JS only adds skip (tap / click /
 *   Escape), the scroll lock and the unmount.
 */

const STORAGE_KEY = 'watch.introSeen';
/** Overlay fully gone — keep in sync with the CSS timeline in intro.module.css. */
const INTRO_MS = 3200;
const SKIP_FALLBACK_MS = 450;

const DECIDE_SCRIPT = `(function(){var d=document.documentElement,s='play';try{if(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches||sessionStorage.getItem('${STORAGE_KEY}')){s='skip'}else{sessionStorage.setItem('${STORAGE_KEY}','1')}}catch(e){}d.setAttribute('data-intro',s)})();`;

type Phase = 'pending' | 'playing' | 'skipping' | 'gone';

// Set from effects only, so it's never shared between server requests. Keeps a
// client-side remount from replaying the splash within the same document.
let finishedThisDocument = false;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Fallback when the inline script couldn't run (e.g. blocked by a CSP). */
const decideHere = (): 'play' | 'skip' => {
  try {
    if (prefersReducedMotion() || window.sessionStorage.getItem(STORAGE_KEY)) return 'skip';
    window.sessionStorage.setItem(STORAGE_KEY, '1');
  } catch {
    /* storage unavailable: just play */
  }
  return 'play';
};

export default function Intro() {
  const [phase, setPhase] = useState<Phase>(() => (finishedThisDocument ? 'gone' : 'pending'));
  const [skipFrom, setSkipFrom] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useBodyScrollLock(phase === 'playing' || phase === 'skipping');

  const finish = useCallback(() => {
    finishedThisDocument = true;
    setPhase('gone');
  }, []);

  const skip = useCallback(() => {
    const el = overlayRef.current;
    if (!el) {
      finish();
      return;
    }
    // Fade out from wherever the timeline is (it may already be mid-fade).
    setSkipFrom(window.getComputedStyle(el).opacity);
    setPhase('skipping');
  }, [finish]);

  // Read the decision the inline script made (once per document).
  useEffect(() => {
    if (phase !== 'pending') return;
    const html = document.documentElement;
    let decision = html.getAttribute('data-intro');
    if (decision !== 'play' && decision !== 'skip') {
      decision = decideHere();
      html.setAttribute('data-intro', decision);
    }
    const el = overlayRef.current;
    // Already over (a slow boot can hydrate after the CSS timeline finished).
    if (decision === 'skip' || !el || window.getComputedStyle(el).visibility === 'hidden') {
      finish();
      return;
    }
    setPhase('playing');
  }, [phase, finish]);

  // While playing: skip from the keyboard, and a safety net in case animationend is missed.
  useEffect(() => {
    if (phase !== 'playing') return;
    let remaining = INTRO_MS;
    const animation = overlayRef.current?.getAnimations?.()[0];
    const timing = animation?.effect?.getComputedTiming();
    if (animation && timing && typeof timing.endTime === 'number' && typeof animation.currentTime === 'number') {
      remaining = Math.max(0, timing.endTime - animation.currentTime);
    }
    const timer = window.setTimeout(finish, remaining + 250);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        skip();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [phase, finish, skip]);

  useEffect(() => {
    if (phase !== 'skipping') return;
    const timer = window.setTimeout(finish, SKIP_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [phase, finish]);

  const handleAnimationEnd = (e: AnimationEvent<HTMLDivElement>) => {
    // Logo/stroke animations bubble up here too; only the overlay's own fade counts.
    if (e.target !== e.currentTarget) return;
    if (phase === 'playing' || phase === 'skipping') finish();
  };

  if (phase === 'gone') return null;

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: DECIDE_SCRIPT }} />
      <div
        ref={overlayRef}
        className={`${styles.overlay} ${phase === 'skipping' ? styles.skipping : ''}`}
        style={skipFrom ? ({ '--intro-skip-from': skipFrom } as CSSProperties) : undefined}
        aria-hidden="true"
        onClick={phase === 'playing' ? skip : undefined}
        onAnimationEnd={handleAnimationEnd}
      >
        <div className={styles.stage}>
          <span className={styles.glow} />
          <div className={styles.logoBox}>
            <Logo />
          </div>
        </div>
      </div>
    </>
  );
}
