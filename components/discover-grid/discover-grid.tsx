'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import MovieCard from '@/components/movie-card/movie-card';
import MovieCardSkeleton from '@/components/movie-card/movie-card-skeleton';
import { ContentItem } from '@/lib/tmdb';
import gridStyles from '@/app/collections.module.css';
import styles from './discover-grid.module.css';

interface DiscoverGridProps {
  type: 'movie' | 'tv';
}

/** Start fetching the next page well before the sentinel scrolls into view. */
const PREFETCH_MARGIN = '0px 0px 1400px 0px';
/** Posters in the first rows (above the fold on phones and desktop) load eagerly. */
const EAGER_POSTERS = 6;

const DiscoverGrid = ({ type }: DiscoverGridProps) => {
  const searchParams = useSearchParams();
  const genre = searchParams.get('genre') || '';
  const year = searchParams.get('year') || '';
  const country = searchParams.get('country') || '';
  const sortBy = searchParams.get('sortBy') || 'popular';
  const filterKey = `${type}|${genre}|${year}|${country}|${sortBy}`;

  const [items, setItems] = useState<ContentItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);
  const [error, setError] = useState(false);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // Guards against overlapping fetches and stale responses when filters change.
  const loadingRef = useRef(false);
  const requestKeyRef = useRef(filterKey);

  const buildUrl = useCallback(
    (nextPage: number) => {
      const params = new URLSearchParams({ type, page: String(nextPage), sortBy });
      if (genre) params.set('genre', genre);
      if (year) params.set('year', year);
      if (country) params.set('country', country);
      return `/api/discover?${params.toString()}`;
    },
    [type, genre, year, country, sortBy]
  );

  // Reset + load page 1 whenever the filters change.
  useEffect(() => {
    requestKeyRef.current = filterKey;
    loadingRef.current = true;
    setInitialLoading(true);
    setError(false);
    setLoadMoreFailed(false);
    setItems([]);
    setPage(1);

    fetch(buildUrl(1))
      .then((res) => {
        if (!res.ok) throw new Error('discover failed');
        return res.json();
      })
      .then((data) => {
        if (requestKeyRef.current !== filterKey) return; // stale
        setItems(data.results || []);
        setTotalPages(data.totalPages || 1);
        setPage(1);
      })
      .catch(() => {
        if (requestKeyRef.current === filterKey) setError(true);
      })
      .finally(() => {
        if (requestKeyRef.current === filterKey) {
          setInitialLoading(false);
          loadingRef.current = false;
        }
      });
  }, [filterKey, buildUrl]);

  const loadMore = useCallback(() => {
    if (loadingRef.current || initialLoading) return;
    if (page >= totalPages) return;
    const nextPage = page + 1;
    loadingRef.current = true;
    setLoadingMore(true);
    setLoadMoreFailed(false);

    fetch(buildUrl(nextPage))
      .then((res) => {
        if (!res.ok) throw new Error('discover failed');
        return res.json();
      })
      .then((data) => {
        if (requestKeyRef.current !== filterKey) return; // stale (filters changed)
        setItems((prev) => {
          const seen = new Set(prev.map((i) => i.id));
          const fresh = (data.results || []).filter((i: ContentItem) => !seen.has(i.id));
          return [...prev, ...fresh];
        });
        setPage(nextPage);
        setTotalPages(data.totalPages || totalPages);
      })
      .catch(() => {
        // Keep what we have. The sentinel retries on its next intersection, and the
        // retry button covers the case where it never leaves the viewport.
        if (requestKeyRef.current === filterKey) setLoadMoreFailed(true);
      })
      .finally(() => {
        if (requestKeyRef.current === filterKey) setLoadingMore(false);
        loadingRef.current = false;
      });
  }, [page, totalPages, initialLoading, buildUrl, filterKey]);

  // Infinite scroll via an intersection sentinel.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: PREFETCH_MARGIN }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  if (initialLoading) {
    return (
      <div className={gridStyles.grid} aria-busy="true" aria-label="Loading titles">
        {Array.from({ length: 12 }).map((_, i) => (
          <MovieCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (error && items.length === 0) {
    return (
      <div className={gridStyles.noResults}>
        <span className={gridStyles.noResultsIcon}>⚠️</span>
        Something went wrong loading titles.
        <span className={gridStyles.noResultsText}>Please try again.</span>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className={gridStyles.noResults}>
        <span className={gridStyles.noResultsIcon}>{type === 'tv' ? '📺' : '🎬'}</span>
        No {type === 'tv' ? 'shows' : 'movies'} found matching your filters.
        <span className={gridStyles.noResultsText}>Try adjusting your filters</span>
      </div>
    );
  }

  const reachedEnd = page >= totalPages;

  return (
    <>
      <div className={gridStyles.grid}>
        {items.map((item, index) => (
          <MovieCard key={`${item.mediaType}-${item.id}`} {...item} eager={index < EAGER_POSTERS} />
        ))}
      </div>

      <div ref={sentinelRef} className={styles.sentinel}>
        <div className={styles.status} role="status" aria-live="polite">
          {loadingMore ? (
            <span className={styles.loading}>
              <span className={styles.spinner} aria-hidden="true" />
              <span className={styles.loadingText}>Loading more</span>
            </span>
          ) : loadMoreFailed && !reachedEnd ? (
            <button type="button" className={styles.retryButton} onClick={loadMore}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20 11a8 8 0 1 0-2.34 5.66" />
                <path d="M20 5v6h-6" />
              </svg>
              Couldn&apos;t load more. Retry
            </button>
          ) : reachedEnd ? (
            <span className={styles.endText}>You&apos;ve reached the end</span>
          ) : null}
        </div>
      </div>
    </>
  );
};

export default DiscoverGrid;
