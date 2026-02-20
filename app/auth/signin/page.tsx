import Link from 'next/link';
import styles from '../auth.module.css';
import PhoneAuth from '@/components/auth/phone-auth';

export default function SignIn() {
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className="text-white">Sign In</h1>
          <p>Login with your phone number to continue.</p>
        </div>
        
        <div className={styles.formContainer}>
          <PhoneAuth />
        </div>
        
        <div className={styles.footer}>
          <p>By signing in, you agree to our Terms of Service.</p>
        </div>
      </div>
    </div>
  );
}
