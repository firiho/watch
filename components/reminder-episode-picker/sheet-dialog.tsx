'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type AnimationEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock';
import { haptic } from '@/lib/haptics';
import styles from './sheet-dialog.module.css';

/**
 * Shared chrome for the reminder overlays (episode picker, Telegram setup):
 * a centered dialog on desktop, an iOS-style bottom sheet on phones (≤768px).
 *
 * - Stays mounted while it animates out (`data-state="closing"`), then unmounts
 *   on `animationend` (with a timeout fallback).
 * - Locks page scroll, moves focus in, traps Tab, and hands focus back to the
 *   trigger once it's gone.
 * - Escape only closes the top-most overlay: the handler runs in React's root
 *   listener and stops the native event, so a detail modal underneath that
 *   listens on `document` doesn't close too.
 * - On phones the sheet follows the finger when pulled down (from anywhere
 *   whose scroll position is at the top) and dismisses past 25% of its height
 *   or on a downward flick; otherwise it springs back.
 */

const MOBILE_QUERY = '(max-width: 768px)';
const EXIT_FALLBACK_MS = 650;
const DISMISS_DISTANCE = 0.25; // of the sheet height
const DISMISS_VELOCITY = 0.5; // px/ms
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const cx = (...names: Array<string | false | null | undefined>) => names.filter(Boolean).join(' ');

/** iOS-style resistance: the further you over-pull, the less it moves. */
const rubberBand = (distance: number, dimension: number) =>
  (1 - 1 / ((distance * 0.55) / dimension + 1)) * dimension;

/** Nearest vertically scrollable ancestor of `target` inside `boundary`. */
const findScrollableY = (target: EventTarget | null, boundary: HTMLElement): HTMLElement | null => {
  let el = target instanceof Element ? target : null;
  while (el && el !== boundary) {
    if (el instanceof HTMLElement && el.scrollHeight > el.clientHeight + 1) {
      const { overflowY } = window.getComputedStyle(el);
      if (overflowY === 'auto' || overflowY === 'scroll') return el;
    }
    el = el.parentElement;
  }
  return null;
};

export interface SheetDialogProps {
  open: boolean;
  /** The user asked to close: Escape, backdrop, close button or a drag down. */
  onClose: () => void;
  /** When false, Escape / backdrop / drag are ignored (e.g. while saving). */
  dismissible?: boolean;
  labelledBy?: string;
  describedBy?: string;
  closeLabel?: string;
  /** Stacking order (Telegram setup 2100, episode picker 2200). */
  zIndex?: number;
  /** Panel class: size it with --sheet-max-w, --sheet-h and --sheet-h-mobile. */
  panelClassName?: string;
  children: ReactNode;
}

export default function SheetDialog({
  open,
  onClose,
  dismissible = true,
  labelledBy,
  describedBy,
  closeLabel = 'Close',
  zIndex,
  panelClassName,
  children,
}: SheetDialogProps) {
  const [present, setPresent] = useState(open);
  const [closing, setClosing] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);

  // Derive presence from `open` during render so the exit starts on the same frame.
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setPresent(true);
      setClosing(false);
    } else if (present) {
      setClosing(true);
    }
  }

  const panelRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const latest = useRef({ open, onClose, dismissible });
  useEffect(() => {
    latest.current = { open, onClose, dismissible };
  });

  useBodyScrollLock(present);

  const finishExit = useCallback(() => {
    setClosing(false);
    setPresent(false);
  }, []);

  // `animationend` can be skipped (hidden tab, reduced motion); never get stuck mounted.
  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(finishExit, EXIT_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [closing, finishExit]);

  // Focus moves into the dialog when it appears and back to the trigger once it's gone.
  useEffect(() => {
    if (!present) return;
    const panel = panelRef.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => panel?.focus({ preventScroll: true }));
    return () => {
      window.cancelAnimationFrame(frame);
      const active = document.activeElement;
      // Don't steal focus from another dialog that opened while this one was leaving.
      const focusIsOurs = !active || active === document.body || (panel?.contains(active) ?? false);
      if (trigger?.isConnected && focusIsOurs) trigger.focus({ preventScroll: true });
    };
  }, [present]);

  // Phones: pull the sheet down to dismiss.
  useEffect(() => {
    const panel = panelRef.current;
    const backdrop = backdropRef.current;
    if (!present || closing || !panel || !backdrop) return;

    const mobile = window.matchMedia(MOBILE_QUERY);
    type Drag = {
      x: number;
      y: number;
      decided: boolean;
      dragging: boolean;
      offset: number;
      height: number;
      scroller: HTMLElement | null;
      samples: Array<{ t: number; y: number }>;
    };
    let drag: Drag | null = null;
    let settleTimer = 0;

    const apply = (offset: number, height = panel.offsetHeight) => {
      panel.style.transform = offset === 0 ? '' : `translate3d(0, ${offset}px, 0)`;
      const progress = Math.min(1, Math.max(0, offset) / Math.max(1, height));
      backdrop.style.opacity = offset > 0 ? String(1 - progress) : '';
    };

    const settle = () => {
      panel.style.transition = 'transform 440ms var(--ease-ios)';
      backdrop.style.transition = 'opacity 440ms var(--ease-ios)';
      apply(0);
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        panel.style.transition = '';
        backdrop.style.transition = '';
      }, 480);
    };

    const onStart = (e: TouchEvent) => {
      drag = null;
      if (!mobile.matches || e.touches.length !== 1) return;
      const touch = e.touches[0];
      drag = {
        x: touch.clientX,
        y: touch.clientY,
        decided: false,
        dragging: false,
        offset: 0,
        height: 0,
        scroller: findScrollableY(e.target, panel),
        samples: [{ t: e.timeStamp, y: touch.clientY }],
      };
    };

    const onMove = (e: TouchEvent) => {
      if (!drag || e.touches.length !== 1) return;
      const touch = e.touches[0];
      const dx = touch.clientX - drag.x;
      const dy = touch.clientY - drag.y;

      if (!drag.decided) {
        if (dx === 0 && dy === 0) return;
        // Decide on the first move: once the browser starts scrolling, touchmove
        // can no longer be cancelled.
        drag.decided = true;
        const pullingDown = dy > 0 && Math.abs(dy) >= Math.abs(dx);
        const atTop = !drag.scroller || drag.scroller.scrollTop <= 0;
        if (!pullingDown || !atTop) {
          drag = null;
          return;
        }
        drag.dragging = true;
        drag.height = panel.offsetHeight;
        window.clearTimeout(settleTimer);
        panel.style.transition = 'none';
        backdrop.style.transition = 'none';
      }

      if (e.cancelable) e.preventDefault();
      drag.offset = dy >= 0 ? dy : -rubberBand(-dy, 140);
      apply(drag.offset, drag.height);
      drag.samples.push({ t: e.timeStamp, y: touch.clientY });
      if (drag.samples.length > 8) drag.samples.shift();
    };

    const onEnd = () => {
      const d = drag;
      drag = null;
      if (!d?.dragging) return;

      const lastSample = d.samples[d.samples.length - 1];
      const recent = d.samples.filter((s) => lastSample.t - s.t <= 100);
      const firstSample = recent[0];
      const velocity =
        firstSample && lastSample.t > firstSample.t ? (lastSample.y - firstSample.y) / (lastSample.t - firstSample.t) : 0;
      const farEnough = d.offset > d.height * DISMISS_DISTANCE;
      const flicked = velocity > DISMISS_VELOCITY && d.offset > 10;

      if ((farEnough || flicked) && latest.current.dismissible) {
        haptic('light');
        latest.current.onClose();
        // The owner can still refuse (e.g. mid-save): if we're still open, settle back.
        settleTimer = window.setTimeout(() => {
          if (latest.current.open) settle();
        }, 140);
      } else {
        settle();
      }
    };

    const onCancel = () => {
      const d = drag;
      drag = null;
      if (d?.dragging) settle();
    };

    panel.addEventListener('touchstart', onStart, { passive: true });
    panel.addEventListener('touchmove', onMove, { passive: false });
    panel.addEventListener('touchend', onEnd, { passive: true });
    panel.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      panel.removeEventListener('touchstart', onStart);
      panel.removeEventListener('touchmove', onMove);
      panel.removeEventListener('touchend', onEnd);
      panel.removeEventListener('touchcancel', onCancel);
      window.clearTimeout(settleTimer);
    };
  }, [present, closing]);

  const requestClose = () => {
    if (!closing && dismissible) onClose();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.nativeEvent.isComposing) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      // Keep document-level Escape handlers (e.g. the detail modal underneath) out of it.
      e.nativeEvent.stopImmediatePropagation();
      requestClose();
      return;
    }

    if (e.key !== 'Tab') return;
    const panel = panelRef.current;
    if (!panel) return;
    e.nativeEvent.stopImmediatePropagation();

    const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.getClientRects().length > 0
    );
    if (focusable.length === 0) {
      e.preventDefault();
      panel.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panel)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  };

  const handleAnimationEnd = (e: AnimationEvent<HTMLDivElement>) => {
    if (closing && e.target === e.currentTarget) finishExit();
  };

  if (!present) return null;

  return (
    <div
      className={styles.root}
      data-state={closing ? 'closing' : 'open'}
      style={zIndex !== undefined ? { zIndex } : undefined}
      onKeyDown={handleKeyDown}
    >
      <div ref={backdropRef} className={styles.backdrop} onClick={requestClose} aria-hidden="true" />
      <div
        ref={panelRef}
        className={cx(styles.panel, panelClassName)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        onAnimationEnd={handleAnimationEnd}
      >
        <span className={styles.grabber} aria-hidden="true" />
        <button
          type="button"
          className={styles.close}
          onClick={() => {
            if (!closing) onClose();
          }}
          disabled={!dismissible}
          aria-label={closeLabel}
        >
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        {children}
      </div>
    </div>
  );
}
