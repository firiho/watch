'use client';

import { useState, useEffect } from 'react';
import MovieCard from '@/components/movie-card/movie-card';
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

  const displayedItems = filterReminders 
    ? items.filter(item => hasReminder(item.id))
    : items;

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

  if (loading) {
    return (
      <div className={styles.page}>
        <header className={listStyles.header}>
          <h1 className={styles.title}>My List</h1>
          <p className={styles.description}>Your personal collection of must-watch titles.</p>
        </header>
        <div className={listStyles.loadingState}>
          <div className={listStyles.loadingSpinner}></div>
          <span className={listStyles.loadingText}>Loading your list...</span>
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
          {items.length > 0 && (
            <>
              <button 
                className={`${listStyles.filterToggle} ${filterReminders ? listStyles.active : ''}`}
                onClick={() => setFilterReminders(!filterReminders)}
                title={filterReminders ? "Show all titles" : "Filter by reminders"}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 22C13.1 22 14 21.1 14 20H10C10 21.1 10.9 22 12 22ZM18 16V11C18 7.93 16.37 5.36 13.5 4.68V4C13.5 3.17 12.83 2.5 12 2.5C11.17 2.5 10.5 3.17 10.5 4V4.68C7.64 5.36 6 7.92 6 11V16L4 18V19H20V18L18 16Z"/>
                </svg>
              </button>
              <span className={listStyles.count}>{items.length} title{items.length !== 1 ? 's' : ''}</span>
            </>
          )}
        </div>
      </header>

      {displayedItems.length === 0 ? (
        <div className={listStyles.emptyState}>
          <div className={listStyles.emptyIcon}>{filterReminders ? '🔔' : '🎬'}</div>
          <h2 className={listStyles.emptyTitle}>{filterReminders ? 'No reminders set' : 'Your list is empty'}</h2>
          <p className={listStyles.emptyText}>
            {filterReminders 
              ? 'Click the bell icon on any movie or TV show to set a reminder.' 
              : 'Browse movies and TV shows and click "Add to My List" to start building your collection.'}
          </p>
          {filterReminders && (
            <button 
              className={listStyles.filterToggle} 
              style={{ marginTop: '10px' }}
              onClick={() => setFilterReminders(false)}
            >
              Show all titles
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
