import styles from './star.module.css';

export default function LoadingStarPage() {
  return (
    <main className={styles.main}>
      <header className={styles.profileContainer}>
        <div className={`${styles.loadingAvatar} ${styles.skeletonBase}`} />

        <div className={styles.info}>
          <div className={`${styles.loadingName} ${styles.skeletonBase}`} />
          <div className={`${styles.loadingKnownFor} ${styles.skeletonBase}`} />

          <div className={styles.metaGrid}>
            <div className={`${styles.loadingMeta} ${styles.skeletonBase}`} />
            <div className={`${styles.loadingMeta} ${styles.skeletonBase}`} />
          </div>

          <div className={`${styles.loadingBio} ${styles.skeletonBase}`} />
        </div>
      </header>

      <section className={styles.section}>
        <div className={`${styles.loadingSectionTitle} ${styles.skeletonBase}`} />

        <div className={styles.creditsGrid}>
          {Array.from({ length: 10 }).map((_, index) => (
            <div
              key={`loading-card-${index}`}
              className={`${styles.loadingCard} ${styles.skeletonBase}`}
            />
          ))}
        </div>
      </section>
    </main>
  );
}
