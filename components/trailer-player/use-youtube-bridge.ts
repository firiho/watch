'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';

/**
 * A tiny client for the YouTube IFrame API's postMessage protocol — real player
 * state without loading YouTube's ~100 KB widget script.
 *
 * Handshake: after the iframe loads we post `{event:'listening', id, channel:'widget'}`
 * until the player answers. From then on it pushes `infoDelivery` messages
 * (playerState, currentTime, duration, muted…) and discrete `onStateChange` /
 * `onError` events, and accepts `{event:'command', func, args}`.
 */

/** Every embed uses the privacy-enhanced host; commands are pinned to it. */
export const YT_EMBED_ORIGIN = 'https://www.youtube-nocookie.com';
const ACCEPTED_ORIGINS = new Set([YT_EMBED_ORIGIN, 'https://www.youtube.com']);

/** IFrame API player states. */
export const YT = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;

export interface YTSnapshot {
  state: number;
  /** Seconds, as last reported by the player. */
  currentTime: number;
  /** performance.now() when `currentTime` (or the state) was last reported. */
  timeAt: number;
  duration: number;
  muted: boolean;
}

export interface YTBridgeEvents {
  /** First message from the player — commands work from here on. */
  onConnect?: () => void;
  onReady?: () => void;
  onStateChange?: (state: number) => void;
  onError?: (code: number) => void;
  /** The player never answered the handshake. */
  onGiveUp?: () => void;
}

const LISTEN_INTERVAL_MS = 250;
const LISTEN_TIMEOUT_MS = 8000;
/** Never extrapolate playback further than this past the last report. */
const MAX_EXTRAPOLATION_S = 1.5;

let widgetSequence = 0;

const initialSnapshot = (): YTSnapshot => ({
  state: YT.UNSTARTED,
  currentTime: 0,
  timeAt: 0,
  duration: 0,
  muted: true,
});

export function buildEmbedUrl(videoKey: string, params: Record<string, string | number>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) query.set(key, String(value));
  return `${YT_EMBED_ORIGIN}/embed/${encodeURIComponent(videoKey)}?${query.toString()}`;
}

/** Best estimate of the playhead right now (interpolates between reports while playing). */
export function estimateTime(snapshot: YTSnapshot): number {
  if (snapshot.state !== YT.PLAYING || !snapshot.timeAt) return snapshot.currentTime;
  const elapsed = (performance.now() - snapshot.timeAt) / 1000;
  return snapshot.currentTime + Math.min(Math.max(elapsed, 0), MAX_EXTRAPOLATION_S);
}

export function useYouTubeBridge(iframeRef: RefObject<HTMLIFrameElement | null>, events: YTBridgeEvents) {
  const eventsRef = useRef(events);
  useEffect(() => {
    eventsRef.current = events;
  });

  const [widgetId] = useState(() => ++widgetSequence);
  const snapshot = useRef<YTSnapshot>(initialSnapshot());
  const connected = useRef(false);
  const listenInterval = useRef<number | undefined>(undefined);
  const listenTimeout = useRef<number | undefined>(undefined);

  const post = useCallback(
    (message: Record<string, unknown>) => {
      const target = iframeRef.current?.contentWindow;
      if (!target) return;
      try {
        target.postMessage(JSON.stringify({ ...message, id: widgetId, channel: 'widget' }), YT_EMBED_ORIGIN);
      } catch {
        // A navigated or torn-down frame — nothing to control.
      }
    },
    [iframeRef, widgetId]
  );

  const command = useCallback(
    (func: string, args: unknown[] = []) => post({ event: 'command', func, args }),
    [post]
  );

  const stopListening = useCallback(() => {
    window.clearInterval(listenInterval.current);
    window.clearTimeout(listenTimeout.current);
    listenInterval.current = undefined;
    listenTimeout.current = undefined;
  }, []);

  /** Call from the iframe's `load` event: handshakes until the player answers. */
  const connect = useCallback(() => {
    stopListening();
    connected.current = false;
    snapshot.current = initialSnapshot();
    const ping = () => post({ event: 'listening' });
    ping();
    listenInterval.current = window.setInterval(ping, LISTEN_INTERVAL_MS);
    listenTimeout.current = window.setTimeout(() => {
      stopListening();
      if (!connected.current) eventsRef.current.onGiveUp?.();
    }, LISTEN_TIMEOUT_MS);
  }, [post, stopListening]);

  useEffect(() => {
    const setState = (next: number) => {
      const snap = snapshot.current;
      if (snap.state === next) return;
      snap.state = next;
      // Re-anchor interpolation so a resume doesn't count the paused time.
      snap.timeAt = performance.now();
      eventsRef.current.onStateChange?.(next);
    };

    const onMessage = (event: MessageEvent) => {
      const frame = iframeRef.current;
      if (!frame || event.source !== frame.contentWindow || !ACCEPTED_ORIGINS.has(event.origin)) return;

      let data: unknown = event.data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch {
          return;
        }
      }
      if (!data || typeof data !== 'object') return;
      const message = data as { event?: unknown; info?: unknown };

      if (!connected.current) {
        connected.current = true;
        stopListening();
        // infoDelivery already carries playerState; discrete events just arrive sooner.
        command('addEventListener', ['onReady']);
        command('addEventListener', ['onStateChange']);
        command('addEventListener', ['onError']);
        eventsRef.current.onConnect?.();
      }

      switch (message.event) {
        case 'onReady':
          eventsRef.current.onReady?.();
          break;
        case 'initialDelivery':
        case 'infoDelivery': {
          const info = message.info as Record<string, unknown> | null;
          if (!info || typeof info !== 'object') break;
          const snap = snapshot.current;
          if (typeof info.currentTime === 'number' && Number.isFinite(info.currentTime)) {
            snap.currentTime = info.currentTime;
            snap.timeAt = performance.now();
          }
          if (typeof info.duration === 'number' && info.duration > 0) snap.duration = info.duration;
          if (typeof info.muted === 'boolean') snap.muted = info.muted;
          if (typeof info.playerState === 'number') setState(info.playerState);
          break;
        }
        case 'onStateChange':
          if (typeof message.info === 'number') setState(message.info);
          break;
        case 'onError':
          eventsRef.current.onError?.(Number(message.info));
          break;
        default:
          break;
      }
    };

    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      stopListening();
    };
  }, [iframeRef, command, stopListening]);

  return useMemo(() => ({ connect, command, snapshot, connected }), [connect, command]);
}
