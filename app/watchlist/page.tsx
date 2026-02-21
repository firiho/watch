'use client';

import { useState, useEffect } from 'react';
import MovieCard from '@/components/movie-card/movie-card';
import MovieCardSkeleton from '@/components/movie-card/movie-card-skeleton';
import { useWatchlist } from '@/context/watchlist-context';
import { useAuth } from '@/context/auth-context';
import { getWatchlist, WatchlistItem } from '@/lib/watchlist';
import { useReminders } from '@/context/reminder-context';
import styles from '../collections.module.css';
import listStyles from './watchlist.module.css';

export default function MyListPage() {
  const { user } = useAuth();
  const { watchlist } = useWatchlist();
  const { hasReminder } = useReminders();
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterReminders, setFilterReminders] = useState(false);
  const [mediaFilter, setMediaFilter] = useState<'all' | 'movie' | 'tv'>('all');

  useEffect(() => {
    const fetchList = async () => {
      if (!user) {
        setItems([]);
        setLoading(false);
        return;
      }

      try {
        const data = await getWatchlist();
        setItems(data);
      } catch (error) {
        console.error('Error fetching watchlist:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchList();
  }, [user, watchlist]); // Re-fetch when watchlist Set changes (add/remove)

  const displayedItems = items.filter((item) => {
    const matchesReminder = !filterReminders || hasReminder(item.id);
    const matchesMedia = mediaFilter === 'all' || item.media_type === mediaFilter;
    return matchesReminder && matchesMedia;
  });

  const hasActiveFilters = filterReminders || mediaFilter !== 'all';

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
        <div className={listStyles.headerActions}>
          <div className={listStyles.filterGroup} role="group" aria-label="Filter by media type">
            <button
              className={`${listStyles.filterPill} ${mediaFilter === 'all' ? listStyles.active : ''}`}
              onClick={() => setMediaFilter('all')}
              title="Show all titles"
              aria-pressed={mediaFilter === 'all'}
              disabled={loading}
            >
              All
            </button>
            <button
              className={`${listStyles.filterPill} ${mediaFilter === 'movie' ? listStyles.active : ''}`}
              onClick={() => setMediaFilter('movie')}
              title="Show movies only"
              aria-pressed={mediaFilter === 'movie'}
              disabled={loading}
            >
              Movies
            </button>
            <button
              className={`${listStyles.filterPill} ${mediaFilter === 'tv' ? listStyles.active : ''}`}
              onClick={() => setMediaFilter('tv')}
              title="Show TV series only"
              aria-pressed={mediaFilter === 'tv'}
              disabled={loading}
            >
              TV Series
            </button>
          </div>
          <button 
            className={`${listStyles.filterToggle} ${filterReminders ? listStyles.active : ''}`}
            onClick={() => setFilterReminders(!filterReminders)}
            title={filterReminders ? "Show all titles" : "Filter by reminders"}
            aria-pressed={filterReminders}
            disabled={loading}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 22C13.1 22 14 21.1 14 20H10C10 21.1 10.9 22 12 22ZM18 16V11C18 7.93 16.37 5.36 13.5 4.68V4C13.5 3.17 12.83 2.5 12 2.5C11.17 2.5 10.5 3.17 10.5 4V4.68C7.64 5.36 6 7.92 6 11V16L4 18V19H20V18L18 16Z"/>
            </svg>
          </button>
          <span className={listStyles.count}>{items.length} title{items.length !== 1 ? 's' : ''}</span>
        </div>
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
