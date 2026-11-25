import type { Metadata } from 'next';
import Link from 'next/link';
// Shares the always-loaded status-screen stylesheet (see the note at its top).
import styles from '@/components/error-boundary/error-boundary.module.css';

export const metadata: Metadata = {
  title: 'Not found · Watch',
};

export default function NotFound() {
  return (
    <main className={styles.nfPage}>
      <div className={styles.nfBackdrop} aria-hidden="true" />
      <div className={styles.nfBeam} aria-hidden="true" />

      <div className={styles.nfContent}>
        <p className={styles.nfEyebrow}>
          <span className={styles.nfEyebrowDot} aria-hidden="true" />
          error 404 · reel missing
        </p>
        <h1 className={styles.nfCode} aria-label="404">
          <span>4</span>
          <span className={styles.nfCodeMiddle}>0</span>
          <span>4</span>
        </h1>
        <h2 className={styles.nfTitle}>Lost in Space?</h2>
        <p className={styles.nfText}>
          The page you are looking for seems to have vanished into the void. Let&apos;s get you back to the
          cinematic world.
        </p>
        <div className={styles.nfActions}>
          <Link href="/" className={styles.nfPrimary}>
            Back to Safety
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
          <Link href="/search" className={styles.nfSecondary}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            Search titles
          </Link>
        </div>
      </div>
    </main>
  );
}
