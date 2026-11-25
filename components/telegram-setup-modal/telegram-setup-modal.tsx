'use client';

import { useId, useMemo, useState } from 'react';
import { authHeader } from '@/lib/auth-headers';
import { haptic } from '@/lib/haptics';
import SheetDialog from '@/components/reminder-episode-picker/sheet-dialog';
import styles from './telegram-setup-modal.module.css';

interface TelegramSetupModalProps {
  open: boolean;
  loading?: boolean;
  mode?: 'optional' | 'required';
  onClose: () => void;
  onComplete: (config: { botToken: string; chatId: string }) => Promise<void>;
}

export default function TelegramSetupModal({
  open,
  loading = false,
  mode = 'required',
  onClose,
  onComplete,
}: TelegramSetupModalProps) {
  const isOptional = mode === 'optional';
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);

  const titleId = useId();
  const descId = useId();
  const helpId = useId();

  // Start fresh on every open. Done during render (not in an effect) so the previous
  // session's token never paints, even for a frame, in the URL preview.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setBotToken('');
      setChatId('');
      setCheckingUpdates(false);
      setError(null);
      setInfo(null);
      setShowToken(false);
      setHelpOpen(false);
    }
  }

  const updatesUrlPreview = useMemo(() => {
    if (!botToken.trim()) return 'https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates';
    return `https://api.telegram.org/bot${botToken.trim()}/getUpdates`;
  }, [botToken]);

  const handleCheckUpdates = async () => {
    const token = botToken.trim();
    if (!token) {
      haptic('warning');
      setError('Paste your Telegram bot token first.');
      return;
    }

    haptic('light');
    setCheckingUpdates(true);
    setError(null);
    setInfo(null);

    try {
      const res = await fetch('/api/telegram/get-updates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ token }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || 'Failed to fetch Telegram updates.');
      }

      if (!json.chatId) {
        setInfo('No chat ID found yet. Make sure you sent any message to your bot, then try again.');
        return;
      }

      setChatId(String(json.chatId));
      setInfo(`Chat ID found from latest message${json.chatTitle ? ` (${json.chatTitle})` : ''}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch Telegram updates.');
    } finally {
      setCheckingUpdates(false);
    }
  };

  const handleSave = async () => {
    const token = botToken.trim();
    const chat = chatId.trim();

    if (!token) {
      haptic('warning');
      setError('Bot token is required.');
      return;
    }
    if (!chat) {
      haptic('warning');
      setError('Chat ID not found yet. Use "I\'ve texted the bot" first.');
      return;
    }

    haptic('light');
    setError(null);
    try {
      await onComplete({ botToken: token, chatId: chat });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save Telegram settings.');
    }
  };

  return (
    <SheetDialog
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      describedBy={descId}
      closeLabel="Close Telegram setup"
      zIndex={2100}
      panelClassName={styles.panel}
    >
      <div className={styles.scroll}>
        <header className={styles.header}>
          <span className={styles.appIcon} aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.5 3.5L2.8 10.7c-.9.35-.85 1.64.07 1.93l4.63 1.47 1.8 5.5c.27.83 1.33 1.07 1.93.43l2.55-2.67 4.6 3.4c.66.49 1.6.12 1.76-.69L23.1 4.9c.2-.98-.74-1.77-1.6-1.4z" />
              <path d="M7.5 14.1L19 6.5l-8.7 9.3" />
            </svg>
          </span>
          <p className={styles.eyebrow}>{isOptional ? 'optional extra' : 'notifications'}</p>
          <h2 id={titleId} className={styles.title}>
            {isOptional ? 'Want Telegram pings too?' : 'Set up Telegram notifications'}
          </h2>
          <p id={descId} className={styles.subtitle}>
            {isOptional
              ? 'Optional — your reminders already show up in-app. Connect Telegram if you also want a push message. You can do this later from Settings.'
              : "One-time setup. We'll use your bot token + chat ID so reminders can be sent directly to your Telegram."}
          </p>
        </header>

        <section className={styles.step}>
          <div className={styles.stepHead}>
            <span className={styles.stepNum} aria-hidden="true">
              01.
            </span>
            <label className={styles.stepTitle} htmlFor="telegram-bot-token">
              Bot token
            </label>
            <button
              type="button"
              className={styles.helpBtn}
              aria-expanded={helpOpen}
              aria-controls={helpId}
              aria-label="What is a bot token?"
              onClick={() => setHelpOpen((v) => !v)}
            >
              ?
            </button>
          </div>

          <p id={helpId} className={styles.help} hidden={!helpOpen}>
            A bot token is the secret string from BotFather that lets your bot send messages. It usually looks like{' '}
            <code>123456789:AA...</code>. Create one via Telegram&apos;s @BotFather if needed.
          </p>

          <div className={styles.inputWrap}>
            <input
              id="telegram-bot-token"
              className={styles.input}
              type={showToken ? 'text' : 'password'}
              placeholder="123456789:AA..."
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="done"
            />
            <button
              type="button"
              className={styles.reveal}
              onClick={() => setShowToken((v) => !v)}
              aria-label={showToken ? 'Hide token' : 'Show token'}
              aria-pressed={showToken}
            >
              {showToken ? (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 3l18 18" />
                  <path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
                  <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
        </section>

        <section className={styles.step}>
          <div className={styles.stepHead}>
            <span className={styles.stepNum} aria-hidden="true">
              02.
            </span>
            <h3 className={styles.stepTitle}>How to get your chat ID</h3>
          </div>

          <ol className={styles.instructions}>
            <li>Open Telegram and send any message to your bot.</li>
            <li>Then use the button below so we can read the bot updates.</li>
          </ol>
          <p className={styles.fine}>
            We pull the chat ID from <code>result[0].message.chat.id</code> (or the latest message that has one).
          </p>
          <div className={styles.monoBox}>{updatesUrlPreview}</div>

          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={handleCheckUpdates}
            disabled={checkingUpdates || loading}
            aria-busy={checkingUpdates}
          >
            {checkingUpdates ? (
              <>
                <span className={styles.spinner} aria-hidden="true" />
                Checking…
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
                  <path d="M21 3v5h-5" />
                </svg>
                I&apos;ve texted the bot
              </>
            )}
          </button>

          {chatId && (
            <div className={styles.chatIdBox}>
              <span className={styles.chatIdCheck} aria-hidden="true">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12.5L10 17L19 8" />
                </svg>
              </span>
              <span className={styles.chatIdText}>
                <span className={styles.chatIdLabel}>Detected chat ID</span>
                <span className={styles.chatIdValue}>{chatId}</span>
              </span>
            </div>
          )}
          {info && (
            <p className={styles.success} role="status">
              {info}
            </p>
          )}
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </section>
      </div>

      <footer className={styles.footer}>
        <button type="button" className={styles.ghostBtn} onClick={onClose} disabled={loading}>
          {isOptional ? 'Skip for now' : 'Cancel'}
        </button>
        <button
          type="button"
          className={styles.primaryBtn}
          onClick={handleSave}
          disabled={loading}
          aria-busy={loading}
        >
          {loading ? (
            <>
              <span className={styles.spinnerInk} aria-hidden="true" />
              Saving…
            </>
          ) : (
            'Save & enable'
          )}
        </button>
      </footer>
    </SheetDialog>
  );
}
