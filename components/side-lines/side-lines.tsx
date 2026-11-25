import styles from './side-lines.module.css';

/** Decorative vertical rules pinned to the bottom corners (desktop only). */
const SideLines = () => {
  return (
    <>
      <div className={`${styles.sideLine} ${styles.leftLine}`} aria-hidden="true">
        <div className={styles.line}></div>
      </div>
      <div className={`${styles.sideLine} ${styles.rightLine}`} aria-hidden="true">
        <div className={styles.line}></div>
      </div>
    </>
  );
};

export default SideLines;
