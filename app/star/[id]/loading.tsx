import styles from './star.module.css';

export default function LoadingStarPage() {
  return (
    <main className={styles.main} aria-busy="true" aria-label="Loading profile">
      <header className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={`${styles.skeleton} ${styles.skeletonPortrait}`} />

          <div className={styles.skeletonInfo}>
            <div className={`${styles.skeleton} ${styles.skeletonDepartment}`} />
            <div className={`${styles.skeleton} ${styles.skeletonName}`} />
            <div className={styles.skeletonFacts}>
              <div className={`${styles.skeleton} ${styles.skeletonFact}`} />
              <div className={`${styles.skeleton} ${styles.skeletonFact}`} />
            </div>
            <div className={styles.skeletonLines}>
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className={`${styles.skeleton} ${styles.skeletonLine}`} />
              ))}
            </div>
          </div>
        </div>
      </header>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={`${styles.skeleton} ${styles.skeletonTitle}`} />
        </div>
        <div className={styles.knownFor}>
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className={styles.knownForItem}>
              <div className={`${styles.skeleton} ${styles.skeletonCard}`} />
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
