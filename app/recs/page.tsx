'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import MovieCard from '@/components/movie-card/movie-card';
import MovieCardSkeleton from '@/components/movie-card/movie-card-skeleton';
import { useAuth } from '@/context/auth-context';
import { useRecommendations } from '@/context/recommendations-context';
import ListFilters, { MediaFilter, RatingFilter } from '@/components/list-filters/list-filters';
import { ADMIN_NAME } from '@/lib/admin';
import { haptic } from '@/lib/haptics';
import styles from '../collections.module.css';
import listStyles from '../watchlist/watchlist.module.css';

const iconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

const StarIcon = () => (
  <svg {...iconProps}>
    <path d="M12 3.5l2.6 5.3 5.9.86-4.25 4.14 1 5.85L12 16.9l-5.25 2.75 1-5.85L3.5 9.66l5.9-.86z" />
  </svg>
);

const FilterIcon = () => (
  <svg {...iconProps}>
    <path d="M4 5h16l-6.2 7.6V18l-3.6 1.8v-7.2z" />
  </svg>
);

const AlertIcon = () => (
  <svg {...iconProps}>
    <path d="M10.3 4.2 2.9 17.5A2 2 0 0 0 4.6 20.5h14.8a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z" />
    <path d="M12 9.5v4" />
    <path d="M12 17h.01" />
  </svg>
);

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

  const clearFilters = () => {
    haptic('light');
    setMediaFilter('all');
    setStarFilter(null);
  };

  return (
    <div className={styles.page}>
      <header className={styles.discoverHeader}>
        <div className={styles.titleGroup}>
          <h1 className={styles.title}>{ADMIN_NAME}&apos;s Recs</h1>
          <p className={styles.description}>
            {isAdmin ? 'Your public page. Rate titles in My List to add them.' : 'Watched, rated, recommended.'}
          </p>
        </div>
        <div className={`${styles.filterWrapper} ${listStyles.filters}`}>
          <ListFilters
            media={mediaFilter}
            onMediaChange={setMediaFilter}
            rating={starFilter}
            onRatingChange={setStarFilter}
            tone="accent"
            count={recommendations.length}
          />
        </div>
      </header>

      {loading ? (
        <div className={styles.grid}>
          {Array.from({ length: 12 }).map((_, i) => (
            <MovieCardSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        <div className={styles.emptyState} role="alert">
          <div className={styles.emptyIcon}>
            <AlertIcon />
          </div>
          <h2 className={styles.emptyTitle}>Couldn&apos;t load recommendations</h2>
          <p className={styles.emptyText}>Please refresh the page and try again.</p>
          <button type="button" className={styles.emptyAction} onClick={() => window.location.reload()}>
            Refresh
          </button>
        </div>
      ) : displayedItems.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>{hasActiveFilters ? <FilterIcon /> : <StarIcon />}</div>
          <h2 className={styles.emptyTitle}>
            {hasActiveFilters ? 'No matches for current filters' : 'No recommendations yet'}
          </h2>
          <p className={styles.emptyText}>
            {hasActiveFilters
              ? 'Try changing or clearing filters to see more titles.'
              : isAdmin
                ? 'Add titles to My List and rate them. Every title you rate is published here.'
                : `${ADMIN_NAME} hasn't rated anything yet. Check back soon.`}
          </p>
          {hasActiveFilters ? (
            <button type="button" className={styles.emptyAction} onClick={clearFilters}>
              Clear filters
            </button>
          ) : isAdmin ? (
            <Link href="/watchlist" className={styles.emptyAction}>
              Go to My List
            </Link>
          ) : null}
        </div>
      ) : (
        <div className={styles.grid}>
          {displayedItems.map((rec, index) => (
            <MovieCard
              key={`${rec.media_type}-${rec.id}`}
              eager={index < 6}
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
