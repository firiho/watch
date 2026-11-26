'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useModalActions } from '@/context/modal-context';
import { haptic } from '@/lib/haptics';
import type { FilmographyGroup, FilmographyRow } from './credits';
import styles from './star.module.css';

interface FilmographyProps {
  groups: FilmographyGroup[];
  /** Section number in the page's "01." heading sequence. */
  index: string;
}

const PREVIEW_ROWS = 12;
const TMDB_IMAGE = 'https://image.tmdb.org/t/p';

function episodesLabel(count: number): string {
  return `${count} ${count === 1 ? 'episode' : 'episodes'}`;
}

interface RowProps {
  row: FilmographyRow;
  showYear: boolean;
  /** Position among rows revealed by "Show all" (drives the stagger), or -1. */
  revealIndex: number;
  onOpen: (row: FilmographyRow) => void;
}

function Row({ row, showYear, revealIndex, onOpen }: RowProps) {
  const isTv = row.mediaType === 'tv';
  const details = [row.role, isTv && row.episodes > 0 ? episodesLabel(row.episodes) : ''].filter(Boolean).join(' · ');
  const revealing = revealIndex >= 0;

  return (
    <li
      className={`${styles.filmItem} ${showYear ? styles.filmItemYearStart : ''} ${revealing ? styles.filmItemReveal : ''}`}
      style={revealing ? { animationDelay: `${Math.min(revealIndex, 14) * 22}ms` } : undefined}
    >
      <span className={styles.filmYear} aria-hidden="true">
        {showYear ? row.year || 'TBA' : ''}
      </span>
      <button type="button" className={styles.filmRow} onClick={() => onOpen(row)}>
        <span className={styles.filmThumb}>
          {row.poster ? (
            // TMDB's own small renditions (92/185w) are exactly thumbnail-sized.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`${TMDB_IMAGE}/w92${row.poster}`}
              srcSet={`${TMDB_IMAGE}/w92${row.poster} 1x, ${TMDB_IMAGE}/w185${row.poster} 2x`}
              alt=""
              loading="lazy"
              decoding="async"
              width={40}
              height={60}
            />
          ) : (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M7 3v18M17 3v18M3 7.5h4M3 12h18M3 16.5h4M17 7.5h4M17 16.5h4" />
            </svg>
          )}
        </span>
        <span className={styles.filmText}>
          <span className={styles.filmTitle}>{row.title}</span>
          {(details || isTv) && (
            <span className={styles.filmMeta}>
              {isTv && <span className={styles.filmTag}>TV</span>}
              {details && <span className={styles.filmRole}>{details}</span>}
            </span>
          )}
        </span>
        <svg className={styles.filmChevron} viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m9 18 6-6-6-6" />
        </svg>
        <span className="sr-only">{row.year ? `, ${row.year}` : ', upcoming'}</span>
      </button>
    </li>
  );
}

export default function Filmography({ groups, index }: FilmographyProps) {
  const [activeId, setActiveId] = useState(groups[0]?.id);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // Rows that were already on screen when "Show all" was tapped don't re-animate.
  const [revealFrom, setRevealFrom] = useState<Record<string, number>>({});
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listRef = useRef<HTMLUListElement>(null);
  // "Show all" unmounts itself; hand focus to the first newly revealed row instead of <body>.
  const focusRowAfterReveal = useRef<number | null>(null);
  // Actions only, so opening and closing the modal doesn't re-render the whole list.
  const { openModal } = useModalActions();

  useEffect(() => {
    const index = focusRowAfterReveal.current;
    if (index == null) return;
    focusRowAfterReveal.current = null;
    listRef.current?.querySelectorAll<HTMLButtonElement>(':scope > li > button')[index]?.focus({ preventScroll: true });
  }, [expanded]);

  const active = groups.find((group) => group.id === activeId) ?? groups[0];
  if (!active) return null;

  const isExpanded = !!expanded[active.id];
  const rows = isExpanded ? active.rows : active.rows.slice(0, PREVIEW_ROWS);
  const hiddenCount = active.rows.length - rows.length;
  const total = groups.reduce((sum, group) => sum + group.rows.length, 0);

  const selectGroup = (id: string) => {
    if (id === active.id) return;
    haptic('selection');
    setActiveId(id);
  };

  // Roving focus for the tablist (←/→/Home/End), per the WAI-ARIA tabs pattern.
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, position: number) => {
    const last = groups.length - 1;
    const target =
      event.key === 'ArrowRight' ? (position === last ? 0 : position + 1)
      : event.key === 'ArrowLeft' ? (position === 0 ? last : position - 1)
      : event.key === 'Home' ? 0
      : event.key === 'End' ? last
      : -1;
    if (target < 0) return;
    event.preventDefault();
    setActiveId(groups[target].id);
    tabRefs.current[target]?.focus();
  };

  const panelId = 'filmography-panel';

  return (
    <section className={styles.section} aria-labelledby="filmography-title">
      <div className={`${styles.sectionHeader} ${styles.sectionHeaderList}`}>
        <h2 id="filmography-title" className={styles.sectionTitle}>
          <span className={styles.sectionIndex}>{index}</span> Filmography
        </h2>
        <span className={styles.sectionLine} aria-hidden="true" />
        <span className={styles.sectionCount}>{total} credits</span>
      </div>

      {groups.length > 1 && (
        <div className={styles.segments} role="tablist" aria-label="Credit type">
          {groups.map((group, position) => {
            const selected = group.id === active.id;
            return (
              <button
                key={group.id}
                ref={(node) => {
                  tabRefs.current[position] = node;
                }}
                type="button"
                role="tab"
                id={`filmography-tab-${group.id}`}
                aria-selected={selected}
                aria-controls={panelId}
                tabIndex={selected ? 0 : -1}
                className={`${styles.segment} ${selected ? styles.segmentActive : ''}`}
                onClick={() => selectGroup(group.id)}
                onKeyDown={(event) => onTabKeyDown(event, position)}
              >
                {group.label}
                <span className={styles.segmentCount}>{group.rows.length}</span>
              </button>
            );
          })}
        </div>
      )}

      <div
        id={panelId}
        role={groups.length > 1 ? 'tabpanel' : undefined}
        aria-labelledby={groups.length > 1 ? `filmography-tab-${active.id}` : undefined}
        className={styles.filmPanel}
        key={active.id}
      >
        <ul ref={listRef} className={styles.filmList}>
          {rows.map((row, position) => (
            <Row
              key={`${row.mediaType}-${row.id}`}
              row={row}
              showYear={position === 0 || rows[position - 1].year !== row.year}
              revealIndex={revealFrom[active.id] != null && position >= revealFrom[active.id] ? position - revealFrom[active.id] : -1}
              onOpen={(item) => openModal(item.id, item.mediaType)}
            />
          ))}
        </ul>

        {hiddenCount > 0 && (
          <button
            type="button"
            className={styles.showAllButton}
            onClick={() => {
              focusRowAfterReveal.current = rows.length;
              setRevealFrom((prev) => ({ ...prev, [active.id]: rows.length }));
              setExpanded((prev) => ({ ...prev, [active.id]: true }));
            }}
          >
            Show all {active.rows.length}
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        )}
      </div>
    </section>
  );
}
