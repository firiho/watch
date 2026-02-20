import { Suspense } from 'react';
import MovieCard from '@/components/movie-card/movie-card';
import MovieCardSkeleton from '@/components/movie-card/movie-card-skeleton';
import { searchMulti } from '@/lib/tmdb';
import styles from '../collections.module.css';

interface PageProps {
  searchParams: Promise<{ q?: string }>;
}

async function SearchResults({ query }: { query: string }) {
  const results = await searchMulti(query);

  if (results.length === 0) {
    return (
      <div className={styles.noResults}>
        <span className={styles.noResultsIcon}>🔍</span>
        No results found for &ldquo;{query}&rdquo;
        <span className={styles.noResultsText}>Try searching for something else</span>
      </div>
    );
  }

  return (
    <>
      <div className={styles.resultsMeta}>
        <span>Search results for &ldquo;{query}&rdquo;</span>
        <div className={styles.resultsDivider} />
        <span>{results.length} results</span>
      </div>
      <div className={styles.grid}>
        {results.map((item) => (
          <MovieCard key={item.id} {...item} />
        ))}
      </div>
    </>
  );
}

export default async function SearchPage({ searchParams }: PageProps) {
  const { q: query } = await searchParams;

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
      </header>
      
      {query ? (
        <Suspense key={query} fallback={
          <div className={styles.grid}>
            {Array.from({ length: 10 }).map((_, i) => (
              <MovieCardSkeleton key={i} />
            ))}
          </div>
        }>
          <SearchResults query={query} />
        </Suspense>
      ) : (
        <div className={styles.emptyState}>
          <div className={styles.noResults}>
            <span className={styles.noResultsIcon}>🔎</span>
            Enter a search term to find movies and TV shows.
          </div>
        </div>
      )}
    </div>
  );
}
