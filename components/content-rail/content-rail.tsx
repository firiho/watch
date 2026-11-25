'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import Link from 'next/link';
import MovieCard from '../movie-card/movie-card';
import { ContentItem } from '@/lib/tmdb';
import styles from './content-rail.module.css';

interface ContentRailProps {
  title: string;
  data: ContentItem[];
  /** Optional destination for the header's "See all" link. */
  href?: string;
}

/** Mouse travel (px) before a press on the rail turns into a drag instead of a click. */
const DRAG_THRESHOLD = 6;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const Chevron = ({ direction }: { direction: 'left' | 'right' }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d={direction === 'left' ? 'M14.5 5.5 8 12l6.5 6.5' : 'M9.5 5.5 16 12l-6.5 6.5'} />
  </svg>
);

interface DragState {
  pointerId: number;
  startX: number;
  startScroll: number;
  lastX: number;
  lastT: number;
  velocity: number;
  moved: boolean;
}

const idleDrag = (): DragState => ({
  pointerId: -1,
  startX: 0,
  startScroll: 0,
  lastX: 0,
  lastT: 0,
  velocity: 0,
  moved: false,
});

const ContentRail = ({ title, data, href }: ContentRailProps) => {
  const headingId = useId();
  const railRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState>(idleDrag());
  const suppressClickRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  const items = data.slice(0, 10);

  // Track the scroll position so the arrows hide at either end.
  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const max = el.scrollWidth - el.clientWidth;
      setAtStart(el.scrollLeft <= 4);
      setAtEnd(el.scrollLeft >= max - 4);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    schedule();
    el.addEventListener('scroll', schedule, { passive: true });
    const observer = new ResizeObserver(schedule);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', schedule);
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const scrollByPage = (direction: 1 | -1) => {
    const el = railRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  };

  // ---- Desktop drag-to-scroll (mouse only; touch uses native momentum scrolling) ----

  const finishDrag = (withMomentum: boolean) => {
    const drag = dragRef.current;
    dragRef.current = idleDrag();
    if (!drag.moved) return;
    setDragging(false);
    // The click that ends a drag must not open the card under the cursor.
    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
    const el = railRef.current;
    const stillMoving = performance.now() - drag.lastT < 80;
    if (el && withMomentum && stillMoving && Math.abs(drag.velocity) > 0.3 && !prefersReducedMotion()) {
      el.scrollBy({ left: -drag.velocity * 260, behavior: 'smooth' });
    }
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const el = railRef.current;
    if (!el) return;
    const now = performance.now();
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startScroll: el.scrollLeft,
      lastX: e.clientX,
      lastT: now,
      velocity: 0,
      moved: false,
    };
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const el = railRef.current;
    if (!el || e.pointerId !== drag.pointerId) return;
    if ((e.buttons & 1) === 0) {
      // The button was released outside the rail.
      finishDrag(false);
      return;
    }
    const dx = e.clientX - drag.startX;
    if (!drag.moved) {
      if (Math.abs(dx) < DRAG_THRESHOLD) return;
      drag.moved = true;
      setDragging(true);
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* capture is a nicety */
      }
      window.getSelection()?.removeAllRanges();
    }
    el.scrollLeft = drag.startScroll - dx;
    const now = performance.now();
    const dt = now - drag.lastT;
    if (dt > 0) drag.velocity = 0.75 * ((e.clientX - drag.lastX) / dt) + 0.25 * drag.velocity;
    drag.lastX = e.clientX;
    drag.lastT = now;
  };

  const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== dragRef.current.pointerId) return;
    finishDrag(true);
  };

  const handlePointerCancel = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== dragRef.current.pointerId) return;
    finishDrag(false);
  };

  const handleClickCapture = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!suppressClickRef.current) return;
    suppressClickRef.current = false;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <div className={styles.railContainer}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle} id={headingId}>
            {title}
          </h2>
          <div className={styles.railLine} aria-hidden="true" />
          {href && (
            <Link href={href} className={styles.seeAll} aria-label={`See all: ${title}`}>
              <span>See all</span>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9.5 5.5 16 12l-6.5 6.5" />
              </svg>
            </Link>
          )}
        </div>

        <div className={styles.railWrapper}>
          <button
            type="button"
            className={`${styles.navArea} ${styles.prevArea}`}
            onClick={() => {
              if (!atStart) scrollByPage(-1);
            }}
            aria-label={`Scroll ${title} left`}
            aria-disabled={atStart}
          >
            <span className={styles.navButton}>
              <Chevron direction="left" />
            </span>
          </button>

          <div
            ref={railRef}
            className={`${styles.rail} ${dragging ? styles.dragging : ''}`}
            data-rail-scroller=""
            role="list"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onLostPointerCapture={handlePointerCancel}
            onClickCapture={handleClickCapture}
          >
            {/* Keeps the first big number fully visible */}
            <div className={styles.railSpacer} aria-hidden="true" />

            {items.map((item, idx) => (
              <div key={item.id} className={styles.itemWithNumber} role="listitem">
                <span className={`${styles.bigNumber} ${idx >= 9 ? styles.twoDigit : ''}`} aria-hidden="true">
                  {idx + 1}
                </span>
                <MovieCard {...item} eager={idx < 3} />
              </div>
            ))}

            <div className={styles.railSpacer} aria-hidden="true" />
          </div>

          <button
            type="button"
            className={`${styles.navArea} ${styles.nextArea}`}
            onClick={() => {
              if (!atEnd) scrollByPage(1);
            }}
            aria-label={`Scroll ${title} right`}
            aria-disabled={atEnd}
          >
            <span className={styles.navButton}>
              <Chevron direction="right" />
            </span>
          </button>
        </div>
      </div>
    </section>
  );
};

export default ContentRail;
