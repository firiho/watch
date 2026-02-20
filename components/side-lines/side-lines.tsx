import styles from './side-lines.module.css';

const SideLines = () => {
  return (
    <>
      <div className={`${styles.sideLine} ${styles.leftLine}`}>
        <div className={styles.line}></div>
      </div>
      <div className={`${styles.sideLine} ${styles.rightLine}`}>
        <div className={styles.line}></div>
      </div>
    </>
  );
};

export default SideLines;
