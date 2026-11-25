'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/context/auth-context';
import { useProfile } from '@/context/profile-context';
import { useReminders } from '@/context/reminder-context';
import { Genre } from '@/lib/tmdb';
import { haptic } from '@/lib/haptics';
import pageStyles from '../collections.module.css';
import styles from './settings.module.css';

/** `<input type="checkbox" switch>` renders a native switch in Safari 17.4+ (and ticks the iOS 18 haptic). */
const NATIVE_SWITCH = { switch: '' } as Record<string, string>;

const SAVED_FLASH_MS = 1800;

function Icon({ name }: { name: 'bell' | 'send' | 'phone' | 'chevron' | 'check' | 'lock' | 'user' }) {
  const paths: Record<typeof name, React.ReactNode> = {
    bell: (
      <>
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </>
    ),
    send: (
      <>
        <path d="m22 2-7 20-4-9-9-4Z" />
        <path d="M22 2 11 13" />
      </>
    ),
    phone: (
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />
    ),
    chevron: <path d="m9 18 6-6-6-6" />,
    check: <path d="M20 6 9 17l-5-5" />,
    lock: (
      <>
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </>
    ),
    user: (
      <>
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function SettingsSkeleton() {
  return (
    <div className={styles.shell} aria-busy="true" aria-label="Loading settings">
      <div className={`${styles.skeleton} ${styles.skeletonTitle}`} />
      <div className={`${styles.skeleton} ${styles.skeletonText}`} />
      <div className={`${styles.skeleton} ${styles.skeletonIdentity}`} />
      {[0, 1, 2].map((index) => (
        <div key={index} className={styles.group}>
          <div className={`${styles.skeleton} ${styles.skeletonGroupTitle}`} />
          <div className={`${styles.skeleton} ${styles.skeletonCard}`} />
        </div>
      ))}
    </div>
  );
}

export default function SettingsPage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const { profile, label, loading: profileLoading, updateProfile } = useProfile();
  const { telegramConnected, telegramSettings, openTelegramSetup, disconnectTelegram } = useReminders();

  const [name, setName] = useState('');
  const [genres, setGenres] = useState<Genre[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<number[]>([]);
  const [savingProfile, setSavingProfile] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const savedTimer = useRef<number | undefined>(undefined);

  // Hydrate the form from the profile (once loaded / when it changes externally).
  useEffect(() => {
    setName(profile?.displayName ?? '');
    setSelectedGenres(profile?.favoriteGenres ?? []);
  }, [profile?.displayName, profile?.favoriteGenres]);

  useEffect(() => {
    let active = true;
    fetch('/api/genres?type=movie')
      .then((res) => res.json())
      .then((data) => {
        if (active) setGenres(data.genres || []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => () => window.clearTimeout(savedTimer.current), []);

  // Once Telegram is gone (disconnected here or elsewhere), there's nothing left to confirm.
  useEffect(() => {
    if (!telegramConnected) setConfirmingDisconnect(false);
  }, [telegramConnected]);

  const toggleGenre = (id: number) => {
    haptic('selection');
    setSelectedGenres((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]));
  };

  const dirty =
    name.trim() !== (profile?.displayName ?? '') ||
    JSON.stringify([...selectedGenres].sort()) !== JSON.stringify([...(profile?.favoriteGenres ?? [])].sort());

  const handleSaveProfile = async () => {
    if (savingProfile) return;
    haptic('light');
    setSavingProfile(true);
    try {
      await updateProfile({ displayName: name.trim(), favoriteGenres: selectedGenres });
      toast.success('Profile saved');
      setJustSaved(true);
      window.clearTimeout(savedTimer.current);
      savedTimer.current = window.setTimeout(() => setJustSaved(false), SAVED_FLASH_MS);
    } catch {
      toast.error('Could not save profile. Please try again.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleDisconnect = async () => {
    if (disconnecting) return;
    setDisconnecting(true);
    try {
      await disconnectTelegram();
    } catch {
      /* toast handled in context */
    } finally {
      setDisconnecting(false);
    }
  };

  const handleTelegramSwitch = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      // Turning it back on while the confirm is open just means "keep it".
      if (confirmingDisconnect) {
        setConfirmingDisconnect(false);
        return;
      }
      openTelegramSetup();
    } else {
      // Disconnecting throws away the bot token + chat ID, so confirm first.
      setConfirmingDisconnect(true);
    }
  };

  if (!user) {
    return (
      <div className={pageStyles.page}>
        {authLoading ? (
          <SettingsSkeleton />
        ) : (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <Icon name="lock" />
            </div>
            <h1 className={styles.emptyTitle}>Sign in to manage settings</h1>
            <p className={styles.emptyText}>Sign in to configure your profile and notifications.</p>
            <Link href="/auth" className={styles.emptyAction}>
              Sign in
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Link>
          </div>
        )}
      </div>
    );
  }

  const initial = (profile?.displayName?.trim()?.[0] ?? '').toUpperCase();
  const telegramChecked = telegramConnected && !confirmingDisconnect;

  return (
    <div className={pageStyles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <h1 className={pageStyles.title}>Settings</h1>
          <p className={pageStyles.description}>Manage your profile, notifications, and account.</p>
        </header>

        <section className={styles.identity} aria-label="Signed in as">
          <span className={styles.avatar} aria-hidden="true">
            {initial || <Icon name="user" />}
          </span>
          <span className={styles.identityText}>
            <span className={styles.identityName}>{label}</span>
            {user.phoneNumber && label !== user.phoneNumber && (
              <span className={styles.identityMeta}>{user.phoneNumber}</span>
            )}
          </span>
        </section>

        {/* Profile: name + favorite genres share one save action */}
        <div className={styles.profileBlock}>
          <section className={styles.group} aria-labelledby="settings-profile-title">
            <h2 id="settings-profile-title" className={styles.groupTitle}>Profile</h2>
            <div className={styles.card}>
              <label className={`${styles.row} ${styles.inputRow}`} htmlFor="displayName">
                <span className={styles.rowLabel}>Display name</span>
                <input
                  id="displayName"
                  className={styles.rowInput}
                  type="text"
                  placeholder={profileLoading ? 'Loading…' : 'Add a name'}
                  value={name}
                  maxLength={40}
                  autoComplete="nickname"
                  autoCapitalize="words"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="done"
                  disabled={profileLoading}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                  }}
                />
              </label>
            </div>
            <p className={styles.groupFooter}>How you appear across Watch.</p>
          </section>

          <section className={styles.group} aria-labelledby="settings-genres-title">
            <h2 id="settings-genres-title" className={styles.groupTitle}>
              Favorite genres
              {selectedGenres.length > 0 && <span className={styles.groupCount}>{selectedGenres.length} selected</span>}
            </h2>
            <div className={`${styles.card} ${styles.cardPadded}`}>
              <div className={styles.chips}>
                {genres.length === 0
                  ? Array.from({ length: 12 }).map((_, index) => (
                      <span key={index} className={`${styles.skeleton} ${styles.chipSkeleton}`} aria-hidden="true" />
                    ))
                  : genres.map((g) => {
                      const selected = selectedGenres.includes(g.id);
                      return (
                        <button
                          key={g.id}
                          type="button"
                          className={`${styles.chip} ${selected ? styles.chipActive : ''}`}
                          onClick={() => toggleGenre(g.id)}
                          aria-pressed={selected}
                        >
                          <span className={styles.chipCheck} aria-hidden="true">
                            <Icon name="check" />
                          </span>
                          {g.name}
                        </button>
                      );
                    })}
                {genres.length === 0 && <span className="sr-only">Loading genres…</span>}
              </div>
            </div>
            <p className={styles.groupFooter}>Pick favorite genres to tailor what you see.</p>
          </section>

          <div className={`${styles.saveRow} ${dirty ? styles.saveRowDirty : ''}`}>
            <button
              type="button"
              className={`${styles.saveButton} ${justSaved && !dirty ? styles.saveButtonDone : ''}`}
              onClick={handleSaveProfile}
              disabled={!dirty || savingProfile}
              aria-live="polite"
            >
              {savingProfile ? (
                <>
                  <span className={styles.spinner} aria-hidden="true" />
                  Saving…
                </>
              ) : justSaved && !dirty ? (
                <>
                  <Icon name="check" />
                  Saved
                </>
              ) : (
                'Save profile'
              )}
            </button>
          </div>
        </div>

        {/* Notifications */}
        <section className={styles.group} aria-labelledby="settings-notifications-title">
          <h2 id="settings-notifications-title" className={styles.groupTitle}>Notifications</h2>
          <div className={styles.card}>
            <div className={styles.row}>
              <span className={`${styles.rowIcon} ${styles.rowIconAccent}`}>
                <Icon name="bell" />
              </span>
              <span className={styles.rowLabel}>In-app reminders</span>
              <span className={styles.rowValue}>Always on</span>
            </div>

            <label className={`${styles.row} ${styles.switchRow}`} htmlFor="telegram-switch">
              <span className={`${styles.rowIcon} ${styles.rowIconTelegram}`}>
                <Icon name="send" />
              </span>
              <span className={styles.rowText}>
                <span className={styles.rowLabel}>Telegram</span>
                <span className={styles.rowSub}>
                  {telegramConnected ? 'Connected — pushes are on' : 'Off — in-app only'}
                </span>
              </span>
              <input
                id="telegram-switch"
                type="checkbox"
                role="switch"
                {...NATIVE_SWITCH}
                className={styles.switch}
                checked={telegramChecked}
                onChange={handleTelegramSwitch}
                disabled={disconnecting}
                aria-checked={telegramChecked}
              />
            </label>

            {telegramConnected && telegramSettings && (
              <>
                <div className={styles.row}>
                  <span className={styles.rowLabel}>Chat ID</span>
                  <span className={`${styles.rowValue} ${styles.mono}`}>{telegramSettings.chatId}</span>
                </div>
                <button type="button" className={`${styles.row} ${styles.rowButton}`} onClick={openTelegramSetup}>
                  <span className={styles.rowLabel}>Reconfigure</span>
                  <span className={styles.rowChevron}>
                    <Icon name="chevron" />
                  </span>
                </button>
              </>
            )}

            {confirmingDisconnect && telegramConnected && (
              <div className={styles.confirm} role="group" aria-labelledby="telegram-confirm-text">
                <p id="telegram-confirm-text" className={styles.confirmText}>
                  Disconnect Telegram? You&apos;ll need your bot token and chat ID to connect again.
                </p>
                <div className={styles.confirmActions}>
                  <button
                    type="button"
                    className={styles.secondaryBtn}
                    onClick={() => setConfirmingDisconnect(false)}
                    disabled={disconnecting}
                  >
                    Keep
                  </button>
                  <button
                    type="button"
                    className={styles.dangerBtn}
                    onClick={() => {
                      haptic('warning');
                      handleDisconnect();
                    }}
                    disabled={disconnecting}
                  >
                    {disconnecting ? 'Disconnecting…' : 'Disconnect'}
                  </button>
                </div>
              </div>
            )}
          </div>
          <p className={styles.groupFooter}>
            Reminders always show up in-app. Connect Telegram to also get a push message when a title hits
            theaters, drops in HD, or a new episode airs.
          </p>
        </section>

        {/* Account */}
        <section className={styles.group} aria-labelledby="settings-account-title">
          <h2 id="settings-account-title" className={styles.groupTitle}>Account</h2>
          <div className={styles.card}>
            <div className={styles.row}>
              <span className={`${styles.rowIcon} ${styles.rowIconNeutral}`}>
                <Icon name="phone" />
              </span>
              <span className={styles.rowLabel}>Phone</span>
              <span className={`${styles.rowValue} ${styles.mono}`}>{user.phoneNumber || '—'}</span>
            </div>
            <button type="button" className={`${styles.row} ${styles.rowButton} ${styles.rowDanger}`} onClick={() => signOut()}>
              Sign out
            </button>
          </div>
          <p className={styles.groupFooter}>You&apos;re signed in with your phone number.</p>
        </section>
      </div>
    </div>
  );
}
