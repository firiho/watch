'use client';

import { useState, useRef } from 'react';
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import styles from '@/app/auth/auth.module.css';
import { useRouter } from 'next/navigation';

// Turn Firebase's cryptic error codes into something a human (and a funny one) can read.
function friendlyError(err: any): string {
  switch (err?.code) {
    case 'auth/invalid-recaptcha-token':
    case 'auth/missing-recaptcha-token':
      return 'reCAPTCHA glitched out. Hit the button once more — fresh token, fresh start.';
    case 'auth/captcha-check-failed':
      return "reCAPTCHA couldn't vouch for this domain. (Dev note: check Firebase → Authentication → Authorized domains.)";
    case 'auth/invalid-phone-number':
    case 'auth/missing-phone-number':
      return "That's not a real number. Include the country code, e.g. +1 234 567 8900.";
    case 'auth/too-many-requests':
      return "Easy there, speed racer. Too many tries — wait a few minutes.";
    case 'auth/quota-exceeded':
      return "SMS quota maxed out for now. Try again later.";
    default:
      return err?.message || 'Something broke. Try again.';
  }
}

export default function PhoneAuth() {
  const [countryCode, setCountryCode] = useState('1');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);

  const recaptchaRef = useRef<HTMLDivElement>(null);
  const recaptchaVerifier = useRef<RecaptchaVerifier | null>(null);
  const router = useRouter();

  // Tear down any existing verifier and DELETE its host node entirely.
  // grecaptcha keeps an internal registry keyed on the DOM element, so it
  // throws "reCAPTCHA has already been rendered in this element" if we ever
  // reuse a node — emptying innerHTML isn't enough. We must drop the node.
  const resetRecaptcha = () => {
    if (recaptchaVerifier.current) {
      try {
        recaptchaVerifier.current.clear();
      } catch {
        // already gone, ignore
      }
      recaptchaVerifier.current = null;
    }
    // Remove every child host node from the stable wrapper.
    if (recaptchaRef.current) recaptchaRef.current.replaceChildren();
  };

  // Build a brand new verifier on a FRESH child node for every send.
  // Invisible reCAPTCHA tokens are single-use, and the node can't be reused,
  // so a clean node + clean verifier each time avoids both
  // auth/invalid-recaptcha-token and the "already rendered" crash.
  const getFreshVerifier = async (): Promise<RecaptchaVerifier> => {
    resetRecaptcha();
    const host = document.createElement('div');
    recaptchaRef.current!.appendChild(host);
    const verifier = new RecaptchaVerifier(auth, host, {
      size: 'invisible'
    });
    await verifier.render();
    recaptchaVerifier.current = verifier;
    return verifier;
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber || loading) return;

    setLoading(true);
    setError(null);

    try {
      // Stitch dial code + the digits the user typed into E.164 (e.g. +250788123456).
      const fullNumber = `+${countryCode.replace(/\D/g, '')}${phoneNumber.replace(/\D/g, '')}`;
      const verifier = await getFreshVerifier();
      const result = await signInWithPhoneNumber(auth, fullNumber, verifier);
      setConfirmationResult(result);
      setStep('otp');
    } catch (err: any) {
      console.error('Login Error:', err);
      // The verifier's token is spent/blocked now — drop it so a retry rebuilds.
      resetRecaptcha();
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  // Go back to the phone step with a clean slate so the user actually enters a
  // NEW number — clear the old digits, the spent OTP/confirmation, and the
  // used-up reCAPTCHA verifier. Without this, the old number stays pre-filled
  // and the next "Receive Code" just re-texts the previous number.
  const handleChangeNumber = () => {
    resetRecaptcha();
    setPhoneNumber('');
    setOtp('');
    setConfirmationResult(null);
    setError(null);
    setStep('phone');
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
            <div className={styles.phoneRow}>
              <div className={styles.codeField}>
                <span className={styles.plus}>+</span>
                <input
                  type="tel"
                  inputMode="numeric"
                  aria-label="Country code"
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="1"
                  disabled={loading}
                  className={styles.codeInput}
                />
              </div>
              <input
                type="tel"
                inputMode="numeric"
                id="phoneNumber"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                placeholder="788 123 456"
                required
                disabled={loading}
                className={styles.numberInput}
              />
            </div>
          </div>

          {/* Invisible reCAPTCHA mounts here; rebuilt fresh on every send. */}
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
            onClick={handleChangeNumber}
            disabled={loading}
          >
            Change Number
          </button>
        </form>
      )}
    </div>
  );
}
