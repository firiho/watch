'use client';

import { useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { useAuth } from '@/context/auth-context';
import { useModalActions } from '@/context/modal-context';
import type { InboxItem } from '@/lib/inbox';
import { haptic } from '@/lib/haptics';
import { useMobileLayout } from '@/components/navbar/use-overlay';
import { confirmInboxItem, dismissInboxItem, useInbox, useLeavingItems } from './inbox-store';
import styles from './inbox-popup.module.css';

/*
 * Reminder notifications on the desktop layout: a stack of cards under the
 * top-right of the navbar. Phones (≤768px) don't get the floating stack; the
 * top bar's bell opens them in a sheet instead (notifications-bell.tsx). Both
 * read the same inbox store, so there is one Firestore listener.
 */

type Swipe = {
  id: string;
  pointerId: number;
  el: HTMLElement;
  startX: number;
  startY: number;
  dx: number;
  active: boolean;
  samples: Array<{ t: number; x: number }>;
};

/** Exit animation length for a card that left the inbox (keep in sync with the CSS). */
const LEAVE_MS = 220;
const SWIPE_DISTANCE = 0.32; // of the card width
const SWIPE_VELOCITY = 0.5; // px/ms

const cx = (...names: Array<string | false | null | undefined>) => names.filter(Boolean).join(' ');

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

const InboxPopup = () => {
  const { user } = useAuth();
  const { openModal } = useModalActions();
  const mobile = useMobileLayout();
  const uid = user?.uid ?? null;
  const { items, acting } = useInbox(uid);
  const [minimized, setMinimized] = useState<Record<string, boolean>>({});
  // Minimized cards belong to the account that minimized them.
  const [minimizedFor, setMinimizedFor] = useState(uid);
  if (minimizedFor !== uid) {
    setMinimizedFor(uid);
    setMinimized({});
  }
  // What's on screen: `items`, plus recently removed ones while they animate out.
  const shown = useLeavingItems(items, LEAVE_MS);

  const stackRef = useRef<HTMLDivElement>(null);
  const slotRefs = useRef(new Map<string, HTMLDivElement>());
  const lastOffsets = useRef(new Map<string, number>());
  const swipeRef = useRef<Swipe | null>(null);
  const suppressClickRef = useRef(false);

  // FLIP: when cards come and go, glide the others to their new spots instead of jumping.
  useLayoutEffect(() => {
    const stack = stackRef.current;
    const previous = lastOffsets.current;
    const next = new Map<string, number>();
    if (!stack) {
      lastOffsets.current = next;
      return;
    }
    const stackTop = stack.getBoundingClientRect().top;
    const animate = !prefersReducedMotion();
    slotRefs.current.forEach((el, id) => {
      const offset = el.getBoundingClientRect().top - stackTop;
      next.set(id, offset);
      const before = previous.get(id);
      if (!animate || before === undefined) return;
      const delta = before - offset;
      if (Math.abs(delta) < 1) return;
      // Restart any FLIP still in flight; leave CSS animations (enter/leave) alone.
      el.getAnimations?.().forEach((a) => {
        if (!('animationName' in a)) a.cancel();
      });
      el.animate([{ transform: `translate3d(0, ${delta}px, 0)` }, { transform: 'translate3d(0, 0, 0)' }], {
        duration: 380,
        easing: 'cubic-bezier(0.32, 0.72, 0, 1)',
      });
    });
    lastOffsets.current = next;
  });

  if (!user || mobile || shown.length === 0) return null;

  const handleConfirm = (item: InboxItem) => {
    if (acting.has(item.id) || item.type !== 'tv') return;
    haptic('success');
    void confirmInboxItem(user.uid, item);
  };

  const handleDismiss = (item: InboxItem) => {
    if (acting.has(item.id)) return;
    haptic('light');
    void dismissInboxItem(user.uid, item);
  };

  const toggleMinimize = (id: string) => {
    haptic('selection');
    setMinimized((m) => ({ ...m, [id]: !m[id] }));
  };

  const openItem = (item: InboxItem) => openModal(item.reminderId, item.type);

  // ---- Swipe a card sideways (touch only) to minimize it. Never confirms or dismisses. ----

  const settleCard = (el: HTMLElement) => {
    el.style.transition = 'transform 380ms var(--ease-ios), opacity 380ms var(--ease-ios)';
    el.style.transform = '';
    el.style.opacity = '';
  };

  const handlePointerDown = (e: PointerEvent<HTMLElement>, item: InboxItem) => {
    if (e.pointerType !== 'touch' || !e.isPrimary || acting.has(item.id)) return;
    swipeRef.current = {
      id: item.id,
      pointerId: e.pointerId,
      el: e.currentTarget,
      startX: e.clientX,
      startY: e.clientY,
      dx: 0,
      active: false,
      samples: [{ t: e.timeStamp, x: e.clientX }],
    };
  };

  const handlePointerMove = (e: PointerEvent<HTMLElement>) => {
    const s = swipeRef.current;
    if (!s || e.pointerId !== s.pointerId) return;
    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;
    if (!s.active) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        swipeRef.current = null; // vertical: leave it to the page
        return;
      }
      s.active = true;
      s.el.setPointerCapture(e.pointerId);
      s.el.style.transition = 'none';
    }
    s.dx = dx;
    s.el.style.transform = `translate3d(${dx}px, 0, 0)`;
    s.el.style.opacity = String(Math.max(0.25, 1 - Math.abs(dx) / (s.el.offsetWidth * 1.1)));
    s.samples.push({ t: e.timeStamp, x: e.clientX });
    if (s.samples.length > 6) s.samples.shift();
  };

  const handlePointerEnd = (e: PointerEvent<HTMLElement>, cancelled = false) => {
    const s = swipeRef.current;
    if (!s || e.pointerId !== s.pointerId) return;
    swipeRef.current = null;
    if (!s.active) return;

    // A swipe must never turn into a tap on whatever button it started on.
    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 350);

    const last = s.samples[s.samples.length - 1];
    const first = s.samples.find((sample) => last.t - sample.t <= 100) ?? last;
    const velocity = last.t > first.t ? (last.x - first.x) / (last.t - first.t) : 0;
    const width = s.el.offsetWidth;
    const flung =
      !cancelled &&
      (Math.abs(s.dx) > width * SWIPE_DISTANCE ||
        (Math.abs(velocity) > SWIPE_VELOCITY && Math.sign(velocity) === Math.sign(s.dx)));

    if (!flung) {
      settleCard(s.el);
      return;
    }

    haptic('light');
    const direction = Math.sign(s.dx) || 1;
    s.el.style.transition = 'transform 200ms var(--ease-out), opacity 200ms var(--ease-out)';
    s.el.style.transform = `translate3d(${direction * (width + 48)}px, 0, 0)`;
    s.el.style.opacity = '0';
    const { id } = s;
    window.setTimeout(() => setMinimized((m) => ({ ...m, [id]: true })), 180);
  };

  const handleClickCapture = (e: MouseEvent<HTMLElement>) => {
    if (!suppressClickRef.current) return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div ref={stackRef} className={styles.stack} aria-live="polite" aria-label="Reminders">
      {shown.map(({ item, leaving }) => {
        const isMin = !!minimized[item.id];
        const isActing = acting.has(item.id);
        const isTV = item.type === 'tv';
        const epLabel = isTV ? `S${item.season}·E${item.episode}` : null;
        const kicker = isTV
          ? 'New episode'
          : item.milestone === 'theaters'
            ? 'Now in theaters'
            : 'Out now in HD';
        const titleId = `inbox-${item.id}-title`;

        return (
          <div
            key={item.id}
            ref={(el) => {
              if (el) slotRefs.current.set(item.id, el);
              else slotRefs.current.delete(item.id);
            }}
            className={cx(styles.slot, leaving && styles.leaving)}
            aria-hidden={leaving || undefined}
          >
            {isMin ? (
              <div key="pill" className={styles.pill}>
                <span className={styles.pillDot} aria-hidden="true" />
                <button
                  type="button"
                  className={styles.pillName}
                  onClick={() => openItem(item)}
                  title={`Open ${item.name}`}
                >
                  {item.name}
                </button>
                {epLabel && (
                  <>
                    <span className={styles.pillSep} aria-hidden="true">
                      ·
                    </span>
                    <span className={styles.pillEp}>{epLabel}</span>
                  </>
                )}
                <button
                  type="button"
                  className={styles.pillExpand}
                  onClick={() => toggleMinimize(item.id)}
                  aria-label="Expand reminder"
                  title="Expand reminder"
                >
                  <svg className={styles.pillChev} viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
              </div>
            ) : (
              <article
                key="card"
                className={styles.card}
                aria-labelledby={titleId}
                onPointerDown={(e) => handlePointerDown(e, item)}
                onPointerMove={handlePointerMove}
                onPointerUp={(e) => handlePointerEnd(e)}
                onPointerCancel={(e) => handlePointerEnd(e, true)}
                onClickCapture={handleClickCapture}
              >
                <div className={styles.cardHeader}>
                  <div className={styles.headerText}>
                    <span className={styles.kicker}>
                      <span className={styles.liveDot} aria-hidden="true" />
                      {kicker}
                    </span>
                    <button
                      id={titleId}
                      type="button"
                      className={styles.cardTitle}
                      onClick={() => openItem(item)}
                      title={`Open ${item.name}`}
                    >
                      {item.name}
                    </button>
                  </div>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() => toggleMinimize(item.id)}
                    aria-label="Minimize"
                    title="Minimize"
                  >
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12h14" />
                    </svg>
                  </button>
                </div>

                {isTV ? (
                  <>
                    <div className={styles.cardBody}>
                      <span className={styles.epBadge}>{epLabel}</span>
                      <span className={styles.bodyText}>just dropped — have you watched it?</span>
                    </div>
                    <div className={styles.cardActions}>
                      <button
                        type="button"
                        className={cx(styles.actionBtn, styles.primary)}
                        onClick={() => handleConfirm(item)}
                        disabled={isActing}
                      >
                        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M5 12.5L10 17L19 8" />
                        </svg>
                        Watched
                      </button>
                      <button
                        type="button"
                        className={styles.actionBtn}
                        onClick={() => handleDismiss(item)}
                        disabled={isActing}
                      >
                        Dismiss
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className={styles.cardBody}>
                      <span className={styles.bodyText}>
                        {item.milestone === 'theaters'
                          ? 'is now showing in theaters.'
                          : 'is now available to stream in HD.'}
                      </span>
                    </div>
                    <div className={styles.cardActions}>
                      <button
                        type="button"
                        className={cx(styles.actionBtn, styles.primary)}
                        onClick={() => openItem(item)}
                      >
                        View
                      </button>
                      <button
                        type="button"
                        className={styles.actionBtn}
                        onClick={() => handleDismiss(item)}
                        disabled={isActing}
                      >
                        Dismiss
                      </button>
                    </div>
                  </>
                )}
              </article>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default InboxPopup;
