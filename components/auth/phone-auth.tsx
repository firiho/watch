'use client';

import { useState, useRef, useEffect, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { haptic } from '@/lib/haptics';
import styles from '@/app/auth/auth.module.css';
import { useRouter } from 'next/navigation';

const OTP_LENGTH = 6;

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

/**
 * On touch devices the keyboard can cover the submit button. Once it has
 * opened (the visual viewport shrinks), nudge the button into view.
 */
function keepVisibleAboveKeyboard(target: HTMLElement | null) {
  if (!target || typeof window === 'undefined') return;
  if (!window.matchMedia('(pointer: coarse)').matches) return;
  const viewport = window.visualViewport;
  let done = false;
  const reveal = () => {
    if (done) return;
    done = true;
    viewport?.removeEventListener('resize', reveal);
    const rect = target.getBoundingClientRect();
    const visibleBottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
    if (rect.bottom + 12 > visibleBottom) {
      // An explicit 'smooth' would override globals.css's reduced-motion `scroll-behavior: auto`.
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      target.scrollIntoView({ block: 'end', behavior: reduceMotion ? 'auto' : 'smooth' });
    }
  };
  viewport?.addEventListener('resize', reveal);
  window.setTimeout(reveal, 450);
}

// The reCAPTCHA host is portaled into <body>, which only exists on the client.
const subscribeNothing = () => () => {};
const getPortalTarget = () => document.body;
const getServerPortalTarget = () => null;

function ErrorIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4M12 16h.01" />
    </svg>
  );
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
  const numberInputRef = useRef<HTMLInputElement>(null);
  const otpInputRef = useRef<HTMLInputElement>(null);
  const otpFieldRef = useRef<HTMLDivElement>(null);
  const otpFormRef = useRef<HTMLFormElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  // Set when the code reaches full length by typing/autofill; submits once on the next render.
  const autoSubmitArmed = useRef(false);
  const router = useRouter();
  const portalTarget = useSyncExternalStore(subscribeNothing, getPortalTarget, getServerPortalTarget);

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

  // Desktop: start typing right away. (Touch keyboards should open on the user's tap.)
  useEffect(() => {
    if (step === 'phone' && window.matchMedia('(pointer: fine)').matches) {
      numberInputRef.current?.focus();
    }
  }, [step]);

  // iOS offers the SMS code above the keyboard (autocomplete="one-time-code");
  // once all six digits land, verify without making them hunt for the button.
  useEffect(() => {
    if (!autoSubmitArmed.current) return;
    autoSubmitArmed.current = false;
    if (step !== 'otp' || loading || otp.length !== OTP_LENGTH) return;
    const form = otpFormRef.current;
    if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
  }, [otp, step, loading]);

  // A wrong code shakes the field (like the iOS passcode screen) and selects it for retyping.
  useEffect(() => {
    if (!error) return;
    haptic('warning');
    if (step !== 'otp') return;
    const input = otpInputRef.current;
    input?.focus();
    input?.select();
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduceMotion) {
      otpFieldRef.current?.animate(
        [0, -9, 8, -6, 4, -2, 0].map((x) => ({ transform: `translateX(${x}px)` })),
        { duration: 420, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
      );
    }
  }, [error, step]);

  return (
    <div className={styles.authWrapper}>
      {/* Invisible reCAPTCHA mounts here; rebuilt fresh on every send. It lives in <body>,
          outside the card: the card's backdrop-filter (like any filter or transform) makes
          Google's position:fixed badge pin to the card instead of the viewport corner,
          right over the submit button. Mounted for the phone step only, so the badge leaves with it. */}
      {step === 'phone' && portalTarget && createPortal(<div ref={recaptchaRef} data-recaptcha-host="" />, portalTarget)}

      {step === 'phone' ? (
        <form key="phone" onSubmit={handleSendOtp} className={`${styles.form} ${styles.phoneForm}`}>
          <div className={styles.inputGroup}>
            <label htmlFor="phoneNumber" className={styles.label}>Phone Number</label>
            <div className={styles.phoneRow}>
              {/* A label so a tap anywhere in the box (incl. the "+") focuses the input. */}
              <label className={`${styles.field} ${styles.codeField}`}>
                <span className={styles.plus} aria-hidden="true">+</span>
                <input
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="tel-country-code"
                  name="country-code"
                  enterKeyHint="next"
                  aria-label="Country code"
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  onKeyDown={(e) => {
                    // The keyboard's "next" key moves on to the number instead of submitting early.
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      numberInputRef.current?.focus();
                    }
                  }}
                  onFocus={() => keepVisibleAboveKeyboard(submitRef.current)}
                  placeholder="1"
                  disabled={loading}
                  className={styles.input}
                />
              </label>
              <div className={`${styles.field} ${styles.numberField}`}>
                <input
                  ref={numberInputRef}
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="tel-national"
                  name="phone"
                  enterKeyHint="send"
                  id="phoneNumber"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                  onFocus={() => keepVisibleAboveKeyboard(submitRef.current)}
                  placeholder="788 123 456"
                  required
                  disabled={loading}
                  aria-describedby={error ? 'auth-error' : undefined}
                  className={styles.input}
                />
              </div>
            </div>
          </div>

          {error && (
            <div id="auth-error" className={styles.errorMessage} role="alert">
              <ErrorIcon />
              <span>{error}</span>
            </div>
          )}

          <button
            ref={submitRef}
            type="submit"
            className={styles.button}
            disabled={loading}
          >
            {loading ? (
              <span className={styles.loader}>
                <span className={styles.spinner} aria-hidden="true" />
                Sending...
              </span>
            ) : (
              <>
                Receive Code
                <svg className={styles.buttonArrow} viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </>
            )}
          </button>
        </form>
      ) : (
        <form key="otp" ref={otpFormRef} onSubmit={handleVerifyOtp} className={styles.form}>
          <div className={styles.inputGroup}>
            <label htmlFor="otp" className={styles.label}>6-Digit Code</label>
            <p className={styles.hint}>
              Sent to <strong>+{countryCode} {phoneNumber}</strong>
            </p>
            <div ref={otpFieldRef} className={`${styles.field} ${styles.otpField}`}>
              <input
                ref={otpInputRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="one-time-code"
                name="one-time-code"
                enterKeyHint="done"
                id="otp"
                value={otp}
                onChange={(e) => {
                  const next = e.target.value.replace(/\D/g, '').slice(0, OTP_LENGTH);
                  if (next.length === OTP_LENGTH && otp.length !== OTP_LENGTH) autoSubmitArmed.current = true;
                  // Retyping after a wrong code clears the complaint, like the iOS passcode screen.
                  if (error) setError(null);
                  setOtp(next);
                }}
                onFocus={() => keepVisibleAboveKeyboard(submitRef.current)}
                placeholder="000000"
                maxLength={OTP_LENGTH}
                autoFocus
                required
                disabled={loading}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'auth-error' : undefined}
                className={styles.input}
              />
            </div>
          </div>

          {error && (
            <div id="auth-error" className={styles.errorMessage} role="alert">
              <ErrorIcon />
              <span>{error}</span>
            </div>
          )}

          <button
            ref={submitRef}
            type="submit"
            className={styles.button}
            disabled={loading}
          >
            {loading ? (
              <span className={styles.loader}>
                <span className={styles.spinner} aria-hidden="true" />
                Verifying...
              </span>
            ) : 'Verify & Sign In'}
          </button>

          <button
            type="button"
            className={styles.backButton}
            onClick={handleChangeNumber}
            disabled={loading}
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 12H5M11 18l-6-6 6-6" />
            </svg>
            Change Number
          </button>
        </form>
      )}
    </div>
  );
}
