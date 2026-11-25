'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  TouchEvent as ReactTouchEvent,
  UIEvent as ReactUIEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import { useModal } from '@/context/modal-context';
import { useRecommendations } from '@/context/recommendations-context';
import StarRating from '@/components/star-rating/star-rating';
import { SEARCH_DEBOUNCE_MS } from '@/lib/constants';
import { ADMIN_NAME } from '@/lib/admin';
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock';
import { trapTabKey, useOverlay } from '@/components/navbar/use-overlay';
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

/*
 * The one and only search instance (it owns the ⌘K shortcut).
 *
 * Desktop: a ⌘K command palette — arrow keys move the highlight, Enter opens it
 * (or the full results page when nothing is highlighted), Esc closes.
 * Mobile (≤768px): the same overlay presents as a full-screen iOS search
 * screen with a Cancel button. The layout switch is pure CSS.
 */

const EXIT_FALLBACK_MS = 420;
const SKELETON_ROWS = [0, 1, 2, 3];

// The API hands out w92 thumbnails; w154 stays crisp on 3x phone screens.
const posterSrc = (src: string) => src.replace('/t/p/w92/', '/t/p/w154/');

const SearchGlyph = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false">
    <circle cx="10.75" cy="10.75" r="6.75" />
    <path d="m20.25 20.25-4.5-4.5" />
  </svg>
);

const Chevron = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="m9.5 6 6 6-6 6" />
  </svg>
);

const Search = () => {
  const { state, stateRef, isOpen, isMounted, open, close, finish } = useOverlay(EXIT_FALLBACK_MS);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [resultsFor, setResultsFor] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [shortcut, setShortcut] = useState('⌘K');

  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const clearOnCloseRef = useRef(false);
  const touchStartYRef = useRef<number | null>(null);

  const { openModal } = useModal();
  const { getRecommendation } = useRecommendations();
  const router = useRouter();
  const pathname = usePathname();

  const baseId = useId();
  const listboxId = `${baseId}-results`;
  const optionId = useCallback((index: number) => `${baseId}-option-${index}`, [baseId]);

  const trimmed = query.trim();
  const showSeeAll = trimmed.length > 0 && results.length > 0;
  const optionCount = results.length + (showSeeAll ? 1 : 0);

  useBodyScrollLock(isMounted);

  // ⌘K on Apple platforms, Ctrl K elsewhere (after mount, so SSR matches).
  useEffect(() => {
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
    const platform = nav.userAgentData?.platform || nav.platform || '';
    if (platform && !/mac|iphone|ipad|ipod/i.test(platform)) setShortcut('Ctrl K');
  }, []);

  const openSearch = useCallback(() => {
    if (stateRef.current === 'open') {
      inputRef.current?.focus();
      return;
    }
    clearOnCloseRef.current = false;
    // Commit synchronously and focus inside the same gesture — iOS only raises
    // the keyboard for focus() calls made while handling the tap.
    open(true);
    const input = inputRef.current;
    if (input) {
      input.focus({ preventScroll: true });
      if (input.value) input.select();
    }
  }, [open, stateRef]);

  const dismiss = useCallback(
    ({ restoreFocus = true, clear = true }: { restoreFocus?: boolean; clear?: boolean } = {}) => {
      if (stateRef.current !== 'open') return;
      clearOnCloseRef.current = clear;
      inputRef.current?.blur();
      close();
      if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
    },
    [close, stateRef]
  );

  // Once the exit animation is over, reset the session (Cancel / Esc clear the
  // field like iOS; picking a result keeps it for next time).
  useEffect(() => {
    if (state !== 'closed') return;
    setActiveIndex(-1);
    if (clearOnCloseRef.current) {
      clearOnCloseRef.current = false;
      setQuery('');
    }
  }, [state]);

  // ⌘K / Ctrl+K toggles search from anywhere.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      if (typeof event.key !== 'string' || event.key.toLowerCase() !== 'k') return;
      event.preventDefault();
      if (stateRef.current === 'open') dismiss();
      else openSearch();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [dismiss, openSearch, stateRef]);

  // Escape + focus trap while open. Capture phase on window so Esc closes only
  // the search, never a dialog underneath it as well.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        dismiss();
      } else if (event.key === 'Tab') {
        trapTabKey(event, panelRef.current);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen, dismiss]);

  // A route change underneath (e.g. browser back) closes the overlay.
  useEffect(() => {
    if (stateRef.current === 'open') dismiss({ restoreFocus: false, clear: false });
  }, [pathname, dismiss, stateRef]);

  // Debounced search. Superseded requests are aborted so a slow, older
  // response can never overwrite newer results.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setLoading(false);
      setResults([]);
      setResultsFor('');
      return;
    }

    setLoading(true);
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?query=${encodeURIComponent(q)}`, { signal: controller.signal });
        if (!res.ok) throw new Error('Search failed');
        const data = await res.json();
        if (controller.signal.aborted) return;
        setResults(Array.isArray(data) ? data : []);
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error('Search error:', err);
        setResults([]);
      }
      setResultsFor(q);
      setActiveIndex(-1);
      setLoading(false);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  // Keep the keyboard-highlighted option in view (the first one scrolls fully
  // to the top so the section label comes back with it).
  useEffect(() => {
    if (activeIndex < 0) return;
    const option = document.getElementById(optionId(activeIndex));
    if (activeIndex === 0) option?.closest<HTMLElement>('[data-search-results]')?.scrollTo({ top: 0 });
    else option?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, optionId]);

  // Mobile: size the screen to the *visual* viewport so the list ends above the
  // on-screen keyboard instead of running underneath it.
  useEffect(() => {
    if (!isMounted) return;
    const vv = window.visualViewport;
    const panel = panelRef.current;
    if (!vv || !panel) return;
    const sync = () => {
      panel.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
      panel.style.setProperty('--vvt', `${Math.round(vv.offsetTop)}px`);
    };
    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
    };
  }, [isMounted]);

  const selectResult = (item: SearchResult) => {
    dismiss({ restoreFocus: false, clear: false });
    openModal(item.id, item.media_type);
  };

  const seeAllResults = () => {
    if (!trimmed) return;
    dismiss({ restoreFocus: false, clear: false });
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  };

  const onInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'ArrowDown') {
      if (!optionCount) return;
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % optionCount);
    } else if (event.key === 'ArrowUp') {
      if (!optionCount) return;
      event.preventDefault();
      setActiveIndex((index) => (index <= -1 ? optionCount - 1 : index - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (activeIndex >= 0 && activeIndex < results.length) selectResult(results[activeIndex]);
      else seeAllResults();
    }
  };

  // Dragging the list dismisses the keyboard (UIScrollView.keyboardDismissMode = .onDrag).
  const onListTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    touchStartYRef.current = event.touches[0]?.clientY ?? null;
  };

  const onListTouchMove = (event: ReactTouchEvent<HTMLDivElement>) => {
    const startY = touchStartYRef.current;
    const y = event.touches[0]?.clientY;
    if (startY === null || y === undefined || Math.abs(y - startY) < 8) return;
    touchStartYRef.current = null;
    if (document.activeElement === inputRef.current) inputRef.current?.blur();
  };

  const onListScroll = (event: ReactUIEvent<HTMLDivElement>) => {
    panelRef.current?.toggleAttribute('data-scrolled', event.currentTarget.scrollTop > 2);
  };

  const highlightOnHover = (index: number) => (event: ReactPointerEvent) => {
    if (event.pointerType === 'mouse' && index !== activeIndex) setActiveIndex(index);
  };

  const view: 'idle' | 'results' | 'loading' | 'empty' = !trimmed
    ? 'idle'
    : results.length > 0
      ? 'results'
      : loading || resultsFor !== trimmed
        ? 'loading'
        : 'empty';

  const announcement =
    view === 'results' && !loading
      ? `${results.length} result${results.length === 1 ? '' : 's'}`
      : view === 'empty'
        ? 'No results'
        : '';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        onClick={openSearch}
        aria-label="Search movies and TV shows"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-keyshortcuts="Meta+K Control+K"
      >
        <SearchGlyph className={styles.triggerIcon} />
        <kbd className={styles.triggerKbd} aria-hidden="true">
          {shortcut}
        </kbd>
      </button>

      {isMounted &&
        createPortal(
          <div className={styles.root} data-state={state}>
            <div className={styles.backdrop} aria-hidden="true" onClick={() => dismiss()} />

            <div
              ref={panelRef}
              className={styles.panel}
              role="dialog"
              aria-modal="true"
              aria-label="Search"
              onAnimationEnd={(event) => {
                if (event.target === event.currentTarget && stateRef.current === 'closing') finish();
              }}
            >
              <div className={styles.bar}>
                <div className={styles.field}>
                  {loading ? (
                    <span className={styles.fieldSpinner} aria-hidden="true" />
                  ) : (
                    <SearchGlyph className={styles.fieldIcon} />
                  )}
                  <input
                    ref={inputRef}
                    className={styles.input}
                    type="search"
                    inputMode="search"
                    enterKeyHint="search"
                    placeholder="Movies & TV shows"
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setActiveIndex(-1);
                    }}
                    onKeyDown={onInputKeyDown}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    role="combobox"
                    aria-label="Search movies and TV shows"
                    aria-expanded={optionCount > 0}
                    aria-controls={listboxId}
                    aria-autocomplete="list"
                    aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
                  />
                  {query && (
                    <button
                      type="button"
                      className={styles.clear}
                      aria-label="Clear search"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setQuery('');
                        setActiveIndex(-1);
                        inputRef.current?.focus();
                      }}
                    >
                      <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                        <circle cx="10" cy="10" r="10" fill="currentColor" />
                        <path d="m6.75 6.75 6.5 6.5m0-6.5-6.5 6.5" strokeWidth="1.7" strokeLinecap="round" style={{ stroke: 'var(--clear-x, #111214)' }} />
                      </svg>
                    </button>
                  )}
                  <button type="button" className={styles.escKey} onClick={() => dismiss()} aria-label="Close search">
                    esc
                  </button>
                </div>
                <button type="button" className={styles.cancel} onClick={() => dismiss()}>
                  Cancel
                </button>
              </div>

              <div
                className={styles.results}
                data-search-results=""
                onScroll={onListScroll}
                onTouchStart={onListTouchStart}
                onTouchMove={onListTouchMove}
              >
                {view === 'idle' && (
                  <div className={styles.state}>
                    <span className={styles.stateIcon}>
                      <SearchGlyph />
                    </span>
                    <p className={styles.stateTitle}>Find something to watch</p>
                    <p className={styles.stateText}>Search movies and TV shows by title.</p>
                  </div>
                )}

                {view === 'loading' && (
                  <ul className={styles.list} aria-hidden="true">
                    {SKELETON_ROWS.map((row) => (
                      <li key={row} className={`${styles.row} ${styles.skeletonRow}`}>
                        <span className={`${styles.poster} ${styles.skeleton}`} />
                        <span className={styles.info}>
                          <span className={`${styles.skeletonLine} ${styles.skeleton}`} style={{ width: `${68 - row * 9}%` }} />
                          <span className={`${styles.skeletonLine} ${styles.skeletonLineShort} ${styles.skeleton}`} />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {view === 'empty' && (
                  <div className={styles.state}>
                    <span className={styles.stateIcon}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                        <rect x="3" y="4.75" width="18" height="14.5" rx="2.5" />
                        <path d="m9.5 10 5 4.5m0-4.5-5 4.5" />
                      </svg>
                    </span>
                    <p className={styles.stateTitle}>No results for &ldquo;{resultsFor}&rdquo;</p>
                    <p className={styles.stateText}>Check the spelling or try a different title.</p>
                  </div>
                )}

                {view === 'results' && (
                  <>
                    <p className={styles.sectionLabel} aria-hidden="true">
                      Top results
                    </p>
                    <ul id={listboxId} role="listbox" aria-label="Search results" className={styles.list}>
                      {results.map((item, index) => {
                        const rec = getRecommendation(item.id, item.media_type);
                        const active = index === activeIndex;
                        const hasRating = item.rating && item.rating !== '0.0';
                        return (
                          <li
                            key={`${item.media_type}-${item.id}`}
                            id={optionId(index)}
                            role="option"
                            aria-selected={active}
                            className={styles.row}
                            data-active={active ? '' : undefined}
                            onClick={() => selectResult(item)}
                            onPointerMove={highlightOnHover(index)}
                          >
                            <span className={styles.poster}>
                              {item.image ? (
                                <img
                                  src={posterSrc(item.image)}
                                  alt=""
                                  width={46}
                                  height={69}
                                  loading="lazy"
                                  decoding="async"
                                  draggable={false}
                                />
                              ) : (
                                <svg className={styles.noPoster} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                                  <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
                                  <path d="m10 9.25 4.5 2.75-4.5 2.75z" />
                                </svg>
                              )}
                            </span>
                            <span className={styles.info}>
                              <span className={styles.title}>{item.title}</span>
                              <span className={styles.meta}>
                                <span className={styles.type}>{item.media_type === 'tv' ? 'TV' : 'Movie'}</span>
                                {item.year && <span>{item.year}</span>}
                                {hasRating && (
                                  <span className={styles.rating}>
                                    <span aria-hidden="true">★</span> {item.rating}
                                  </span>
                                )}
                                {rec && (
                                  <span className={styles.rec} title={`${ADMIN_NAME} rates this ${rec.stars}/5`}>
                                    Rec <StarRating value={rec.stars} size="xs" tone="accent" />
                                  </span>
                                )}
                              </span>
                            </span>
                            <span className={styles.enterHint} aria-hidden="true">
                              ↵
                            </span>
                            <Chevron className={styles.chevron} />
                          </li>
                        );
                      })}
                      <li
                        id={optionId(results.length)}
                        role="option"
                        aria-selected={activeIndex === results.length}
                        className={`${styles.row} ${styles.seeAll}`}
                        data-active={activeIndex === results.length ? '' : undefined}
                        onClick={seeAllResults}
                        onPointerMove={highlightOnHover(results.length)}
                      >
                        <span className={styles.seeAllIcon}>
                          <SearchGlyph />
                        </span>
                        <span className={styles.seeAllText}>
                          See all results for &ldquo;{trimmed}&rdquo;
                        </span>
                        <span className={styles.enterHint} aria-hidden="true">
                          ↵
                        </span>
                        <Chevron className={styles.chevron} />
                      </li>
                    </ul>
                  </>
                )}
              </div>

              <div className={styles.footer} aria-hidden="true">
                <span>
                  <kbd>↑</kbd>
                  <kbd>↓</kbd>
                  Navigate
                </span>
                <span>
                  <kbd>↵</kbd>
                  Open
                </span>
                <span>
                  <kbd>esc</kbd>
                  Close
                </span>
              </div>

              <div className="sr-only" aria-live="polite">
                {announcement}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

export default Search;
