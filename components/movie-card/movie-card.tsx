'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import styles from './movie-card.module.css';
import { useWatchlist } from '@/context/watchlist-context';
import { useAuth } from '@/context/auth-context';
import { useModal } from '@/context/modal-context';
import { useReminders } from '@/context/reminder-context';
import { useToggleReminder } from '@/hooks/use-toggle-reminder';
import { HOVER_OPEN_DELAY_MS, PROVIDER_FETCH_DELAY_MS } from '@/lib/constants';

interface WatchProvider {
  id: number;
  name: string;
  logo: string;
}

interface MovieCardProps {
  id: number;
  title: string;
  year: string;
  releaseDate?: string;
  image: string;
  backdrop?: string;
  rating: string;
  description?: string;
  quality?: string;
  mediaType?: 'movie' | 'tv';
  isHD?: boolean;
}

const formatDisplayDate = (date?: string) => {
  if (!date) return null;
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed);
};

const MovieCard = ({ id, title, year, releaseDate, image, backdrop, rating, description, quality, mediaType = 'movie', isHD: initialIsHD }: MovieCardProps) => {
  const [isHovered, setIsHovered] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [providers, setProviders] = useState<WatchProvider[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const [adding, setAdding] = useState(false);
  const [isBtnHovered, setIsBtnHovered] = useState(false);
  const [isHD, setIsHD] = useState(initialIsHD);

  const { isInList, addItem, removeItem } = useWatchlist();
  const { hasReminder } = useReminders();
  const { toggleReminder } = useToggleReminder();
  const { user } = useAuth();
  const { openModal } = useModal();
  const inList = isInList(id);
  const formattedReleaseDate = formatDisplayDate(releaseDate);

  useEffect(() => {
    let timeout: NodeJS.Timeout;
    const controller = new AbortController();

    if (isHovered && !hasFetched && !loading) {
      timeout = setTimeout(async () => {
        setLoading(true);
        try {
          const response = await fetch(`/api/providers?id=${id}&type=${mediaType}`, { signal: controller.signal });
          if (!response.ok) throw new Error('Failed to fetch from proxy');
          const data = await response.json();
          setProviders(data.providers || []);
          if (data.isHD !== undefined) setIsHD(data.isHD);
          setHasFetched(true);
        } catch (error) {
          if ((error as Error)?.name !== 'AbortError') {
            console.error('Failed to fetch providers:', error);
            setHasFetched(true); // don't hammer the API on a real failure
          }
        } finally {
          setLoading(false);
        }
      }, PROVIDER_FETCH_DELAY_MS);
    }

    return () => {
      if (timeout) clearTimeout(timeout);
      controller.abort();
    };
  }, [isHovered, id, mediaType, hasFetched, loading]);

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

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

  const handleToggleReminder = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleReminder({ id, title, mediaType });
  };

  const handleMouseEnter = () => {
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(true);
    }, HOVER_OPEN_DELAY_MS);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    setIsHovered(false);
  };

  return (
    <div 
      className={styles.cardWrapper}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={() => openModal(id, mediaType)}
    >
      <div className={`${styles.card} ${isHovered ? styles.expanded : ''}`}>
        {/* Image with provider overlay */}
        <div className={styles.imageContainer}>
          <Image
            src={isHovered && backdrop ? backdrop : image}
            alt={title}
            className={styles.image}
            fill
            sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 220px"
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
              <button
                type="button"
                className={`${styles.bellIcon} ${hasReminder(id) ? styles.active : ''}`}
                title={hasReminder(id) ? 'Remove Reminder' : 'Set Reminder'}
                aria-label={hasReminder(id) ? 'Remove reminder' : 'Set reminder'}
                aria-pressed={hasReminder(id)}
                onClick={handleToggleReminder}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M12 22C13.1 22 14 21.1 14 20H10C10 21.1 10.9 22 12 22ZM18 16V11C18 7.93 16.37 5.36 13.5 4.68V4C13.5 3.17 12.83 2.5 12 2.5C11.17 2.5 10.5 3.17 10.5 4V4.68C7.64 5.36 6 7.92 6 11V16L4 18V19H20V18L18 16Z"/>
                </svg>
              </button>
            )}
          </div>

          {description && (
            <p className={styles.description}>{description}</p>
          )}

          {formattedReleaseDate && (
            <p className={styles.releaseDateLine}>
              {mediaType === 'tv' ? 'First aired' : 'Released'} {formattedReleaseDate}
            </p>
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
            {formattedReleaseDate && (
              <p className={styles.simpleReleaseDate}>
                {formattedReleaseDate}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MovieCard;
