'use client';

import { useState, useEffect } from 'react';
import styles from './hero-gallery.module.css';
import { ContentItem } from '@/lib/tmdb';
import { useWatchlist } from '@/context/watchlist-context';
import { useAuth } from '@/context/auth-context';
import { useModal } from '@/context/modal-context';

interface HeroGalleryProps {
  items: ContentItem[];
}

const HeroGallery = ({ items }: HeroGalleryProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [adding, setAdding] = useState(false);
  const { isInList, addItem, removeItem } = useWatchlist();
  const { user } = useAuth();
  const { openModal } = useModal();

  useEffect(() => {
    if (items.length === 0) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % items.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [items.length]);

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
    <section className={styles.heroGallery}>
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
              <h2 className={styles.heroTitle} onClick={() => openModal(item.id, item.mediaType)}>
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
            className={`${styles.indicator} ${index === currentIndex ? styles.activeIndicator : ''}`}
            onClick={() => setCurrentIndex(index)}
          />
        ))}
      </div>
    </section>
  );
};

export default HeroGallery;
