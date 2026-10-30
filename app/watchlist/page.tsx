'use client';

import { useState } from 'react';
import MovieCard from '@/components/movie-card/movie-card';
import MovieCardSkeleton from '@/components/movie-card/movie-card-skeleton';
import { useWatchlist } from '@/context/watchlist-context';
import { useAuth } from '@/context/auth-context';
import { useReminders } from '@/context/reminder-context';
import ListFilters, { MediaFilter, RatingFilter } from '@/components/list-filters/list-filters';
import styles from '../collections.module.css';
import listStyles from './watchlist.module.css';

export default function MyListPage() {
  const { user } = useAuth();
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

  if (!user) {
    return (
      <div className={styles.page}>
        <div className={listStyles.emptyState}>
          <div className={listStyles.emptyIcon}>🔒</div>
          <h2 className={listStyles.emptyTitle}>Sign in to see your list</h2>
          <p className={listStyles.emptyText}>
            Sign in to start building your personal watchlist.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={listStyles.header}>
        <div className={listStyles.headerContent}>
          <h1 className={styles.title}>My List</h1>
          <p className={styles.description}>Your personal collection of must-watch titles. Keep track of everything you want to see.</p>
        </div>
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
      </header>

      {loading ? (
        <div className={styles.grid}>
          {Array.from({ length: 12 }).map((_, i) => (
            <MovieCardSkeleton key={i} />
          ))}
        </div>
      ) : displayedItems.length === 0 ? (
        <div className={listStyles.emptyState}>
          <div className={listStyles.emptyIcon}>{filterReminders ? '🔔' : '🎬'}</div>
          <h2 className={listStyles.emptyTitle}>{hasActiveFilters ? 'No matches for current filters' : 'Your list is empty'}</h2>
          <p className={listStyles.emptyText}>
            {hasActiveFilters
              ? 'Try changing or clearing filters to see more titles in your list.'
              : 'Browse movies and TV shows and click "Add to My List" to start building your collection.'}
          </p>
          {hasActiveFilters && (
            <button 
              className={listStyles.filterToggle} 
              style={{ marginTop: '10px' }}
              onClick={() => {
                setFilterReminders(false);
                setMediaFilter('all');
                setRatingFilter(null);
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className={styles.grid}>
          {displayedItems.map((item) => (
            <MovieCard
              key={item.id}
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
    </div>
  );
}
