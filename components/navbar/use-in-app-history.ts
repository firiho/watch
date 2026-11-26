'use client';

import { useCallback, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

/*
 * Knows whether the previous history entry belongs to this app, so the mobile
 * top bar's Back button can call router.back() (restoring the page you came
 * from) without ever stepping out of the app. Home-screen (standalone) web apps
 * have no browser back button or edge swipe, so this is the only way back.
 *
 * A small pathname stack in sessionStorage (per tab, survives reloads):
 * - the previous pathname again → a back navigation: pop
 * - the same pathname → reload / replace / query change: nothing
 * - anything else → push
 *
 * sessionStorage is only read in effects and at click time, so the server and
 * the first client render stay identical.
 */

const STORAGE_KEY = 'watch.navStack';
const MAX_ENTRIES = 50;

function readStack(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : [];
  } catch {
    return [];
  }
}

function writeStack(stack: string[]): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stack));
  } catch {
    // Storage unavailable (private mode quota, blocked): Back falls back to Home.
  }
}

/** Whether this page load has been checked against the saved stack (once per document). */
let loadChecked = false;

/**
 * Whether the stack sessionStorage kept for this tab still describes history
 * on this page load.
 * - A new tab, a typed URL, a bookmark, a home-screen launch or an external
 *   link: nothing earlier in history is ours.
 * - A link from another page of the app (no client router yet): it is.
 * - A reload or a browser back/forward into this page must land on the entry
 *   the stack ends on (or the one before it); anything else is out of sync.
 */
function stackStillValid(stack: string[], pathname: string): boolean {
  if (window.history.length <= 1) return false;
  const entry = performance.getEntriesByType?.('navigation')[0] as PerformanceNavigationTiming | undefined;
  if (entry?.type === 'navigate') {
    try {
      return Boolean(document.referrer) && new URL(document.referrer).origin === window.location.origin;
    } catch {
      return false;
    }
  }
  if (entry?.type === 'reload' || entry?.type === 'back_forward') return stack.slice(-2).includes(pathname);
  return true;
}

/** Returns the Back action: history back when the previous entry is in the app, otherwise Home. */
export function useInAppBack(): () => void {
  const pathname = usePathname() || '/';
  const router = useRouter();

  useEffect(() => {
    let stack = readStack();
    let changed = false;

    if (!loadChecked) {
      loadChecked = true;
      if (stack.length > 0 && !stackStillValid(stack, pathname)) {
        stack = [];
        changed = true;
      }
    }

    const last = stack.length - 1;
    if (last >= 1 && stack[last - 1] === pathname) {
      stack.pop();
      changed = true;
    } else if (stack[last] !== pathname) {
      stack.push(pathname);
      if (stack.length > MAX_ENTRIES) stack = stack.slice(-MAX_ENTRIES);
      changed = true;
    }

    if (changed) writeStack(stack);
  }, [pathname]);

  return useCallback(() => {
    const stack = readStack();
    const last = stack.length - 1;
    const previousIsInApp = last >= 1 && stack[last] === pathname && window.history.length > 1;
    if (previousIsInApp) router.back();
    else router.push('/');
  }, [pathname, router]);
}
