'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import styles from './navbar.module.css';
import Logo from '../logo/logo';
import Search from '../search/search';
import { useAuth } from '@/context/auth-context';

const Navbar = () => {
  const [scrollProgress, setScrollProgress] = useState(0);
  const { user, signOut } = useAuth();

  useEffect(() => {
    const handleScroll = () => {
      const progress = Math.min(window.scrollY / 100, 1);
      setScrollProgress(progress);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header 
      className={styles.header}
      style={{ 
        '--nav-opacity': scrollProgress,
        '--nav-blur': `${scrollProgress * 20}px`
      } as React.CSSProperties}
    >
      <nav className={styles.nav}>
        <div className={styles.logoContainer}>
          <Link href="/" className={`${styles.logoLink} logo-link`}>
            <Logo />
            <span className={styles.logoText}>Watch</span>
          </Link>
        </div>
        
        <div className={styles.links}>
          <ol>
            <li>
              <Link href="/movies"><span className="text-accent">01.</span> Movies</Link>
            </li>
            <li>
              <Link href="/tv-shows"><span className="text-accent">02.</span> TV Shows</Link>
            </li>
            {user && (
              <li>
                <Link href="/watchlist"><span className="text-accent">03.</span> My List</Link>
              </li>
            )}
          </ol>

          <Search />

          <div className={styles.buttonContainer}>
            {user ? (
              <button onClick={() => signOut()} className={styles.resumeButton}>
                Sign Out
              </button>
            ) : (
              <Link href="/auth/signin" className={styles.resumeButton}>
                Sign In
              </Link>
            )}
          </div>
        </div>
      </nav>
    </header>
  );
};

export default Navbar;
