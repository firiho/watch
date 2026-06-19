import FilterBar from '@/components/filter-bar/filter-bar';
import DiscoverGrid from '@/components/discover-grid/discover-grid';
import { getGenres } from '@/lib/tmdb';
import styles from '../collections.module.css';

export const dynamic = 'force-dynamic';

export default async function TVShowsPage() {
  const genres = await getGenres('tv');

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

      <DiscoverGrid type="tv" />
    </div>
  );
}
