'use client';

import { useState, useEffect } from 'react';
import styles from './movie-card.module.css';
import { useWatchlist } from '@/context/watchlist-context';
import { useAuth } from '@/context/auth-context';
import { useModal } from '@/context/modal-context';
import { useReminders } from '@/context/reminder-context';

interface WatchProvider {
  id: number;
  name: string;
  logo: string;
}

interface MovieCardProps {
  id: number;
  title: string;
  year: string;
  image: string;
  backdrop?: string;
  rating: string;
  description?: string;
  quality?: string;
  mediaType?: 'movie' | 'tv';
  isHD?: boolean;
}

const MovieCard = ({ id, title, year, image, backdrop, rating, description, quality, mediaType = 'movie', isHD: initialIsHD }: MovieCardProps) => {
  const [isHovered, setIsHovered] = useState(false);
  const [providers, setProviders] = useState<WatchProvider[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const [adding, setAdding] = useState(false);
  const [isBtnHovered, setIsBtnHovered] = useState(false);
  const [isHD, setIsHD] = useState(initialIsHD);
  const [lastEpisode, setLastEpisode] = useState<{ season: number; episode: number; name: string } | undefined>(undefined);

  const { isInList, addItem, removeItem } = useWatchlist();
  const { reminders, addReminder, removeReminder, hasReminder } = useReminders();
  const { user } = useAuth();
  const { openModal } = useModal();
  const inList = isInList(id);

  useEffect(() => {
    let timeout: NodeJS.Timeout;
    
    if (isHovered && !hasFetched && !loading) {
      timeout = setTimeout(async () => {
        setLoading(true);
        try {
          const response = await fetch(`/api/providers?id=${id}&type=${mediaType}`);
          if (!response.ok) throw new Error('Failed to fetch from proxy');
          const data = await response.json();
          setProviders(data.providers || []);
          if (data.isHD !== undefined) setIsHD(data.isHD);
          if (data.lastEpisode) setLastEpisode(data.lastEpisode);
        } catch (error) {
          console.error('Failed to fetch providers:', error);
        } finally {
          setLoading(false);
          setHasFetched(true);
        }
      }, 400); 
    }

    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [isHovered, id, mediaType, hasFetched, loading]);

  const handleToggleWatchlist = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || adding) return;

    setAdding(true);
    try {
      if (inList) {
        await removeItem(id);
      } else {
        await addItem({
          id,
          title,
          overview: description,
          poster_path: image.replace('https://image.tmdb.org/t/p/w500', ''),
          backdrop_path: backdrop?.replace('https://image.tmdb.org/t/p/w780', '') || '',
          release_date: year,
          vote_average: parseFloat(rating),
        }, mediaType);
      }
    } catch (error) {
      console.error('Error toggling watchlist:', error);
    } finally {
      setAdding(false);
    }
  };

  const handleToggleReminder = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;

    if (hasReminder(id)) {
      await removeReminder(id);
    } else {
      const reminderData: any = {
        id,
        name: title,
        type: mediaType,
      };

      if (mediaType === 'movie') {
        reminderData.notified = false;
      } else {
        reminderData.season = lastEpisode?.season;
        reminderData.episode = lastEpisode?.episode;
      }

      await addReminder(reminderData);
    }
  };

  return (
    <div 
      className={styles.cardWrapper}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => openModal(id, mediaType)}
    >
      <div className={`${styles.card} ${isHovered ? styles.expanded : ''}`}>
        {/* Image with provider overlay */}
        <div className={styles.imageContainer}>
          <img 
            src={isHovered && backdrop ? backdrop : image} 
            alt={title} 
            className={styles.image} 
          />

          {/* Providers float on the image */}
          {isHovered && (
            <div className={styles.providerOverlay}>
              {loading ? (
                <div className={styles.providerLoading}>
                  <div className={styles.spinner}></div>
                </div>
              ) : providers.length > 0 ? (
                <div className={styles.providerLogos}>
                  {providers.map(p => (
                    <img key={p.id} src={p.logo} alt={p.name} title={p.name} className={styles.providerLogo} />
                  ))}
                </div>
              ) : hasFetched ? (
                <span className={styles.noProviders}>No streaming</span>
              ) : null}
            </div>
          )}

          {/* Gradient at bottom of image for expanded title */}
          {isHovered && <div className={styles.imageGradient} />}

          {/* Top Right Badges */}
          {isHovered && !loading && hasFetched &&(
            <div className={styles.topRightBadges}>
            {mediaType === 'movie' && (
              <span className={`${styles.cardBadge} ${isHD ? styles.hdBadge : styles.sdBadge}`}>
                {isHD ? 'HD' : 'SD'}
              </span>
            )}
            </div>
          )}
        </div>
        
        {/* Expanded content */}
        <div className={styles.cardContent}>
          <h3 className={styles.expandedTitle}>{title}</h3>

          <div className={styles.meta}>
            <span className={styles.rating}>★ {rating}</span>
            <span className={styles.dot}>·</span>
            <span className={styles.year}>{year}</span>
            <span className={styles.dot}>·</span>
            <span className={styles.mediaTag}>{mediaType === 'tv' ? 'TV' : 'Movie'}</span>
            {user && inList && !isHD && (
              <span 
                className={`${styles.bellIcon} ${hasReminder(id) ? styles.active : ''}`} 
                title={hasReminder(id) ? 'Remove Reminder' : 'Set Reminder'}
                onClick={handleToggleReminder}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 22C13.1 22 14 21.1 14 20H10C10 21.1 10.9 22 12 22ZM18 16V11C18 7.93 16.37 5.36 13.5 4.68V4C13.5 3.17 12.83 2.5 12 2.5C11.17 2.5 10.5 3.17 10.5 4V4.68C7.64 5.36 6 7.92 6 11V16L4 18V19H20V18L18 16Z"/>
                </svg>
              </span>
            )}
          </div>

          {description && (
            <p className={styles.description}>{description}</p>
          )}

          {user && (
            <button
              className={`${styles.addButton} ${inList ? styles.inList : ''}`}
              onClick={handleToggleWatchlist}
              onMouseEnter={() => setIsBtnHovered(true)}
              onMouseLeave={() => setIsBtnHovered(false)}
              disabled={adding}
            >
              {adding ? (
                <span className={styles.btnSpinner}></span>
              ) : inList ? (
                isBtnHovered ? '− Remove from My List' : '✓ In My List'
              ) : (
                '+ Add to My List'
              )}
            </button>
          )}
        </div>
        
        {/* Simple title for non-hovered state */}
        {!isHovered && (
          <div className={styles.simpleTitle}>
            <h3 className={styles.title}>{title}</h3>
          </div>
        )}
      </div>
    </div>
  );
};

export default MovieCard;
