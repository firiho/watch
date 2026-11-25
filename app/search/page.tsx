import { Suspense } from 'react';
import Link from 'next/link';
import MovieCard from '@/components/movie-card/movie-card';
import MovieCardSkeleton from '@/components/movie-card/movie-card-skeleton';
import SearchPageInput from '@/components/search-page-input/search-page-input';
import { searchMulti } from '@/lib/tmdb';
import styles from '../collections.module.css';

interface PageProps {
  searchParams: Promise<{ q?: string | string[] }>;
}

const iconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

const SearchIcon = () => (
  <svg {...iconProps}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

const NoResultsIcon = () => (
  <svg {...iconProps}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
    <path d="m9 9 4 4m0-4-4 4" />
  </svg>
);

async function SearchResults({ query }: { query: string }) {
  const results = await searchMulti(query);

  if (results.length === 0) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyIcon}>
          <NoResultsIcon />
        </div>
        <h2 className={styles.emptyTitle}>No results for &ldquo;{query}&rdquo;</h2>
        <p className={styles.emptyText}>Try searching for something else</p>
        <Link href="/search" className={styles.emptyAction}>
          Clear search
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className={styles.resultsMeta}>
        <span className={styles.resultsLabel}>
          <span className={styles.resultsCount}>{results.length}</span> result{results.length !== 1 ? 's' : ''} for{' '}
          <span className={styles.resultsQuery}>&ldquo;{query}&rdquo;</span>
        </span>
        <div className={styles.resultsDivider} />
      </div>
      <div className={styles.grid}>
        {results.map((item, index) => (
          <MovieCard key={`${item.mediaType}-${item.id}`} {...item} eager={index < 6} />
        ))}
      </div>
    </>
  );
}

function SearchResultsSkeleton() {
  return (
    <>
      <div className={styles.resultsMeta} aria-hidden="true">
        <span className={styles.resultsMetaSkeleton} />
      </div>
      <div className={styles.grid}>
        {Array.from({ length: 10 }).map((_, i) => (
          <MovieCardSkeleton key={i} />
        ))}
      </div>
    </>
  );
}

export default async function SearchPage({ searchParams }: PageProps) {
  const { q } = await searchParams;
  const query = (Array.isArray(q) ? q[0] : q)?.trim() ?? '';

  return (
    <div className={styles.page}>
      <header className={styles.discoverHeader}>
        <div className={styles.titleGroup}>
          <h1 className={styles.title}>Search</h1>
          <p className={styles.description}>
            {query
              ? `Displaying results for "${query}". Find exactly what you're looking for in our vast library.`
              : 'Search for your favorite movies and TV shows across our entire collection.'}
          </p>
        </div>
        <div className={styles.searchField}>
          <SearchPageInput initialQuery={query} />
        </div>
      </header>

      {query ? (
        <Suspense key={query} fallback={<SearchResultsSkeleton />}>
          <SearchResults query={query} />
        </Suspense>
      ) : (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <SearchIcon />
          </div>
          <h2 className={styles.emptyTitle}>Find something to watch</h2>
          <p className={styles.emptyText}>Enter a search term to find movies and TV shows.</p>
        </div>
      )}
    </div>
  );
}
