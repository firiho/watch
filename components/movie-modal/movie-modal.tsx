'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { AnimationEvent as ReactAnimationEvent, MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useModal, type ActiveItem } from '@/context/modal-context';
import { useWatchlist } from '@/context/watchlist-context';
import { useAuth } from '@/context/auth-context';
import { useReminders } from '@/context/reminder-context';
import { useRecommendations } from '@/context/recommendations-context';
import { useToggleReminder } from '@/hooks/use-toggle-reminder';
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock';
import StarRating from '@/components/star-rating/star-rating';
import TrailerPlayer from '@/components/trailer-player/trailer-player';
import { IconArrowUpRight, IconClose } from '@/components/trailer-player/icons';
import { ADMIN_NAME } from '@/lib/admin';
import { haptic } from '@/lib/haptics';
import { formatDisplayDate, formatRuntime } from '@/lib/format';
import { ContentItem, Episode } from '@/lib/tmdb';
import { selectBestYoutubeTrailer, TMDBVideo } from '@/lib/tmdb-video-util';
import { getCheckpoint, setCheckpoint, Checkpoint } from '@/lib/checkpoints';
import styles from './movie-modal.module.css';

const MOBILE_QUERY = '(max-width: 768px)';
const HERO_SIZES = '(max-width: 768px) 100vw, (max-width: 1222px) 90vw, 1100px';
/** Drag-to-dismiss: distance (fraction of the sheet) or flick speed (px/ms). */
const DISMISS_FRACTION = 0.25;
const DISMISS_VELOCITY = 0.5;
const DRAG_SLOP = 6;
const ENTER_FALLBACK_MS = 800;
const EXIT_FALLBACK_MS = 650;
const MAX_PROVIDER_LOGOS = 3;

/* ---------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------- */

/** TMDB URLs built from a null path end in "/null" — treat those as missing. */
const usableImage = (url?: string | null) => (url && !/\/(null|undefined)$/.test(url) ? url : null);

/** Swap a TMDB size segment ("/t/p/original/…") for a UI-appropriate one. */
const tmdbSized = (url: string | null, size: string) => (url ? url.replace(/\/t\/p\/[^/]+\//, `/t/p/${size}/`) : null);

const formatCurrency = (amount?: number) =>
  amount == null
    ? 'N/A'
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);

const joinList = (items?: string[]) => (items && items.length > 0 ? items.join(', ') : null);

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

const isModifiedClick = (event: ReactMouseEvent) =>
  event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;

/** iOS-style resistance: the further you pull, the less it moves. */
const rubberBand = (distance: number, dimension = 140) => dimension * (1 - 1 / ((distance * 0.55) / dimension + 1));

/** Pin an element's in-flight animated values inline so the next animation continues from them. */
function freezeMotion(el: HTMLElement, props: Array<'transform' | 'opacity'>) {
  const computed = getComputedStyle(el);
  const values = props.map((prop) => computed[prop]);
  el.style.transition = 'none';
  props.forEach((prop, index) => {
    el.style[prop] = values[index];
  });
}

function clearMotion(...elements: Array<HTMLElement | null>) {
  for (const el of elements) {
    if (!el) continue;
    for (const prop of ['transform', 'opacity', 'transition', '--exit-dur', '--exit-ease']) {
      el.style.removeProperty(prop);
    }
  }
}

/** True when another (visible) modal sits above ours — let it own the keyboard. */
function isCoveredByAnotherDialog(sheet: HTMLElement) {
  const modals = Array.from(document.querySelectorAll<HTMLElement>('[aria-modal="true"]')).filter(
    (el) => el.getClientRects().length > 0
  );
  const top = modals[modals.length - 1];
  if (top && top !== sheet && !sheet.contains(top)) return true;
  const active = document.activeElement;
  return !!active && active !== document.body && !sheet.contains(active) && !!active.closest('[role="dialog"]');
}

/* ---------------------------------------------------------------------------
 * Icons
 * ------------------------------------------------------------------------- */

const StarGlyph = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
  </svg>
);

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 12.5 10 17.5 19 7.5" />
  </svg>
);

const BellIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.filledIcon}>
    <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2Zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2Z" />
  </svg>
);

const BookmarkIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M18 20.5 12 16.2 6 20.5V5.5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v15Z" />
  </svg>
);

const ChevronDown = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

const Spinner = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.spinner}>
    <circle cx="12" cy="12" r="9" />
  </svg>
);

/* ---------------------------------------------------------------------------
 * Placeholders
 * ------------------------------------------------------------------------- */

/** Mirrors the real layout (hero, title block, body) so nothing jumps when data lands. */
const DetailSkeleton = () => (
  <div className={styles.skeleton} aria-hidden="true">
    <div className={styles.head}>
      <div className={`${styles.hero} ${styles.skeletonHero}`} />
      <div className={styles.titleBlock}>
        <span className={`${styles.skel} ${styles.skelTagline}`} />
        <span className={`${styles.skel} ${styles.skelTitle}`} />
        <span className={`${styles.skel} ${styles.skelMeta}`} />
        <div className={styles.skelActions}>
          <span className={`${styles.skel} ${styles.skelButton}`} />
          <span className={`${styles.skel} ${styles.skelRound}`} />
        </div>
      </div>
    </div>
    <div className={styles.body}>
      <div className={styles.skelLines}>
        <span className={styles.skel} style={{ width: '94%' }} />
        <span className={styles.skel} style={{ width: '88%' }} />
        <span className={styles.skel} style={{ width: '91%' }} />
        <span className={styles.skel} style={{ width: '56%' }} />
      </div>
    </div>
  </div>
);

const EpisodeSkeletons = () => (
  <>
    {[0, 1, 2].map((n) => (
      <div key={n} className={`${styles.episode} ${styles.episodeSkeleton}`} aria-hidden="true">
        <span className={styles.epNumber} />
        <span className={`${styles.epStill} ${styles.skel}`} />
        <div className={styles.epInfo}>
          <span className={styles.skel} style={{ width: '48%', height: 14 }} />
          <span className={styles.skel} style={{ width: '32%', height: 10 }} />
          <span className={styles.skel} style={{ width: '86%', height: 10 }} />
        </div>
      </div>
    ))}
  </>
);

/* ---------------------------------------------------------------------------
 * Modal
 * ------------------------------------------------------------------------- */

type Fact = { key: string; label: string; value: ReactNode; wide?: boolean; desktopOnly?: boolean };

export default function MovieModal() {
  const { activeItem, closeModal, openModal } = useModal();
  const { isInList, addItem, removeItem, getRating, setRating } = useWatchlist();
  const { getRecommendation } = useRecommendations();
  const { hasReminder } = useReminders();
  const { toggleReminder, pending: addingRem } = useToggleReminder();
  const { user, isAdmin } = useAuth();

  // Presentation: the last item stays rendered while the sheet animates out.
  const [rendered, setRendered] = useState<ActiveItem | null>(null);
  const [closing, setClosing] = useState(false);
  const [entered, setEntered] = useState(false);

  const [data, setData] = useState<ContentItem | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [adding, setAdding] = useState(false);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [activeSeason, setActiveSeason] = useState(1);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [checkpoint, setCheckpointData] = useState<Checkpoint | null>(null);
  const [settingCheckpoint, setSettingCheckpoint] = useState<string | null>(null);
  const [trailer, setTrailer] = useState<TMDBVideo | null>(null);
  const [barVisible, setBarVisible] = useState(false);
  const [overviewExpanded, setOverviewExpanded] = useState(false);
  const [overviewClamped, setOverviewClamped] = useState(false);

  const scrimRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const overviewRef = useRef<HTMLParagraphElement>(null);
  const renderedRef = useRef<ActiveItem | null>(null);
  const skipExitRef = useRef(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  // Bumped per load so late responses for a previous title are dropped.
  const loadTokenRef = useRef(0);
  const seasonTokenRef = useRef(0);
  const trailerTokenRef = useRef(0);

  const uid = useId();
  const titleId = `${uid}-title`;
  const isOpen = rendered !== null;

  useBodyScrollLock(isOpen);

  const finishExit = useCallback(() => {
    renderedRef.current = null;
    loadTokenRef.current += 1;
    seasonTokenRef.current += 1;
    trailerTokenRef.current += 1;
    setRendered(null);
    setClosing(false);
    setEntered(false);
    setData(null);
    setLoadError(false);
    setEpisodes([]);
    setLoadingEpisodes(false);
    setTrailer(null);
    setCheckpointData(null);
    setBarVisible(false);
    setOverviewExpanded(false);
  }, []);

  // Open / switch / close transitions (before paint, so nothing flashes).
  useLayoutEffect(() => {
    const previous = renderedRef.current;
    const sheet = sheetRef.current;
    const scrim = scrimRef.current;

    if (activeItem) {
      if (!previous) {
        returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setEntered(false);
      } else {
        // Re-opened mid-exit or switched via "More Like This".
        clearMotion(sheet, scrim);
        if (previous.id !== activeItem.id || previous.type !== activeItem.type) {
          sheet?.scrollTo({ top: 0 });
        }
      }
      renderedRef.current = activeItem;
      setRendered(activeItem);
      setClosing(false);
      return;
    }

    if (!previous) return;
    const trigger = returnFocusRef.current;
    returnFocusRef.current = null;
    if (trigger?.isConnected) trigger.focus({ preventScroll: true });

    if (skipExitRef.current) {
      // Navigating away (cast / director links): no exit animation.
      skipExitRef.current = false;
      finishExit();
      return;
    }
    // Continue from wherever the sheet is (mid-drag, mid-spring, mid-enter).
    if (sheet) freezeMotion(sheet, ['transform', 'opacity']);
    if (scrim) freezeMotion(scrim, ['opacity']);
    setClosing(true);
  }, [activeItem, finishExit]);

  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(finishExit, EXIT_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [closing, finishExit]);

  useEffect(() => {
    if (!isOpen || entered) return;
    const timer = window.setTimeout(() => setEntered(true), ENTER_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [isOpen, entered]);

  const handleSheetAnimationEnd = (event: ReactAnimationEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (closing) finishExit();
    else setEntered(true);
  };

  /* ---- Data ---- */

  const fetchTrailer = useCallback(async (id: number, type: 'movie' | 'tv', season?: number) => {
    const token = ++trailerTokenRef.current;
    setTrailer(null);
    try {
      const params = new URLSearchParams({ id: String(id), type });
      if (type === 'tv') params.set('season', String(season ?? 1));
      const res = await fetch(`/api/trailer?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch trailer');
      const json = await res.json();
      if (token !== trailerTokenRef.current) return;
      setTrailer(selectBestYoutubeTrailer(json.results || []) || null);
    } catch (error) {
      if (token === trailerTokenRef.current) console.error('[MovieModal] fetchTrailer error:', error);
    }
  }, []);

  const fetchEpisodes = useCallback(async (id: number, season: number) => {
    const token = ++seasonTokenRef.current;
    setLoadingEpisodes(true);
    try {
      const res = await fetch(`/api/details?id=${id}&type=season&season=${season}`);
      if (!res.ok) throw new Error('Failed to fetch episodes');
      const json = await res.json();
      if (token !== seasonTokenRef.current) return;
      setEpisodes(Array.isArray(json) ? json : []);
    } catch (error) {
      if (token === seasonTokenRef.current) console.error('Error fetching episodes:', error);
    } finally {
      if (token === seasonTokenRef.current) setLoadingEpisodes(false);
    }
  }, []);

  const activeId = activeItem?.id ?? null;
  const activeType = activeItem?.type ?? null;

  useEffect(() => {
    if (activeId === null || activeType === null) return;
    const token = ++loadTokenRef.current;
    const controller = new AbortController();
    setData(null);
    setLoadError(false);
    setEpisodes([]);
    setOverviewExpanded(false);
    setBarVisible(false);

    // A movie's trailer doesn't depend on its details, so fetch it in parallel.
    // (TV trailers need the resolved season, so they're fetched after details.)
    if (activeType === 'movie') fetchTrailer(activeId, 'movie');
    else setTrailer(null);

    (async () => {
      try {
        const res = await fetch(`/api/details?id=${activeId}&type=${activeType}`, { signal: controller.signal });
        if (!res.ok) throw new Error('Failed to fetch details');
        const json: ContentItem = await res.json();
        if (token !== loadTokenRef.current) return;
        setData(json);
        if (activeType === 'tv') {
          // Skip "Specials" (season 0) when a numbered season exists.
          const firstSeason =
            json.seasons?.find((s) => s.season_number > 0)?.season_number ?? json.seasons?.[0]?.season_number ?? 1;
          setActiveSeason(firstSeason);
          fetchEpisodes(json.id, firstSeason);
          fetchTrailer(activeId, 'tv', firstSeason);
        }
      } catch (error) {
        if (controller.signal.aborted || token !== loadTokenRef.current) return;
        console.error('Error fetching details:', error);
        setLoadError(true);
      }
    })();

    return () => controller.abort();
  }, [activeId, activeType, reloadToken, fetchEpisodes, fetchTrailer]);

  useEffect(() => {
    if (activeId === null) return;
    setCheckpointData(null);
    if (activeType !== 'tv' || !user) return;
    let cancelled = false;
    getCheckpoint(user.uid, activeId)
      .then((cp) => {
        if (!cancelled) setCheckpointData(cp);
      })
      .catch((error) => console.error('Error fetching checkpoint', error));
    return () => {
      cancelled = true;
    };
  }, [activeId, activeType, user]);

  /* ---- Focus & keyboard ---- */

  useEffect(() => {
    if (isOpen) sheetRef.current?.focus({ preventScroll: true });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || closing) return;
    const sheet = sheetRef.current;
    if (!sheet) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isCoveredByAnotherDialog(sheet)) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeModal();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(
        sheet.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.getClientRects().length > 0);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement as HTMLElement | null;
      const inside = !!current && sheet.contains(current);
      if (event.shiftKey && (!inside || current === first || current === sheet)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (!inside || current === last)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, closing, closeModal]);

  /* ---- Mobile sheet: drag to dismiss ---- */

  useEffect(() => {
    const sheet = sheetRef.current;
    const scrim = scrimRef.current;
    if (!isOpen || closing || !entered || !sheet || !scrim) return;
    const scroller = sheet; // the dialog is its own scroll container

    const mobile = window.matchMedia(MOBILE_QUERY);
    let phase: 'idle' | 'pending' | 'dragging' | 'ignored' = 'idle';
    let startX = 0;
    let startY = 0;
    let baseOffset = 0;
    let offset = 0;
    let height = 1;
    let fromHandle = false;
    let inRow = false;
    let samples: Array<{ t: number; y: number }> = [];
    let frame = 0;
    let settleTimer: number | undefined;
    let suppressClicksUntil = 0;

    const paint = () => {
      frame = 0;
      sheet.style.transform = offset === 0 ? '' : `translate3d(0, ${offset}px, 0)`;
      scrim.style.opacity = String(1 - Math.min(1, Math.max(0, offset / height)) * 0.9);
    };
    const schedulePaint = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const flushPaint = () => {
      if (frame) cancelAnimationFrame(frame);
      paint();
    };

    const translateNow = () => {
      try {
        return new DOMMatrixReadOnly(getComputedStyle(sheet).transform).m42;
      } catch {
        return 0;
      }
    };

    const beginDrag = (y: number) => {
      phase = 'dragging';
      startY = y;
      window.clearTimeout(settleTimer);
      sheet.style.transition = 'none';
      scrim.style.transition = 'none';
    };

    const onTouchStart = (event: TouchEvent) => {
      if (!mobile.matches || event.touches.length !== 1) {
        phase = 'idle';
        return;
      }
      const touch = event.touches[0];
      const target = event.target instanceof Element ? event.target : null;
      fromHandle = !!target?.closest('[data-sheet-handle]');
      inRow = !!target?.closest('[data-hscroll]');
      startX = touch.clientX;
      startY = touch.clientY;
      height = sheet.getBoundingClientRect().height || window.innerHeight;
      samples = [{ t: event.timeStamp, y: touch.clientY }];
      // Caught mid spring-back: grab the sheet where it is.
      baseOffset = sheet.style.transition ? translateNow() : 0;
      if (Math.abs(baseOffset) > 0.5) {
        offset = baseOffset;
        beginDrag(touch.clientY);
        flushPaint();
      } else {
        baseOffset = 0;
        phase = 'pending';
      }
    };

    const onTouchMove = (event: TouchEvent) => {
      if (phase === 'idle' || phase === 'ignored') return;
      if (event.touches.length !== 1) {
        if (phase === 'dragging') settle(0);
        phase = 'ignored';
        return;
      }
      const touch = event.touches[0];
      if (phase === 'pending') {
        const dx = touch.clientX - startX;
        const dy = touch.clientY - startY;
        const canPull = fromHandle || scroller.scrollTop <= 0;
        // Keep a downward pull ours while deciding (it has nothing to scroll anyway).
        if (canPull && dy > 0 && !inRow && event.cancelable) event.preventDefault();
        if (Math.abs(dx) < DRAG_SLOP && Math.abs(dy) < DRAG_SLOP) return;
        if (Math.abs(dx) > Math.abs(dy) || !event.cancelable || (dy > 0 ? !canPull : !fromHandle)) {
          phase = 'ignored'; // horizontal row swipe, or a normal scroll
          return;
        }
        beginDrag(touch.clientY);
      }
      if (event.cancelable) event.preventDefault();
      const raw = baseOffset + (touch.clientY - startY);
      offset = raw >= 0 ? raw : -rubberBand(-raw);
      samples.push({ t: event.timeStamp, y: touch.clientY });
      while (samples.length > 2 && event.timeStamp - samples[0].t > 100) samples.shift();
      schedulePaint();
    };

    const settle = (velocity: number) => {
      flushPaint();
      if (offset > 0 && (offset > height * DISMISS_FRACTION || velocity > DISMISS_VELOCITY)) {
        haptic('light');
        // Carry the flick: duration from the remaining distance at (at least) release speed.
        const remaining = Math.max(0, height - offset);
        const duration = Math.round(Math.min(380, Math.max(180, remaining / Math.max(velocity, 1.3))));
        sheet.style.setProperty('--exit-dur', `${duration}ms`);
        sheet.style.setProperty('--exit-ease', 'cubic-bezier(0.2, 0.75, 0.35, 1)');
        scrim.style.setProperty('--exit-dur', `${duration}ms`);
        closeModal();
        return;
      }
      offset = 0;
      sheet.style.transition = 'transform 480ms var(--ease-ios)';
      scrim.style.transition = 'opacity 320ms var(--ease-out)';
      sheet.style.transform = '';
      scrim.style.opacity = '';
      settleTimer = window.setTimeout(() => {
        sheet.style.transition = '';
        scrim.style.transition = '';
      }, 520);
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (phase !== 'dragging') {
        phase = 'idle';
        return;
      }
      phase = 'idle';
      suppressClicksUntil = performance.now() + 400;
      const last = samples[samples.length - 1];
      const first = samples[0];
      const resting = !last || event.timeStamp - last.t > 80;
      const velocity = !resting && last && first && last.t > first.t ? (last.y - first.y) / (last.t - first.t) : 0;
      settle(velocity);
    };

    // A drag that ends over a button must not also press it.
    const onClickCapture = (event: MouseEvent) => {
      if (performance.now() < suppressClicksUntil) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    sheet.addEventListener('touchstart', onTouchStart, { passive: true });
    sheet.addEventListener('touchmove', onTouchMove, { passive: false });
    sheet.addEventListener('touchend', onTouchEnd, { passive: true });
    sheet.addEventListener('touchcancel', onTouchEnd, { passive: true });
    sheet.addEventListener('click', onClickCapture, true);
    return () => {
      sheet.removeEventListener('touchstart', onTouchStart);
      sheet.removeEventListener('touchmove', onTouchMove);
      sheet.removeEventListener('touchend', onTouchEnd);
      sheet.removeEventListener('touchcancel', onTouchEnd);
      sheet.removeEventListener('click', onClickCapture, true);
      if (frame) cancelAnimationFrame(frame);
      window.clearTimeout(settleTimer);
    };
  }, [isOpen, closing, entered, closeModal]);

  /* ---- Scroll-linked chrome ---- */

  const dataKey = data ? `${data.mediaType}-${data.id}` : null;

  // Compact title bar once the big title scrolls under the top edge.
  useEffect(() => {
    const title = titleRef.current;
    const scroller = sheetRef.current;
    if (!dataKey || !title || !scroller || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (!entry) return;
        const rootTop = entry.rootBounds?.top ?? 0;
        setBarVisible(!entry.isIntersecting && entry.boundingClientRect.top < rootTop);
      },
      { root: scroller, rootMargin: '-60px 0px 0px 0px' }
    );
    observer.observe(title);
    return () => observer.disconnect();
  }, [dataKey]);

  // Only offer "more" when the (mobile) clamp actually hides text.
  useLayoutEffect(() => {
    const el = overviewRef.current;
    if (!el) return;
    const measure = () => setOverviewClamped(el.scrollHeight - el.clientHeight > 1);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [dataKey, overviewExpanded]);

  const scrollToTop = () => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    sheetRef.current?.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  };

  /* ---- Actions ---- */

  const closeForNavigation = (event: ReactMouseEvent) => {
    if (isModifiedClick(event)) return;
    skipExitRef.current = true;
    closeModal();
  };

  const handleSetCheckpoint = async (seasonNum: number, episodeNum: number) => {
    if (!user || !activeItem) return;
    haptic('success');
    setSettingCheckpoint(`${seasonNum}-${episodeNum}`);
    try {
      await setCheckpoint(user.uid, activeItem.id, seasonNum, episodeNum);
      setCheckpointData({ seasonNumber: seasonNum, episodeNumber: episodeNum, timestamp: new Date().toISOString() });
      toast.success(`Progress saved — S${seasonNum} · E${episodeNum}`);
    } catch (error) {
      console.error('Error setting checkpoint', error);
      toast.error('Could not save your progress. Please try again.');
    } finally {
      setSettingCheckpoint(null);
    }
  };

  const changeSeason = (season: number) => {
    if (season === activeSeason || Number.isNaN(season)) return;
    haptic('selection');
    setActiveSeason(season);
    if (data) {
      fetchEpisodes(data.id, season);
      // Each season has its own trailer.
      fetchTrailer(data.id, 'tv', season);
    }
  };

  const handleToggleWatchlist = async () => {
    if (!user || !data || adding) return;
    const removing = isInList(data.id);
    haptic(removing ? 'light' : 'success');
    setAdding(true);
    try {
      if (removing) {
        await removeItem(data.id);
      } else {
        await addItem(
          {
            id: data.id,
            title: data.title,
            overview: data.description,
            poster_path: data.image?.replace('https://image.tmdb.org/t/p/w500', '') || '',
            backdrop_path: data.backdrop?.replace('https://image.tmdb.org/t/p/original', '') || '',
            release_date: data.year,
            vote_average: parseFloat(data.rating),
          },
          data.mediaType
        );
      }
    } catch (error) {
      console.error('Error toggling watchlist:', error);
    } finally {
      setAdding(false);
    }
  };

  const handleToggleReminder = () => {
    if (!data) return;
    haptic('selection');
    toggleReminder({ id: data.id, title: data.title, mediaType: data.mediaType, preloaded: data });
  };

  if (!rendered) return null;

  /* ---- Derived view data ---- */

  let content: ReactNode;
  if (data) {
    const isTV = data.mediaType === 'tv';
    const inList = isInList(data.id);
    const rec = getRecommendation(data.id, data.mediaType);
    const backdropRaw = usableImage(data.backdrop);
    const heroBackdrop = tmdbSized(backdropRaw, 'w1280');
    const heroPoster = usableImage(data.image);
    const providers = data.providerLink && data.providers && data.providers.length > 0 ? data.providers : null;
    const genres = data.genres?.map((g) => g.name).filter(Boolean) ?? [];
    const seasons = data.seasons?.filter((s) => s.season_number > 0) ?? [];
    const ratingValue = parseFloat(data.rating);
    const runtimeText = isTV ? null : formatRuntime(data.runtime);
    const seasonText = isTV && seasons.length > 0 ? `${seasons.length} Season${seasons.length > 1 ? 's' : ''}` : null;
    const cast = data.cast ?? [];
    const recommendations = data.recommendations ?? [];
    const showRatingPanel = (rec && !isAdmin) || !!user;

    const facts: Fact[] = [];
    const isLong = (text: string | null) => !!text && text.length > 24;
    const genreText = joinList(genres);
    if (genreText) facts.push({ key: 'genres', label: 'Genres', value: genreText, desktopOnly: true });
    if (data.releaseDate) {
      facts.push({
        key: 'release',
        label: isTV ? 'First Air Date' : 'Release Date',
        value: formatDisplayDate(data.releaseDate, 'N/A'),
      });
    }
    if (data.status) facts.push({ key: 'status', label: 'Status', value: data.status });
    if (!isTV && data.releaseHistory && data.releaseHistory.length > 0) {
      facts.push({
        key: 'schedule',
        label: 'Release Schedule',
        wide: data.releaseHistory.length > 1,
        value: (
          <ul className={styles.schedule}>
            {data.releaseHistory.map((entry) => (
              <li key={`${entry.type}-${entry.date}`}>
                <span className={styles.scheduleTag}>{entry.label}</span>
                <span className={styles.scheduleDate}>{formatDisplayDate(entry.date, 'N/A')}</span>
              </li>
            ))}
          </ul>
        ),
      });
    }
    if (!isTV && data.directors && data.directors.length > 0) {
      const directors = data.directors;
      facts.push({
        key: 'directors',
        label: `Director${directors.length > 1 ? 's' : ''}`,
        wide: isLong(directors.map((d) => d.name).join(', ')),
        value: directors.map((director, index) => (
          <span key={director.id}>
            <Link href={`/star/${director.id}`} className={styles.inlineLink} onClick={closeForNavigation}>
              {director.name}
            </Link>
            {index < directors.length - 1 ? ', ' : ''}
          </span>
        )),
      });
    }
    const creators = isTV ? joinList(data.creators) : null;
    if (creators) {
      facts.push({ key: 'creators', label: `Creator${(data.creators?.length ?? 0) > 1 ? 's' : ''}`, value: creators, wide: isLong(creators) });
    }
    const studios = joinList(data.productionStudios);
    if (studios) facts.push({ key: 'studios', label: 'Production Studios', value: studios, wide: isLong(studios) });
    const countries = joinList(data.productionCountries);
    if (countries) facts.push({ key: 'countries', label: 'Production Countries', value: countries, wide: isLong(countries) });
    const languages = joinList(data.spokenLanguages);
    if (languages) facts.push({ key: 'languages', label: 'Spoken Languages', value: languages, wide: isLong(languages) });
    if (typeof data.budget === 'number' && data.budget > 0) {
      facts.push({ key: 'budget', label: 'Budget', value: formatCurrency(data.budget) });
    }
    if (typeof data.revenue === 'number' && data.revenue > 0) {
      facts.push({ key: 'revenue', label: 'Revenue', value: formatCurrency(data.revenue) });
    }

    content = (
      <div key={dataKey} className={styles.content}>
        <header className={styles.head}>
          <div className={styles.hero} data-sheet-handle>
            <TrailerPlayer
              videoKey={trailer?.key ?? null}
              title={data.title}
              backdrop={heroBackdrop}
              poster={heroPoster}
              sizes={HERO_SIZES}
              active={entered && !closing}
            />
          </div>

          <div className={styles.titleBlock}>
            {data.tagline && <p className={styles.tagline}>{data.tagline}</p>}
            <h2 id={titleId} ref={titleRef} className={styles.title}>
              {data.title}
            </h2>
            <ul className={styles.meta} aria-label="Details">
              {Number.isFinite(ratingValue) && ratingValue > 0 && (
                <li className={styles.metaRating} aria-label={`Rated ${data.rating} out of 10`}>
                  <StarGlyph />
                  {data.rating}
                </li>
              )}
              {data.year && data.year !== 'N/A' && <li>{data.year}</li>}
              {runtimeText && <li>{runtimeText}</li>}
              {seasonText && <li>{seasonText}</li>}
              <li>{isTV ? 'TV Series' : 'Movie'}</li>
              {!isTV && (
                <li>
                  <span className={`${styles.qualityBadge} ${data.isHD ? styles.qualityHD : ''}`}>
                    {data.isHD ? 'HD' : 'SD'}
                  </span>
                </li>
              )}
            </ul>

            {genres.length > 0 && (
              <ul className={styles.chips} aria-label="Genres" data-hscroll>
                {genres.map((genre) => (
                  <li key={genre} className={styles.chip}>
                    {genre}
                  </li>
                ))}
              </ul>
            )}

            {(providers || user) && (
              <div className={styles.actions}>
                {providers && data.providerLink && (
                  <a href={data.providerLink} target="_blank" rel="noopener noreferrer" className={styles.watchButton}>
                    <span className={styles.watchLabel}>Watch on</span>
                    <span className={styles.watchLogos}>
                      {providers.slice(0, MAX_PROVIDER_LOGOS).map((p) => (
                        <img
                          key={p.id}
                          src={tmdbSized(p.logo, 'w92') ?? p.logo}
                          alt={p.name}
                          title={p.name}
                          width={28}
                          height={28}
                          decoding="async"
                          className={styles.watchLogo}
                        />
                      ))}
                      {providers.length > MAX_PROVIDER_LOGOS && (
                        <span className={styles.watchMore}>+{providers.length - MAX_PROVIDER_LOGOS}</span>
                      )}
                    </span>
                    <IconArrowUpRight className={styles.watchArrow} />
                  </a>
                )}
                {user && (
                  <button
                    type="button"
                    className={`${styles.roundButton} ${inList ? styles.isOn : ''} ${providers ? '' : styles.listWide}`}
                    onClick={handleToggleWatchlist}
                    disabled={adding}
                    aria-label={inList ? 'Remove from My List' : 'Add to My List'}
                    title={inList ? 'Remove from My List' : 'Add to My List'}
                  >
                    {adding ? (
                      <Spinner />
                    ) : (
                      <span key={inList ? 'in' : 'out'} className={styles.popIcon}>
                        {inList ? <CheckIcon /> : <PlusIcon />}
                      </span>
                    )}
                    {!providers && <span className={styles.listLabel}>{inList ? 'In My List' : 'My List'}</span>}
                  </button>
                )}
                {user && inList && !data.isHD && (
                  <button
                    type="button"
                    className={`${styles.roundButton} ${styles.bellButton} ${hasReminder(data.id) ? styles.isOn : ''}`}
                    onClick={handleToggleReminder}
                    disabled={addingRem}
                    aria-label={hasReminder(data.id) ? 'Remove reminder' : 'Set reminder'}
                    aria-pressed={hasReminder(data.id)}
                    title={hasReminder(data.id) ? 'Remove Reminder' : 'Set Reminder'}
                  >
                    <span key={hasReminder(data.id) ? 'on' : 'off'} className={styles.popIcon}>
                      <BellIcon />
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>
        </header>

        <div className={styles.body}>
          {showRatingPanel && (
            <div className={styles.ratingPanel}>
              {rec && !isAdmin && (
                <div className={styles.ratingBlock}>
                  <span className={styles.label}>{ADMIN_NAME}&apos;s rating</span>
                  <StarRating value={rec.stars} size="md" tone="accent" />
                </div>
              )}
              {user && (
                <div className={styles.ratingBlock}>
                  <span className={styles.label}>{isAdmin ? 'Your recommendation · public' : 'Your rating'}</span>
                  {inList ? (
                    <StarRating
                      value={getRating(data.id)}
                      onChange={(stars) => {
                        haptic('selection');
                        setRating(data.id, stars);
                      }}
                      size="md"
                      label={isAdmin ? `Recommend ${data.title}` : `Rate ${data.title}`}
                    />
                  ) : (
                    <span className={styles.ratingHint}>Add to My List to rate it</span>
                  )}
                </div>
              )}
            </div>
          )}

          {data.description && (
            <div className={styles.overviewWrap}>
              <p
                ref={overviewRef}
                className={`${styles.overview} ${overviewExpanded ? styles.overviewOpen : ''}`}
                onClick={overviewClamped && !overviewExpanded ? () => setOverviewExpanded(true) : undefined}
              >
                {data.description}
              </p>
              {overviewClamped && !overviewExpanded && (
                <button
                  type="button"
                  className={styles.moreToggle}
                  onClick={() => setOverviewExpanded(true)}
                  aria-expanded={false}
                >
                  more
                </button>
              )}
            </div>
          )}

          {facts.length > 0 && (
            <dl className={styles.facts}>
              {facts.map((fact) => (
                <div
                  key={fact.key}
                  className={`${styles.fact} ${fact.wide ? styles.factWide : ''} ${fact.desktopOnly ? styles.factDesktop : ''}`}
                >
                  <dt className={styles.label}>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        {cast.length > 0 && (
          <section className={styles.section} aria-labelledby={`${uid}-cast`}>
            <div className={styles.sectionHead}>
              <h3 id={`${uid}-cast`} className={styles.sectionTitle}>
                Cast
              </h3>
              <span className={styles.sectionRule} aria-hidden="true" />
            </div>
            <div className={`${styles.row} ${styles.castRow}`} data-hscroll>
              {cast.map((member) => (
                <Link
                  href={`/star/${member.id}`}
                  key={member.id}
                  className={styles.castCard}
                  onClick={closeForNavigation}
                >
                  <span className={styles.castAvatar}>
                    {member.profile_path ? (
                      <img
                        src={member.profile_path}
                        alt=""
                        width={120}
                        height={120}
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                        className={styles.castImage}
                      />
                    ) : (
                      <span className={styles.castInitials} aria-hidden="true">
                        {initials(member.name)}
                      </span>
                    )}
                  </span>
                  <span className={styles.castName}>{member.name}</span>
                  {member.character && <span className={styles.castRole}>{member.character}</span>}
                </Link>
              ))}
            </div>
          </section>
        )}

        {isTV && data.seasons && (
          <section className={styles.section} aria-labelledby={`${uid}-episodes`}>
            <div className={`${styles.sectionHead} ${styles.episodesHead}`}>
              <h3 id={`${uid}-episodes`} className={styles.sectionTitle}>
                Episodes
              </h3>
              <span className={styles.sectionRule} aria-hidden="true" />
              {seasons.length > 1 &&
                (seasons.length <= 6 ? (
                  <div className={styles.seasonChips} role="group" aria-label="Season" data-hscroll>
                    {seasons.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className={`${styles.seasonChip} ${s.season_number === activeSeason ? styles.seasonChipActive : ''}`}
                        aria-pressed={s.season_number === activeSeason}
                        onClick={() => changeSeason(s.season_number)}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                ) : (
                  <label className={styles.seasonSelectWrap}>
                    <span className="sr-only">Season</span>
                    <select
                      className={styles.seasonSelect}
                      value={activeSeason}
                      onChange={(e) => changeSeason(parseInt(e.target.value, 10))}
                    >
                      {seasons.map((s) => (
                        <option key={s.id} value={s.season_number}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown />
                  </label>
                ))}
            </div>

            <div className={styles.episodes} aria-busy={loadingEpisodes}>
              {loadingEpisodes ? (
                <EpisodeSkeletons />
              ) : episodes.length === 0 ? (
                <p className={styles.emptyNote}>No episode details yet.</p>
              ) : (
                episodes.map((ep) => {
                  const isCurrent =
                    checkpoint?.seasonNumber === activeSeason && checkpoint?.episodeNumber === ep.episode_number;
                  const saving = settingCheckpoint === `${activeSeason}-${ep.episode_number}`;
                  const still = usableImage(ep.still_path) ?? tmdbSized(backdropRaw, 'w300');
                  const airDate = formatDisplayDate(ep.air_date);
                  const runtime = formatRuntime(ep.runtime);
                  return (
                    <article key={ep.id} className={`${styles.episode} ${isCurrent ? styles.episodeCurrent : ''}`}>
                      <span className={styles.epNumber} aria-hidden="true">
                        {ep.episode_number}
                      </span>
                      <span className={styles.epStill}>
                        {still && (
                          <img src={still} alt="" loading="lazy" decoding="async" draggable={false} width={300} height={169} />
                        )}
                      </span>
                      <div className={styles.epInfo}>
                        <div className={styles.epTop}>
                          <h4 className={styles.epTitle}>{ep.name}</h4>
                          {user && (
                            <button
                              type="button"
                              className={`${styles.checkpointButton} ${isCurrent ? styles.checkpointActive : ''}`}
                              onClick={() => handleSetCheckpoint(activeSeason, ep.episode_number)}
                              disabled={saving}
                              aria-pressed={isCurrent}
                              aria-label={`Mark S${activeSeason} · E${ep.episode_number} as your checkpoint`}
                              title="Mark as Current Checkpoint"
                            >
                              {saving ? <Spinner /> : <BookmarkIcon />}
                            </button>
                          )}
                        </div>
                        <div className={styles.epMeta}>
                          <span className={styles.epIndex}>E{ep.episode_number}</span>
                          {airDate && <span title={airDate}>{airDate}</span>}
                          {runtime && <span>{runtime}</span>}
                          {isCurrent && <span className={styles.epHere}>You&apos;re here</span>}
                        </div>
                        <p className={styles.epOverview}>{ep.overview || 'No overview available.'}</p>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>
        )}

        {recommendations.length > 0 && (
          <section className={styles.section} aria-labelledby={`${uid}-more`}>
            <div className={styles.sectionHead}>
              <h3 id={`${uid}-more`} className={styles.sectionTitle}>
                More Like This
              </h3>
              <span className={styles.sectionRule} aria-hidden="true" />
            </div>
            <div className={`${styles.row} ${styles.moreRow}`} data-hscroll>
              {recommendations.map((similar) => {
                const similarRec = getRecommendation(similar.id, similar.mediaType);
                const poster = tmdbSized(usableImage(similar.image), 'w342');
                return (
                  <button
                    key={`${similar.mediaType}-${similar.id}`}
                    type="button"
                    className={styles.moreCard}
                    onClick={() => openModal(similar.id, similar.mediaType)}
                    title={similar.title}
                  >
                    <span className={styles.morePoster}>
                      {poster && (
                        <img src={poster} alt="" loading="lazy" decoding="async" draggable={false} width={342} height={513} />
                      )}
                      {similarRec && (
                        <span className={styles.moreRecBadge} title={`${ADMIN_NAME} rates this ${similarRec.stars}/5`}>
                          <StarRating value={similarRec.stars} size="xs" tone="accent" />
                        </span>
                      )}
                    </span>
                    <span className={styles.moreTitle}>{similar.title}</span>
                    <span className={styles.moreMeta}>
                      ★ {similar.rating} · {similar.year}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>
    );
  } else if (loadError) {
    content = (
      <div className={styles.errorState} role="alert">
        <p className={styles.errorTitle}>We couldn&apos;t load this title.</p>
        <p className={styles.errorText}>Check your connection and try again.</p>
        <button type="button" className={styles.retryButton} onClick={() => setReloadToken((n) => n + 1)}>
          Try again
        </button>
      </div>
    );
  } else {
    content = <DetailSkeleton />;
  }

  return (
    <div className={`${styles.root} ${closing ? styles.closing : ''}`}>
      <div ref={scrimRef} className={styles.scrim} onClick={closeModal} aria-hidden="true" />
      {/* The dialog is the scroll container; its chrome rides a zero-height sticky layer. */}
      <div
        ref={sheetRef}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={data ? titleId : undefined}
        aria-label={data ? undefined : 'Title details'}
        aria-busy={!data && !loadError}
        tabIndex={-1}
        onAnimationEnd={handleSheetAnimationEnd}
      >
        <div className={styles.chrome}>
          <div
            className={`${styles.bar} ${barVisible ? styles.barVisible : ''}`}
            data-sheet-handle
            onClick={scrollToTop}
            aria-hidden="true"
          >
            <span className={styles.barTitle}>{data?.title}</span>
          </div>
          <div className={styles.handle} data-sheet-handle aria-hidden="true">
            <span className={styles.grabber} />
          </div>
          <button type="button" className={styles.closeButton} onClick={closeModal} aria-label="Close">
            <IconClose />
          </button>
        </div>
        {content}
      </div>
    </div>
  );
}
