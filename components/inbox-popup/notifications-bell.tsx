'use client';

import { useEffect, useId, useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/context/auth-context';
import { useModalActions } from '@/context/modal-context';
import type { InboxItem } from '@/lib/inbox';
import { haptic } from '@/lib/haptics';
import SheetDialog from '@/components/reminder-episode-picker/sheet-dialog';
import { prefersReducedMotion, useMobileLayout } from '@/components/navbar/use-overlay';
import { confirmInboxItem, dismissInboxItem, retryInbox, useInbox, useLeavingItems } from './inbox-store';
import styles from './notifications.module.css';

/*
 * Phones (≤768px): the reminder inbox lives behind a bell in the top bar
 * instead of floating over the page. The bell carries the unread count and
 * opens an iOS-style "Notifications" sheet with the same items and actions as
 * the desktop cards (inbox-popup.tsx). Hidden by CSS on the desktop layout.
 */

/** Row exit length: 100ms delay + 260ms collapse (keep in sync with .rowLeaving in the CSS). */
const ROW_LEAVE_MS = 360;
const BADGE_MAX = 9;

const WIGGLE: Keyframe[] = [
  { transform: 'rotate(0deg)' },
  { transform: 'rotate(16deg)', offset: 0.14 },
  { transform: 'rotate(-13deg)', offset: 0.3 },
  { transform: 'rotate(9deg)', offset: 0.46 },
  { transform: 'rotate(-6deg)', offset: 0.62 },
  { transform: 'rotate(3deg)', offset: 0.8 },
  { transform: 'rotate(0deg)' },
];

const cx = (...names: Array<string | false | null | undefined>) => names.filter(Boolean).join(' ');

/** What a screen reader hears when items arrive while the app is open. */
function announcementFor(fresh: readonly InboxItem[]): string {
  if (fresh.length > 1) return `${fresh.length} new notifications`;
  const item = fresh[0];
  if (item.type === 'tv') return `New episode: ${item.name}, season ${item.season} episode ${item.episode}`;
  return `${item.milestone === 'theaters' ? 'Now in theaters' : 'Out now in HD'}: ${item.name}`;
}

function describe(item: InboxItem) {
  if (item.type === 'tv') {
    return {
      kicker: 'New episode',
      episode: `S${item.season}·E${item.episode}`,
      body: 'just dropped — have you watched it?',
    };
  }
  return {
    kicker: item.milestone === 'theaters' ? 'Now in theaters' : 'Out now in HD',
    episode: null,
    body: item.milestone === 'theaters' ? 'is now showing in theaters.' : 'is now available to stream in HD.',
  };
}

interface ListProps {
  titleId: string;
  items: readonly InboxItem[];
  loaded: boolean;
  failed: boolean;
  acting: ReadonlySet<string>;
  onOpenItem: (item: InboxItem) => void;
  onConfirm: (item: InboxItem) => void;
  onDismiss: (item: InboxItem) => void;
}

/** The sheet's contents. Mounted only while the sheet is up. */
function NotificationsList({ titleId, items, loaded, failed, acting, onOpenItem, onConfirm, onDismiss }: ListProps) {
  const shown = useLeavingItems(items, ROW_LEAVE_MS);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // What was there when the sheet opened rides in with the sheet; later arrivals animate in.
  const [initialIds] = useState(() => new Set(items.map((item) => item.id)));

  // Watched / Dismiss: the row starts leaving as soon as its write is in flight. If
  // focus was on it (keyboard, VoiceOver), hand it to the next row, or the heading.
  const act = (event: MouseEvent<HTMLButtonElement>, item: InboxItem, run: (item: InboxItem) => void) => {
    if (acting.has(item.id)) return;
    const row = event.currentTarget.closest('li');
    run(item);
    if (!row || !row.contains(document.activeElement)) return;
    const nextRow = (from: Element | null, step: 'nextElementSibling' | 'previousElementSibling') => {
      let el = from?.[step] ?? null;
      while (el && el.hasAttribute('data-leaving')) el = el[step];
      return el?.querySelector<HTMLElement>('[data-row-title]') ?? null;
    };
    (nextRow(row, 'nextElementSibling') ?? nextRow(row, 'previousElementSibling') ?? headingRef.current)?.focus({
      preventScroll: true,
    });
  };

  return (
    <>
      <div className={styles.header}>
        <h2 id={titleId} ref={headingRef} className={styles.heading} tabIndex={-1}>
          Notifications
        </h2>
      </div>

      <div className={styles.scroller}>
        {shown.length > 0 ? (
          <ul className={styles.list} role="list">
            {shown.map(({ item, leaving }) => {
              // A row being acted on is already on its way out.
              const isLeaving = leaving || acting.has(item.id);
              const { kicker, episode, body } = describe(item);
              const rowTitleId = `notification-${item.id}-title`;
              return (
                <li
                  key={item.id}
                  className={cx(
                    styles.row,
                    isLeaving ? styles.rowLeaving : !initialIds.has(item.id) && styles.rowEntering
                  )}
                  data-leaving={isLeaving ? '' : undefined}
                  aria-hidden={isLeaving || undefined}
                >
                  <div className={styles.rowClip}>
                    <article className={styles.card} aria-labelledby={rowTitleId}>
                      <div className={styles.text}>
                        <span className={styles.kicker}>
                          <span className={styles.dot} aria-hidden="true" />
                          {kicker}
                        </span>
                        <button
                          id={rowTitleId}
                          type="button"
                          className={styles.title}
                          data-row-title=""
                          onClick={() => onOpenItem(item)}
                        >
                          {item.name}
                        </button>
                        <p className={styles.body}>
                          {episode && <span className={styles.episode}>{episode}</span>}
                          <span>{body}</span>
                        </p>
                      </div>
                      <div className={styles.actions}>
                        {item.type === 'tv' ? (
                          <button
                            type="button"
                            className={cx(styles.action, styles.primary)}
                            onClick={(event) => act(event, item, onConfirm)}
                            disabled={isLeaving}
                          >
                            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                              <path d="M5 12.5L10 17L19 8" />
                            </svg>
                            Watched
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={cx(styles.action, styles.primary)}
                            onClick={() => onOpenItem(item)}
                            disabled={isLeaving}
                          >
                            View
                          </button>
                        )}
                        <button
                          type="button"
                          className={styles.action}
                          onClick={(event) => act(event, item, onDismiss)}
                          disabled={isLeaving}
                        >
                          Dismiss
                        </button>
                      </div>
                    </article>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : loaded && failed ? (
          <div className={styles.empty} role="status">
            <p className={styles.emptyTitle}>Couldn&rsquo;t load notifications</p>
            <p className={styles.emptyText}>Check your connection, then open this again.</p>
          </div>
        ) : loaded ? (
          <div className={styles.empty} role="status">
            <span className={styles.emptyIcon} aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" focusable="false">
                <path d="M5 12.5L10 17L19 8" />
              </svg>
            </span>
            <p className={styles.emptyTitle}>You&rsquo;re all caught up</p>
            <p className={styles.emptyText}>New episodes and releases you&rsquo;re waiting for will show up here.</p>
          </div>
        ) : (
          <p className={styles.loading} role="status">
            Checking for updates…
          </p>
        )}
      </div>
    </>
  );
}

export default function NotificationsBell() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { items, loaded, failed, acting } = useInbox(uid);
  const { openModal } = useModalActions();
  const mobile = useMobileLayout();
  const titleId = useId();
  const glyphRef = useRef<SVGSVGElement>(null);
  const seenRef = useRef<{ loaded: boolean; ids: Set<string> } | null>(null);
  const [open, setOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  // The bell only exists on the phone layout: if the window grows past it (an iPad
  // rotating), close the sheet rather than leave a dialog the desktop never shows.
  if (open && !mobile) setOpen(false);

  // When something new lands (not what was already there on load): announce it to
  // screen readers and give the bell a small wiggle (skipped under reduced motion).
  useEffect(() => {
    const before = seenRef.current;
    seenRef.current = { loaded, ids: new Set(items.map((item) => item.id)) };
    if (!before?.loaded || !loaded) return;
    const fresh = items.filter((item) => !before.ids.has(item.id));
    if (fresh.length === 0) return;
    setAnnouncement(announcementFor(fresh));
    if (!prefersReducedMotion()) glyphRef.current?.animate(WIGGLE, { duration: 760, easing: 'ease-in-out' });
  }, [items, loaded]);

  if (!uid) return null;

  const count = items.length;

  const openItem = (item: InboxItem) => {
    setOpen(false);
    openModal(item.reminderId, item.type);
  };

  const confirm = (item: InboxItem) => {
    if (acting.has(item.id) || item.type !== 'tv') return;
    haptic('success');
    void confirmInboxItem(uid, item);
  };

  const dismiss = (item: InboxItem) => {
    if (acting.has(item.id)) return;
    haptic('light');
    void dismissInboxItem(uid, item);
  };

  return (
    <>
      <button
        type="button"
        className={styles.bell}
        onClick={() => {
          retryInbox(); // reconnects only if the listener had failed
          setOpen(true);
        }}
        aria-label={count > 0 ? `Notifications, ${count} new` : 'Notifications'}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <svg
          ref={glyphRef}
          className={styles.glyph}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M18 16.25V10.5a6 6 0 0 0-12 0v5.75L4.5 18h15Z" />
          <path d="M10 21a2.2 2.2 0 0 0 4 0" />
        </svg>
        {count > 0 && (
          <span className={styles.badge} aria-hidden="true">
            {count > BADGE_MAX ? `${BADGE_MAX}+` : count}
          </span>
        )}
      </button>
      {/* Phones only: on the desktop layout the floating reminder stack is its own live region. */}
      {mobile && (
        <span className="sr-only" role="status" aria-live="polite">
          {announcement}
        </span>
      )}

      {/* Portaled: the top bar's backdrop-filter would otherwise trap the fixed sheet inside it. */}
      {createPortal(
        <SheetDialog
          open={open}
          onClose={() => setOpen(false)}
          labelledBy={titleId}
          closeLabel="Close notifications"
          panelClassName={styles.panel}
        >
          <NotificationsList
            titleId={titleId}
            items={items}
            loaded={loaded}
            failed={failed}
            acting={acting}
            onOpenItem={openItem}
            onConfirm={confirm}
            onDismiss={dismiss}
          />
        </SheetDialog>,
        document.body
      )}
    </>
  );
}
