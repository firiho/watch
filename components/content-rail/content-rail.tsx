'use client';

import { useRef, useState } from 'react';
import MovieCard from '../movie-card/movie-card';
import { ContentItem } from '@/lib/tmdb';
import styles from './content-rail.module.css';

interface ContentRailProps {
  title: string;
  data: ContentItem[];
}

const ContentRail = ({ title, data }: ContentRailProps) => {
  const railRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!railRef.current) return;
    setIsDragging(true);
    setStartX(e.pageX - railRef.current.offsetLeft);
    setScrollLeft(railRef.current.scrollLeft);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !railRef.current) return;
    e.preventDefault();
    const x = e.pageX - railRef.current.offsetLeft;
    const walk = (x - startX) * 2; // Scroll speed
    railRef.current.scrollLeft = scrollLeft - walk;
  };

  const scrollByAmount = (direction: 'left' | 'right') => {
    if (!railRef.current) return;
    const scrollAmount = railRef.current.clientWidth * 0.8;
    railRef.current.scrollTo({
      left: railRef.current.scrollLeft + (direction === 'right' ? scrollAmount : -scrollAmount),
      behavior: 'smooth'
    });
  };

  return (
    <section className={styles.section}>
      <div className={styles.railContainer}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{title}</h2>
          <div className={styles.railLine}></div>
        </div>

        <div className={styles.railWrapper}>
          <div 
            className={`${styles.navArea} ${styles.prevArea}`} 
            onClick={() => scrollByAmount('left')}
          >
            <span className={styles.navArrow}>‹</span>
          </div>

          <div 
            className={`${styles.rail} ${isDragging ? styles.dragging : ''}`}
            ref={railRef}
            onMouseDown={handleMouseDown}
            onMouseLeave={handleMouseLeave}
            onMouseUp={handleMouseUp}
            onMouseMove={handleMouseMove}
          >
            {/* Added a spacer to ensure the first number is fully visible */}
            <div className={styles.railSpacer} />
            
            {data.slice(0, 10).map((item, idx) => (
              <div key={item.id} className={styles.itemWithNumber}>
                <span className={styles.bigNumber}>{idx + 1}</span>
                <MovieCard {...item} />
              </div>
            ))}
            
            <div className={styles.railSpacer} />
          </div>

          <div 
            className={`${styles.navArea} ${styles.nextArea}`} 
            onClick={() => scrollByAmount('right')}
          >
            <span className={styles.navArrow}>›</span>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ContentRail;
