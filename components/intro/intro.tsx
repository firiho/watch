'use client';

import { useEffect, useState } from 'react';
import Logo from '../logo/logo';
import styles from './intro.module.css';

export default function Intro() {
  const [isVisible, setIsVisible] = useState(true);
  const [shouldRender, setShouldRender] = useState(true);

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const scrollY = window.scrollY;

    const previousHtmlOverflow = root.style.overflow;
    const previousHtmlHeight = root.style.height;
    const previousHtmlTouchAction = root.style.touchAction;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyTouchAction = body.style.touchAction;
    const previousBodyPosition = body.style.position;
    const previousBodyTop = body.style.top;
    const previousBodyLeft = body.style.left;
    const previousBodyRight = body.style.right;
    const previousBodyWidth = body.style.width;
    const previousBodyHeight = body.style.height;

    if (shouldRender) {
      root.style.overflow = 'hidden';
      root.style.height = '100%';
      root.style.touchAction = 'none';

      body.style.overflow = 'hidden';
      body.style.touchAction = 'none';
      body.style.position = 'fixed';
      body.style.top = `-${scrollY}px`;
      body.style.left = '0';
      body.style.right = '0';
      body.style.width = '100%';
      body.style.height = '100%';
    }

    return () => {
      const savedScrollY = Math.abs(parseInt(body.style.top || '0', 10)) || scrollY;

      root.style.overflow = previousHtmlOverflow;
      root.style.height = previousHtmlHeight;
      root.style.touchAction = previousHtmlTouchAction;

      body.style.overflow = previousBodyOverflow;
      body.style.touchAction = previousBodyTouchAction;
      body.style.position = previousBodyPosition;
      body.style.top = previousBodyTop;
      body.style.left = previousBodyLeft;
      body.style.right = previousBodyRight;
      body.style.width = previousBodyWidth;
      body.style.height = previousBodyHeight;

      window.scrollTo(0, savedScrollY);
    };
  }, [shouldRender]);

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
