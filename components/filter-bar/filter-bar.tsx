'use client';

import { useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Genre } from '@/lib/tmdb';
import styles from './filter-bar.module.css';

interface FilterBarProps {
  genres: Genre[];
}

const FilterBar = ({ genres }: FilterBarProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const currentGenre = searchParams.get('genre') || '';
  const currentYear = searchParams.get('year') || '';
  const currentSort = searchParams.get('sortBy') || 'popularity.desc';

  const updateFilters = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  const years = Array.from({ length: 30 }, (_, i) => (new Date().getFullYear() - i).toString());

  return (
    <div className={`${styles.filterBar} ${isPending ? styles.pending : ''}`}>
      <div className={styles.filterGroup}>
        <span className={styles.accentPrefix}>01.</span>
        <select 
          className={styles.select}
          value={currentGenre}
          onChange={(e) => updateFilters('genre', e.target.value)}
        >
          <option value="">All Genres</option>
          {genres.map((genre) => (
            <option key={genre.id} value={genre.id.toString()}>
              {genre.name}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.filterGroup}>
        <span className={styles.accentPrefix}>02.</span>
        <select 
          className={styles.select}
          value={currentYear}
          onChange={(e) => updateFilters('year', e.target.value)}
        >
          <option value="">All Years</option>
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.filterGroup}>
        <span className={styles.accentPrefix}>03.</span>
        <select 
          className={styles.select}
          value={currentSort}
          onChange={(e) => updateFilters('sortBy', e.target.value)}
        >
          <option value="popularity.desc">Sort: Popular</option>
          <option value="vote_average.desc">Sort: Rating</option>
          <option value="primary_release_date.desc">Sort: Newest</option>
          <option value="vote_count.desc">Sort: Reviews</option>
        </select>
      </div>
    </div>
  );
};

export default FilterBar;
