'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock';
import { buildEmbedUrl, estimateTime, useYouTubeBridge } from './use-youtube-bridge';
import { IconClose } from './icons';
import styles from './trailer-theater.module.css';

const OPEN_MS = 460;
const CLOSE_MS = 300;
/** Show the frame even if the player never reports ready. */
const READY_FALLBACK_MS = 1600;
const FALLBACK_EASE_IOS = 'cubic-bezier(0.32, 0.72, 0, 1)';
const FALLBACK_EASE_IN = 'cubic-bezier(0.55, 0, 1, 0.45)';

/** Motion tokens live in globals.css; read them so JS animations stay in sync. */
const cssToken = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const isOnScreen = (rect: DOMRect | null | undefined): rect is DOMRect =>
  !!rect && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;

/** Transform that lays `to` exactly over `from` (center origin). */
const flipTransform = (from: DOMRect, to: DOMRect) => {
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  return `translate(${dx}px, ${dy}px) scale(${from.width / to.width}, ${from.height / to.height})`;
};

export interface TrailerTheaterProps {
  open: boolean;
  videoKey: string;
  title: string;
  /** window.location.origin — required by the IFrame API. */
  origin: string;
  /** Seconds to start from (where the hero preview was). */
  startAt: number;
  backdrop?: string | null;
  sizes: string;
  /** Rect the frame grows out of and shrinks back into (the hero). */
  getOriginRect?: () => DOMRect | null;
  /** Called when the viewer closes; `lastTime` is the playhead if known. */
  onClose: (lastTime: number | null) => void;
}

/**
 * Full-screen trailer with YouTube's own controls (and sound). Portaled above
 * everything, it grows out of the hero and shrinks back into it on close.
 */
export default function TrailerTheater({ open, ...viewProps }: TrailerTheaterProps) {
  const [rendered, setRendered] = useState(open);
  const [closing, setClosing] = useState(false);

  // Stay mounted through the exit animation.
  if (open && (!rendered || closing)) {
    setRendered(true);
    setClosing(false);
  } else if (!open && rendered && !closing) {
    setClosing(true);
  }

  const handleExited = useCallback(() => {
    setRendered(false);
    setClosing(false);
  }, []);

  if (!rendered || typeof document === 'undefined') return null;
  return createPortal(<TheaterView {...viewProps} closing={closing} onExited={handleExited} />, document.body);
}

interface TheaterViewProps extends Omit<TrailerTheaterProps, 'open'> {
  closing: boolean;
  onExited: () => void;
}

function TheaterView({
  videoKey,
  title,
  origin,
  startAt,
  backdrop,
  sizes,
  getOriginRect,
  onClose,
  closing,
  onExited,
}: TheaterViewProps) {
  useBodyScrollLock(true);

  const rootRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const readyTimer = useRef<number | undefined>(undefined);
  const [ready, setReady] = useState(false);

  // Latest callbacks without re-running the animation effects.
  const latest = useRef({ getOriginRect, onClose, onExited });
  useEffect(() => {
    latest.current = { getOriginRect, onClose, onExited };
  });

  const bridge = useYouTubeBridge(iframeRef, {
    onReady: () => setReady(true),
    onStateChange: () => setReady(true),
  });

  const [start] = useState(() => Math.max(0, Math.floor(startAt)));
  const src = useMemo(
    () =>
      buildEmbedUrl(videoKey, {
        autoplay: 1,
        mute: 0,
        controls: 1,
        playsinline: 1,
        fs: 1,
        rel: 0,
        iv_load_policy: 3,
        modestbranding: 1,
        enablejsapi: 1,
        origin,
        start,
      }),
    [videoKey, origin, start]
  );

  // Focus moves in, and back to whatever opened the theater when it unmounts.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      window.clearTimeout(readyTimer.current);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  // Shared-element open: the frame grows out of the hero.
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame || prefersReducedMotion()) return;
    const from = latest.current.getOriginRect?.();
    const to = frame.getBoundingClientRect();
    const keyframes: Keyframe[] =
      isOnScreen(from) && to.width > 0
        ? [{ transform: flipTransform(from, to) }, { transform: 'none' }]
        : [
            { transform: 'scale(0.94)', opacity: 0 },
            { transform: 'none', opacity: 1 },
          ];
    frame.animate(keyframes, { duration: OPEN_MS, easing: cssToken('--ease-ios', FALLBACK_EASE_IOS) });
  }, []);

  const requestClose = useCallback(() => {
    if (closing) return;
    const snap = bridge.snapshot.current;
    const lastTime = bridge.connected.current && snap.duration > 0 ? estimateTime(snap) : null;
    bridge.command('pauseVideo');
    latest.current.onClose(lastTime);
  }, [bridge, closing]);

  // Exit: shrink back into the hero (or fade), then unmount.
  useEffect(() => {
    if (!closing) return;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      latest.current.onExited();
    };
    const fallback = window.setTimeout(finish, CLOSE_MS + 160);
    const frame = frameRef.current;
    let animation: Animation | null = null;
    if (frame && !prefersReducedMotion()) {
      const from = latest.current.getOriginRect?.();
      const to = frame.getBoundingClientRect();
      const keyframes: Keyframe[] =
        isOnScreen(from) && to.width > 0
          ? [
              { transform: 'none', opacity: 1 },
              { opacity: 1, offset: 0.55 },
              { transform: flipTransform(from, to), opacity: 0 },
            ]
          : [
              { transform: 'none', opacity: 1 },
              { transform: 'scale(0.96)', opacity: 0 },
            ];
      animation = frame.animate(keyframes, {
        duration: CLOSE_MS,
        easing: cssToken('--ease-in', FALLBACK_EASE_IN),
        fill: 'forwards',
      });
      animation.onfinish = finish;
    } else {
      finish();
    }
    return () => {
      window.clearTimeout(fallback);
      animation?.cancel();
    };
  }, [closing]);

  // Escape closes only the theater (capture phase beats the modal's listener); Tab stays inside.
  useEffect(() => {
    if (closing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        requestClose();
        return;
      }
      if (event.key !== 'Tab') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const order = [closeRef.current, iframeRef.current].filter((el): el is HTMLButtonElement | HTMLIFrameElement => !!el);
      if (!order.length) return;
      const index = order.indexOf(document.activeElement as HTMLButtonElement | HTMLIFrameElement);
      const next = event.shiftKey
        ? order[(index <= 0 ? order.length : index) - 1]
        : order[(index + 1) % order.length];
      next.focus();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [closing, requestClose]);

  const handleLoad = () => {
    bridge.connect();
    window.clearTimeout(readyTimer.current);
    readyTimer.current = window.setTimeout(() => setReady(true), READY_FALLBACK_MS);
  };

  return (
    <div
      ref={rootRef}
      className={`${styles.root} ${closing ? styles.closing : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={`${title} — trailer`}
    >
      <div className={styles.scrim} onClick={requestClose} aria-hidden="true" />
      <div ref={frameRef} className={styles.frame}>
        {backdrop && (
          <Image src={backdrop} alt="" fill sizes={sizes} className={styles.poster} draggable={false} />
        )}
        <span className={`${styles.spinner} ${ready ? styles.spinnerHidden : ''}`} aria-hidden="true" />
        <iframe
          ref={iframeRef}
          className={`${styles.iframe} ${ready ? styles.iframeReady : ''}`}
          src={src}
          title={`${title} — trailer`}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={handleLoad}
        />
      </div>
      <button ref={closeRef} type="button" className={styles.close} onClick={requestClose} aria-label="Close trailer">
        <IconClose />
      </button>
    </div>
  );
}
