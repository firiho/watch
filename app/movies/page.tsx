import FilterBar from '@/components/filter-bar/filter-bar';
import DiscoverGrid from '@/components/discover-grid/discover-grid';
import { getGenres } from '@/lib/tmdb';
import styles from '../collections.module.css';

export const dynamic = 'force-dynamic';

export default async function MoviesPage() {
  const genres = await getGenres('movie');

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

      <DiscoverGrid type="movie" />
    </div>
  );
}
