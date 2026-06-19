import styles from './auth.module.css';
import PhoneAuth from '@/components/auth/phone-auth';

export default function Auth() {
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.header}>
          <span className={styles.tagline}>🧙 halt, traveler</span>
          <h1 className="text-white">You shall not pass.</h1>
          <p className={styles.subhead}>...unless I have your number.</p>
          <p>
            Not in a creepy way :) It&apos;s just so randoms can&apos;t spam
            my database into oblivion. Drop your number, punch in the code, and
            you&apos;re in.
          </p>
        </div>

        <div className={styles.formContainer}>
          <PhoneAuth />
        </div>

        <div className={styles.footer}>
          <p className={styles.disclaimer}>
            <strong>Terms &amp; Conditions?</strong> Don&apos;t have any. You log in
            at your own risk.
          </p>
          <p className={styles.disclaimerSub}>
            Not selling your data either — way too lazy for that.
          </p>
        </div>
      </div>
    </div>
  );
}
