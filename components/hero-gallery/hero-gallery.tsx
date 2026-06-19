'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import styles from './hero-gallery.module.css';
import { ContentItem } from '@/lib/tmdb';
import { useWatchlist } from '@/context/watchlist-context';
import { useAuth } from '@/context/auth-context';
import { useProfile } from '@/context/profile-context';
import { useModal } from '@/context/modal-context';
import { HERO_ROTATE_INTERVAL_MS } from '@/lib/constants';

interface HeroGalleryProps {
  items: ContentItem[];
}

const HeroGallery = ({ items: initialItems }: HeroGalleryProps) => {
  const [items, setItems] = useState<ContentItem[]>(initialItems);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [adding, setAdding] = useState(false);
  const [paused, setPaused] = useState(false);
  const { isInList, addItem, removeItem } = useWatchlist();
  const { user } = useAuth();
  const { profile } = useProfile();
  const { openModal } = useModal();

  const favoriteGenres = profile?.favoriteGenres;
  const genresKey = favoriteGenres?.join(',') ?? '';

  // Personalize the hero with the user's favorite genres when signed in.
  // Falls back to the server-provided trending items otherwise.
  useEffect(() => {
    if (!user || !genresKey) {
      setItems(initialItems);
      setCurrentIndex(0);
      return;
    }

    let active = true;
    fetch(`/api/featured?genres=${genresKey}`)
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        if (Array.isArray(data.results) && data.results.length > 0) {
          setItems(data.results);
          setCurrentIndex(0);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [user, genresKey, initialItems]);
  const sectionRef = useRef<HTMLElement | null>(null);
  const touchStartX = useRef(0);

  const count = items.length;
  const goNext = useCallback(() => setCurrentIndex((p) => (p + 1) % count), [count]);
  const goPrev = useCallback(() => setCurrentIndex((p) => (p - 1 + count) % count), [count]);

  useEffect(() => {
    if (items.length === 0 || paused) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % items.length);
    }, HERO_ROTATE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [items.length, paused]);

  // Two-finger horizontal trackpad swipe (and horizontal mouse wheel) → change slide.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el || count < 2) return;
    let lock = false;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 24) {
        e.preventDefault();
        if (lock) return;
        lock = true;
        if (e.deltaX > 0) goNext();
        else goPrev();
        window.setTimeout(() => {
          lock = false;
        }, 500);
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [count, goNext, goPrev]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (count < 2) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 45) {
      if (dx < 0) goNext();
      else goPrev();
    }
  };

  if (!items || items.length === 0) {
    return null;
  }

  const handleToggleWatchlist = async (item: ContentItem) => {
    if (!user || adding) return;

    setAdding(true);
    try {
      if (isInList(item.id)) {
        await removeItem(item.id);
      } else {
        await addItem({
          id: item.id,
          title: item.title,
          overview: item.description,
          poster_path: item.image?.replace('https://image.tmdb.org/t/p/original', '') || '',
          backdrop_path: item.image?.replace('https://image.tmdb.org/t/p/original', '') || '',
          release_date: item.year,
          vote_average: parseFloat(item.rating),
        }, item.mediaType);
      }
    } catch (error) {
      console.error('Error toggling watchlist:', error);
    } finally {
      setAdding(false);
    }
  };

  return (
    <section
      className={styles.heroGallery}
      ref={sectionRef}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {items.map((item, index) => (
        <div 
          key={item.id} 
          className={`${styles.heroSlide} ${index === currentIndex ? styles.active : ''}`}
        >
          {/* Background Image Layer */}
          <div 
            className={styles.backgroundImage}
            style={{ backgroundImage: `url(${item.image})` }}
          />
          
          {/* Gradient Overlay */}
          <div className={styles.overlay} />

          <div className={styles.heroContentWrapper}>
            <div className={styles.heroContent}>
              <h4 className="text-accent mono-text">Featured</h4>
              <h2
                className={styles.heroTitle}
                onClick={() => openModal(item.id, item.mediaType)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openModal(item.id, item.mediaType);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                {item.title}
              </h2>
              <p className={styles.heroDescription}>{item.description}</p>
              <div className={styles.heroButtons}>
                {user && (
                  <button
                    className={`${styles.primaryButton} ${isInList(item.id) ? styles.inListBtn : ''}`}
                    onClick={() => handleToggleWatchlist(item)}
                    disabled={adding}
                    aria-label={isInList(item.id) ? 'In My List. Click to remove.' : 'Add to My List'}
                    title={isInList(item.id) ? 'In My List. Click to remove.' : 'Add to My List'}
                  >
                    {adding ? (
                      <>
                        <svg className={styles.buttonSpinner} viewBox="0 0 24 24" aria-hidden="true">
                          <circle cx="12" cy="12" r="9" />
                        </svg>
                        <span className={styles.buttonLabel}>Saving...</span>
                      </>
                    ) : isInList(item.id) ? (
                      <>
                        <svg className={styles.buttonIcon} viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M5 12.5L10 17L19 8" />
                        </svg>
                        <span className={styles.buttonLabel}>In My List</span>
                      </>
                    ) : (
                      <>
                        <svg className={styles.buttonIcon} viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M12 5V19M5 12H19" />
                        </svg>
                        <span className={styles.buttonLabel}>My List</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
      
      <div className={styles.indicators}>
        {items.map((_, index) => (
          <button
            key={index}
            type="button"
            className={`${styles.indicator} ${index === currentIndex ? styles.activeIndicator : ''}`}
            onClick={() => setCurrentIndex(index)}
            aria-label={`Go to slide ${index + 1}`}
            aria-current={index === currentIndex}
          />
        ))}
      </div>
    </section>
  );
};

export default HeroGallery;
