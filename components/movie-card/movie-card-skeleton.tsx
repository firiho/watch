import styles from './movie-card-skeleton.module.css';

const MovieCardSkeleton = () => {
  return <div className={styles.skeleton} aria-hidden="true" />;
};

export default MovieCardSkeleton;
