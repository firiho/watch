'use client';

import { useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { haptic } from '@/lib/haptics';
import styles from './star-rating.module.css';

interface StarRatingProps {
  value?: number | null;
  /** Makes the stars clickable. Clicking the current value clears it (null). */
  onChange?: (value: number | null) => void;
  size?: 'xs' | 'sm' | 'md';
  tone?: 'gold' | 'accent';
  /** Accessible name for the interactive group. */
  label?: string;
  /** Tooltip per star; defaults to rating wording. */
  getTitle?: (star: number, isCurrent: boolean) => string;
  className?: string;
}

const STARS = [1, 2, 3, 4, 5];

const StarIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
  </svg>
);

const defaultTitle = (star: number, isCurrent: boolean) => (isCurrent ? 'Clear rating' : `Rate ${star}/5`);

const cx = (...names: Array<string | false | null | undefined>) => names.filter(Boolean).join(' ');

const isFocusVisible = (el: Element) => {
  try {
    return el.matches(':focus-visible');
  } catch {
    return true;
  }
};

type Pop = { star: number; kind: 'set' | 'clear'; id: number };

const StarRating = ({
  value,
  onChange,
  size = 'sm',
  tone = 'gold',
  label = 'Your rating',
  getTitle = defaultTitle,
  className,
}: StarRatingProps) => {
  // Mouse hover and keyboard focus each preview a rating; touch never does
  // (a tap would otherwise leave a sticky "hover" fill behind on iOS).
  const [hovered, setHovered] = useState<number | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const [pop, setPop] = useState<Pop | null>(null);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  const current = value ?? 0;
  const shown = hovered ?? preview ?? current;
  const classes = cx(styles.stars, styles[size], styles[tone], className);

  if (!onChange) {
    return (
      <span className={classes} role="img" aria-label={current ? `${current} out of 5 stars` : 'Not rated'}>
        {STARS.map((n) => (
          <span key={n} className={cx(styles.star, n <= current && styles.filled)}>
            <span className={styles.glyph}>
              <StarIcon />
            </span>
          </span>
        ))}
      </span>
    );
  }

  const commit = (next: number | null, star: number) => {
    haptic('selection');
    setHovered(null);
    setPreview(null);
    setPop((p) => ({ star, kind: next === null ? 'clear' : 'set', id: (p?.id ?? 0) + 1 }));
    onChange(next);
  };

  // Roving tabindex: the group is a single Tab stop (the current star, or the first).
  const tabStop = focused ?? (current >= 1 ? current : 1);

  const focusStar = (n: number) => buttons.current[Math.min(5, Math.max(1, n)) - 1]?.focus();

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const from = focused ?? tabStop;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        e.preventDefault();
        focusStar(from + 1);
        return;
      case 'ArrowLeft':
      case 'ArrowDown':
        e.preventDefault();
        focusStar(from - 1);
        return;
      case 'Home':
        e.preventDefault();
        focusStar(1);
        return;
      case 'End':
        e.preventDefault();
        focusStar(5);
        return;
      case '0':
      case 'Backspace':
      case 'Delete':
        if (value != null) {
          e.preventDefault();
          commit(null, current);
        }
        return;
      default:
        if (/^[1-5]$/.test(e.key)) {
          e.preventDefault();
          const n = Number(e.key);
          if (n !== current) commit(n, n);
          focusStar(n);
        }
    }
  };

  const handleFocus = (n: number) => (e: FocusEvent<HTMLButtonElement>) => {
    setFocused(n);
    setPreview(isFocusVisible(e.currentTarget) ? n : null);
  };

  const handleBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setFocused(null);
    setPreview(null);
  };

  return (
    <div
      className={cx(classes, styles.interactive)}
      role="group"
      aria-label={label}
      // Cards open the detail modal on click; rating must not trigger that.
      onClick={(e) => e.stopPropagation()}
      onPointerLeave={(e) => {
        if (e.pointerType === 'mouse') setHovered(null);
      }}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
    >
      {STARS.map((n) => {
        const isCurrent = n === current;
        const popping = pop?.star === n ? pop : null;
        return (
          <button
            key={n}
            ref={(el) => {
              buttons.current[n - 1] = el;
            }}
            type="button"
            className={cx(styles.star, styles.button, n <= shown && styles.filled)}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            aria-pressed={isCurrent}
            title={getTitle(n, isCurrent)}
            tabIndex={n === tabStop ? 0 : -1}
            onPointerEnter={(e) => {
              if (e.pointerType === 'mouse') setHovered(n);
            }}
            onFocus={handleFocus(n)}
            onClick={() => commit(isCurrent ? null : n, n)}
          >
            {/* Re-keyed per commit so the pop replays even on the same star. */}
            <span
              key={popping ? popping.id : 'idle'}
              className={cx(styles.glyph, popping && (popping.kind === 'set' ? styles.pop : styles.unpop))}
            >
              <StarIcon />
            </span>
          </button>
        );
      })}
    </div>
  );
};

export default StarRating;
