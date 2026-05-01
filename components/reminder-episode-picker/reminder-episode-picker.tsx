'use client';

import { useEffect, useMemo, useState } from 'react';
import { ContentItem, Episode } from '@/lib/tmdb';
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

const formatAirDate = (date?: string) => {
  if (!date) return 'TBA';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return 'TBA';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed);
};

const formatRelativeAir = (date?: string): string | null => {
  if (!date) return null;
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(parsed);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays > 1 && diffDays < 7) return `In ${diffDays} days`;
  if (diffDays >= 7 && diffDays < 30) return `In ${Math.round(diffDays / 7)} wk${diffDays >= 14 ? 's' : ''}`;
  if (diffDays >= 30) return `In ${Math.round(diffDays / 30)} mo`;
  return null;
};

const isFutureAirDate = (airDate?: string) => {
  if (!airDate) return true;
  const parsed = new Date(airDate);
  if (Number.isNaN(parsed.getTime())) return true;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return parsed >= today;
};

export default function ReminderEpisodePicker({
  open,
  show,
  saving = false,
  onClose,
  onConfirm,
}: ReminderEpisodePickerProps) {
  const [mode, setMode] = useState<'next' | 'specific'>('next');
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loadingEps, setLoadingEps] = useState(false);
  const [selectedEpisode, setSelectedEpisode] = useState<{ season: number; episode: number; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upcomingSeasons = useMemo(() => {
    if (!show?.seasons) return [];
    const lastSeason = show.lastEpisode?.season ?? 0;
    return show.seasons
      .filter((s) => s.season_number > 0 && s.season_number >= lastSeason)
      .sort((a, b) => a.season_number - b.season_number);
  }, [show]);

  const hasSpecific = upcomingSeasons.length > 0;

  useEffect(() => {
    if (!open) return;
    setMode('next');
    setSelectedEpisode(null);
    setError(null);
    setEpisodes([]);
    const initial = upcomingSeasons[0]?.season_number ?? show?.lastEpisode?.season ?? null;
    setSelectedSeason(initial);
  }, [open, show, upcomingSeasons]);

  useEffect(() => {
    if (!open || mode !== 'specific' || !show || selectedSeason == null) return;
    let cancelled = false;
    (async () => {
      setLoadingEps(true);
      setError(null);
      try {
        const res = await fetch(`/api/details?id=${show.id}&type=season&season=${selectedSeason}`);
        if (!res.ok) throw new Error('Failed to fetch episodes');
        const json = (await res.json()) as Episode[];
        if (cancelled) return;
        setEpisodes(json);
      } catch (e) {
        if (!cancelled) setError('Could not load episodes for this season.');
      } finally {
        if (!cancelled) setLoadingEps(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, mode, show, selectedSeason]);

  if (!open || !show) return null;

  const futureEpisodes = episodes.filter((ep) => isFutureAirDate(ep.air_date));

  const handleConfirm = async () => {
    if (mode === 'next') {
      await onConfirm({ mode: 'next' });
      return;
    }
    if (!selectedEpisode) {
      setError('Pick an upcoming episode first.');
      return;
    }
    await onConfirm({ mode: 'specific', ...selectedEpisode });
  };

  const canConfirm = mode === 'next' ? !!show.lastEpisode : !!selectedEpisode;

  const ctaLabel = (() => {
    if (saving) return 'Setting reminder…';
    if (mode === 'next') return 'Remind me on next episode';
    if (selectedEpisode) {
      return `Remind me on S${selectedEpisode.season}·E${selectedEpisode.episode}`;
    }
    return 'Pick an episode first';
  })();

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.glow} aria-hidden />
        <div className={styles.closeWrap}>
          <button className={styles.close} onClick={onClose} aria-label="Close reminder picker">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 6L18 18M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className={styles.hero}>
          {show.image && (
            <div className={styles.posterWrap}>
              <img src={show.image} alt="" className={styles.poster} />
            </div>
          )}
          <div className={styles.heroText}>
            <span className={styles.kicker}>Set Reminder</span>
            <h3 className={styles.title}>{show.title}</h3>
            <p className={styles.subtitle}>Tell us when you want a ping.</p>
          </div>
        </div>

        <div className={styles.tabs} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'next'}
            className={`${styles.tab} ${mode === 'next' ? styles.tabActive : ''}`}
            onClick={() => setMode('next')}
          >
            <svg className={styles.tabIcon} viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
            </svg>
            Next episode
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'specific'}
            className={`${styles.tab} ${mode === 'specific' ? styles.tabActive : ''}`}
            onClick={() => hasSpecific && setMode('specific')}
            disabled={!hasSpecific}
            title={!hasSpecific ? 'No upcoming seasons listed for this show.' : undefined}
          >
            <svg className={styles.tabIcon} viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" />
            </svg>
            Pick episode
          </button>
          <span
            className={`${styles.tabIndicator} ${mode === 'specific' ? styles.tabIndicatorRight : ''}`}
            aria-hidden
          />
        </div>

        <div className={styles.body}>
          {mode === 'next' ? (
            <div className={styles.nextPanel}>
              <div className={styles.nextHeadline}>
                <span className={styles.nextDot} />
                <span>You&apos;ll get a ping the moment a new episode drops.</span>
              </div>
              {show.lastEpisode ? (
                <div className={styles.lastEpisodeCard}>
                  <span className={styles.lastEpisodeLabel}>Latest aired</span>
                  <span className={styles.lastEpisodeBadge}>
                    S{show.lastEpisode.season}·E{show.lastEpisode.episode}
                  </span>
                  <span className={styles.lastEpisodeName}>{show.lastEpisode.name}</span>
                </div>
              ) : (
                <div className={styles.lastEpisodeCard}>
                  <span className={styles.lastEpisodeLabel}>No aired episodes yet</span>
                  <span className={styles.lastEpisodeName}>
                    We&apos;ll ping you when the very first episode airs.
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className={styles.specificPanel}>
              {upcomingSeasons.length > 1 ? (
                <div className={styles.seasonChips} role="tablist">
                  {upcomingSeasons.map((s) => {
                    const active = selectedSeason === s.season_number;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        className={`${styles.seasonChip} ${active ? styles.seasonChipActive : ''}`}
                        onClick={() => {
                          setSelectedSeason(s.season_number);
                          setSelectedEpisode(null);
                        }}
                      >
                        {s.name}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className={styles.singleSeasonLabel}>
                  {upcomingSeasons[0]?.name ?? ''}
                </div>
              )}

              <div className={styles.episodeList}>
                {loadingEps ? (
                  <div className={styles.loadingRow}>
                    <span className={styles.spinner} />
                    Loading upcoming episodes…
                  </div>
                ) : futureEpisodes.length === 0 ? (
                  <div className={styles.emptyRow}>
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" />
                      <path d="M16 2v4M8 2v4M3 10h18" />
                    </svg>
                    <span>No upcoming episodes scheduled in this season yet.</span>
                  </div>
                ) : (
                  futureEpisodes.map((ep) => {
                    const active =
                      selectedEpisode?.season === selectedSeason &&
                      selectedEpisode?.episode === ep.episode_number;
                    const relative = formatRelativeAir(ep.air_date);
                    return (
                      <button
                        key={ep.id}
                        type="button"
                        className={`${styles.episodeRow} ${active ? styles.episodeActive : ''}`}
                        onClick={() =>
                          setSelectedEpisode({
                            season: selectedSeason!,
                            episode: ep.episode_number,
                            name: ep.name,
                          })
                        }
                      >
                        <span className={styles.episodeBadge}>
                          <span className={styles.episodeBadgeS}>S{selectedSeason}</span>
                          <span className={styles.episodeBadgeDot}>·</span>
                          <span className={styles.episodeBadgeE}>E{ep.episode_number}</span>
                        </span>
                        <span className={styles.episodeMeta}>
                          <span className={styles.episodeName}>{ep.name || 'Untitled episode'}</span>
                          <span className={styles.episodeDateRow}>
                            <span className={styles.episodeDate}>{formatAirDate(ep.air_date)}</span>
                            {relative && (
                              <>
                                <span className={styles.episodeDateDot}>•</span>
                                <span className={styles.episodeRelative}>{relative}</span>
                              </>
                            )}
                          </span>
                        </span>
                        <span className={`${styles.episodeCheck} ${active ? styles.episodeCheckActive : ''}`}>
                          {active ? (
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M5 12.5L10 17L19 8" />
                            </svg>
                          ) : null}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.footer}>
          <button
            type="button"
            className={`${styles.cta} ${!canConfirm ? styles.ctaDisabled : ''}`}
            onClick={handleConfirm}
            disabled={saving || !canConfirm}
          >
            {!saving && (
              <svg className={styles.ctaIcon} viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22C13.1 22 14 21.1 14 20H10C10 21.1 10.9 22 12 22ZM18 16V11C18 7.93 16.37 5.36 13.5 4.68V4C13.5 3.17 12.83 2.5 12 2.5C11.17 2.5 10.5 3.17 10.5 4V4.68C7.64 5.36 6 7.92 6 11V16L4 18V19H20V18L18 16Z" fill="currentColor" stroke="none" />
              </svg>
            )}
            {ctaLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
