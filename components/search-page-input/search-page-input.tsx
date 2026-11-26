'use client';

import { useEffect, useId, useRef, useState, useTransition, type FormEvent, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import styles from './search-page-input.module.css';

interface SearchPageInputProps {
  /** The current `?q=` value; prefills the field and keeps it in sync. */
  initialQuery?: string;
}

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

const ClearIcon = () => (
  <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
    <path d="M3 3l6 6M9 3 3 9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

/**
 * The search field at the top of /search. Submits to `/search?q=` (the same
 * URL the navbar search uses) with a client-side navigation, and degrades to a
 * plain GET form before hydration.
 */
export default function SearchPageInput({ initialQuery = '' }: SearchPageInputProps) {
  const router = useRouter();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initialQuery);
  const [syncedQuery, setSyncedQuery] = useState(initialQuery);
  const [isPending, startTransition] = useTransition();

  // The query can change from elsewhere (navbar search, back/forward).
  if (initialQuery !== syncedQuery) {
    setSyncedQuery(initialQuery);
    setValue(initialQuery);
  }

  // Desktop only: an empty search page is waiting for typing. On touch screens
  // focusing would throw up the keyboard before the user asked for it.
  useEffect(() => {
    if (initialQuery) return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    inputRef.current?.focus({ preventScroll: true });
    // Mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trimmed = value.trim();
  const isDirty = trimmed !== '' && trimmed !== initialQuery;

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!trimmed) {
      inputRef.current?.focus();
      return;
    }
    // Drop the keyboard so the results are visible.
    inputRef.current?.blur();
    if (trimmed === initialQuery) return;
    startTransition(() => {
      // This field only lives on /search, so a new query replaces the entry: Back then
      // leaves search instead of stepping through every earlier result set.
      router.replace(`/search?q=${encodeURIComponent(trimmed)}`);
    });
  };

  const handleClear = () => {
    setValue('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Escape on an empty field leaves it (the browser clears a non-empty one).
    if (e.key === 'Escape' && !value) inputRef.current?.blur();
  };

  return (
    <form
      role="search"
      action="/search"
      method="get"
      className={styles.form}
      onSubmit={handleSubmit}
      data-pending={isPending || undefined}
    >
      <label htmlFor={inputId} className="sr-only">
        Search movies and TV shows
      </label>
      <span className={styles.leading} aria-hidden="true">
        {isPending ? <span className={styles.spinner} /> : <SearchIcon />}
      </span>
      <input
        ref={inputRef}
        id={inputId}
        name="q"
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search movies & TV shows"
        enterKeyHint="search"
        inputMode="search"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        className={styles.input}
      />
      {isDirty && (
        <kbd className={styles.hint} aria-hidden="true">
          ↵
        </kbd>
      )}
      {value && (
        <button type="button" className={styles.clear} onClick={handleClear} aria-label="Clear search">
          <span className={styles.clearDot}>
            <ClearIcon />
          </span>
        </button>
      )}
    </form>
  );
}
