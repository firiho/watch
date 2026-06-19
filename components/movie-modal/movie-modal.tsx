'use client';

import { useEffect, useState, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { toast } from 'sonner';
import { useModal } from '@/context/modal-context';
import { useWatchlist } from '@/context/watchlist-context';
import { useAuth } from '@/context/auth-context';
import { useReminders } from '@/context/reminder-context';
import { useToggleReminder } from '@/hooks/use-toggle-reminder';
import { ContentItem, getTVSeasonDetails, Episode } from '@/lib/tmdb';
import { selectBestYoutubeTrailer, TMDBVideo } from '@/lib/tmdb-video-util';
import { getCheckpoint, setCheckpoint, Checkpoint } from '@/lib/checkpoints';
import styles from './movie-modal.module.css';

const MovieModal = () => {
  const { activeItem, closeModal, openModal } = useModal();
  const { isInList, addItem, removeItem } = useWatchlist();
  const { hasReminder } = useReminders();
  const { toggleReminder, pending: addingRem } = useToggleReminder();
  const { user } = useAuth();
  const [data, setData] = useState<ContentItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [activeSeason, setActiveSeason] = useState(1);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [checkpoint, setCheckpointData] = useState<Checkpoint | null>(null);
  const [settingCheckpoint, setSettingCheckpoint] = useState<string | null>(null);

  // Trailer state
  const [trailer, setTrailer] = useState<TMDBVideo | null>(null);
  const [trailerLoading, setTrailerLoading] = useState(false);
  const [trailerReady, setTrailerReady] = useState(false);
  const [trailerMuted, setTrailerMuted] = useState(true);
  const [trailerPlay, setTrailerPlay] = useState(false);
  const [trailerError, setTrailerError] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const playerRef = useRef<HTMLIFrameElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (activeItem) {
      fetchDetails();
      // A movie's trailer doesn't depend on its details, so fetch it in parallel.
      // (TV trailers need the resolved season, so they're fetched after details.)
      if (activeItem.type === 'movie') {
        fetchTrailer();
      }
      if (activeItem.type === 'tv' && user) {
        fetchUserCheckpoint();
      }
    } else {
      setData(null);
      setEpisodes([]);
      setTrailer(null);
      setTrailerPlay(false);
      setTrailerReady(false);
      setTrailerError(false);
      setCheckpointData(null);
    }
  }, [activeItem, user]);

  // Focus management: close on Escape and trap Tab focus inside the dialog.
  useEffect(() => {
    if (!activeItem) return;

    const modalEl = modalRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    modalEl?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeModal();
        return;
      }
      if (event.key !== 'Tab' || !modalEl) return;

      const focusable = modalEl.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey && (active === first || active === modalEl)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [activeItem, closeModal]);

  // Mobile bottom sheet: drag down (when scrolled to the top) to dismiss.
  useEffect(() => {
    const el = modalRef.current;
    if (!activeItem || !el) return;

    const isMobile = () => window.matchMedia('(max-width: 768px)').matches;
    let startY = 0;
    let startScroll = 0;
    let dragging = false;
    let dy = 0;

    const onStart = (e: TouchEvent) => {
      if (!isMobile() || e.touches.length !== 1) return;
      startY = e.touches[0].clientY;
      startScroll = el.scrollTop;
      dragging = false;
      dy = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (!isMobile() || e.touches.length !== 1) return;
      const delta = e.touches[0].clientY - startY;
      if (!dragging) {
        // Only start a drag-to-close when at the very top and pulling downward.
        if (startScroll <= 0 && delta > 6) {
          dragging = true;
          el.style.transition = 'none';
        } else {
          return;
        }
      }
      dy = Math.max(0, delta);
      if (e.cancelable) e.preventDefault();
      el.style.transform = `translateY(${dy}px)`;
    };
    const onEnd = () => {
      if (!dragging) return;
      dragging = false;
      if (dy > 110) {
        el.style.transition = 'transform 0.2s ease';
        el.style.transform = 'translateY(100%)';
        window.setTimeout(() => closeModal(), 170);
      } else {
        el.style.transition = 'transform 0.25s ease';
        el.style.transform = '';
      }
      dy = 0;
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [activeItem, closeModal]);

  const fetchUserCheckpoint = async () => {
    if (!user || !activeItem) return;
    try {
      const cp = await getCheckpoint(user.uid, activeItem.id);
      setCheckpointData(cp);
    } catch(e) {
      console.error('Error fetching checkpoint', e);
    }
  };

  const handleSetCheckpoint = async (seasonNum: number, episodeNum: number) => {
    if (!user || !activeItem) return;
    setSettingCheckpoint(`${seasonNum}-${episodeNum}`);
    try {
      await setCheckpoint(user.uid, activeItem.id, seasonNum, episodeNum);
      setCheckpointData({ seasonNumber: seasonNum, episodeNumber: episodeNum, timestamp: new Date().toISOString() });
      toast.success(`Progress saved — S${seasonNum} · E${episodeNum}`);
    } catch (error) {
      console.error('Error setting checkpoint', error);
      toast.error('Could not save your progress. Please try again.');
    } finally {
      setSettingCheckpoint(null);
    }
  };
  // Fetch trailer/teaser videos for movie or TV season
  const fetchTrailer = async (seasonOverride?: number) => {
    if (!activeItem) return;
    setTrailer(null);
    setTrailerLoading(true);
    setTrailerError(false);
    try {
      const params = new URLSearchParams({ id: String(activeItem.id), type: activeItem.type });
      if (activeItem.type === 'tv') {
        const seasonToUse = seasonOverride ?? activeSeason ?? 1;
        params.set('season', String(seasonToUse));
      }
      const res = await fetch(`/api/trailer?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch trailer');
      const json = await res.json();
      const best = selectBestYoutubeTrailer(json.results || []);
      setTrailer(best || null);
    } catch (e) {
      console.error('[MovieModal] fetchTrailer error:', e);
      setTrailerError(true);
    } finally {
      setTrailerLoading(false);
    }
  };

  const fetchDetails = async () => {
    if (!activeItem) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/details?id=${activeItem.id}&type=${activeItem.type}`);
      if (!response.ok) throw new Error('Failed to fetch details');
      const json = await response.json();
      setData(json);
      
      if (activeItem.type === 'tv') {
        const firstSeason = json.seasons?.[0]?.season_number ?? 1;
        setActiveSeason(firstSeason);
        fetchEpisodes(json.id, firstSeason);
        // Fetch trailer for the selected season after details loaded
        fetchTrailer(firstSeason);
        return;
      }
      // Movie trailers are fetched in parallel from the activeItem effect.
    } catch (error) {
      console.error('Error fetching details:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchEpisodes = async (id: number, season: number) => {
    setLoadingEpisodes(true);
    try {
      const response = await fetch(`/api/details?id=${id}&type=season&season=${season}`);
      if (!response.ok) throw new Error('Failed to fetch episodes');
      const json = await response.json();
      setEpisodes(json);
    } catch (error) {
      console.error('Error fetching episodes:', error);
    } finally {
      setLoadingEpisodes(false);
    }
  };

  const handleSeasonChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const season = parseInt(e.target.value);
    setActiveSeason(season);
    if (data) fetchEpisodes(data.id, season);
    // Refetch trailer for new season (pass explicit season)
    fetchTrailer(season);
  };
  // iframe-based player controls
  useEffect(() => {
    if (!trailer) return;
    setTrailerReady(false);
    setTrailerPlay(false);
    setTrailerMuted(true);
    const t = setTimeout(() => {
      setTrailerPlay(true);
      setTrailerReady(true);
    }, 1000);
    return () => clearTimeout(t);
  }, [trailer]);

  const handleMuteToggle = () => {
    const iframe = playerRef.current;
    if (iframe && iframe.contentWindow) {
      try {
        const cmd = trailerMuted ? 'unMute' : 'mute';
        iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: cmd, args: [] }), '*');
        setTrailerMuted(m => !m);
        setTrailerPlay(true);
        return;
      } catch (e) {
        console.error('postMessage mute toggle error', e);
      }
    }
    // fallback: just toggle state
    setTrailerMuted(m => !m);
    setTrailerPlay(true);
  };

  const handleFullScreen = () => {
    const iframe = playerRef.current;
    
    if (isFullscreen) {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      setIsFullscreen(false);
      return;
    }

    if (!iframe) return;

    if (iframe.requestFullscreen) {
      iframe.requestFullscreen().catch(() => {
        setIsFullscreen(true);
      });
    } else if ((iframe as any).webkitRequestFullscreen) {
      (iframe as any).webkitRequestFullscreen();
    } else if ((iframe as any).mozRequestFullScreen) {
      (iframe as any).mozRequestFullScreen();
    } else if ((iframe as any).msRequestFullscreen) {
      (iframe as any).msRequestFullscreen();
    } else {
      // Fallback for browsers that don't support iframe fullscreen (like iOS Safari)
      setIsFullscreen(true);
    }
  };

  // Listen for native fullscreen exit
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setIsFullscreen(false);
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const handleToggleWatchlist = async () => {
    if (!user || !data || adding) return;
    setAdding(true);
    try {
      if (isInList(data.id)) {
        await removeItem(data.id);
      } else {
        await addItem({
          id: data.id,
          title: data.title,
          overview: data.description,
          poster_path: data.image?.replace('https://image.tmdb.org/t/p/w500', '') || '',
          backdrop_path: data.backdrop?.replace('https://image.tmdb.org/t/p/original', '') || '',
          release_date: data.year,
          vote_average: parseFloat(data.rating),
        }, data.mediaType);
      }
    } catch (error) {
      console.error('Error toggling watchlist:', error);
    } finally {
      setAdding(false);
    }
  };

  const handleToggleReminder = () => {
    if (!data) return;
    toggleReminder({ id: data.id, title: data.title, mediaType: data.mediaType, preloaded: data });
  };

  const formatCurrency = (amount?: number) => {
    if (amount == null) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatRuntime = (minutes?: number) => {
    if (minutes == null) return 'N/A';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const formatDate = (date?: string) => {
    if (!date) return 'N/A';
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return 'N/A';
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(parsed);
  };

  const formatList = (items?: string[]) => {
    if (!items || items.length === 0) return null;
    return items.join(', ');
  };

  if (!activeItem) return null;

  return (
    <div className={styles.overlay} onClick={closeModal}>
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={data?.title || 'Title details'}
        tabIndex={-1}
      >
        <span className={styles.grabber} aria-hidden="true" />
        <button className={styles.closeButton} onClick={closeModal} aria-label="Close">×</button>

        {/* Trailer Section moved into hero to avoid being covered by backdrop */}

        {loading ? (
          <div className={styles.loading}>
            <div className={styles.spinner}></div>
          </div>
        ) : data ? (
          <>
            <div className={styles.hero}>
              {data.backdrop && (
                <Image
                  src={data.backdrop}
                  alt={data.title}
                  fill
                  priority
                  sizes="(max-width: 900px) 100vw, 900px"
                  className={`${styles.backdrop} ${trailer ? styles.backdropHidden : ''}`}
                />
              )}
              {trailer && (
                <div className={`${styles.trailerHero} ${trailerReady ? styles.trailerVisible : ''} ${isFullscreen ? styles.fullscreenTrailer : ''}`}>
                  <iframe
                    ref={playerRef}
                    title={trailer.name}
                    src={`https://www.youtube.com/embed/${trailer.key}?enablejsapi=1&autoplay=0&controls=0&rel=0&modestbranding=1`}
                    width="100%"
                    height="100%"
                    frameBorder="0"
                    allowFullScreen
                    allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                    onError={() => setTrailerError(true)}
                    className={styles.trailerIframe}
                    onLoad={() => {
                      // when iframe loads, mute and (after 1s) play
                      try {
                        const win = playerRef.current?.contentWindow;
                        if (win) {
                          // ensure muted
                          win.postMessage(JSON.stringify({ event: 'command', func: 'mute', args: [] }), '*');
                          setTimeout(() => {
                            win.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*');
                            setTrailerPlay(true);
                            setTrailerReady(true);
                          }, 1000);
                        }
                      } catch (e) {
                        console.error('iframe onLoad postMessage error', e);
                      }
                    }}
                  />
                  <div className={styles.trailerHeroControls}>
                      <button
                        onClick={handleMuteToggle}
                        className={`${styles.trailerMuteBtn} ${!trailerMuted ? styles.active : ''}`}
                        aria-label={trailerMuted ? 'Unmute trailer' : 'Mute trailer'}
                        title={trailerMuted ? 'Unmute trailer' : 'Mute trailer'}
                      >
                        {trailerMuted ? (
                          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M5 9v6h4l5 5V4L9 9H5z"/></svg>
                        ) : (
                          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M5 9v6h4l5 5V4L9 9H5z"/><path d="M16.5 12c0-1.77-.77-3.37-2-4.47v8.94c1.23-1.1 2-2.7 2-4.47z"/></svg>
                        )}
                      </button>
                    <button onClick={handleFullScreen} className={styles.trailerFullscreenBtn} aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen trailer"} title={isFullscreen ? "Exit fullscreen" : "Fullscreen trailer"}>
                      {isFullscreen ? (
                        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                          <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                          <path d="M7 3H3V7H5V5H7V3ZM21 3H17V5H19V7H21V3ZM3 17H5V19H7V21H3V17ZM19 19H17V21H21V17H19V19Z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              )}
              <div className={styles.heroGradient} />
              <div className={styles.heroContent}>
                {data.tagline && <span className={styles.tagline}>{data.tagline}</span>}
                <h2 className={styles.title}>{data.title}</h2>
                <div className={styles.actions}>
                  {data.providerLink && data.providers && data.providers.length > 0 && (
                    <a 
                      href={data.providerLink} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className={styles.providerLink}
                    >
                      <span className={styles.providerText}>Watch on</span>
                      <div className={styles.modalProviderLogos}>
                        {data.providers.map(p => (
                          <img key={p.id} src={p.logo} alt={p.name} title={p.name} className={styles.modalProviderLogo} />
                        ))}
                      </div>
                    </a>
                  )}
                  {user && (
                    <button 
                      className={`${styles.watchlistButton} ${isInList(data.id) ? styles.inList : ''}`}
                      onClick={handleToggleWatchlist}
                      disabled={adding}
                      aria-label={isInList(data.id) ? 'Remove from My List' : 'Add to My List'}
                      title={isInList(data.id) ? 'Remove from My List' : 'Add to My List'}
                    >
                      {adding ? (
                        <svg className={styles.watchlistSpinner} viewBox="0 0 24 24" aria-hidden="true">
                          <circle cx="12" cy="12" r="9" />
                        </svg>
                      ) : isInList(data.id) ? (
                        <svg className={styles.watchlistIcon} viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M5 12.5L10 17L19 8" />
                        </svg>
                      ) : (
                        <svg className={styles.watchlistIcon} viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M12 5V19M5 12H19" />
                        </svg>
                      )}
                    </button>
                  )}
                  {user && isInList(data.id) && !data.isHD && (
                    <button 
                      className={`${styles.bellButton} ${hasReminder(data.id) ? styles.active : ''}`} 
                      title={hasReminder(data.id) ? 'Remove Reminder' : 'Set Reminder'}
                      onClick={handleToggleReminder}
                      disabled={addingRem}
                    >
                      <span className={styles.bellIcon}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                          <path d="M12 22C13.1 22 14 21.1 14 20H10C10 21.1 10.9 22 12 22ZM18 16V11C18 7.93 16.37 5.36 13.5 4.68V4C13.5 3.17 12.83 2.5 12 2.5C11.17 2.5 10.5 3.17 10.5 4V4.68C7.64 5.36 6 7.92 6 11V16L4 18V19H20V18L18 16Z"/>
                        </svg>
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className={styles.content}>
              <div className={styles.mainInfo}>
                <div className={styles.metaRow}>
                  <div className={styles.metaBadge}>
                    <span className={styles.metaStar}>★</span> {data.rating}
                  </div>
                  <span className={styles.metaYear}>{data.year}</span>
                  <span className={styles.metaType}>{data.mediaType === 'tv' ? 'TV Series' : 'Movie'}</span>
                  {data.mediaType === 'movie' && (
                    <span className={data.isHD ? styles.hdBadge : styles.sdBadge}>
                      {data.isHD ? 'HD' : 'SD'}
                    </span>
                  )}
                </div>
                <p className={styles.overview}>{data.description}</p>
                <div className={styles.metaGrid}>
                  {data.genres && (
                    <div className={styles.metaItem}>
                      <span className={styles.metaLabel}>Genres</span>
                      <span className={styles.metaValue}>{data.genres.map(g => g.name).join(', ')}</span>
                    </div>
                  )}
                  {typeof data.runtime === 'number' && data.runtime > 0 && (
                    <div className={styles.metaItem}>
                      <span className={styles.metaLabel}>Runtime</span>
                      <span className={styles.metaValue}>{formatRuntime(data.runtime)}</span>
                    </div>
                  )}
                  {data.releaseDate && (
                    <div className={styles.metaItem}>
                      <span className={styles.metaLabel}>{data.mediaType === 'tv' ? 'First Air Date' : 'Release Date'}</span>
                      <span className={styles.metaValue}>{formatDate(data.releaseDate)}</span>
                    </div>
                  )}
                  {data.status && (
                    <div className={styles.metaItem}>
                      <span className={styles.metaLabel}>Status</span>
                      <span className={styles.metaValue}>{data.status}</span>
                    </div>
                  )}
                  {data.mediaType === 'movie' && data.releaseHistory && data.releaseHistory.length > 0 && (
                    <div className={styles.metaItem}>
                      <span className={styles.metaLabel}>Release Schedule</span>
                      <ul className={styles.releaseScheduleList}>
                        {data.releaseHistory.map((entry) => (
                          <li key={`${entry.type}-${entry.date}`} className={styles.releaseScheduleItem}>
                            <span className={styles.releaseScheduleTag}>{entry.label}</span>
                            <span className={styles.releaseScheduleDate}>{formatDate(entry.date)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {data.mediaType === 'movie' && data.directors && data.directors.length > 0 && (
                    <div className={styles.metaItem}>
                      <span className={styles.metaLabel}>Director{data.directors && data.directors.length > 1 ? 's' : ''}</span>
                      <span className={styles.metaValue}>
                        <span className={styles.directorLinks}>
                          {data.directors?.map((director, index) => (
                            <span key={director.id}>
                              <Link href={`/star/${director.id}`} className={styles.directorLink} onClick={closeModal}>
                                {director.name}
                              </Link>
                              {index < (data.directors?.length || 0) - 1 ? ', ' : ''}
                            </span>
                          ))}
                        </span>
                      </span>
                    </div>
                  )}
                  {data.mediaType === 'tv' && formatList(data.creators) && (
                    <div className={styles.metaItem}>
                      <span className={styles.metaLabel}>Creator{data.creators && data.creators.length > 1 ? 's' : ''}</span>
                      <span className={styles.metaValue}>{formatList(data.creators)}</span>
                    </div>
                  )}
                  {formatList(data.productionStudios) && (
                    <div className={styles.metaItem}>
                      <span className={styles.metaLabel}>Production Studios</span>
                      <span className={styles.metaValue}>{formatList(data.productionStudios)}</span>
                    </div>
                  )}
                  {formatList(data.productionCountries) && (
                    <div className={styles.metaItem}>
                      <span className={styles.metaLabel}>Production Countries</span>
                      <span className={styles.metaValue}>{formatList(data.productionCountries)}</span>
                    </div>
                  )}
                  {formatList(data.spokenLanguages) && (
                    <div className={styles.metaItem}>
                      <span className={styles.metaLabel}>Spoken Languages</span>
                      <span className={styles.metaValue}>{formatList(data.spokenLanguages)}</span>
                    </div>
                  )}
                  {typeof data.budget === 'number' && data.budget > 0 && (
                    <div className={styles.metaItem}>
                      <span className={styles.metaLabel}>Budget</span>
                      <span className={styles.metaValue}>{formatCurrency(data.budget)}</span>
                    </div>
                  )}
                  {typeof data.revenue === 'number' && data.revenue > 0 && (
                    <div className={styles.metaItem}>
                      <span className={styles.metaLabel}>Revenue</span>
                      <span className={styles.metaValue}>{formatCurrency(data.revenue)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {data.cast && data.cast.length > 0 && (
              <div className={styles.castSection}>
                <h3 className={styles.castTitle}>Cast</h3>
                <div className={styles.castCarousel}>
                  {data.cast.map(member => (
                    <Link href={`/star/${member.id}`} key={member.id} className={styles.castMember} onClick={closeModal} style={{ textDecoration: 'none' }}>
                      <div className={styles.castImageWrapper}>
                        {member.profile_path ? (
                          <img src={member.profile_path} alt={member.name} className={styles.castImage} />
                        ) : (
                          <div className={styles.noCastImage}>👤</div>
                        )}
                      </div>
                      <span className={styles.castName}>{member.name}</span>
                      <span className={styles.castCharacter}>{member.character}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {data.mediaType === 'tv' && data.seasons && (
              <div className={styles.tvContainer}>
                <div className={styles.seasonSelect}>
                  <h3>Episodes</h3>
                  {data.seasons.length > 1 && (
                    <select 
                      className={styles.seasonDropdown} 
                      value={activeSeason}
                      onChange={handleSeasonChange}
                    >
                      {data.seasons
                        .filter(s => s.season_number > 0)
                        .map(s => (
                          <option key={s.id} value={s.season_number}>{s.name}</option>
                        ))
                      }
                    </select>
                  )}
                </div>

                <div className={styles.episodesGrid}>
                  {loadingEpisodes ? (
                    <div className={styles.loading}>
                      <div className={styles.spinner}></div>
                    </div>
                  ) : episodes.map(ep => (
                    <div key={ep.id} className={styles.episodeRow}>
                      <div className={styles.episodeNumber}>{ep.episode_number}</div>
                      <img 
                        src={ep.still_path || data.backdrop} 
                        alt={ep.name} 
                        className={styles.episodeImage} 
                      />
                      <div className={styles.episodeInfo}>
                        <div className={styles.episodeTitleRow}>
                          <div className={styles.episodeTitleLeft}>
                            <h4>{ep.name}</h4>
                            <div className={styles.episodeMetaLine}>
                              <span className={styles.episodeIndex}>E{ep.episode_number}</span>
                              {ep.air_date && (
                                <span className={styles.episodeDate} title={formatDate(ep.air_date)}>
                                  {formatDate(ep.air_date)}
                                </span>
                              )}
                              {typeof ep.runtime === 'number' && ep.runtime > 0 && (
                                <span className={styles.episodeRuntime}>{formatRuntime(ep.runtime)}</span>
                              )}
                            </div>
                          </div>
                          {user && (
                            <button
                              className={`${styles.checkpointBtn} ${checkpoint?.seasonNumber === activeSeason && checkpoint?.episodeNumber === ep.episode_number ? styles.isCheckpoint : ''}`}
                              onClick={() => handleSetCheckpoint(activeSeason, ep.episode_number)}
                              title="Mark as Current Checkpoint"
                              disabled={settingCheckpoint === `${activeSeason}-${ep.episode_number}`}
                            >
                              {settingCheckpoint === `${activeSeason}-${ep.episode_number}` ? (
                                <svg className={styles.watchlistSpinner} viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <circle cx="12" cy="12" r="10"></circle>
                                </svg>
                              ) : (
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                                </svg>
                              )}
                            </button>
                          )}
                        </div>
                        <p className={styles.episodeOverview}>{ep.overview || "No overview available."}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.recommendations && data.recommendations.length > 0 && (
              <div className={styles.moreLikeThis}>
                <h3 className={styles.moreHeading}>More Like This</h3>
                <div className={styles.moreRow}>
                  {data.recommendations.map((rec) => (
                    <button
                      key={`${rec.mediaType}-${rec.id}`}
                      type="button"
                      className={styles.moreCard}
                      onClick={() => openModal(rec.id, rec.mediaType)}
                      title={rec.title}
                    >
                      <img src={rec.image} alt={rec.title} className={styles.morePoster} loading="lazy" />
                      <span className={styles.moreCardTitle}>{rec.title}</span>
                      <span className={styles.moreCardMeta}>★ {rec.rating} · {rec.year}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
};

export default MovieModal;
