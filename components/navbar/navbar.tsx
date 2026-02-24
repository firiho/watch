'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './navbar.module.css';
import Logo from '../logo/logo';
import Search from '../search/search';
import { useAuth } from '@/context/auth-context';

const Navbar = () => {
  const [scrollProgress, setScrollProgress] = useState(0);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { user, signOut } = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    const handleScroll = () => {
      const progress = Math.min(window.scrollY / 100, 1);
      setScrollProgress(progress);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = isMobileMenuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMobileMenuOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

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
          <Link href="/" className={`${styles.logoLink} logo-link`} onClick={closeMobileMenu}>
            <Logo />
            <span className={styles.logoText}>Watch</span>
          </Link>
        </div>

        <button
          type="button"
          className={`${styles.menuButton} ${isMobileMenuOpen ? styles.menuButtonOpen : ''}`}
          aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={isMobileMenuOpen}
          onClick={() => setIsMobileMenuOpen((prev) => !prev)}
        >
          <span className={styles.menuBar} />
          <span className={styles.menuBar} />
          <span className={styles.menuBar} />
        </button>

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

        {isMobileMenuOpen && (
          <>
            <button
              type="button"
              className={styles.mobileBackdrop}
              aria-label="Close menu"
              onClick={closeMobileMenu}
            />
            <div className={styles.mobileMenu}>
              <ol className={styles.mobileLinks}>
                <li>
                  <Link href="/movies" onClick={closeMobileMenu}>Movies</Link>
                </li>
                <li>
                  <Link href="/tv-shows" onClick={closeMobileMenu}>TV Shows</Link>
                </li>
                {user && (
                  <li>
                    <Link href="/watchlist" onClick={closeMobileMenu}>My List</Link>
                  </li>
                )}
              </ol>

              <div className={styles.mobileSearch}>
                <Search />
              </div>

              <div className={styles.mobileActions}>
                {user ? (
                  <button
                    onClick={() => {
                      closeMobileMenu();
                      signOut();
                    }}
                    className={styles.resumeButton}
                  >
                    Sign Out
                  </button>
                ) : (
                  <Link href="/auth/signin" className={styles.resumeButton} onClick={closeMobileMenu}>
                    Sign In
                  </Link>
                )}
              </div>
            </div>
          </>
        )}
      </nav>
    </header>
  );
};

export default Navbar;
