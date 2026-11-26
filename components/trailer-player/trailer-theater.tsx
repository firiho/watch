'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock';
import { buildEmbedUrl, estimateTime, useYouTubeBridge, YT } from './use-youtube-bridge';
import { IconClose, IconPause, IconPlay } from './icons';
import styles from './trailer-theater.module.css';

const OPEN_MS = 460;
const CLOSE_MS = 300;
/** Show the frame even if the player never reports ready. */
const READY_FALLBACK_MS = 1600;
/** YouTube's own seek steps (←/→ and J/L), mirrored here — keyboard focus never enters its frame. */
const SEEK_SHORT_S = 5;
const SEEK_LONG_S = 10;
/** How long a key command counts as "pending" (not yet reported back by the player). */
const PENDING_COMMAND_MS = 600;
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
  const playPauseRef = useRef<HTMLButtonElement>(null);
  const readyTimer = useRef<number | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [playerState, setPlayerState] = useState<number>(YT.UNSTARTED);

  // Latest callbacks without re-running the animation effects.
  const latest = useRef({ getOriginRect, onClose, onExited });
  useEffect(() => {
    latest.current = { getOriginRect, onClose, onExited };
  });

  const bridge = useYouTubeBridge(iframeRef, {
    onReady: () => setReady(true),
    onStateChange: (state) => {
      setReady(true);
      setPlayerState(state);
    },
  });
  // What the player reports, never what we asked for: it can also be paused from its own UI.
  const paused = playerState !== YT.PLAYING && playerState !== YT.BUFFERING;

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

  const togglePlayback = useCallback(() => {
    const { state } = bridge.snapshot.current;
    bridge.command(state === YT.PLAYING || state === YT.BUFFERING ? 'pauseVideo' : 'playVideo');
  }, [bridge]);

  // Our last command, so quick repeated presses build on it before the player reports
  // back (it does every ~250ms). Kept apart from the bridge's snapshot, which only ever
  // holds what the player said — a command it ignores can't skew the time we hand back.
  const lastSeek = useRef({ to: 0, at: -Infinity });
  const lastMute = useRef({ muted: false, at: -Infinity });

  const seekBy = useCallback(
    (seconds: number) => {
      if (!bridge.connected.current) return;
      const snap = bridge.snapshot.current;
      const now = performance.now();
      const from = now - lastSeek.current.at < PENDING_COMMAND_MS ? lastSeek.current.to : estimateTime(snap);
      const end = snap.duration > 0 ? snap.duration - 0.25 : Infinity;
      const to = Math.min(end, Math.max(0, from + seconds));
      bridge.command('seekTo', [to, true]);
      lastSeek.current = { to, at: now };
    },
    [bridge]
  );

  const toggleMuted = useCallback(() => {
    if (!bridge.connected.current) return;
    const now = performance.now();
    const muted = now - lastMute.current.at < PENDING_COMMAND_MS ? lastMute.current.muted : bridge.snapshot.current.muted;
    bridge.command(muted ? 'unMute' : 'mute');
    lastMute.current = { muted: !muted, at: now };
  }, [bridge]);

  // The theater owns the keyboard (capture phase, ahead of the modal's and ⌘K's
  // listeners): Escape closes only the theater, Tab cycles Close ⇄ Play/Pause — the
  // frame itself is never a tab stop, since keys typed inside it never reach us —
  // and YouTube's own playback keys work from here.
  useEffect(() => {
    if (closing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      event.stopImmediatePropagation();
      // In YouTube's own full screen (an element inside its frame) Escape only leaves
      // full screen. Browsers usually do that without telling the page; this covers the rest.
      const fullscreen = !!document.fullscreenElement;
      if (event.key === 'Escape') {
        event.preventDefault();
        if (fullscreen) document.exitFullscreen?.().catch(() => {});
        else requestClose();
        return;
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        if (fullscreen) return; // our buttons are hidden behind it
        const order = [closeRef.current, playPauseRef.current].filter((el): el is HTMLButtonElement => !!el);
        if (!order.length) return;
        const index = order.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.shiftKey
          ? order[(index <= 0 ? order.length : index) - 1]
          : order[(index + 1) % order.length];
        next.focus();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing || typeof event.key !== 'string') return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      // Space on one of our buttons presses it; anywhere else (focus dropped to the
      // page, as entering full screen does) it plays/pauses, like YouTube's.
      const onButton = document.activeElement === closeRef.current || document.activeElement === playPauseRef.current;
      const action =
        key === 'k' || (key === ' ' && !onButton) ? (event.repeat ? null : togglePlayback)
        : key === 'm' ? (event.repeat ? null : toggleMuted)
        : key === 'ArrowLeft' ? () => seekBy(-SEEK_SHORT_S)
        : key === 'ArrowRight' ? () => seekBy(SEEK_SHORT_S)
        : key === 'j' ? () => seekBy(-SEEK_LONG_S)
        : key === 'l' ? () => seekBy(SEEK_LONG_S)
        : undefined;
      if (action === undefined) return;
      event.preventDefault();
      action?.();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [closing, requestClose, togglePlayback, toggleMuted, seekBy]);

  // Entering YouTube's full screen blurs our buttons (they sit outside it); on the way
  // out, put focus back here so Escape and Tab keep working.
  useEffect(() => {
    if (closing) return;
    const onFullscreenChange = () => {
      if (document.fullscreenElement) return;
      const active = document.activeElement;
      if (!active || active === document.body) playPauseRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, [closing]);

  // A mouse click into YouTube's player moves focus into its frame, where no key we
  // handle (Escape included) would arrive. Take focus back on the next tick: the press
  // itself still belongs to the frame, so its clicks, scrubbing and menus keep working.
  // Only for a real mouse click — focus a screen reader moved in there stays put.
  useEffect(() => {
    if (closing) return;
    const iframe = iframeRef.current;
    if (!iframe) return;
    let mouseOverFrame = false;
    let timer: number | undefined;
    const onPointerEnter = (event: PointerEvent) => {
      mouseOverFrame = event.pointerType === 'mouse';
    };
    const onPointerLeave = () => {
      mouseOverFrame = false;
    };
    const onWindowBlur = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (document.activeElement !== iframe || !mouseOverFrame) return;
        const activation = (navigator as Partial<Navigator>).userActivation;
        if (activation && !activation.isActive) return;
        playPauseRef.current?.focus({ preventScroll: true });
      }, 0);
    };
    iframe.addEventListener('pointerenter', onPointerEnter);
    iframe.addEventListener('pointerleave', onPointerLeave);
    window.addEventListener('blur', onWindowBlur);
    return () => {
      window.clearTimeout(timer);
      iframe.removeEventListener('pointerenter', onPointerEnter);
      iframe.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('blur', onWindowBlur);
    };
  }, [closing]);

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
          tabIndex={-1}
          onLoad={handleLoad}
        />
      </div>
      <div className={styles.toolbar}>
        <button
          ref={playPauseRef}
          type="button"
          className={styles.button}
          onClick={togglePlayback}
          aria-label="Pause trailer"
          aria-pressed={paused}
          aria-keyshortcuts="k"
          title={paused ? 'Play (k)' : 'Pause (k)'}
        >
          <span key={paused ? 'paused' : 'playing'} className={styles.buttonIcon}>
            {paused ? <IconPlay /> : <IconPause />}
          </span>
        </button>
        <button ref={closeRef} type="button" className={styles.button} onClick={requestClose} aria-label="Close trailer">
          <IconClose />
        </button>
      </div>
    </div>
  );
}
