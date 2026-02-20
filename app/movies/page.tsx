import { Suspense } from 'react';
import MovieCard from '@/components/movie-card/movie-card';
import MovieCardSkeleton from '@/components/movie-card/movie-card-skeleton';
import FilterBar from '@/components/filter-bar/filter-bar';
import { discoverContent, getGenres } from '@/lib/tmdb';
import styles from '../collections.module.css';


interface PageProps {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}

async function MovieGrid({ filters }: { filters: any }) {
  const movies = await discoverContent('movie', filters);

  if (movies.length === 0) {
    return (
      <div className={styles.noResults}>
        <span className={styles.noResultsIcon}>🎬</span>
        No movies found matching your filters.
        <span className={styles.noResultsText}>Try adjusting your filters</span>
      </div>
    );
  }

  return (
    <>
      <div className={styles.resultsMeta}>
        <span>{movies.length} results</span>
        <div className={styles.resultsDivider} />
      </div>
      <div className={styles.grid}>
        {movies.map((movie) => (
          <MovieCard key={movie.id} {...movie} />
        ))}
      </div>
    </>
  );
}

export default async function MoviesPage({ searchParams }: PageProps) {
  const filters = await searchParams;
  const genres = await getGenres('movie');
  
  const suspenseKey = JSON.stringify(filters);

  return (
    <div className={styles.page}>
      <header className={styles.discoverHeader}>
        <div className={styles.titleGroup}>
          <h1 className={styles.title}>Movies</h1>
          <p className={styles.description}>Explore our curated selection of cinematic masterpieces, from timeless classics to modern blockbusters.</p>
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
        <MovieGrid filters={filters} />
      </Suspense>
    </div>
  );
}
