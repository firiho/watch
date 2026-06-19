'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/context/auth-context';
import { useProfile } from '@/context/profile-context';
import { useReminders } from '@/context/reminder-context';
import { Genre } from '@/lib/tmdb';
import pageStyles from '../collections.module.css';
import styles from './settings.module.css';

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const { profile, updateProfile } = useProfile();
  const { telegramConnected, telegramSettings, openTelegramSetup, disconnectTelegram } = useReminders();

  const [name, setName] = useState('');
  const [genres, setGenres] = useState<Genre[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<number[]>([]);
  const [savingProfile, setSavingProfile] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

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

  const toggleGenre = (id: number) => {
    setSelectedGenres((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]));
  };

  const dirty =
    name.trim() !== (profile?.displayName ?? '') ||
    JSON.stringify([...selectedGenres].sort()) !== JSON.stringify([...(profile?.favoriteGenres ?? [])].sort());

  const handleSaveProfile = async () => {
    if (savingProfile) return;
    setSavingProfile(true);
    try {
      await updateProfile({ displayName: name.trim(), favoriteGenres: selectedGenres });
      toast.success('Profile saved');
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

  if (!user) {
    return (
      <div className={pageStyles.page}>
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>🔒</div>
          <h2 className={styles.emptyTitle}>Sign in to manage settings</h2>
          <p className={styles.emptyText}>Sign in to configure your profile and notifications.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={pageStyles.page}>
      <header className={styles.header}>
        <h1 className={pageStyles.title}>Settings</h1>
        <p className={pageStyles.description}>Manage your profile, notifications, and account.</p>
      </header>

      <div className={styles.sections}>
        {/* Profile */}
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <div className={styles.cardHeadTop}>
              <span className={styles.sectionIcon}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </span>
              <h2 className={styles.cardTitle}>Profile</h2>
            </div>
            <p className={styles.cardSubtitle}>How you appear across Watch. Pick favorite genres to tailor what you see.</p>
          </div>

          <label className={styles.fieldLabel} htmlFor="displayName">Display name</label>
          <input
            id="displayName"
            className={styles.input}
            type="text"
            placeholder="e.g. John Doe"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
          />

          <div className={styles.fieldLabel}>Favorite genres</div>
          <div className={styles.chips}>
            {genres.length === 0 ? (
              <span className={styles.muted}>Loading genres…</span>
            ) : (
              genres.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className={`${styles.chip} ${selectedGenres.includes(g.id) ? styles.chipActive : ''}`}
                  onClick={() => toggleGenre(g.id)}
                  aria-pressed={selectedGenres.includes(g.id)}
                >
                  {g.name}
                </button>
              ))
            )}
          </div>

          <div className={styles.cardActions}>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={handleSaveProfile}
              disabled={!dirty || savingProfile}
            >
              {savingProfile ? 'Saving…' : 'Save profile'}
            </button>
          </div>
        </section>

        {/* Notifications */}
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <div className={styles.cardHeadTop}>
              <span className={styles.sectionIcon}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              </span>
              <h2 className={styles.cardTitle}>Notifications</h2>
              <span className={`${styles.statusBadge} ${telegramConnected ? styles.connected : styles.disconnected}`}>
                {telegramConnected ? 'Telegram on' : 'In-app only'}
              </span>
            </div>
            <p className={styles.cardSubtitle}>
              Reminders always show up in-app. Connect Telegram to also get a push message when a title hits
              theaters, drops in HD, or a new episode airs.
            </p>
          </div>

          {telegramConnected && telegramSettings && (
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Chat ID</span>
              <span className={styles.detailValue}>{telegramSettings.chatId}</span>
            </div>
          )}

          <div className={styles.cardActions}>
            {telegramConnected ? (
              <>
                <button type="button" className={styles.secondaryBtn} onClick={openTelegramSetup}>
                  Reconfigure
                </button>
                <button type="button" className={styles.dangerBtn} onClick={handleDisconnect} disabled={disconnecting}>
                  {disconnecting ? 'Disconnecting…' : 'Disconnect'}
                </button>
              </>
            ) : (
              <button type="button" className={styles.primaryBtn} onClick={openTelegramSetup}>
                Connect Telegram
              </button>
            )}
          </div>
        </section>

        {/* Account */}
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <div className={styles.cardHeadTop}>
              <span className={styles.sectionIcon}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </span>
              <h2 className={styles.cardTitle}>Account</h2>
            </div>
            <p className={styles.cardSubtitle}>You&apos;re signed in with your phone number.</p>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Phone</span>
            <span className={styles.detailValue}>{user.phoneNumber || '—'}</span>
          </div>
          <div className={styles.cardActions}>
            <button type="button" className={styles.dangerBtn} onClick={() => signOut()}>
              Sign out
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
