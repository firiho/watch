'use client';

import { useCallback, useEffect, useOptimistic, useRef, useState, useTransition, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Genre } from '@/lib/tmdb';
import { COUNTRIES } from '@/lib/countries';
import { haptic } from '@/lib/haptics';
import styles from './filter-bar.module.css';

interface FilterBarProps {
  genres: Genre[];
}

type FilterKey = 'genre' | 'year' | 'country' | 'sortBy';
type Filters = Record<FilterKey, string>;

const SORT_OPTIONS = [
  { value: 'popular', label: 'Popular' },
  { value: 'top_rated', label: 'Top Rated' },
  { value: 'newest', label: 'Newest' },
  { value: 'most_reviewed', label: 'Most Reviewed' },
];

const DEFAULT_SORT = 'popular';
const FILTER_KEYS: FilterKey[] = ['genre', 'year', 'country', 'sortBy'];
const DEFAULTS: Filters = { genre: '', year: '', country: '', sortBy: DEFAULT_SORT };

const Chevron = () => (
  <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
    <path d="M3 4.75 6 7.75l3-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const SortIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="4" y1="6" x2="15" y2="6" />
    <line x1="4" y1="12" x2="12" y2="12" />
    <line x1="4" y1="18" x2="9" y2="18" />
    <polyline points="17 8 20 5 23 8" />
    <line x1="20" y1="5" x2="20" y2="19" />
  </svg>
);

const ResetIcon = () => (
  <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
    <path d="M3 3l6 6M9 3 3 9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

interface FilterChipProps {
  /** Desktop "01." numbering (hidden on mobile). */
  index?: string;
  icon?: ReactNode;
  /** Label of the selected option; sizes the chip to the current value. */
  label: string;
  active: boolean;
  pending: boolean;
  /** The native <select>, laid invisibly over the chip. */
  children: ReactNode;
}

/**
 * A pill that shows the current value of a native <select>. The select covers
 * the whole chip at opacity 0, so taps, clicks and the keyboard all reach the
 * real control (iOS opens its own picker) while the chip stays content-sized.
 */
function FilterChip({ index, icon, label, active, pending, children }: FilterChipProps) {
  return (
    <div className={`${styles.chip} ${active ? styles.active : ''}`}>
      {index && (
        <span className={styles.index} aria-hidden="true">
          {index}
        </span>
      )}
      {icon && (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      )}
      <span className={styles.value} aria-hidden="true">
        {label}
      </span>
      <span className={styles.chevron} aria-hidden="true">
        {pending ? <span className={styles.spinner} /> : <Chevron />}
      </span>
      {children}
    </div>
  );
}

const FilterBar = ({ genres }: FilterBarProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [pendingKey, setPendingKey] = useState<FilterKey | 'reset' | null>(null);

  const committed: Filters = {
    genre: searchParams.get('genre') || '',
    year: searchParams.get('year') || '',
    country: searchParams.get('country') || '',
    sortBy: searchParams.get('sortBy') || DEFAULT_SORT,
  };

  // The URL only updates once the navigation commits; show the new choice
  // immediately instead of snapping the chip back to the old value meanwhile.
  const [filters, setOptimisticFilters] = useOptimistic(committed, (state: Filters, patch: Partial<Filters>) => ({
    ...state,
    ...patch,
  }));

  const navigate = (params: URLSearchParams, key: FilterKey | 'reset', patch: Partial<Filters>) => {
    const query = params.toString();
    setPendingKey(key);
    startTransition(() => {
      setOptimisticFilters(patch);
      router.push(query ? `${pathname}?${query}` : pathname);
    });
  };

  const updateFilters = (key: FilterKey, value: string) => {
    haptic('selection');
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    navigate(params, key, { [key]: value || DEFAULTS[key] });
  };

  const resetFilters = () => {
    haptic('light');
    const params = new URLSearchParams(searchParams.toString());
    FILTER_KEYS.forEach((key) => params.delete(key));
    navigate(params, 'reset', DEFAULTS);
  };

  const years = Array.from({ length: 30 }, (_, i) => (new Date().getFullYear() - i).toString());

  // Hand-edited URLs can carry values outside the option lists; the grid still
  // applies them, so say so rather than showing the "All …" default.
  const genreLabel =
    genres.find((genre) => genre.id.toString() === filters.genre)?.name ?? (filters.genre ? 'Genre' : 'All Genres');
  const yearLabel = filters.year || 'All Years';
  const countryLabel =
    COUNTRIES.find((country) => country.code === filters.country)?.name ?? (filters.country || 'All Countries');
  const sortLabel = SORT_OPTIONS.find((opt) => opt.value === filters.sortBy)?.label ?? 'Popular';
  const hasActive = Boolean(filters.genre || filters.year || filters.country || filters.sortBy !== DEFAULT_SORT);
  const isKeyPending = (key: FilterKey) => isPending && pendingKey === key;

  // ---- Edge fades for the mobile chip scroller ------------------------------
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState({ start: false, end: false });

  const updateFade = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const start = el.scrollLeft > 2;
    const end = max - el.scrollLeft > 2;
    setFade((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    updateFade();
    if (typeof ResizeObserver === 'undefined') return;
    // Chip widths change with their labels, and the Reset chip comes and goes.
    const observer = new ResizeObserver(updateFade);
    observer.observe(el);
    Array.from(el.children).forEach((child) => observer.observe(child));
    return () => observer.disconnect();
  }, [updateFade, hasActive]);

  return (
    <div className={styles.filterBar} role="group" aria-label="Filters" aria-busy={isPending || undefined}>
      <div
        ref={scrollerRef}
        className={styles.scroller}
        onScroll={updateFade}
        data-fade-start={fade.start || undefined}
        data-fade-end={fade.end || undefined}
      >
        <FilterChip index="01." label={genreLabel} active={Boolean(filters.genre)} pending={isKeyPending('genre')}>
          <select
            className={styles.select}
            value={filters.genre}
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
        </FilterChip>

        <FilterChip index="02." label={yearLabel} active={Boolean(filters.year)} pending={isKeyPending('year')}>
          <select
            className={styles.select}
            value={filters.year}
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
        </FilterChip>

        <FilterChip index="03." label={countryLabel} active={Boolean(filters.country)} pending={isKeyPending('country')}>
          <select
            className={styles.select}
            value={filters.country}
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
        </FilterChip>

        <FilterChip
          icon={<SortIcon />}
          label={sortLabel}
          active={filters.sortBy !== DEFAULT_SORT}
          pending={isKeyPending('sortBy')}
        >
          <select
            className={styles.select}
            value={filters.sortBy}
            onChange={(e) => updateFilters('sortBy', e.target.value)}
            aria-label="Sort by"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </FilterChip>

        {hasActive && (
          <button type="button" className={styles.reset} onClick={resetFilters} aria-label="Reset filters">
            <ResetIcon />
            <span>Reset</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default FilterBar;
