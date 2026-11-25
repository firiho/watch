'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Image from 'next/image';
import { preconnect } from 'react-dom';
import { haptic } from '@/lib/haptics';
import { buildEmbedUrl, estimateTime, useYouTubeBridge, YT, YT_EMBED_ORIGIN } from './use-youtube-bridge';
import TrailerTheater from './trailer-theater';
import { IconArrowUpRight, IconExpand, IconPlay, IconReplay, IconSoundOff, IconSoundOn } from './icons';
import styles from './trailer-player.module.css';

/**
 * How long playback must run, uninterrupted, before the video may be shown.
 * YouTube paints its own chrome whenever playback (re)starts: the desktop player
 * a title bar (cropped away here) and, in some sessions, a centre pause control
 * for ~4s; the mobile-web player — served to phone UAs — its title, pause button
 * and related strip for ~4.5s (both measured in Chrome).
 */
const HOLD_MS_DESKTOP = 4300;
const HOLD_MS_MOBILE = 5000;
/** Never reveal before this playhead position (seconds), whatever the clock says. */
const MIN_REVEAL_POSITION = 2.8;
const revealHoldMs = () =>
  /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? HOLD_MS_MOBILE : HOLD_MS_DESKTOP;
/** Seconds before the end at which the still returns, dodging YouTube's end screen. */
const END_GUARD = 1.5;
/** Shorter clips than this have no meaningful end guard. */
const MIN_DURATION = 5;
/** Not playing this long after load: autoplay was blocked (Low Power Mode, data saver…). */
const BLOCKED_AFTER_MS = 6000;
/** Buffering longer than this re-covers the video (YouTube draws its spinner). */
const BUFFER_COVER_MS = 900;
/** Fade the still back in before pausing so YouTube's paused UI is never seen. */
const COVER_BEFORE_PAUSE_MS = 450;
/** An unexpected pause this soon after unmuting = the browser refused audible playback (iOS). */
const UNMUTE_PAUSE_WINDOW_MS = 1500;
/** Pause when less than this much of the hero is on screen. */
const IN_VIEW_RATIO = 0.25;

type NetworkAwareNavigator = Navigator & { connection?: { saveData?: boolean } };

const subscribeNothing = () => () => {};
const getOrigin = () => window.location.origin;
const getServerOrigin = () => null;

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
const subscribeAutoplayPrefs = (onChange: () => void) => {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};
const getAutoplayAllowed = () =>
  !window.matchMedia(REDUCED_MOTION).matches && !(navigator as NetworkAwareNavigator).connection?.saveData;
const getServerAutoplayAllowed = () => false;

export interface TrailerPlayerProps {
  /** YouTube video key; null shows the still alone. */
  videoKey: string | null;
  title: string;
  /** Landscape still that covers the video until it is genuinely playing. */
  backdrop?: string | null;
  /** Portrait art, shown blurred when there is no backdrop. */
  poster?: string | null;
  /** next/image `sizes` for the still (and the theater's poster). */
  sizes: string;
  autoPlay?: boolean;
  /** False while the host animates in or out: nothing loads, playback goes quiet. */
  active?: boolean;
  className?: string;
  onRevealChange?: (revealed: boolean) => void;
}

/**
 * Hero trailer. A still covers a cover-cropped, chrome-free YouTube embed and
 * only crossfades away once playback is genuinely underway — never showing
 * YouTube's title bar, pause overlay or end screen. Our own glass controls
 * (mute, replay, full screen) sit bottom-right; the full screen view is a
 * theater with YouTube's controls and sound.
 */
export default function TrailerPlayer({
  videoKey,
  title,
  backdrop = null,
  poster = null,
  sizes,
  autoPlay = true,
  active = true,
  className,
  onRevealChange,
}: TrailerPlayerProps) {
  const origin = useSyncExternalStore(subscribeNothing, getOrigin, getServerOrigin);
  const autoplayAllowed = useSyncExternalStore(subscribeAutoplayPrefs, getAutoplayAllowed, getServerAutoplayAllowed);

  const rootRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);

  const [ytState, setYtState] = useState<number>(YT.UNSTARTED);
  const [connected, setConnected] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [ended, setEnded] = useState(false);
  const [muted, setMuted] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [errorCode, setErrorCode] = useState<number | null>(null);
  const [userStarted, setUserStarted] = useState(false);
  const [theaterOpen, setTheaterOpen] = useState(false);
  const [theaterStart, setTheaterStart] = useState(0);
  const [armedKey, setArmedKey] = useState<string | null>(null);
  const [inView, setInView] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const [stillLoaded, setStillLoaded] = useState(false);

  // A different video (TV season switch) starts from a clean slate.
  const [stateKey, setStateKey] = useState(videoKey);
  if (stateKey !== videoKey) {
    setStateKey(videoKey);
    setYtState(YT.UNSTARTED);
    setConnected(false);
    setRevealed(false);
    setEnded(false);
    setMuted(true);
    setBlocked(false);
    setErrorCode(null);
    setUserStarted(false);
    setTheaterOpen(false);
  }

  const still = backdrop ?? poster;
  const [stillKey, setStillKey] = useState(still);
  if (stillKey !== still) {
    setStillKey(still);
    setStillLoaded(false);
  }

  const revealedRef = useRef(false);
  const endedRef = useRef(false);
  const playingSinceRef = useRef(0);
  const unmuteAtRef = useRef(-Infinity);
  const pauseAtRef = useRef(-Infinity);
  const canPlayRef = useRef(false);
  const mutedRef = useRef(true);
  const openTheaterRef = useRef<() => void>(() => {});
  const onRevealChangeRef = useRef(onRevealChange);
  const blockedTimer = useRef<number | undefined>(undefined);
  const pauseTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    revealedRef.current = false;
    endedRef.current = false;
    playingSinceRef.current = 0;
    unmuteAtRef.current = -Infinity;
    return () => {
      window.clearTimeout(blockedTimer.current);
      window.clearTimeout(pauseTimer.current);
    };
  }, [videoKey]);

  const setRevealedTo = useCallback((next: boolean) => {
    if (revealedRef.current === next) return;
    revealedRef.current = next;
    setRevealed(next);
  }, []);

  const bridge = useYouTubeBridge(iframeRef, {
    onConnect: () => setConnected(true),
    onStateChange: (state) => {
      setYtState(state);
      const now = performance.now();
      switch (state) {
        case YT.PLAYING:
          window.clearTimeout(blockedTimer.current);
          setBlocked(false);
          if (!revealedRef.current) playingSinceRef.current = now;
          break;
        case YT.PAUSED:
          setRevealedTo(false);
          if (now - unmuteAtRef.current < UNMUTE_PAUSE_WINDOW_MS && now - pauseAtRef.current > UNMUTE_PAUSE_WINDOW_MS) {
            // iOS won't let a parent page unmute a frame's video (it pauses it instead):
            // hand over to the full player, where one tap gives sound. The preview
            // resumes muted when the theater closes.
            unmuteAtRef.current = -Infinity;
            setMuted(true);
            bridge.command('mute');
            openTheaterRef.current();
          }
          break;
        case YT.ENDED:
          endedRef.current = true;
          setEnded(true);
          setRevealedTo(false);
          break;
        case YT.BUFFERING:
          break;
        default:
          setRevealedTo(false);
      }
    },
    onError: (code) => {
      setErrorCode(code);
      setRevealedTo(false);
    },
    onGiveUp: () => setBlocked(true),
  });

  // Load nothing until the host has finished animating in.
  useEffect(() => {
    if (active && videoKey) setArmedKey(videoKey);
  }, [active, videoKey]);

  const hasVideo = videoKey !== null;
  const playIntent = (autoPlay && autoplayAllowed) || userStarted;
  const armed = hasVideo && armedKey === videoKey;
  const mountFrame = armed && origin !== null && playIntent && errorCode === null;
  const canPlay = mountFrame && active && inView && pageVisible && !theaterOpen && !ended;

  useEffect(() => {
    canPlayRef.current = canPlay;
    mutedRef.current = muted;
    openTheaterRef.current = openTheater;
    onRevealChangeRef.current = onRevealChange;
  });

  const src = useMemo(
    () =>
      videoKey && origin
        ? buildEmbedUrl(videoKey, {
            autoplay: 1,
            mute: 1,
            controls: 0,
            playsinline: 1,
            rel: 0,
            iv_load_policy: 3,
            disablekb: 1,
            fs: 0,
            modestbranding: 1,
            enablejsapi: 1,
            origin,
          })
        : null,
    [videoKey, origin]
  );

  useEffect(() => {
    if (!videoKey) return;
    preconnect(YT_EMBED_ORIGIN);
    preconnect('https://www.youtube.com');
    preconnect('https://i.ytimg.com');
  }, [videoKey]);

  // Keep the player in step with what should be happening.
  useEffect(() => {
    if (!connected) return;
    window.clearTimeout(pauseTimer.current);
    if (canPlay) {
      bridge.command('playVideo');
      return;
    }
    setRevealedTo(false);
    if (!active) {
      // The host is closing; the frame is about to go away — just go silent.
      bridge.command('mute');
      return;
    }
    const pause = () => {
      pauseAtRef.current = performance.now();
      bridge.command('pauseVideo');
    };
    if (!pageVisible || theaterOpen) pause();
    else pauseTimer.current = window.setTimeout(pause, COVER_BEFORE_PAUSE_MS);
  }, [canPlay, connected, active, pageVisible, theaterOpen, bridge, setRevealedTo]);

  // The URL always starts muted; apply an unmute chosen before the player answered.
  useEffect(() => {
    if (connected && !mutedRef.current) bridge.command('unMute');
  }, [connected, bridge]);

  // While playing: interpolate the playhead, reveal past YouTube's intro overlay,
  // cover before the end screen, and drive the progress bar — one rAF loop.
  useEffect(() => {
    if (ytState !== YT.PLAYING || ended) return;
    const holdMs = revealHoldMs();
    let frame = 0;
    const tick = () => {
      const snap = bridge.snapshot.current;
      const time = estimateTime(snap);
      const duration = snap.duration;
      if (duration > MIN_DURATION && time >= duration - END_GUARD) {
        if (!endedRef.current) {
          endedRef.current = true;
          setEnded(true);
          setRevealedTo(false);
        }
        return;
      }
      if (
        !revealedRef.current &&
        canPlayRef.current &&
        time >= MIN_REVEAL_POSITION &&
        performance.now() - playingSinceRef.current >= holdMs
      ) {
        setRevealedTo(true);
      }
      const bar = barRef.current;
      if (bar && duration > 0) bar.style.transform = `scaleX(${Math.min(1, Math.max(0, time / duration))})`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [ytState, ended, bridge, setRevealedTo]);

  // A long buffer would show YouTube's spinner: cover until playback is steady again.
  useEffect(() => {
    if (ytState !== YT.BUFFERING || !revealed) return;
    const id = window.setTimeout(() => setRevealedTo(false), BUFFER_COVER_MS);
    return () => window.clearTimeout(id);
  }, [ytState, revealed, setRevealedTo]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (entry) setInView(entry.intersectionRatio >= IN_VIEW_RATIO);
      },
      { threshold: [0, IN_VIEW_RATIO, 0.6, 1] }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const sync = () => setPageVisible(document.visibilityState !== 'hidden');
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);

  useEffect(() => {
    onRevealChangeRef.current?.(revealed);
  }, [revealed]);

  const handleFrameLoad = () => {
    bridge.connect();
    window.clearTimeout(blockedTimer.current);
    blockedTimer.current = window.setTimeout(() => {
      if (bridge.snapshot.current.state !== YT.PLAYING && !revealedRef.current && canPlayRef.current) {
        setBlocked(true);
      }
    }, BLOCKED_AFTER_MS);
  };

  const openTheater = useCallback(() => {
    setTheaterStart(endedRef.current ? 0 : estimateTime(bridge.snapshot.current));
    setTheaterOpen(true);
  }, [bridge]);

  const closeTheater = useCallback(
    (lastTime: number | null) => {
      setTheaterOpen(false);
      setMuted(true);
      bridge.command('mute');
      if (lastTime === null) return;
      const duration = bridge.snapshot.current.duration;
      if (duration > MIN_DURATION && lastTime >= duration - END_GUARD) {
        endedRef.current = true;
        setEnded(true);
      } else {
        endedRef.current = false;
        setEnded(false);
        bridge.command('seekTo', [lastTime, true]);
      }
    },
    [bridge]
  );

  const getOriginRect = useCallback(() => rootRef.current?.getBoundingClientRect() ?? null, []);

  const toggleMute = () => {
    haptic('selection');
    const next = !muted;
    setMuted(next);
    if (next) {
      bridge.command('mute');
      return;
    }
    unmuteAtRef.current = performance.now();
    bridge.command('unMute');
    bridge.command('setVolume', [100]);
  };

  const replay = () => {
    haptic('selection');
    endedRef.current = false;
    setEnded(false);
    bridge.command('seekTo', [0, true]);
  };

  const expand = () => {
    haptic('light');
    openTheater();
  };

  const startFromPill = () => {
    haptic('selection');
    if (!playIntent) {
      setUserStarted(true);
      return;
    }
    // Autoplay was refused — the full player's own play button always works.
    openTheater();
  };

  const showVideo = revealed && !theaterOpen;
  const showError = hasVideo && errorCode !== null;
  const showPlayPill = hasVideo && !showError && !ended && !revealed && (blocked || !playIntent);
  const showControls = hasVideo && (armed || showPlayPill || showError);
  const stillIsPoster = !backdrop && !!poster;

  let controls: React.ReactNode = null;
  if (showControls && videoKey) {
    if (showError) {
      controls = (
        <a
          className={styles.pill}
          href={`https://www.youtube.com/watch?v=${encodeURIComponent(videoKey)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className={styles.pillIcon}>
            <IconPlay />
          </span>
          <span>Watch on YouTube</span>
          <IconArrowUpRight className={styles.pillArrow} />
        </a>
      );
    } else if (showPlayPill) {
      controls = (
        <button type="button" className={styles.pill} onClick={startFromPill}>
          <span className={styles.pillIcon}>
            <IconPlay />
          </span>
          <span>Play trailer</span>
        </button>
      );
    } else {
      controls = (
        <>
          {ended ? (
            <button type="button" className={styles.pill} onClick={replay}>
              <span className={`${styles.pillIcon} ${styles.pillIconReplay}`}>
                <IconReplay />
              </span>
              <span>Replay</span>
            </button>
          ) : (
            <button
              type="button"
              className={`${styles.ctrl} ${muted ? '' : styles.ctrlOn}`}
              onClick={toggleMute}
              aria-label="Mute trailer"
              aria-pressed={muted}
              title={muted ? 'Unmute' : 'Mute'}
            >
              <span key={muted ? 'muted' : 'sound'} className={styles.ctrlIcon}>
                {muted ? <IconSoundOff /> : <IconSoundOn />}
              </span>
            </button>
          )}
          <button
            type="button"
            className={styles.ctrl}
            onClick={expand}
            aria-label="Watch trailer full screen"
            title="Full screen"
          >
            <span className={styles.ctrlIcon}>
              <IconExpand />
            </span>
          </button>
        </>
      );
    }
  }

  return (
    <div
      ref={rootRef}
      className={`${styles.root} ${className ?? ''}`}
      data-revealed={showVideo ? '' : undefined}
    >
      {mountFrame && src && (
        <div className={styles.video} aria-hidden="true">
          <iframe
            key={videoKey}
            ref={iframeRef}
            className={styles.frame}
            src={src}
            title={`${title} — trailer`}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            referrerPolicy="strict-origin-when-cross-origin"
            tabIndex={-1}
            onLoad={handleFrameLoad}
          />
        </div>
      )}

      <div className={`${styles.cover} ${showVideo ? styles.coverHidden : ''}`}>
        {still && (
          <Image
            key={still}
            src={still}
            alt=""
            fill
            sizes={sizes}
            loading="eager"
            fetchPriority="high"
            draggable={false}
            className={`${styles.still} ${stillIsPoster ? styles.stillPoster : ''} ${stillLoaded ? styles.stillLoaded : ''}`}
            onLoad={() => setStillLoaded(true)}
          />
        )}
      </div>

      <div className={styles.shadeSide} aria-hidden="true" />
      <div className={styles.shadeTop} aria-hidden="true" />
      <div className={styles.shadeBottom} aria-hidden="true" />

      {hasVideo && (
        <span className={`${styles.progress} ${showVideo ? styles.progressOn : ''}`} aria-hidden="true">
          <span ref={barRef} className={styles.progressBar} />
        </span>
      )}

      {controls && <div className={styles.controls}>{controls}</div>}

      {videoKey && origin && (
        <TrailerTheater
          open={theaterOpen}
          videoKey={videoKey}
          title={title}
          origin={origin}
          startAt={theaterStart}
          backdrop={backdrop}
          sizes={sizes}
          getOriginRect={getOriginRect}
          onClose={closeTheater}
        />
      )}
    </div>
  );
}
