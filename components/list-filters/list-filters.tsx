'use client';

import { useRef, type CSSProperties, type KeyboardEvent } from 'react';
import StarRating from '@/components/star-rating/star-rating';
import { haptic } from '@/lib/haptics';
import styles from './list-filters.module.css';

export type MediaFilter = 'all' | 'movie' | 'tv';
/** null = any rating; a number = exactly that many stars. */
export type RatingFilter = number | 'unrated' | null;

interface ListFiltersProps {
  media: MediaFilter;
  onMediaChange: (media: MediaFilter) => void;
  rating: RatingFilter;
  onRatingChange: (rating: RatingFilter) => void;
  /** Adds an "Unrated" option (My List only — every rec has stars). */
  showUnrated?: boolean;
  /** Renders the reminders toggle when provided. */
  remindersOnly?: boolean;
  onRemindersOnlyChange?: (value: boolean) => void;
  tone?: 'gold' | 'accent';
  count: number;
}

const MEDIA_OPTIONS: { value: MediaFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'movie', label: 'Movies' },
  { value: 'tv', label: 'TV' },
];

const BellIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 22C13.1 22 14 21.1 14 20H10C10 21.1 10.9 22 12 22ZM18 16V11C18 7.93 16.37 5.36 13.5 4.68V4C13.5 3.17 12.83 2.5 12 2.5C11.17 2.5 10.5 3.17 10.5 4V4.68C7.64 5.36 6 7.92 6 11V16L4 18V19H20V18L18 16Z" />
  </svg>
);

/**
 * Filters shared by My List and Recs: an iOS-style segmented control for the
 * media type, a star filter, optional Unrated / reminders toggles and a count.
 */
const ListFilters = ({
  media,
  onMediaChange,
  rating,
  onRatingChange,
  showUnrated,
  remindersOnly,
  onRemindersOnlyChange,
  tone = 'gold',
  count,
}: ListFiltersProps) => {
  const starValue = typeof rating === 'number' ? rating : null;
  const segmentRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = Math.max(
    0,
    MEDIA_OPTIONS.findIndex((option) => option.value === media)
  );

  const selectMedia = (value: MediaFilter) => {
    if (value === media) return;
    haptic('selection');
    onMediaChange(value);
  };

  // Radio-group keyboard model: arrows move the selection, Home/End jump.
  const handleSegmentKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = MEDIA_OPTIONS.length - 1;
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = index === last ? 0 : index + 1;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = index === 0 ? last : index - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    if (next === null) return;
    e.preventDefault();
    segmentRefs.current[next]?.focus();
    selectMedia(MEDIA_OPTIONS[next].value);
  };

  const segmentedStyle = {
    '--segment-index': selectedIndex,
    '--segment-count': MEDIA_OPTIONS.length,
  } as CSSProperties;

  return (
    <div className={`${styles.bar} ${tone === 'accent' ? styles.toneAccent : ''}`}>
      <div className={styles.segmented} role="radiogroup" aria-label="Filter by type" style={segmentedStyle}>
        <span className={styles.indicator} aria-hidden="true" />
        {MEDIA_OPTIONS.map((option, index) => {
          const selected = index === selectedIndex;
          return (
            <button
              key={option.value}
              ref={(el) => {
                segmentRefs.current[index] = el;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              className={`${styles.segment} ${selected ? styles.selected : ''}`}
              onClick={() => selectMedia(option.value)}
              onKeyDown={(e) => handleSegmentKeyDown(e, index)}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <div className={styles.toggles}>
        <div className={`${styles.starGroup} ${starValue !== null ? styles.starGroupActive : ''}`}>
          {/* StarRating plays its own selection haptic on commit. */}
          <StarRating
            value={starValue}
            onChange={onRatingChange}
            tone={tone}
            label="Filter by stars"
            getTitle={(star, isCurrent) => (isCurrent ? 'Show all ratings' : `Only ${star}★`)}
            className={styles.starFilter}
          />
        </div>

        {/* Kept together so a narrow phone wraps them as a pair (never the bell alone). */}
        {(showUnrated || onRemindersOnlyChange) && (
          <div className={styles.extras}>
            {showUnrated && (
              <button
                type="button"
                className={`${styles.pill} ${rating === 'unrated' ? styles.pillActive : ''}`}
                aria-pressed={rating === 'unrated'}
                onClick={() => {
                  haptic('selection');
                  onRatingChange(rating === 'unrated' ? null : 'unrated');
                }}
              >
                Unrated
              </button>
            )}

            {onRemindersOnlyChange && (
              <button
                type="button"
                className={`${styles.pill} ${styles.iconPill} ${remindersOnly ? styles.pillActive : ''}`}
                onClick={() => {
                  haptic('selection');
                  onRemindersOnlyChange(!remindersOnly);
                }}
                aria-pressed={Boolean(remindersOnly)}
                aria-label="Only titles with reminders"
                title={remindersOnly ? 'Show all titles' : 'Only titles with reminders'}
              >
                <BellIcon />
              </button>
            )}
          </div>
        )}
      </div>

      <span className={styles.count}>
        {count} title{count !== 1 ? 's' : ''}
      </span>
    </div>
  );
};

export default ListFilters;
