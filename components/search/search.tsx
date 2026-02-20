'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useModal } from '@/context/modal-context';
import styles from './search.module.css';

interface SearchResult {
  id: number;
  title: string;
  year: string;
  image: string | null;
  rating: string;
  media_type: 'movie' | 'tv';
  overview: string;
}

const Search = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const { openModal } = useModal();
  const router = useRouter();

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard shortcut: Cmd+K or Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSearchSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && query.trim()) {
      setIsOpen(false);
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  };

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?query=${encodeURIComponent(query)}`);
        if (!res.ok) throw new Error('Search failed');
        const data = await res.json();
        setResults(data);
      } catch (err) {
        console.error('Search error:', err);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const handleOpen = () => {
    setIsOpen(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  return (
    <div className={styles.searchWrapper} ref={wrapperRef}>
      {/* Search trigger button */}
      <button className={styles.searchTrigger} onClick={handleOpen} aria-label="Search">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <span className={styles.searchHint}>⌘K</span>
      </button>

      {/* Search modal/dropdown */}
      {isOpen && (
        <>
          <div className={styles.backdrop} onClick={() => setIsOpen(false)} />
          <div className={styles.searchModal}>
            <div className={styles.inputWrapper}>
              <svg className={styles.searchIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                className={styles.searchInput}
                placeholder="Search movies & TV shows..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleSearchSubmit}
              />
              <kbd className={styles.escKey}>ESC</kbd>
            </div>

            <div className={styles.resultsContainer}>
              {loading ? (
                <div className={styles.loadingState}>
                  <div className={styles.spinner}></div>
                  <span>Searching...</span>
                </div>
              ) : results.length > 0 ? (
                <ul className={styles.resultsList}>
                  {results.map((item) => (
                    <li 
                      key={`${item.media_type}-${item.id}`} 
                      className={styles.resultItem}
                      onClick={() => {
                        openModal(item.id, item.media_type);
                        setIsOpen(false);
                      }}
                    >
                      <div className={styles.resultPoster}>
                        {item.image ? (
                          <img src={item.image} alt={item.title} />
                        ) : (
                          <div className={styles.noPoster}>🎬</div>
                        )}
                      </div>
                      <div className={styles.resultInfo}>
                        <span className={styles.resultTitle}>{item.title}</span>
                        <div className={styles.resultMeta}>
                          <span className={styles.resultType}>{item.media_type === 'tv' ? 'TV' : 'Movie'}</span>
                          {item.year && <span className={styles.resultYear}>{item.year}</span>}
                          <span className={styles.resultRating}>★ {item.rating}</span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : query.trim() ? (
                <div className={styles.emptyState}>No results for &ldquo;{query}&rdquo;</div>
              ) : (
                <div className={styles.emptyState}>Start typing to search...</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Search;
