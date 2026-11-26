'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './navbar.module.css';
import Logo from '../logo/logo';
import Search from '../search/search';
import ProfileMenu from '../profile-menu/profile-menu';
import NotificationsBell from '../inbox-popup/notifications-bell';
import { useAuth } from '@/context/auth-context';
import { isScrollLocked } from '@/hooks/use-body-scroll-lock';
import { useInAppBack } from './use-in-app-history';

/** Scroll distance (px) over which the bar goes from transparent to glass. */
const GLASS_DISTANCE = 96;
/** Auth resolves client-side; never keep the actions hidden if it doesn't. */
const READY_FALLBACK_MS = 900;

const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/**
 * Screens you drill into rather than tabs (see mobile-tab-bar.tsx). On phones
 * the bar shows Back in place of the logo there. Unknown paths (the 404 page)
 * keep the logo: that page has its own "Back to Safety" and the tab bar.
 */
const PUSHED_ROUTES = ['/star', '/search', '/settings', '/auth'];

const BackChevron = () => (
  <svg
    className={styles.backChevron}
    viewBox="0 0 12 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M10 2 2 10l8 8" />
  </svg>
);

const Navbar = () => {
  const { user, loading } = useAuth();
  const pathname = usePathname() || '/';
  const goBack = useInAppBack();
  const headerRef = useRef<HTMLElement>(null);
  const [fallbackReady, setFallbackReady] = useState(false);
  const ready = !loading || fallbackReady;
  const pushed = PUSHED_ROUTES.some((href) => isActive(pathname, href));

  // Scroll-linked glass. Written straight onto the element (no React state per
  // frame), coalesced to one write per animation frame, and frozen while an
  // overlay holds the body scroll lock (scrollY reads 0 during the lock).
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    let frame = 0;
    let last = -1;

    const apply = () => {
      frame = 0;
      if (isScrollLocked()) return;
      const progress = Math.min(Math.max(window.scrollY / GLASS_DISTANCE, 0), 1);
      const rounded = Math.round(progress * 100) / 100;
      if (rounded === last) return;
      last = rounded;
      header.style.setProperty('--nav-opacity', String(rounded));
      header.style.setProperty('--nav-blur', `${(rounded * 20).toFixed(1)}px`);
      header.style.setProperty('--nav-sat', `${Math.round(100 + rounded * 80)}%`);
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };

    apply();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // While the body is scroll-locked on desktop the scrollbar disappears and the
  // lock pads <body> by its width. Mirror that padding so the fixed bar's
  // contents don't jump sideways when a dialog opens.
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const html = document.documentElement;
    const sync = () => {
      header.style.paddingRight = html.hasAttribute('data-scroll-locked') ? document.body.style.paddingRight : '';
    };
    const observer = new MutationObserver(sync);
    observer.observe(html, { attributes: true, attributeFilter: ['data-scroll-locked'] });
    sync();
    return () => observer.disconnect();
  }, []);

  // Which links (My List) and which account control to show depends on auth,
  // so the actions fade in once it resolves rather than flashing "Sign In".
  useEffect(() => {
    if (!loading) return;
    const timer = window.setTimeout(() => setFallbackReady(true), READY_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [loading]);

  const links = [
    { href: '/movies', label: 'Movies' },
    { href: '/tv-shows', label: 'TV Shows' },
    ...(user ? [{ href: '/watchlist', label: 'My List' }] : []),
    // Public, so it shows signed out too — numbered after My List when that's visible.
    { href: '/recs', label: 'Recs' },
  ];

  const onAuthPage = pathname === '/auth' || pathname.startsWith('/auth/');

  return (
    <header ref={headerRef} className={styles.header} data-pushed={pushed ? '' : undefined}>
      <div className={styles.inner}>
        {pushed && (
          <button type="button" className={styles.back} onClick={goBack}>
            <BackChevron />
            Back
          </button>
        )}

        <Link href="/" className={`${styles.brand} logo-link`} draggable={false}>
          <Logo />
          <span className={styles.wordmark}>Watch</span>
        </Link>

        <div className={styles.actions} data-ready={ready ? '' : undefined}>
          <nav className={styles.links} aria-label="Main">
            <ol>
              {links.map((link, index) => {
                const active = isActive(pathname, link.href);
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className={styles.link}
                      aria-current={active ? 'page' : undefined}
                    >
                      <span className="text-accent">{String(index + 1).padStart(2, '0')}.</span>
                      <span className={styles.linkLabel}>{link.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </nav>

          <Search />

          {user ? (
            <>
              {/* Phones only (hidden by its CSS on desktop, which keeps the reminder stack). */}
              <NotificationsBell />
              <div className={styles.account}>
                <ProfileMenu />
              </div>
            </>
          ) : (
            !onAuthPage && (
              <div className={styles.account}>
                <Link href="/auth" className={styles.signIn}>
                  Sign In
                </Link>
              </div>
            )
          )}
        </div>
      </div>
    </header>
  );
};

export default Navbar;
