'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  AnimationEvent as ReactAnimationEvent,
  CSSProperties,
  FocusEvent as ReactFocusEvent,
  PointerEvent as ReactPointerEvent,
  TouchEvent as ReactTouchEvent,
} from 'react';
import Image from 'next/image';
import styles from './hero-gallery.module.css';
import { ContentItem } from '@/lib/tmdb';
import { useWatchlist } from '@/context/watchlist-context';
import { useAuth } from '@/context/auth-context';
import { useProfile } from '@/context/profile-context';
import { useModal } from '@/context/modal-context';
import { HERO_ROTATE_INTERVAL_MS } from '@/lib/constants';
import { haptic } from '@/lib/haptics';

interface HeroGalleryProps {
  items: ContentItem[];
}

interface SlideState {
  current: number;
  prev: number;
  /** 1 = moved forward, -1 = moved back (drives the content drift direction). */
  dir: 1 | -1;
}

/** Crossfade length; keep in sync with `--hero-fade` in the CSS. */
const FADE_MS = 1000;
/** Swipe commit thresholds. */
const SWIPE_DISTANCE = 48;
const SWIPE_VELOCITY = 0.35; // px/ms
const AXIS_LOCK_DISTANCE = 8;
/** Ken Burns origins, cycled per slide so consecutive slides don't drift the same way. */
const KEN_BURNS_ORIGINS = ['50% 40%', '28% 50%', '72% 45%', '42% 62%', '62% 34%'];

const INITIAL_SLIDE: SlideState = { current: 0, prev: -1, dir: 1 };

const titleSize = (title: string) => (title.length > 30 ? 'long' : title.length > 16 ? 'medium' : 'short');

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}

const PlusIcon = () => (
  <svg className={styles.buttonIcon} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 5V19M5 12H19" />
  </svg>
);

const CheckIcon = () => (
  <svg className={styles.buttonIcon} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 12.5L10 17L19 8" />
  </svg>
);

const InfoIcon = () => (
  <svg className={styles.buttonIcon} viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5" />
    <circle cx="12" cy="7.6" r="0.6" className={styles.iconDot} />
  </svg>
);

const HeroGallery = ({ items: initialItems }: HeroGalleryProps) => {
  const [items, setItems] = useState<ContentItem[]>(initialItems);
  const [slide, setSlide] = useState<SlideState>(INITIAL_SLIDE);
  const [seen, setSeen] = useState<ReadonlySet<number>>(() => new Set([0, 1]));
  const [adding, setAdding] = useState(false);
  // Every reason auto-rotation can be paused.
  const [hovering, setHovering] = useState(false);
  const [touching, setTouching] = useState(false);
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  const [pageHidden, setPageHidden] = useState(false);
  const [offscreen, setOffscreen] = useState(false);

  const reducedMotion = useReducedMotion();
  const { isInList, addItem, removeItem } = useWatchlist();
  const { user } = useAuth();
  const { profile } = useProfile();
  const { openModal, activeItem } = useModal();

  const sectionRef = useRef<HTMLElement | null>(null);
  const hoverRef = useRef(false);
  const dragFrameRef = useRef(0);
  const gestureRef = useRef({ x: 0, y: 0, t: 0, dx: 0, axis: null as 'x' | 'y' | null, active: false });

  const favoriteGenres = profile?.favoriteGenres;
  const genresKey = favoriteGenres?.join(',') ?? '';

  // Personalize the hero with the user's favorite genres when signed in.
  // Falls back to the server-provided trending items otherwise.
  useEffect(() => {
    if (!user || !genresKey) {
      setItems(initialItems);
      setSlide(INITIAL_SLIDE);
      setSeen(new Set([0, 1]));
      return;
    }

    let active = true;
    fetch(`/api/featured?genres=${genresKey}`)
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        if (Array.isArray(data.results) && data.results.length > 0) {
          setItems(data.results);
          setSlide(INITIAL_SLIDE);
          setSeen(new Set([0, 1]));
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [user, genresKey, initialItems]);

  const count = items.length;
  const current = count > 0 ? slide.current % count : 0;
  const nextIndex = count > 0 ? (current + 1) % count : 0;

  const goNext = useCallback(() => {
    if (count < 2) return;
    setSlide((s) => ({ current: (s.current + 1) % count, prev: s.current, dir: 1 }));
  }, [count]);

  const goPrev = useCallback(() => {
    if (count < 2) return;
    setSlide((s) => ({ current: (s.current - 1 + count) % count, prev: s.current, dir: -1 }));
  }, [count]);

  const goTo = useCallback((index: number) => {
    setSlide((s) => (index === s.current ? s : { current: index, prev: s.current, dir: index > s.current ? 1 : -1 }));
  }, []);

  // Images mount for the visible slide, the next one (preloaded while hidden) and anything already shown.
  useEffect(() => {
    if (count === 0) return;
    setSeen((prev) => {
      if (prev.has(current) && prev.has(nextIndex)) return prev;
      const updated = new Set(prev);
      updated.add(current);
      updated.add(nextIndex);
      return updated;
    });
  }, [current, nextIndex, count]);

  // Pause while the tab is hidden…
  useEffect(() => {
    const update = () => setPageHidden(document.visibilityState === 'hidden');
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  // …and while the hero is mostly scrolled out of view.
  const hasItems = count > 0;
  useEffect(() => {
    const el = sectionRef.current;
    if (!el || !hasItems) return;
    const observer = new IntersectionObserver(([entry]) => setOffscreen(entry.intersectionRatio < 0.35), {
      threshold: [0, 0.35, 1],
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasItems]);

  // Two-finger horizontal trackpad swipe (and horizontal mouse wheel) → change slide.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el || count < 2) return;
    let lock = false;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 24) {
        e.preventDefault();
        if (lock) return;
        lock = true;
        if (e.deltaX > 0) goNext();
        else goPrev();
        window.setTimeout(() => {
          lock = false;
        }, 500);
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [count, goNext, goPrev]);

  useEffect(() => () => cancelAnimationFrame(dragFrameRef.current), []);

  if (!items || items.length === 0) {
    return null;
  }

  const autoRotate = count > 1 && !reducedMotion;
  const paused = hovering || touching || keyboardFocus || pageHidden || offscreen || Boolean(activeItem);

  const handleToggleWatchlist = async (item: ContentItem) => {
    if (!user || adding) return;

    haptic(isInList(item.id) ? 'light' : 'success');
    setAdding(true);
    try {
      if (isInList(item.id)) {
        await removeItem(item.id);
      } else {
        await addItem({
          id: item.id,
          title: item.title,
          overview: item.description,
          poster_path: item.image?.replace('https://image.tmdb.org/t/p/original', '') || '',
          backdrop_path: item.image?.replace('https://image.tmdb.org/t/p/original', '') || '',
          release_date: item.year,
          vote_average: parseFloat(item.rating),
        }, item.mediaType);
      }
    } catch (error) {
      console.error('Error toggling watchlist:', error);
    } finally {
      setAdding(false);
    }
  };

  // ---- Hover pause (desktop): only over the text/buttons and the pills ----

  const handlePointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.pointerType !== 'mouse') return;
    const over = Boolean((e.target as Element | null)?.closest?.('[data-hover-pause]'));
    if (over !== hoverRef.current) {
      hoverRef.current = over;
      setHovering(over);
    }
  };

  const handlePointerLeave = () => {
    if (!hoverRef.current) return;
    hoverRef.current = false;
    setHovering(false);
  };

  // Keyboard focus inside the carousel pauses it (mouse focus doesn't).
  const handleFocus = (e: ReactFocusEvent<HTMLElement>) => {
    if ((e.target as Element).matches?.(':focus-visible')) setKeyboardFocus(true);
  };

  const handleBlur = (e: ReactFocusEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setKeyboardFocus(false);
  };

  // ---- Touch swipe: horizontal only, with a live drag offset ----

  const writeDrag = (px: number) => {
    const el = sectionRef.current;
    if (!el) return;
    cancelAnimationFrame(dragFrameRef.current);
    dragFrameRef.current = requestAnimationFrame(() => {
      el.style.setProperty('--hero-drag', `${px}px`);
      el.style.setProperty('--hero-drag-fade', String(Math.max(0.35, 1 - Math.abs(px) / 360)));
    });
  };

  const releaseDrag = () => {
    const el = sectionRef.current;
    if (!el) return;
    cancelAnimationFrame(dragFrameRef.current);
    el.removeAttribute('data-dragging');
    el.style.removeProperty('--hero-drag');
    el.style.removeProperty('--hero-drag-fade');
  };

  const handleTouchStart = (e: ReactTouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    gestureRef.current = { x: touch.clientX, y: touch.clientY, t: performance.now(), dx: 0, axis: null, active: true };
    setTouching(true);
  };

  const handleTouchMove = (e: ReactTouchEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture.active || count < 2) return;
    const touch = e.touches[0];
    const dx = touch.clientX - gesture.x;
    const dy = touch.clientY - gesture.y;
    if (!gesture.axis) {
      if (Math.abs(dx) < AXIS_LOCK_DISTANCE && Math.abs(dy) < AXIS_LOCK_DISTANCE) return;
      gesture.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (gesture.axis === 'x') sectionRef.current?.setAttribute('data-dragging', '');
    }
    if (gesture.axis !== 'x') return;
    gesture.dx = dx;
    writeDrag(dx);
  };

  const handleTouchEnd = () => {
    const gesture = gestureRef.current;
    gestureRef.current = { ...gesture, active: false };
    setTouching(false);
    if (gesture.axis === 'x' && count > 1) {
      const elapsed = Math.max(1, performance.now() - gesture.t);
      const velocity = Math.abs(gesture.dx) / elapsed;
      if (Math.abs(gesture.dx) > SWIPE_DISTANCE || (velocity > SWIPE_VELOCITY && Math.abs(gesture.dx) > 16)) {
        haptic('selection');
        if (gesture.dx < 0) goNext();
        else goPrev();
      }
    }
    releaseDrag();
  };

  const handleProgressEnd = (e: ReactAnimationEvent<HTMLSpanElement>) => {
    if (e.target !== e.currentTarget) return;
    // Reduced motion collapses every CSS animation to ~0ms; never let that spin the carousel.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    goNext();
  };

  const sectionStyle = {
    '--hero-interval': `${HERO_ROTATE_INTERVAL_MS}ms`,
    '--hero-fade': `${FADE_MS}ms`,
    '--hero-dir': slide.dir,
  } as CSSProperties;

  return (
    <section
      className={styles.heroGallery}
      ref={sectionRef}
      style={sectionStyle}
      aria-roledescription="carousel"
      aria-label="Featured"
      data-paused={paused ? '' : undefined}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      <div
        className={styles.slides}
        aria-live={autoRotate && !paused ? 'off' : 'polite'}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        {items.map((item, index) => {
          const state = index === current ? 'active' : index === slide.prev ? 'leaving' : 'idle';
          const isActive = state === 'active';
          const inList = isInList(item.id);
          const hasYear = Boolean(item.year && item.year !== 'N/A');
          const ratingValue = parseFloat(item.rating);
          const showImage = Boolean(item.image) && (isActive || index === nextIndex || seen.has(index));

          return (
            <div
              key={item.id}
              className={styles.heroSlide}
              data-state={state}
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} of ${count}`}
              aria-hidden={!isActive}
              inert={!isActive}
            >
              <div className={styles.mediaShift}>
                <div
                  className={styles.media}
                  style={{ '--kb-origin': KEN_BURNS_ORIGINS[index % KEN_BURNS_ORIGINS.length] } as CSSProperties}
                >
                  {showImage && (
                    <Image
                      src={item.image}
                      alt=""
                      fill
                      sizes="100vw"
                      preload={index === 0}
                      className={styles.mediaImage}
                      draggable={false}
                    />
                  )}
                </div>
              </div>

              <div className={styles.overlay} />

              <div className={styles.heroContentWrapper}>
                <div className={styles.contentShift}>
                  <div className={styles.heroContent} data-hover-pause="">
                    <p className={styles.eyebrow}>
                      <span className={styles.eyebrowFeatured}>Featured</span>
                      <span className={styles.eyebrowMeta}>
                        <span>{item.mediaType === 'tv' ? 'TV' : 'Movie'}</span>
                        {hasYear && <span>{item.year}</span>}
                        {ratingValue > 0 && <span>★ {item.rating}</span>}
                      </span>
                    </p>

                    <h2
                      className={styles.heroTitle}
                      data-size={titleSize(item.title)}
                      onClick={() => openModal(item.id, item.mediaType)}
                    >
                      {item.title}
                    </h2>

                    {item.description && <p className={styles.heroDescription}>{item.description}</p>}

                    <div className={styles.heroButtons}>
                      {user && (
                        <button
                          type="button"
                          className={`${styles.primaryButton} ${inList ? styles.inListBtn : ''}`}
                          onClick={() => handleToggleWatchlist(item)}
                          disabled={adding}
                          aria-label={inList ? 'In My List. Click to remove.' : 'Add to My List'}
                          title={inList ? 'In My List. Click to remove.' : 'Add to My List'}
                        >
                          {adding ? (
                            <>
                              <svg className={styles.buttonSpinner} viewBox="0 0 24 24" aria-hidden="true">
                                <circle cx="12" cy="12" r="9" />
                              </svg>
                              <span className={styles.buttonLabel}>Saving...</span>
                            </>
                          ) : inList ? (
                            <>
                              <CheckIcon />
                              <span className={styles.buttonLabel}>In My List</span>
                            </>
                          ) : (
                            <>
                              <PlusIcon />
                              <span className={styles.buttonLabel}>My List</span>
                            </>
                          )}
                        </button>
                      )}

                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => openModal(item.id, item.mediaType)}
                        aria-label={`More info about ${item.title}`}
                      >
                        <InfoIcon />
                        <span className={styles.buttonLabel}>More info</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {count > 1 && (
        <div className={styles.indicators} data-hover-pause="">
          {items.map((item, index) => {
            const isActive = index === current;
            return (
              <button
                key={item.id}
                type="button"
                className={styles.indicator}
                data-active={isActive ? '' : undefined}
                onClick={() => goTo(index)}
                aria-label={`Slide ${index + 1} of ${count}: ${item.title}`}
                aria-current={isActive ? 'true' : undefined}
              >
                <span className={styles.pill}>
                  {isActive && (
                    <span
                      key={`${item.id}-${index}`}
                      className={`${styles.pillFill} ${autoRotate ? '' : styles.pillFillStatic}`}
                      onAnimationEnd={autoRotate ? handleProgressEnd : undefined}
                    />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default HeroGallery;
