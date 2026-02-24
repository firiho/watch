'use client';

import { useEffect, useMemo, useState } from 'react';
import styles from './telegram-setup-modal.module.css';

interface TelegramSetupModalProps {
  open: boolean;
  loading?: boolean;
  onClose: () => void;
  onComplete: (config: { botToken: string; chatId: string }) => Promise<void>;
}

export default function TelegramSetupModal({
  open,
  loading = false,
  onClose,
  onComplete,
}: TelegramSetupModalProps) {
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const updatesUrlPreview = useMemo(() => {
    if (!botToken.trim()) return 'https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates';
    return `https://api.telegram.org/bot${botToken.trim()}/getUpdates`;
  }, [botToken]);

  useEffect(() => {
    if (!open) return;
    setBotToken('');
    setChatId('');
    setCheckingUpdates(false);
    setError(null);
    setInfo(null);
  }, [open]);

  if (!open) return null;

  const handleCheckUpdates = async () => {
    const token = botToken.trim();
    if (!token) {
      setError('Paste your Telegram bot token first.');
      return;
    }

    setCheckingUpdates(true);
    setError(null);
    setInfo(null);

    try {
      const res = await fetch('/api/telegram/get-updates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || 'Failed to fetch Telegram updates.');
      }

      if (!json.chatId) {
        setInfo('No chat ID found yet. Make sure you sent any message to your bot, then click again.');
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
      setError('Bot token is required.');
      return;
    }
    if (!chat) {
      setError('Chat ID not found yet. Click "I have texted the bot" first.');
      return;
    }

    setError(null);
    try {
      await onComplete({ botToken: token, chatId: chat });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save Telegram settings.');
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <h3 className={styles.title}>Set Up Telegram Notifications</h3>
            <p className={styles.subtitle}>
              One-time setup. We&apos;ll use your bot token + chat ID so reminders can be sent directly to your Telegram.
            </p>
          </div>
          <button className={styles.close} onClick={onClose} aria-label="Close Telegram setup">
            ×
          </button>
        </div>

        <div className={styles.section}>
          <label className={styles.fieldLabel} htmlFor="telegram-bot-token">
            Telegram Bot Token
            <span className={styles.helpWrap} tabIndex={0}>
              <span className={styles.helpIcon}>?</span>
              <span className={styles.tooltip}>
                A bot token is the secret string from BotFather that lets your bot send messages.
                It usually looks like `123456789:AA...`. Create one via Telegram&apos;s @BotFather if needed.
              </span>
            </span>
          </label>
          <input
            id="telegram-bot-token"
            className={styles.input}
            type="password"
            placeholder="123456789:AA..."
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>How to get your chat ID</h4>
          <p className={styles.sectionText}>
            1. Open Telegram and send any message to your bot. 2. Then click the button below so we can read the bot updates.
            We pull the chat ID from <code>result[0].message.chat.id</code> (or the latest message that has one).
          </p>
          <div className={styles.monoBox}>{updatesUrlPreview}</div>
          <div className={styles.actions}>
            <button
              type="button"
              className={`${styles.button} ${styles.primary}`}
              onClick={handleCheckUpdates}
              disabled={checkingUpdates || loading}
            >
              {checkingUpdates ? 'Checking...' : 'I Have Texted the Bot'}
            </button>
          </div>
          {chatId && (
            <div className={styles.chatIdBox}>
              <span className={styles.chatIdLabel}>Detected Chat ID</span>
              <span className={styles.chatIdValue}>{chatId}</span>
            </div>
          )}
          {info && <p className={styles.success}>{info}</p>}
          {error && <p className={styles.error}>{error}</p>}
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.button} onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            type="button"
            className={`${styles.button} ${styles.primary}`}
            onClick={handleSave}
            disabled={loading}
          >
            {loading ? 'Saving...' : 'Save Telegram & Enable Notifications'}
          </button>
        </div>
      </div>
    </div>
  );
}
