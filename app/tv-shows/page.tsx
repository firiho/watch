import { Suspense } from 'react';
import MovieCard from '@/components/movie-card/movie-card';
import MovieCardSkeleton from '@/components/movie-card/movie-card-skeleton';
import FilterBar from '@/components/filter-bar/filter-bar';
import { discoverContent, getGenres } from '@/lib/tmdb';
import styles from '../collections.module.css';

interface PageProps {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}

async function TVGrid({ filters }: { filters: any }) {
  const tvShows = await discoverContent('tv', filters);

  if (tvShows.length === 0) {
    return (
      <div className={styles.noResults}>
        <span className={styles.noResultsIcon}>📺</span>
        No TV shows found matching your filters.
        <span className={styles.noResultsText}>Try adjusting your filters</span>
      </div>
    );
  }

  return (
    <>
      <div className={styles.resultsMeta}>
        <span>{tvShows.length} results</span>
        <div className={styles.resultsDivider} />
      </div>
      <div className={styles.grid}>
        {tvShows.map((show) => (
          <MovieCard key={show.id} {...show} />
        ))}
      </div>
    </>
  );
}

export default async function TVShowsPage({ searchParams }: PageProps) {
  const filters = await searchParams;
  const genres = await getGenres('tv');
  
  const suspenseKey = JSON.stringify(filters);

  return (
    <div className={styles.page}>
      <header className={styles.discoverHeader}>
        <div className={styles.titleGroup}>
          <h1 className={styles.title}>TV Shows</h1>
          <p className={styles.description}>Discover your next obsession with our extensive library of binge-worthy series and acclaimed dramas.</p>
        </div>
        <div className={styles.filterWrapper}>
          <FilterBar genres={genres} />
        </div>
      </header>
      
      <Suspense key={suspenseKey} fallback={
        <div className={styles.grid}>
          {Array.from({ length: 12 }).map((_, i) => (
            <MovieCardSkeleton key={i} />
          ))}
        </div>
      }>
        <TVGrid filters={filters} />
      </Suspense>
    </div>
  );
}
