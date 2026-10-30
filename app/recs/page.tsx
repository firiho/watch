'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import MovieCard from '@/components/movie-card/movie-card';
import MovieCardSkeleton from '@/components/movie-card/movie-card-skeleton';
import { useAuth } from '@/context/auth-context';
import { useRecommendations } from '@/context/recommendations-context';
import ListFilters, { MediaFilter, RatingFilter } from '@/components/list-filters/list-filters';
import { ADMIN_NAME } from '@/lib/admin';
import styles from '../collections.module.css';
import listStyles from '../watchlist/watchlist.module.css';

export default function RecsPage() {
  const { isAdmin } = useAuth();
  const { recommendations, loading, error } = useRecommendations();
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('all');
  const [starFilter, setStarFilter] = useState<RatingFilter>(null);

  // Highest rated first, most recently rated first within the same score.
  const sorted = useMemo(
    () => [...recommendations].sort((a, b) => b.stars - a.stars || b.updated_at - a.updated_at),
    [recommendations]
  );

  const displayedItems = sorted.filter((rec) => {
    const matchesMedia = mediaFilter === 'all' || rec.media_type === mediaFilter;
    const matchesStars = starFilter === null || rec.stars === starFilter;
    return matchesMedia && matchesStars;
  });

  const hasActiveFilters = mediaFilter !== 'all' || starFilter !== null;

  return (
    <div className={styles.page}>
      <header className={listStyles.header}>
        <div className={listStyles.headerContent}>
          <h1 className={styles.title}>{ADMIN_NAME}&apos;s Recs</h1>
          <p className={styles.description}>
            {isAdmin ? 'Your public page. Rate titles in My List to add them.' : 'Watched, rated, recommended.'}
          </p>
        </div>
        <ListFilters
          media={mediaFilter}
          onMediaChange={setMediaFilter}
          rating={starFilter}
          onRatingChange={setStarFilter}
          tone="accent"
          count={recommendations.length}
        />
      </header>

      {loading ? (
        <div className={styles.grid}>
          {Array.from({ length: 12 }).map((_, i) => (
            <MovieCardSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        <div className={listStyles.emptyState}>
          <div className={listStyles.emptyIcon}>⚠️</div>
          <h2 className={listStyles.emptyTitle}>Couldn&apos;t load recommendations</h2>
          <p className={listStyles.emptyText}>Please refresh the page and try again.</p>
        </div>
      ) : displayedItems.length === 0 ? (
        <div className={listStyles.emptyState}>
          <div className={listStyles.emptyIcon}>⭐</div>
          <h2 className={listStyles.emptyTitle}>
            {hasActiveFilters ? 'No matches for current filters' : 'No recommendations yet'}
          </h2>
          <p className={listStyles.emptyText}>
            {hasActiveFilters
              ? 'Try changing or clearing filters to see more titles.'
              : isAdmin
                ? 'Add titles to My List and rate them. Every title you rate is published here.'
                : `${ADMIN_NAME} hasn't rated anything yet. Check back soon.`}
          </p>
          {hasActiveFilters ? (
            <button
              className={listStyles.filterToggle}
              style={{ marginTop: '10px' }}
              onClick={() => {
                setMediaFilter('all');
                setStarFilter(null);
              }}
            >
              Clear filters
            </button>
          ) : isAdmin ? (
            <Link href="/watchlist" className={listStyles.filterToggle} style={{ marginTop: '10px' }}>
              Go to My List
            </Link>
          ) : null}
        </div>
      ) : (
        <div className={styles.grid}>
          {displayedItems.map((rec) => (
            <MovieCard
              key={`${rec.media_type}-${rec.id}`}
              id={rec.id}
              title={rec.title}
              year={rec.release_date?.split('-')[0] || 'N/A'}
              releaseDate={rec.release_date || undefined}
              image={`https://image.tmdb.org/t/p/w500${rec.poster_path}`}
              backdrop={rec.backdrop_path ? `https://image.tmdb.org/t/p/w780${rec.backdrop_path}` : undefined}
              rating={rec.vote_average?.toFixed(1) || '0.0'}
              description={rec.overview}
              mediaType={rec.media_type}
            />
          ))}
        </div>
      )}
    </div>
  );
}
