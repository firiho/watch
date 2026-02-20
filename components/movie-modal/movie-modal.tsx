'use client';

import { useEffect, useState } from 'react';
import { useModal } from '@/context/modal-context';
import { useWatchlist } from '@/context/watchlist-context';
import { useAuth } from '@/context/auth-context';
import { useReminders } from '@/context/reminder-context';
import { ContentItem, getTVSeasonDetails, Episode } from '@/lib/tmdb';
import styles from './movie-modal.module.css';

const MovieModal = () => {
  const { activeItem, closeModal } = useModal();
  const { isInList, addItem, removeItem } = useWatchlist();
  const { addReminder, removeReminder, hasReminder } = useReminders();
  const { user } = useAuth();
  const [data, setData] = useState<ContentItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addingRem, setAddingRem] = useState(false);
  const [isBtnHovered, setIsBtnHovered] = useState(false);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [activeSeason, setActiveSeason] = useState(1);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);

  useEffect(() => {
    if (activeItem) {
      fetchDetails();
    } else {
      setData(null);
      setEpisodes([]);
    }
  }, [activeItem]);

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
      }
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
  };

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

  const handleToggleReminder = async () => {
    if (!user || !data || addingRem) return;

    setAddingRem(true);
    try {
      if (hasReminder(data.id)) {
        await removeReminder(data.id);
      } else {
        await addReminder({
          id: data.id,
          name: data.title,
          type: data.mediaType,
          notified: false,
          season: data.lastEpisode?.season,
          episode: data.lastEpisode?.episode
        });
      }
    } catch (error) {
      console.error('Error toggling reminder:', error);
    } finally {
      setAddingRem(false);
    }
  };

  const formatCurrency = (amount?: number) => {
    if (!amount) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatRuntime = (minutes?: number) => {
    if (!minutes) return 'N/A';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  if (!activeItem) return null;

  return (
    <div className={styles.overlay} onClick={closeModal}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeButton} onClick={closeModal}>×</button>

        {loading ? (
          <div className={styles.loading}>
            <div className={styles.spinner}></div>
          </div>
        ) : data ? (
          <>
            <div className={styles.hero}>
              <img src={data.backdrop} alt={data.title} className={styles.backdrop} />
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
                      onMouseEnter={() => setIsBtnHovered(true)}
                      onMouseLeave={() => setIsBtnHovered(false)}
                      disabled={adding}
                    >
                      {adding ? '...' : (isInList(data.id) ? (isBtnHovered ? '− Remove from My List' : '✓ In My List') : '+ My List')}
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
              </div>

              <div className={styles.metaGrid}>
                {data.genres && (
                  <div className={styles.metaItem}>
                    <span className={styles.metaLabel}>Genres</span>
                    <div className={styles.genres}>
                      {data.genres.map(g => (
                        <span key={g.id} className={styles.genreTag}>{g.name}</span>
                      ))}
                    </div>
                  </div>
                )}
                {data.runtime && (
                  <div className={styles.metaItem}>
                    <span className={styles.metaLabel}>Runtime</span>
                    <span className={styles.metaValue}>{formatRuntime(data.runtime)}</span>
                  </div>
                )}
                {data.status && (
                  <div className={styles.metaItem}>
                    <span className={styles.metaLabel}>Status</span>
                    <span className={styles.metaValue}>{data.status}</span>
                  </div>
                )}
                {data.budget && data.budget > 0 && (
                  <div className={styles.metaItem}>
                    <span className={styles.metaLabel}>Budget</span>
                    <span className={styles.metaValue}>{formatCurrency(data.budget)}</span>
                  </div>
                )}
              </div>
            </div>

            {data.cast && data.cast.length > 0 && (
              <div className={styles.castSection}>
                <h3 className={styles.castTitle}>Cast</h3>
                <div className={styles.castCarousel}>
                  {data.cast.map(member => (
                    <div key={member.id} className={styles.castMember}>
                      <div className={styles.castImageWrapper}>
                        {member.profile_path ? (
                          <img src={member.profile_path} alt={member.name} className={styles.castImage} />
                        ) : (
                          <div className={styles.noCastImage}>👤</div>
                        )}
                      </div>
                      <span className={styles.castName}>{member.name}</span>
                      <span className={styles.castCharacter}>{member.character}</span>
                    </div>
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
                        <h4>{ep.name}</h4>
                        <p className={styles.episodeOverview}>{ep.overview || "No overview available."}</p>
                      </div>
                    </div>
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
