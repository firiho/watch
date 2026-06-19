'use client';

import { useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Genre } from '@/lib/tmdb';
import { COUNTRIES } from '@/lib/countries';
import styles from './filter-bar.module.css';

interface FilterBarProps {
  genres: Genre[];
}

const SORT_OPTIONS = [
  { value: 'popular', label: 'Popular' },
  { value: 'top_rated', label: 'Top Rated' },
  { value: 'newest', label: 'Newest' },
  { value: 'most_reviewed', label: 'Most Reviewed' },
];

const FilterBar = ({ genres }: FilterBarProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const currentGenre = searchParams.get('genre') || '';
  const currentYear = searchParams.get('year') || '';
  const currentCountry = searchParams.get('country') || '';
  const currentSort = searchParams.get('sortBy') || 'popular';

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
          aria-label="Filter by genre"
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
          aria-label="Filter by year"
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
          value={currentCountry}
          onChange={(e) => updateFilters('country', e.target.value)}
          aria-label="Filter by country"
        >
          <option value="">All Countries</option>
          {COUNTRIES.map((country) => (
            <option key={country.code} value={country.code}>
              {country.name}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.filterGroup}>
        <span className={styles.sortLabel} aria-hidden="true">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="6" x2="15" y2="6" />
            <line x1="4" y1="12" x2="12" y2="12" />
            <line x1="4" y1="18" x2="9" y2="18" />
            <polyline points="17 8 20 5 23 8" />
            <line x1="20" y1="5" x2="20" y2="19" />
          </svg>
        </span>
        <select
          className={styles.select}
          value={currentSort}
          onChange={(e) => updateFilters('sortBy', e.target.value)}
          aria-label="Sort by"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

export default FilterBar;
