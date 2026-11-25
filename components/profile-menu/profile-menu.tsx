'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { useProfile } from '@/context/profile-context';
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock';
import { haptic } from '@/lib/haptics';
import { isMobileLayout, useOverlay } from '@/components/navbar/use-overlay';
import styles from './profile-menu.module.css';

const getInitials = (name?: string) => {
  if (!name) return '';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const PersonGlyph = ({ size }: { size: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const EXIT_FALLBACK_MS = 520;
/** Drag distance (fraction of sheet height) or flick speed (px/ms) that dismisses. */
const DISMISS_FRACTION = 0.25;
const DISMISS_VELOCITY = 0.5;

interface DragState {
  pointerId: number;
  startY: number;
  lastY: number;
  lastTime: number;
  velocity: number;
  offset: number;
  dragging: boolean;
}

/*
 * Account menu.
 * Desktop: a glass dropdown that scales out of the avatar (top-right origin).
 * Mobile (≤768px): an iOS-style bottom sheet — grabber, identity header,
 * grouped rows, destructive "Sign Out" — that you can drag down to dismiss.
 * Both are portaled to <body> so they sit above the tab bar and get real
 * backdrop blur; the layout switch is CSS.
 */
const ProfileMenu = () => {
  const { user, signOut } = useAuth();
  const { profile, label } = useProfile();
  const { state, stateRef, isOpen, isMounted, open, close, finish } = useOverlay(EXIT_FALLBACK_MS);
  const [anchor, setAnchor] = useState({ top: 0, left: 0 });
  const pathname = usePathname();
  const menuId = useId();

  const buttonRef = useRef<HTMLButtonElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const signOutPendingRef = useRef(false);
  const signOutRef = useRef(signOut);
  const openWidthRef = useRef(0);
  const dragRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);

  const displayName = profile?.displayName?.trim();
  const initials = getInitials(displayName);

  useBodyScrollLock(isMounted);

  const openMenu = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    // Anchor by the avatar's right edge, measured from the left, so the
    // scrollbar disappearing under the scroll lock can't misalign it.
    if (rect) setAnchor({ top: Math.round(rect.bottom + 10), left: Math.round(rect.right) });
    openWidthRef.current = window.innerWidth;
    if (isMobileLayout()) haptic('light');
    open();
  };

  const closeMenu = (restoreFocus = true) => {
    close();
    if (restoreFocus) buttonRef.current?.focus({ preventScroll: true });
  };

  // Move focus into the menu once it's on screen.
  useEffect(() => {
    if (!isOpen) return;
    const first = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
    first?.focus({ preventScroll: true });
  }, [isOpen]);

  // Escape closes (capture phase, so nothing underneath also reacts). ⌘K also
  // closes it, letting the search palette open in its place.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && typeof event.key === 'string' && event.key.toLowerCase() === 'k') {
        close();
        return;
      }
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      close();
      buttonRef.current?.focus({ preventScroll: true });
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen, close]);

  // Close if the route changes underneath, or the window is resized (the
  // dropdown is anchored to a measured position).
  useEffect(() => {
    if (stateRef.current === 'open') close();
  }, [pathname, close, stateRef]);

  // Width only: iOS fires height-only resizes as its toolbars show and hide.
  useEffect(() => {
    if (!isOpen) return;
    const onResize = () => {
      if (window.innerWidth !== openWidthRef.current) close();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [isOpen, close]);

  // Sign out once the menu has animated away (also if we unmount first).
  useEffect(() => {
    signOutRef.current = signOut;
  });

  useEffect(() => {
    if (state === 'closed' && signOutPendingRef.current) {
      signOutPendingRef.current = false;
      void signOutRef.current();
    }
  }, [state]);

  useEffect(
    () => () => {
      if (signOutPendingRef.current) {
        signOutPendingRef.current = false;
        void signOutRef.current();
      }
    },
    []
  );

  if (!user) return null;

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    if (items.length === 0) return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (event.key === 'ArrowDown') next = (index + 1) % items.length;
    else if (event.key === 'ArrowUp') next = (index - 1 + items.length) % items.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    else if (event.key === 'Tab') {
      event.preventDefault();
      closeMenu(true);
      return;
    }
    if (next >= 0) {
      event.preventDefault();
      items[next].focus();
    }
  };

  /* ---------------------------------------------------------- Drag to dismiss */

  const sheetMode = () => isMobileLayout();

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!sheetMode() || stateRef.current !== 'open' || !event.isPrimary || event.button !== 0) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      lastY: event.clientY,
      lastTime: event.timeStamp,
      velocity: 0,
      offset: 0,
      dragging: false,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const sheet = menuRef.current;
    if (!drag || !sheet || event.pointerId !== drag.pointerId) return;
    const delta = event.clientY - drag.startY;

    if (!drag.dragging) {
      if (Math.abs(delta) < 6) return;
      drag.dragging = true;
      sheet.setPointerCapture(event.pointerId);
      // Retire the enter animation (data-settled) and follow the finger 1:1.
      sheet.setAttribute('data-settled', '');
      sheet.style.transition = 'none';
      if (backdropRef.current) {
        backdropRef.current.setAttribute('data-settled', '');
        backdropRef.current.style.transition = 'none';
      }
    }

    const dt = event.timeStamp - drag.lastTime;
    if (dt > 0) {
      const instant = (event.clientY - drag.lastY) / dt;
      drag.velocity = drag.velocity * 0.2 + instant * 0.8;
    }
    drag.lastY = event.clientY;
    drag.lastTime = event.timeStamp;

    // Downward follows the finger; upward rubber-bands.
    drag.offset = delta >= 0 ? delta : -Math.min(28, Math.sqrt(-delta) * 2.4);
    sheet.style.transform = `translate3d(0, ${drag.offset}px, 0)`;
    if (backdropRef.current) {
      const progress = Math.min(Math.max(drag.offset, 0) / sheet.offsetHeight, 1);
      backdropRef.current.style.opacity = String(1 - progress);
    }
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
    const drag = dragRef.current;
    const sheet = menuRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    if (!drag.dragging || !sheet) return;

    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 80);

    const backdrop = backdropRef.current;
    // A finger that came to rest before lifting has no fling velocity left.
    const velocity = event.timeStamp - drag.lastTime > 90 ? 0 : drag.velocity;
    const shouldDismiss =
      !cancelled && (drag.offset > sheet.offsetHeight * DISMISS_FRACTION || velocity > DISMISS_VELOCITY);

    sheet.style.transition = '';
    if (backdrop) backdrop.style.transition = '';

    if (shouldDismiss) {
      // The exit keyframes have no "from", so they continue from wherever the
      // finger let go (inline transform / backdrop opacity).
      haptic('light');
      closeMenu(true);
      return;
    }

    // Spring back.
    sheet.style.transition = 'transform var(--dur-slow) var(--ease-ios)';
    sheet.style.transform = '';
    if (backdrop) {
      backdrop.style.transition = 'opacity var(--dur-slow) var(--ease-ios)';
      backdrop.style.opacity = '';
    }
    const cleanup = () => {
      sheet.style.transition = '';
      if (backdrop) backdrop.style.transition = '';
    };
    sheet.addEventListener('transitionend', cleanup, { once: true });
  };

  const onClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!suppressClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
  };

  const avatar = (size: number) => (initials ? initials : <PersonGlyph size={size} />);

  const menu = isMounted
    ? createPortal(
        <div
          className={styles.root}
          data-state={state}
          style={{ '--anchor-top': `${anchor.top}px`, '--anchor-left': `${anchor.left}px` } as CSSProperties}
        >
          <div ref={backdropRef} className={styles.backdrop} aria-hidden="true" onClick={() => closeMenu(true)} />
          <div className={styles.anchor}>
            <div
              ref={menuRef}
              id={menuId}
              className={styles.menu}
              role="menu"
              aria-label={`Account: ${label}`}
              onKeyDown={onMenuKeyDown}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={(event) => endDrag(event)}
              onPointerCancel={(event) => endDrag(event, true)}
              onClickCapture={onClickCapture}
              onAnimationEnd={(event) => {
                if (event.target === event.currentTarget && stateRef.current === 'closing') finish();
              }}
            >
              <span className={styles.grabber} aria-hidden="true" />

              <div className={styles.identity}>
                <span className={styles.identityAvatar} aria-hidden="true">
                  {avatar(20)}
                </span>
                <span className={styles.identityText}>
                  <span className={styles.identityName}>{label}</span>
                  {displayName && user.phoneNumber && <span className={styles.identitySub}>{user.phoneNumber}</span>}
                </span>
              </div>

              <div className={styles.group} role="none">
                <Link
                  href="/settings"
                  className={styles.item}
                  role="menuitem"
                  onClick={() => closeMenu(false)}
                >
                  <span className={styles.itemIcon} aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" focusable="false">
                      <circle cx="12" cy="12" r="3" />
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                    </svg>
                  </span>
                  <span className={styles.itemLabel}>Settings</span>
                  <svg className={styles.itemChevron} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                    <path d="m9.5 6 6 6-6 6" />
                  </svg>
                </Link>
              </div>

              <div className={styles.group} role="none">
                <button
                  type="button"
                  className={`${styles.item} ${styles.danger}`}
                  role="menuitem"
                  onClick={() => {
                    haptic('medium');
                    signOutPendingRef.current = true;
                    closeMenu(false);
                  }}
                >
                  <span className={styles.itemIcon} aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" focusable="false">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                  </span>
                  <span className={styles.itemLabel}>Sign Out</span>
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={styles.avatarButton}
        onClick={() => (stateRef.current === 'open' ? closeMenu(true) : openMenu())}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isMounted ? menuId : undefined}
        aria-label="Account menu"
      >
        <span className={styles.avatarFace}>{initials ? <span className={styles.initials}>{initials}</span> : <PersonGlyph size={18} />}</span>
      </button>
      {menu}
    </>
  );
};

export default ProfileMenu;
