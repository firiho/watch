'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import MovieCard from '@/components/movie-card/movie-card';
import MovieCardSkeleton from '@/components/movie-card/movie-card-skeleton';
import { useWatchlist } from '@/context/watchlist-context';
import { useAuth } from '@/context/auth-context';
import { useReminders } from '@/context/reminder-context';
import ListFilters, { MediaFilter, RatingFilter } from '@/components/list-filters/list-filters';
import { haptic } from '@/lib/haptics';
import styles from '../collections.module.css';
import listStyles from './watchlist.module.css';

const iconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

const LockIcon = () => (
  <svg {...iconProps}>
    <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
    <path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3" />
  </svg>
);

const BookmarkIcon = () => (
  <svg {...iconProps}>
    <path d="M7 3.5h10a1.5 1.5 0 0 1 1.5 1.5v15.5L12 16.6l-6.5 3.9V5A1.5 1.5 0 0 1 7 3.5z" />
  </svg>
);

const BellIcon = () => (
  <svg {...iconProps}>
    <path d="M18 9a6 6 0 0 0-12 0c0 6.5-2.5 8.5-2.5 8.5h17S18 15.5 18 9z" />
    <path d="M13.7 20.5a2 2 0 0 1-3.4 0" />
  </svg>
);

const FilterIcon = () => (
  <svg {...iconProps}>
    <path d="M4 5h16l-6.2 7.6V18l-3.6 1.8v-7.2z" />
  </svg>
);

const ArrowIcon = () => (
  <svg {...iconProps} strokeWidth={2.25}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export default function MyListPage() {
  const { user, loading: authLoading } = useAuth();
  // Live items from the watchlist subscription, so ratings and add/remove show instantly.
  const { items, loading } = useWatchlist();
  const { hasReminder } = useReminders();
  const [filterReminders, setFilterReminders] = useState(false);
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('all');
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>(null);

  const displayedItems = items.filter((item) => {
    const matchesReminder = !filterReminders || hasReminder(item.id);
    const matchesMedia = mediaFilter === 'all' || item.media_type === mediaFilter;
    const matchesRating =
      ratingFilter === null ||
      (ratingFilter === 'unrated' ? !item.rating : item.rating === ratingFilter);
    return matchesReminder && matchesMedia && matchesRating;
  });

  const hasActiveFilters = filterReminders || mediaFilter !== 'all' || ratingFilter !== null;

  const clearFilters = () => {
    haptic('light');
    setFilterReminders(false);
    setMediaFilter('all');
    setRatingFilter(null);
  };

  const renderHeader = (filters?: ReactNode) => (
    <header className={styles.discoverHeader}>
      <div className={styles.titleGroup}>
        <h1 className={styles.title}>My List</h1>
        <p className={styles.description}>Your personal collection of must-watch titles. Keep track of everything you want to see.</p>
      </div>
      {filters && <div className={`${styles.filterWrapper} ${listStyles.filters}`}>{filters}</div>}
    </header>
  );

  const skeletonGrid = (
    <div className={styles.grid}>
      {Array.from({ length: 12 }).map((_, i) => (
        <MovieCardSkeleton key={i} />
      ))}
    </div>
  );

  if (!user) {
    // Firebase is still restoring the session: don't flash the signed-out screen.
    if (authLoading) {
      return (
        <main className={styles.page}>
          {renderHeader()}
          {skeletonGrid}
        </main>
      );
    }

    return (
      <main className={styles.page}>
        <div className={`${styles.emptyState} ${listStyles.gate}`}>
          <div className={styles.emptyIcon}>
            <LockIcon />
          </div>
          <h2 className={styles.emptyTitle}>Sign in to see your list</h2>
          <p className={styles.emptyText}>Sign in to start building your personal watchlist.</p>
          <Link href="/auth" className={`${styles.emptyAction} ${styles.emptyActionPrimary}`}>
            Sign in
            <ArrowIcon />
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      {renderHeader(
        <ListFilters
          media={mediaFilter}
          onMediaChange={setMediaFilter}
          rating={ratingFilter}
          onRatingChange={setRatingFilter}
          showUnrated
          remindersOnly={filterReminders}
          onRemindersOnlyChange={setFilterReminders}
          count={items.length}
        />
      )}

      {loading ? (
        skeletonGrid
      ) : displayedItems.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            {filterReminders ? <BellIcon /> : hasActiveFilters ? <FilterIcon /> : <BookmarkIcon />}
          </div>
          <h2 className={styles.emptyTitle}>{hasActiveFilters ? 'No matches for current filters' : 'Your list is empty'}</h2>
          <p className={styles.emptyText}>
            {hasActiveFilters
              ? 'Try changing or clearing filters to see more titles in your list.'
              : 'Browse movies and TV shows and click “Add to My List” to start building your collection.'}
          </p>
          {hasActiveFilters ? (
            <button type="button" className={styles.emptyAction} onClick={clearFilters}>
              Clear filters
            </button>
          ) : (
            <Link href="/movies" className={styles.emptyAction}>
              Browse movies
            </Link>
          )}
        </div>
      ) : (
        <div className={styles.grid}>
          {displayedItems.map((item, index) => (
            <MovieCard
              key={item.id}
              eager={index < 6}
              id={item.id}
              title={item.title}
              year={item.release_date?.split('-')[0] || 'N/A'}
              releaseDate={item.release_date || undefined}
              image={`https://image.tmdb.org/t/p/w500${item.poster_path}`}
              backdrop={item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : undefined}
              rating={item.vote_average?.toFixed(1) || '0.0'}
              description={item.overview}
              mediaType={item.media_type}
            />
          ))}
        </div>
      )}
    </main>
  );
}
