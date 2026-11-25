'use client';

import { useEffect, useId, useMemo, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { ContentItem, Episode } from '@/lib/tmdb';
import { formatDisplayDate, parseCalendarDate } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import SheetDialog from './sheet-dialog';
import styles from './reminder-episode-picker.module.css';

export type ReminderTarget =
  | { mode: 'next' }
  | { mode: 'specific'; season: number; episode: number; name: string };

interface ReminderEpisodePickerProps {
  open: boolean;
  show: ContentItem | null;
  saving?: boolean;
  onClose: () => void;
  onConfirm: (target: ReminderTarget) => Promise<void> | void;
}

type Mode = 'next' | 'specific';

const DAY_MS = 24 * 60 * 60 * 1000;
const SKELETON_ROWS = [0, 1, 2, 3];

const cx = (...names: Array<string | false | null | undefined>) => names.filter(Boolean).join(' ');

const startOfToday = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
};

// TMDB air dates are calendar dates: parse them as local days (`new Date("2026-11-17")`
// is UTC midnight, i.e. the previous evening in the Americas).
const formatRelativeAir = (date?: string): string | null => {
  const target = parseCalendarDate(date);
  if (!target) return null;
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - startOfToday().getTime()) / DAY_MS);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays > 1 && diffDays < 7) return `In ${diffDays} days`;
  if (diffDays >= 7 && diffDays < 30) {
    const weeks = Math.round(diffDays / 7);
    return `In ${weeks} wk${weeks > 1 ? 's' : ''}`;
  }
  if (diffDays >= 30) return `In ${Math.round(diffDays / 30)} mo`;
  return null;
};

const isFutureAirDate = (airDate?: string) => {
  if (!airDate) return true;
  const parsed = parseCalendarDate(airDate);
  if (!parsed) return true;
  return parsed >= startOfToday();
};

/** Seasons that can still have unaired episodes (the latest aired one onward). */
const getUpcomingSeasons = (show: ContentItem | null) => {
  if (!show?.seasons) return [];
  const lastSeason = show.lastEpisode?.season ?? 0;
  return show.seasons
    .filter((s) => s.season_number > 0 && s.season_number >= lastSeason)
    .sort((a, b) => a.season_number - b.season_number);
};

const BellIcon = ({ size = 16, className }: { size?: number; className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
    <path d="M12 22C13.1 22 14 21.1 14 20H10C10 21.1 10.9 22 12 22ZM18 16V11C18 7.93 16.37 5.36 13.5 4.68V4C13.5 3.17 12.83 2.5 12 2.5C11.17 2.5 10.5 3.17 10.5 4V4.68C7.64 5.36 6 7.92 6 11V16L4 18V19H20V18L18 16Z" />
  </svg>
);

export default function ReminderEpisodePicker({
  open,
  show,
  saving = false,
  onClose,
  onConfirm,
}: ReminderEpisodePickerProps) {
  // The provider clears `show` the moment it closes the picker; keep the last one
  // so the sheet can animate out with its content intact.
  const [lastShow, setLastShow] = useState<ContentItem | null>(show);
  if (show && show !== lastShow) setLastShow(show);
  const current = show ?? lastShow;
  const isOpen = open && !!show;

  const [mode, setMode] = useState<Mode>('next');
  const [direction, setDirection] = useState<'left' | 'right' | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loadingEps, setLoadingEps] = useState(false);
  const [selectedEpisode, setSelectedEpisode] = useState<{ season: number; episode: number; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openedFor, setOpenedFor] = useState<ContentItem | null>(null);

  const titleId = useId();
  const descId = useId();
  const nextTabId = useId();
  const specificTabId = useId();
  const tabPanelId = useId();

  // Start fresh whenever the picker opens (or switches show). Done during render
  // rather than in an effect so a previous session's tab/episode never paints.
  if (isOpen && show !== openedFor) {
    setOpenedFor(show);
    setMode('next');
    setDirection(null);
    setSelectedEpisode(null);
    setError(null);
    setEpisodes([]);
    setLoadingEps(false);
    setSelectedSeason(getUpcomingSeasons(show)[0]?.season_number ?? show?.lastEpisode?.season ?? null);
  } else if (!isOpen && openedFor !== null) {
    setOpenedFor(null);
  }

  const upcomingSeasons = useMemo(() => getUpcomingSeasons(current), [current]);
  const hasSpecific = upcomingSeasons.length > 0;

  useEffect(() => {
    if (!isOpen || mode !== 'specific' || !current || selectedSeason == null) return;
    let cancelled = false;
    (async () => {
      setLoadingEps(true);
      setError(null);
      try {
        const res = await fetch(`/api/details?id=${current.id}&type=season&season=${selectedSeason}`);
        if (!res.ok) throw new Error('Failed to fetch episodes');
        const json = (await res.json()) as Episode[];
        if (cancelled) return;
        setEpisodes(json);
      } catch {
        if (!cancelled) setError('Could not load episodes for this season.');
      } finally {
        if (!cancelled) setLoadingEps(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, mode, current, selectedSeason]);

  if (!current) return null;

  const futureEpisodes = episodes.filter((ep) => isFutureAirDate(ep.air_date));
  const canConfirm = mode === 'next' ? !!current.lastEpisode : !!selectedEpisode;

  const selectMode = (next: Mode) => {
    if (next === mode || (next === 'specific' && !hasSpecific)) return;
    haptic('selection');
    setDirection(next === 'specific' ? 'right' : 'left');
    setMode(next);
  };

  const handleTabsKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const next: Mode = e.key === 'ArrowLeft' || e.key === 'Home' ? 'next' : 'specific';
    if (next === 'specific' && !hasSpecific) return;
    selectMode(next);
    document.getElementById(next === 'next' ? nextTabId : specificTabId)?.focus();
  };

  const selectSeason = (seasonNumber: number) => {
    if (seasonNumber === selectedSeason) return;
    haptic('selection');
    setSelectedSeason(seasonNumber);
    setSelectedEpisode(null);
  };

  const selectEpisode = (ep: Episode) => {
    if (selectedSeason == null) return;
    haptic('selection');
    setSelectedEpisode({ season: selectedSeason, episode: ep.episode_number, name: ep.name });
  };

  const handleConfirm = async () => {
    if (mode === 'next') {
      haptic('light');
      await onConfirm({ mode: 'next' });
      return;
    }
    if (!selectedEpisode) {
      setError('Pick an upcoming episode first.');
      return;
    }
    haptic('light');
    await onConfirm({ mode: 'specific', ...selectedEpisode });
  };

  const ctaLabel = (() => {
    if (saving) return <span>Setting reminder…</span>;
    if (mode === 'next') return <span>Remind me on next episode</span>;
    if (selectedEpisode) {
      return (
        <span>
          Remind me on{' '}
          <span className={styles.ctaEp}>
            S{selectedEpisode.season}·E{selectedEpisode.episode}
          </span>
        </span>
      );
    }
    return <span>Pick an episode first</span>;
  })();

  return (
    <SheetDialog
      open={isOpen}
      onClose={onClose}
      dismissible={!saving}
      labelledBy={titleId}
      describedBy={descId}
      closeLabel="Close reminder picker"
      zIndex={2200}
      panelClassName={styles.panel}
    >
      <div className={styles.glow} aria-hidden="true" />

      <header className={styles.hero}>
        {current.image && (
          <div className={styles.posterWrap}>
            <img src={current.image} alt="" className={styles.poster} decoding="async" draggable={false} />
          </div>
        )}
        <div className={styles.heroText}>
          <span className={styles.kicker}>set a reminder</span>
          <h2 id={titleId} className={styles.title}>
            {current.title}
          </h2>
          <p id={descId} className={styles.subtitle}>
            Tell us when you want a ping.
          </p>
        </div>
      </header>

      <div className={styles.tabs} role="tablist" aria-label="Reminder type" onKeyDown={handleTabsKeyDown}>
        <span className={cx(styles.tabIndicator, mode === 'specific' && styles.tabIndicatorRight)} aria-hidden="true" />
        <button
          id={nextTabId}
          type="button"
          role="tab"
          aria-selected={mode === 'next'}
          aria-controls={tabPanelId}
          tabIndex={mode === 'next' ? 0 : -1}
          className={cx(styles.tab, mode === 'next' && styles.tabActive)}
          onClick={() => selectMode('next')}
        >
          <svg className={styles.tabIcon} viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
          </svg>
          Next episode
        </button>
        <button
          id={specificTabId}
          type="button"
          role="tab"
          aria-selected={mode === 'specific'}
          aria-controls={tabPanelId}
          tabIndex={mode === 'specific' ? 0 : -1}
          className={cx(styles.tab, mode === 'specific' && styles.tabActive)}
          onClick={() => selectMode('specific')}
          disabled={!hasSpecific}
          title={!hasSpecific ? 'No upcoming seasons listed for this show.' : undefined}
        >
          <svg className={styles.tabIcon} viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
          Pick episode
        </button>
      </div>

      <div
        id={tabPanelId}
        className={styles.body}
        role="tabpanel"
        aria-labelledby={mode === 'next' ? nextTabId : specificTabId}
      >
        {mode === 'next' ? (
          <div key="next" className={cx(styles.nextPanel, direction === 'left' && styles.fromLeft)}>
            <div className={styles.bell} aria-hidden="true">
              <BellIcon size={26} className={styles.bellIcon} />
            </div>
            <div className={styles.nextCopy}>
              <p className={styles.nextTitle}>You&apos;ll get a ping the moment a new episode drops.</p>
              <p className={styles.nextSub}>No need to pick one — every new episode counts.</p>
            </div>
            {current.lastEpisode ? (
              <div className={styles.lastEpisodeCard}>
                <span className={styles.lastEpisodeLabel}>Latest aired</span>
                <span className={styles.lastEpisodeRow}>
                  <span className={styles.lastEpisodeBadge}>
                    S{current.lastEpisode.season}·E{current.lastEpisode.episode}
                  </span>
                  <span className={styles.lastEpisodeName}>{current.lastEpisode.name}</span>
                </span>
              </div>
            ) : (
              <div className={styles.lastEpisodeCard}>
                <span className={styles.lastEpisodeLabel}>No aired episodes yet</span>
                <span className={styles.lastEpisodeName}>We&apos;ll ping you when the very first episode airs.</span>
              </div>
            )}
          </div>
        ) : (
          <div key="specific" className={cx(styles.specificPanel, direction === 'right' && styles.fromRight)}>
            {upcomingSeasons.length > 1 ? (
              <div className={styles.seasonChips} role="group" aria-label="Season">
                {upcomingSeasons.map((s) => {
                  const active = selectedSeason === s.season_number;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      aria-pressed={active}
                      className={cx(styles.seasonChip, active && styles.seasonChipActive)}
                      onClick={() => selectSeason(s.season_number)}
                    >
                      {s.name}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className={styles.singleSeasonLabel}>{upcomingSeasons[0]?.name ?? ''}</div>
            )}

            <div className={styles.episodeList} aria-busy={loadingEps}>
              {loadingEps ? (
                <div className={styles.skeletonList} aria-label="Loading upcoming episodes" role="status">
                  {SKELETON_ROWS.map((i) => (
                    <div key={i} className={styles.skeletonRow} style={{ '--i': i } as CSSProperties}>
                      <span className={styles.skeletonBadge} />
                      <span className={styles.skeletonLines}>
                        <span className={styles.skeletonLine} />
                        <span className={cx(styles.skeletonLine, styles.skeletonLineShort)} />
                      </span>
                    </div>
                  ))}
                </div>
              ) : futureEpisodes.length === 0 ? (
                error ? null : (
                  <div className={styles.emptyRow}>
                    <span className={styles.emptyIcon} aria-hidden="true">
                      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" />
                        <path d="M16 2v4M8 2v4M3 10h18" />
                      </svg>
                    </span>
                    <span>No upcoming episodes scheduled in this season yet.</span>
                  </div>
                )
              ) : (
                futureEpisodes.map((ep, index) => {
                  const active =
                    selectedEpisode?.season === selectedSeason && selectedEpisode?.episode === ep.episode_number;
                  const relative = formatRelativeAir(ep.air_date);
                  return (
                    <button
                      key={ep.id}
                      type="button"
                      aria-pressed={active}
                      className={cx(styles.episodeRow, active && styles.episodeActive)}
                      style={{ '--i': Math.min(index, 8) } as CSSProperties}
                      onClick={() => selectEpisode(ep)}
                    >
                      <span className={styles.episodeBadge}>
                        S{selectedSeason}
                        <span className={styles.episodeBadgeDot}>·</span>E{ep.episode_number}
                      </span>
                      <span className={styles.episodeMeta}>
                        <span className={styles.episodeName}>{ep.name || 'Untitled episode'}</span>
                        <span className={styles.episodeDateRow}>
                          <span className={styles.episodeDate}>{formatDisplayDate(ep.air_date, 'TBA')}</span>
                          {relative && (
                            <>
                              <span className={styles.episodeDateDot} aria-hidden="true">
                                •
                              </span>
                              <span className={styles.episodeRelative}>{relative}</span>
                            </>
                          )}
                        </span>
                      </span>
                      <span className={cx(styles.episodeCheck, active && styles.episodeCheckActive)} aria-hidden="true">
                        {active && (
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 12.5L10 17L19 8" />
                          </svg>
                        )}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <footer className={styles.footer}>
        <button
          type="button"
          className={cx(styles.cta, !canConfirm && !saving && styles.ctaDisabled)}
          onClick={handleConfirm}
          disabled={saving || !canConfirm}
          aria-busy={saving}
        >
          {saving ? <span className={styles.ctaSpinner} aria-hidden="true" /> : <BellIcon className={styles.ctaIcon} />}
          {ctaLabel}
        </button>
      </footer>
    </SheetDialog>
  );
}
