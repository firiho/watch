'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';

/**
 * Small helpers shared by the navigation shell's overlays (search palette /
 * sheet, profile menu / action sheet).
 */

export type OverlayState = 'closed' | 'open' | 'closing';

/**
 * Open → closing → closed state machine, so overlays stay mounted while their
 * exit animation runs. Call `finish()` from `onAnimationEnd`; a timeout covers
 * the cases where no animation runs (reduced motion, interrupted animations).
 *
 * `open(true)` commits synchronously (flushSync) so the caller can focus an
 * element inside the overlay within the same user gesture — the only way iOS
 * Safari will raise the on-screen keyboard.
 */
export function useOverlay(exitFallbackMs = 450) {
  const [state, setState] = useState<OverlayState>('closed');
  const stateRef = useRef<OverlayState>('closed');

  const set = useCallback((next: OverlayState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const open = useCallback(
    (sync = false) => {
      if (stateRef.current === 'open') return;
      if (sync) flushSync(() => set('open'));
      else set('open');
    },
    [set]
  );

  const close = useCallback(() => {
    if (stateRef.current === 'open') set('closing');
  }, [set]);

  const finish = useCallback(() => {
    if (stateRef.current === 'closing') set('closed');
  }, [set]);

  useEffect(() => {
    if (state !== 'closing') return;
    const timer = window.setTimeout(finish, exitFallbackMs);
    return () => window.clearTimeout(timer);
  }, [state, finish, exitFallbackMs]);

  return {
    state,
    stateRef,
    isOpen: state === 'open',
    isMounted: state !== 'closed',
    open,
    close,
    finish,
  };
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Keeps Tab / Shift+Tab cycling inside `container`. Call from a keydown handler. */
export function trapTabKey(event: KeyboardEvent, container: HTMLElement | null): void {
  if (event.key !== 'Tab' || !container) return;
  const focusables = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.getClientRects().length > 0
  );
  if (focusables.length === 0) {
    event.preventDefault();
    return;
  }
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !container.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !container.contains(active))) {
    event.preventDefault();
    first.focus();
  }
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

const MOBILE_QUERY = '(max-width: 768px)';

/** True when the mobile (≤768px) layout is active. */
export function isMobileLayout(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.(MOBILE_QUERY).matches === true;
}

function subscribeToLayout(onChange: () => void): () => void {
  const query = window.matchMedia?.(MOBILE_QUERY);
  query?.addEventListener('change', onChange);
  return () => query?.removeEventListener('change', onChange);
}

/** isMobileLayout(), kept live across resizes and rotation (false on the server and while hydrating). */
export function useMobileLayout(): boolean {
  return useSyncExternalStore(subscribeToLayout, isMobileLayout, () => false);
}
