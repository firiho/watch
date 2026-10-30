'use client';

import StarRating from '@/components/star-rating/star-rating';
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

/** One slim row of filters shared by My List and Recs. */
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

  return (
    <div className={styles.bar}>
      <div className={styles.tabs} role="group" aria-label="Filter by type">
        {MEDIA_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`${styles.tab} ${media === option.value ? styles.active : ''}`}
            aria-pressed={media === option.value}
            onClick={() => onMediaChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <span className={styles.sep} aria-hidden="true" />

      <div className={styles.ratingGroup}>
        <StarRating
          value={starValue}
          onChange={onRatingChange}
          tone={tone}
          label="Filter by stars"
          getTitle={(star, isCurrent) => (isCurrent ? 'Show all ratings' : `Only ${star}★`)}
          className={styles.starFilter}
        />
        {showUnrated && (
          <button
            type="button"
            className={`${styles.tab} ${rating === 'unrated' ? styles.active : ''}`}
            aria-pressed={rating === 'unrated'}
            onClick={() => onRatingChange(rating === 'unrated' ? null : 'unrated')}
          >
            Unrated
          </button>
        )}
      </div>

      {onRemindersOnlyChange && (
        <>
          <span className={styles.sep} aria-hidden="true" />
          <button
            type="button"
            className={`${styles.iconToggle} ${remindersOnly ? styles.active : ''}`}
            onClick={() => onRemindersOnlyChange(!remindersOnly)}
            aria-pressed={remindersOnly}
            aria-label="Only titles with reminders"
            title={remindersOnly ? 'Show all titles' : 'Only titles with reminders'}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 22C13.1 22 14 21.1 14 20H10C10 21.1 10.9 22 12 22ZM18 16V11C18 7.93 16.37 5.36 13.5 4.68V4C13.5 3.17 12.83 2.5 12 2.5C11.17 2.5 10.5 3.17 10.5 4V4.68C7.64 5.36 6 7.92 6 11V16L4 18V19H20V18L18 16Z" />
            </svg>
          </button>
        </>
      )}

      <span className={styles.count}>
        {count} title{count !== 1 ? 's' : ''}
      </span>
    </div>
  );
};

export default ListFilters;
