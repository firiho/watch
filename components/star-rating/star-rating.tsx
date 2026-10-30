'use client';

import { useState } from 'react';
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

const StarRating = ({
  value,
  onChange,
  size = 'sm',
  tone = 'gold',
  label = 'Your rating',
  getTitle = defaultTitle,
  className,
}: StarRatingProps) => {
  const [hovered, setHovered] = useState<number | null>(null);
  const current = value ?? 0;
  const shown = hovered ?? current;
  const classes = `${styles.stars} ${styles[size]} ${styles[tone]} ${className ?? ''}`;

  if (!onChange) {
    return (
      <span className={classes} role="img" aria-label={`${current} out of 5 stars`}>
        {STARS.map((n) => (
          <span key={n} className={`${styles.star} ${n <= current ? styles.filled : ''}`}>
            <StarIcon />
          </span>
        ))}
      </span>
    );
  }

  return (
    <div
      className={classes}
      role="group"
      aria-label={label}
      // Cards open the detail modal on click; rating must not trigger that.
      onClick={(e) => e.stopPropagation()}
      onMouseLeave={() => setHovered(null)}
    >
      {STARS.map((n) => (
        <button
          key={n}
          type="button"
          className={`${styles.star} ${styles.button} ${n <= shown ? styles.filled : ''}`}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          aria-pressed={n === current}
          title={getTitle(n, n === current)}
          onMouseEnter={() => setHovered(n)}
          onFocus={() => setHovered(n)}
          onBlur={() => setHovered(null)}
          onClick={() => {
            setHovered(null);
            onChange(n === current ? null : n);
          }}
        >
          <StarIcon />
        </button>
      ))}
    </div>
  );
};

export default StarRating;
