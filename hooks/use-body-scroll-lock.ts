'use client';

import { useEffect } from 'react';

/**
 * iOS-safe, ref-counted body scroll lock.
 *
 * `overflow: hidden` on <body> doesn't reliably stop touch scrolling in iOS
 * Safari, and several overlays can be open at once (sheet + picker + menu), so
 * every overlay goes through this single lock instead of writing body styles
 * directly. The page is pinned with `position: fixed` at its current offset and
 * restored exactly when the last lock is released.
 *
 * While locked, <html> carries `data-scroll-locked`, so scroll listeners can
 * ignore the synthetic jump to scrollY = 0 (see `isScrollLocked`).
 */

let lockCount = 0;
let savedScrollY = 0;
let savedLocation = '';
let savedStyles: Partial<Record<'position' | 'top' | 'left' | 'right' | 'width' | 'overflow' | 'paddingRight', string>> = {};

export function isScrollLocked(): boolean {
  return typeof document !== 'undefined' && document.documentElement.hasAttribute('data-scroll-locked');
}

/** The page offset to treat as "current" — the frozen one while locked. */
export function getPageScrollY(): number {
  if (typeof window === 'undefined') return 0;
  return isScrollLocked() ? savedScrollY : window.scrollY;
}

export function lockBodyScroll(): void {
  if (typeof document === 'undefined') return;
  lockCount += 1;
  if (lockCount > 1) return;

  const { body, documentElement: html } = document;
  savedScrollY = window.scrollY;
  savedLocation = window.location.pathname + window.location.search;
  const scrollbarWidth = window.innerWidth - html.clientWidth;

  savedStyles = {
    position: body.style.position,
    top: body.style.top,
    left: body.style.left,
    right: body.style.right,
    width: body.style.width,
    overflow: body.style.overflow,
    paddingRight: body.style.paddingRight,
  };

  // Flag first so scroll handlers ignore the jump caused by pinning the body.
  html.setAttribute('data-scroll-locked', '');
  html.style.setProperty('--scroll-lock-y', `${savedScrollY}px`);
  html.style.setProperty('--scrollbar-w', `${Math.max(0, scrollbarWidth)}px`);

  body.style.position = 'fixed';
  body.style.top = `-${savedScrollY}px`;
  body.style.left = '0';
  body.style.right = '0';
  body.style.width = '100%';
  body.style.overflow = 'hidden';
  if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;
}

export function unlockBodyScroll(): void {
  if (typeof document === 'undefined' || lockCount === 0) return;
  lockCount -= 1;
  if (lockCount > 0) return;

  const { body, documentElement: html } = document;
  body.style.position = savedStyles.position ?? '';
  body.style.top = savedStyles.top ?? '';
  body.style.left = savedStyles.left ?? '';
  body.style.right = savedStyles.right ?? '';
  body.style.width = savedStyles.width ?? '';
  body.style.overflow = savedStyles.overflow ?? '';
  body.style.paddingRight = savedStyles.paddingRight ?? '';

  // Restore instantly (never smooth-scroll back to where the user already was). If an
  // overlay navigated while it held the lock (e.g. a link tapped, then its exit animation),
  // the new page belongs at the top — Next's own scroll-to-top couldn't move a pinned body.
  const routeChanged = window.location.pathname + window.location.search !== savedLocation;
  const previousBehavior = html.style.scrollBehavior;
  html.style.scrollBehavior = 'auto';
  window.scrollTo(0, routeChanged ? 0 : savedScrollY);
  html.style.scrollBehavior = previousBehavior;

  html.style.removeProperty('--scroll-lock-y');
  html.style.removeProperty('--scrollbar-w');
  html.removeAttribute('data-scroll-locked');
}

/** Locks body scroll for as long as `active` is true and the component is mounted. */
export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    lockBodyScroll();
    return () => unlockBodyScroll();
  }, [active]);
}
