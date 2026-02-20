'use client';

import { useEffect, useState } from 'react';
import Logo from '../logo/logo';
import styles from './intro.module.css';

export default function Intro() {
  const [isVisible, setIsVisible] = useState(true);
  const [shouldRender, setShouldRender] = useState(true);

  useEffect(() => {
    // Auto-hide after animation completes
    const timer = setTimeout(() => {
      setIsVisible(false);
      // Final cleanup after fade out
      setTimeout(() => setShouldRender(false), 1000);
    }, 3500); // Intro duration

    return () => clearTimeout(timer);
  }, []);

  if (!shouldRender) return null;

  return (
    <div className={`${styles.introOverlay} ${isVisible ? styles.visible : styles.hidden}`}>
      <div className={styles.content}>
        <div className={styles.logoBox}>
          <Logo />
        </div>
      </div>
    </div>
  );
}
