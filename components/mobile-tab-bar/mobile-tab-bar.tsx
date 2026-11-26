'use client';

import { useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { haptic } from '@/lib/haptics';
import { isScrollLocked } from '@/hooks/use-body-scroll-lock';
import styles from './mobile-tab-bar.module.css';

/*
 * iOS-style bottom tab bar (≤768px only — hidden by CSS above that).
 *
 * - Rendered as <nav data-mobile-tabbar>: globals.css reserves its height at
 *   the end of the page and exposes it to other fixed UI as --tabbar-offset.
 * - Tapping a tab highlights it immediately (optimistic), before the route
 *   finishes loading, the way a native tab bar switches instantly.
 * - Tapping the tab you're already on scrolls back to the top.
 * - Steps out of the way while the on-screen keyboard is up.
 */

type IconProps = { filled: boolean };

const ICON_PROPS = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
};

const HOUSE_BODY =
  'M3.75 11.15V19a2.25 2.25 0 0 0 2.25 2.25h12A2.25 2.25 0 0 0 20.25 19v-7.85a1.5 1.5 0 0 0-.55-1.16l-7.07-5.8a1 1 0 0 0-1.26 0L4.3 9.99a1.5 1.5 0 0 0-.55 1.16Z';
const HOUSE_FILLED =
  'M3.75 11.15V19a2.25 2.25 0 0 0 2.25 2.25h3.5V16.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v4.75h3.5A2.25 2.25 0 0 0 20.25 19v-7.85a1.5 1.5 0 0 0-.55-1.16l-7.07-5.8a1 1 0 0 0-1.26 0L4.3 9.99a1.5 1.5 0 0 0-.55 1.16Z';

function HomeIcon({ filled }: IconProps) {
  return filled ? (
    <svg {...ICON_PROPS}>
      <path d={HOUSE_FILLED} fill="currentColor" />
    </svg>
  ) : (
    <svg {...ICON_PROPS}>
      <path d={HOUSE_BODY} />
      <path d="M9.5 21.25V16.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v4.75" />
    </svg>
  );
}

function MoviesIcon({ filled }: IconProps) {
  // Clapperboard: slate + board. Filled variant cuts the slate stripes out in
  // the bar's own tone so they read as gaps.
  return (
    <svg {...ICON_PROPS}>
      <path
        d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z"
        fill={filled ? 'currentColor' : 'none'}
      />
      <path
        d="m6.2 5.3 3.1 3.9M12.4 3.4l3.1 4"
        style={filled ? { stroke: 'var(--tab-cutout)', strokeWidth: 1.6 } : undefined}
      />
      <path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" fill={filled ? 'currentColor' : 'none'} />
    </svg>
  );
}

function TvIcon({ filled }: IconProps) {
  return (
    <svg {...ICON_PROPS}>
      <rect x="2.75" y="4.25" width="18.5" height="12.75" rx="2.5" fill={filled ? 'currentColor' : 'none'} />
      <path d="M8 20.5h8" />
    </svg>
  );
}

function RecsIcon({ filled }: IconProps) {
  return (
    <svg {...ICON_PROPS}>
      <path
        d="M11.1 3.9a1 1 0 0 1 1.8 0l2.06 4.18 4.6.67a1 1 0 0 1 .56 1.71l-3.33 3.25.79 4.59a1 1 0 0 1-1.45 1.05L12 17.2l-4.12 2.17a1 1 0 0 1-1.45-1.05l.79-4.6-3.33-3.24a1 1 0 0 1 .56-1.7l4.6-.68Z"
        fill={filled ? 'currentColor' : 'none'}
      />
    </svg>
  );
}

function ListIcon({ filled }: IconProps) {
  return (
    <svg {...ICON_PROPS}>
      <path
        d="M6.75 3.75h10.5a1.5 1.5 0 0 1 1.5 1.5v14.88a.75.75 0 0 1-1.2.6L12 16.5l-5.55 4.23a.75.75 0 0 1-1.2-.6V5.25a1.5 1.5 0 0 1 1.5-1.5Z"
        fill={filled ? 'currentColor' : 'none'}
      />
    </svg>
  );
}

interface Tab {
  href: string;
  label: string;
  icon: (props: IconProps) => ReactNode;
  requiresAuth?: boolean;
}

const TABS: Tab[] = [
  { href: '/', label: 'Home', icon: HomeIcon },
  { href: '/movies', label: 'Movies', icon: MoviesIcon },
  { href: '/tv-shows', label: 'TV', icon: TvIcon },
  { href: '/recs', label: 'Recs', icon: RecsIcon },
  { href: '/watchlist', label: 'My List', icon: ListIcon, requiresAuth: true },
];

const matchesRoute = (pathname: string, href: string) =>
  href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

const NON_TEXT_INPUTS = new Set(['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit']);

function isEditable(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable || el.tagName === 'TEXTAREA') return true;
  return el.tagName === 'INPUT' && !NON_TEXT_INPUTS.has((el as HTMLInputElement).type);
}

/** Auth resolves client-side; don't hold the tabs hostage if it never does. */
const READY_FALLBACK_MS = 900;
/** Clears an optimistic highlight if a navigation never lands. */
const PENDING_TIMEOUT_MS = 6000;

export default function MobileTabBar() {
  const pathname = usePathname() || '/';
  const { user, loading } = useAuth();
  const navRef = useRef<HTMLElement>(null);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [popHref, setPopHref] = useState<string | null>(null);
  const [fallbackReady, setFallbackReady] = useState(false);
  const ready = !loading || fallbackReady;

  // A landed navigation replaces the optimistic highlight.
  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  useEffect(() => {
    if (!pendingHref) return;
    const timer = window.setTimeout(() => setPendingHref(null), PENDING_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [pendingHref]);

  // The signed-in tab set (with My List) is only known once auth resolves, so
  // the tabs fade in then instead of reflowing from 4 to 5 in front of you.
  useEffect(() => {
    if (!loading) return;
    const timer = window.setTimeout(() => setFallbackReady(true), READY_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [loading]);

  // Hide while the on-screen keyboard is open. iOS Safari keeps the layout
  // viewport and only shrinks the visual viewport; Android Chrome, in-app
  // browsers (Telegram, Instagram) and resizes-content shrink the layout
  // viewport too, which would float the bar on top of the keyboard. Measuring
  // against the height last seen while nothing editable was focused covers
  // both. The latest such height, not the tallest: after a resize with no
  // keyboard (a desktop window, split screen) the old height no longer applies.
  // Remembered per width, so rotating resets it.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const fullHeights = new Map<number, number>();
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const editing = isEditable(document.activeElement);
        // Layout width: changes on rotation, not with pinch zoom.
        const width = document.documentElement.clientWidth;
        if (!editing) fullHeights.set(width, window.innerHeight);
        const fullHeight = fullHeights.get(width) ?? window.innerHeight;
        // × scale: pinch zoom shrinks the visual viewport without a keyboard.
        const keyboardOpen = editing && fullHeight - vv.height * vv.scale > 140;
        navRef.current?.toggleAttribute('data-keyboard', keyboardOpen);
      });
    };
    update();
    vv.addEventListener('resize', update);
    window.addEventListener('resize', update);
    window.addEventListener('focusin', update);
    window.addEventListener('focusout', update);
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener('resize', update);
      window.removeEventListener('resize', update);
      window.removeEventListener('focusin', update);
      window.removeEventListener('focusout', update);
    };
  }, []);

  if (pathname === '/auth' || pathname.startsWith('/auth/')) return null;

  const tabs = TABS.filter((tab) => !tab.requiresAuth || user);
  const routeHref = tabs.find((tab) => matchesRoute(pathname, tab.href))?.href ?? null;
  const activeHref = pendingHref ?? routeHref;

  const handleClick = (event: ReactMouseEvent<HTMLAnchorElement>, href: string) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    if (pathname === href) {
      // Already here: tap again to jump back to the top, like iOS.
      event.preventDefault();
      if (isScrollLocked() || window.scrollY <= 0) return;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
      return;
    }

    haptic('selection');
    setPendingHref(href);
    setPopHref(href);
  };

  return (
    <nav
      ref={navRef}
      className={styles.tabbar}
      data-mobile-tabbar=""
      data-ready={ready ? '' : undefined}
      aria-label="Primary"
    >
      <ul className={styles.list} role="list">
        {tabs.map((tab) => {
          const active = tab.href === activeHref;
          const Icon = tab.icon;
          return (
            <li key={tab.href} className={styles.item}>
              <Link
                href={tab.href}
                className={styles.tab}
                aria-current={active ? 'page' : undefined}
                data-active={active ? '' : undefined}
                onClick={(event) => handleClick(event, tab.href)}
                draggable={false}
              >
                <span className={styles.icon} data-pop={active && popHref === tab.href ? '' : undefined}>
                  <Icon filled={active} />
                </span>
                <span className={styles.label}>{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
