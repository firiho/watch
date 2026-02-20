'use client';

import { useState, useEffect, useRef } from 'react';
import { 
  RecaptchaVerifier, 
  signInWithPhoneNumber, 
  ConfirmationResult 
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import styles from '@/app/auth/auth.module.css';
import { useRouter } from 'next/navigation';

export default function PhoneAuth() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  
  const recaptchaRef = useRef<HTMLDivElement>(null);
  const recaptchaVerifier = useRef<RecaptchaVerifier | null>(null);
  const router = useRouter();

  useEffect(() => {
    // Prevent double initialization in Next.js Strict Mode
    if (typeof window !== 'undefined' && !recaptchaVerifier.current && recaptchaRef.current) {
      try {
        recaptchaVerifier.current = new RecaptchaVerifier(auth, recaptchaRef.current, {
          size: 'invisible', // Invisible is smoother for users
          callback: () => {
            // reCAPTCHA solved automatically
          },
          'expired-callback': () => {
            setError('reCAPTCHA expired. Please try again.');
          }
        });

        recaptchaVerifier.current.render();
      } catch (err: any) {
        console.error('reCAPTCHA Initialization Error:', err);
      }
    }
    
    return () => {
      if (recaptchaVerifier.current) {
        try {
          recaptchaVerifier.current.clear();
          recaptchaVerifier.current = null;
          // Physically clear the container to prevent ghosting
          if (recaptchaRef.current) {
            recaptchaRef.current.innerHTML = '';
          }
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    };
  }, []);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber || loading) return;
    
    setLoading(true);
    setError(null);

    try {
      const appVerifier = recaptchaVerifier.current;
      if (!appVerifier) throw new Error('reCAPTCHA not initialized');

      const result = await signInWithPhoneNumber(auth, phoneNumber, appVerifier);
      setConfirmationResult(result);
      setStep('otp');
    } catch (err: any) {
      console.error('Login Error:', err);
      setError(err.message || 'Failed to send code.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp || !confirmationResult || loading) return;

    setLoading(true);
    setError(null);

    try {
      await confirmationResult.confirm(otp);
      router.push('/');
    } catch (err: any) {
      setError('Invalid code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.authWrapper}>
      {step === 'phone' ? (
        <form onSubmit={handleSendOtp} className={styles.form}>
          <div className={styles.inputGroup}>
            <label htmlFor="phoneNumber">Phone Number</label>
            <input
              type="tel"
              id="phoneNumber"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+1 234 567 8900"
              required
              disabled={loading}
              className={styles.input}
            />
          </div>
          
          <div ref={recaptchaRef}></div>
          
          {error && <div className={styles.errorMessage}>{error}</div>}
          
          <button 
            type="submit" 
            className={styles.button}
            disabled={loading}
          >
            {loading ? (
              <span className={styles.loader}>Sending...</span>
            ) : 'Receive Code'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerifyOtp} className={styles.form}>
          <div className={styles.inputGroup}>
            <label htmlFor="otp">6-Digit Code</label>
            <input
              type="text"
              id="otp"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="000000"
              maxLength={6}
              required
              disabled={loading}
              className={styles.input}
            />
          </div>
          
          {error && <div className={styles.errorMessage}>{error}</div>}
          
          <button 
            type="submit" 
            className={styles.button}
            disabled={loading}
          >
            {loading ? (
              <span className={styles.loader}>Verifying...</span>
            ) : 'Verify & Sign In'}
          </button>
          
          <button 
            type="button" 
            className={styles.backButton}
            onClick={() => setStep('phone')}
            disabled={loading}
          >
            Change Number
          </button>
        </form>
      )}
    </div>
  );
}
