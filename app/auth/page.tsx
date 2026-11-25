import styles from './auth.module.css';
import PhoneAuth from '@/components/auth/phone-auth';

export default function Auth() {
  return (
    <div className={styles.page}>
      <div className={styles.backdrop} aria-hidden="true" />

      <main className={styles.container}>
        <div className={styles.header}>
          <span className={styles.tagline}>
            <span aria-hidden="true">🧙</span> halt, traveler
          </span>
          <h1>You shall not pass.</h1>
          <p className={styles.subhead}>...unless I have your number.</p>
          <p>
            Just so randoms can&apos;t spam
            my database into oblivion. Drop your number, punch in the code, and
            you&apos;re in.
          </p>
        </div>

        <PhoneAuth />

        <div className={styles.footer}>
          <p className={styles.disclaimer}>
            <strong>Terms &amp; Conditions?</strong> Don&apos;t have any. You log in
            at your own risk.
          </p>
          <p className={styles.disclaimerSub}>
            Not selling your data either — way too lazy for that.
          </p>
        </div>
      </main>
    </div>
  );
}
