'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/auth-context';
import { InboxItem, subscribeToInbox, markInboxItem } from '@/lib/inbox';
import { setCheckpoint } from '@/lib/checkpoints';
import styles from './inbox-popup.module.css';

const InboxPopup = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [minimized, setMinimized] = useState<Record<string, boolean>>({});
  const [acting, setActing] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!user) {
      setItems([]);
      setMinimized({});
      return;
    }
    const unsubscribe = subscribeToInbox(user.uid, setItems);
    return () => unsubscribe();
  }, [user]);

  if (!user || items.length === 0) return null;

  const handleConfirm = async (item: InboxItem) => {
    if (!user || acting[item.id]) return;
    setActing((m) => ({ ...m, [item.id]: true }));
    try {
      await setCheckpoint(user.uid, item.reminderId, item.season, item.episode);
      await markInboxItem(user.uid, item.id, 'confirmed');
    } catch (e) {
      console.error('Error confirming inbox item', e);
    } finally {
      setActing((m) => {
        const next = { ...m };
        delete next[item.id];
        return next;
      });
    }
  };

  const handleDismiss = async (item: InboxItem) => {
    if (!user || acting[item.id]) return;
    setActing((m) => ({ ...m, [item.id]: true }));
    try {
      await markInboxItem(user.uid, item.id, 'dismissed');
    } catch (e) {
      console.error('Error dismissing inbox item', e);
    } finally {
      setActing((m) => {
        const next = { ...m };
        delete next[item.id];
        return next;
      });
    }
  };

  const toggleMinimize = (id: string) => {
    setMinimized((m) => ({ ...m, [id]: !m[id] }));
  };

  return (
    <div className={styles.stack} aria-live="polite">
      {items.map((item) => {
        const isMin = !!minimized[item.id];
        const isActing = !!acting[item.id];
        const epLabel = `S${item.season}·E${item.episode}`;

        if (isMin) {
          return (
            <button
              key={item.id}
              type="button"
              className={styles.pill}
              onClick={() => toggleMinimize(item.id)}
              title="Expand reminder"
            >
              <span className={styles.pillDot} />
              <span className={styles.pillText}>
                <span className={styles.pillName}>{item.name}</span>
                <span className={styles.pillSep}>·</span>
                <span className={styles.pillEp}>{epLabel}</span>
              </span>
              <svg className={styles.pillChev} viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          );
        }

        return (
          <div key={item.id} className={styles.card} role="status">
            <div className={styles.cardHeader}>
              <div className={styles.headerText}>
                <span className={styles.kicker}>New episode</span>
                <span className={styles.cardTitle}>{item.name}</span>
              </div>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => toggleMinimize(item.id)}
                aria-label="Minimize"
                title="Minimize"
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" />
                </svg>
              </button>
            </div>

            <div className={styles.cardBody}>
              <span className={styles.epBadge}>{epLabel}</span>
              <span className={styles.bodyText}>just dropped — have you watched it?</span>
            </div>

            <div className={styles.cardActions}>
              <button
                type="button"
                className={`${styles.actionBtn} ${styles.primary}`}
                onClick={() => handleConfirm(item)}
                disabled={isActing}
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12.5L10 17L19 8" />
                </svg>
                Watched
              </button>
              <button
                type="button"
                className={styles.actionBtn}
                onClick={() => handleDismiss(item)}
                disabled={isActing}
              >
                Dismiss
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default InboxPopup;
