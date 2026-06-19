'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  onSnapshot,
  query
} from 'firebase/firestore';
import { useAuth } from './auth-context';
import {
  ReminderItem,
  addReminder as addReminderToDb,
  removeReminder as removeReminderFromDb
} from '@/lib/reminders';
import {
  TelegramSettings,
  saveTelegramSettings,
  deleteTelegramSettings,
} from '@/lib/telegram-settings';
import { toast } from 'sonner';
import { authHeader } from '@/lib/auth-headers';
import TelegramSetupModal from '@/components/telegram-setup-modal/telegram-setup-modal';
import ReminderEpisodePicker, { ReminderTarget } from '@/components/reminder-episode-picker/reminder-episode-picker';
import { ContentItem } from '@/lib/tmdb';

interface RequestTVReminderOpts {
  id: number;
  title: string;
  preloaded?: ContentItem | null;
}

interface ReminderContextType {
  reminders: Record<number, ReminderItem>;
  addReminder: (item: ReminderItem) => Promise<void>;
  removeReminder: (id: number) => Promise<void>;
  hasReminder: (id: number) => boolean;
  requestTVReminder: (opts: RequestTVReminderOpts) => Promise<void>;
  telegramConnected: boolean;
  telegramSettings: TelegramSettings | null;
  openTelegramSetup: () => void;
  disconnectTelegram: () => Promise<void>;
  loading: boolean;
}

const ReminderContext = createContext<ReminderContextType | undefined>(undefined);

// Per-user localStorage flag so the optional Telegram offer is only shown once.
const offerDismissedKey = (uid: string) => `watch:tg-offer-dismissed:${uid}`;
const isOfferDismissed = (uid: string) => {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(offerDismissedKey(uid)) === '1';
  } catch {
    return false;
  }
};
const markOfferDismissed = (uid: string) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(offerDismissedKey(uid), '1');
  } catch {
    /* ignore */
  }
};

export const ReminderProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [reminders, setReminders] = useState<Record<number, ReminderItem>>({});
  const [loading, setLoading] = useState(true);
  const [telegramSettings, setTelegramSettings] = useState<TelegramSettings | null>(null);
  const [telegramSetupOpen, setTelegramSetupOpen] = useState(false);
  const [telegramSetupMode, setTelegramSetupMode] = useState<'optional' | 'required'>('required');
  const [telegramSetupSaving, setTelegramSetupSaving] = useState(false);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerShow, setPickerShow] = useState<ContentItem | null>(null);
  const [pickerSaving, setPickerSaving] = useState(false);

  const telegramConnected = !!(telegramSettings?.botToken && telegramSettings?.chatId);
  const telegramConnectedRef = useRef(telegramConnected);
  telegramConnectedRef.current = telegramConnected;

  useEffect(() => {
    if (!user) {
      setReminders({});
      setLoading(false);
      return;
    }

    const q = query(collection(db, 'users', user.uid, 'reminders'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: Record<number, ReminderItem> = {};
      snapshot.forEach((doc) => {
        items[parseInt(doc.id)] = doc.data() as ReminderItem;
      });
      setReminders(items);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) {
      setTelegramSettings(null);
      return;
    }

    const telegramDocRef = doc(db, 'users', user.uid, 'notifications', 'telegram');
    const unsubscribe = onSnapshot(telegramDocRef, (snapshot) => {
      setTelegramSettings(snapshot.exists() ? (snapshot.data() as TelegramSettings) : null);
    });

    return () => unsubscribe();
  }, [user]);

  // After a reminder is set, nudge the user about Telegram once — but only if they
  // haven't connected it and haven't already dismissed the offer. In-app bubbles
  // deliver regardless, so this is purely optional.
  const maybeOfferTelegram = () => {
    if (!user) return;
    if (telegramConnectedRef.current) return;
    if (isOfferDismissed(user.uid)) return;
    setTelegramSetupMode('optional');
    setTelegramSetupOpen(true);
  };

  const addReminder = async (item: ReminderItem) => {
    if (!user) return;
    try {
      await addReminderToDb(item);
      toast.success(`Reminder set for ${item.name}`);
      maybeOfferTelegram();
    } catch (error) {
      console.error('Error adding reminder:', error);
      toast.error('Could not set reminder. Please try again.');
      throw error;
    }
  };

  const removeReminder = async (id: number) => {
    if (!user) return;
    try {
      await removeReminderFromDb(id);
      toast.success('Reminder removed');
    } catch (error) {
      console.error('Error removing reminder:', error);
      toast.error('Could not remove reminder. Please try again.');
      throw error;
    }
  };

  const hasReminder = (id: number) => !!reminders[id];

  const openTelegramSetup = () => {
    setTelegramSetupMode('required');
    setTelegramSetupOpen(true);
  };

  const disconnectTelegram = async () => {
    try {
      await deleteTelegramSettings();
      toast.success('Telegram disconnected');
    } catch (error) {
      console.error('Error disconnecting Telegram:', error);
      toast.error('Could not disconnect Telegram.');
      throw error;
    }
  };

  const handleCloseTelegramSetup = () => {
    // Closing the optional offer counts as "skip" so we don't nag again.
    if (telegramSetupMode === 'optional' && user) {
      markOfferDismissed(user.uid);
    }
    setTelegramSetupOpen(false);
  };

  const handleCompleteTelegramSetup = async (config: { botToken: string; chatId: string }) => {
    try {
      setTelegramSetupSaving(true);
      await saveTelegramSettings({
        botToken: config.botToken,
        chatId: config.chatId,
      });

      try {
        const welcomeRes = await fetch('/api/telegram/send-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
          body: JSON.stringify({
            token: config.botToken,
            chatId: config.chatId,
            message: 'Welcome to Watch notifications. You will receive reminder updates here.',
          }),
        });
        if (!welcomeRes.ok) {
          const body = await welcomeRes.json().catch(() => ({}));
          throw new Error(body?.error || 'Telegram welcome message failed');
        }
      } catch (welcomeErr) {
        console.error('Failed to send Telegram welcome message:', welcomeErr);
      }

      if (user) markOfferDismissed(user.uid);
      setTelegramSetupOpen(false);
      toast.success('Telegram connected');
    } catch (error) {
      console.error('Error saving Telegram settings:', error);
      toast.error('Could not save Telegram settings.');
      throw error;
    } finally {
      setTelegramSetupSaving(false);
    }
  };

  const requestTVReminder = async ({ id, title, preloaded }: RequestTVReminderOpts) => {
    if (!user) return;
    if (reminders[id]) return;

    let show = preloaded ?? null;
    if (!show) {
      try {
        const res = await fetch(`/api/details?id=${id}&type=tv`);
        if (!res.ok) throw new Error('Failed to fetch show details');
        show = (await res.json()) as ContentItem;
      } catch (error) {
        console.error('Error loading show details for reminder:', error);
        return;
      }
    }

    if (!show.title) show.title = title;
    setPickerShow(show);
    setPickerOpen(true);
  };

  const handlePickerClose = () => {
    if (pickerSaving) return;
    setPickerOpen(false);
    setPickerShow(null);
  };

  const handlePickerConfirm = async (target: ReminderTarget) => {
    if (!pickerShow) return;
    setPickerSaving(true);
    try {
      let savedSeason: number | undefined;
      let savedEpisode: number | undefined;

      if (target.mode === 'next') {
        savedSeason = pickerShow.lastEpisode?.season;
        savedEpisode = pickerShow.lastEpisode?.episode;
      } else if (target.episode > 1) {
        savedSeason = target.season;
        savedEpisode = target.episode - 1;
      } else {
        savedSeason = Math.max(1, target.season - 1);
        savedEpisode = 9999;
      }

      await addReminderToDb({
        id: pickerShow.id,
        name: pickerShow.title,
        type: 'tv',
        season: savedSeason,
        episode: savedEpisode,
      });
      setPickerOpen(false);
      setPickerShow(null);
      toast.success(`Reminder set for ${pickerShow.title}`);
      maybeOfferTelegram();
    } catch (error) {
      console.error('Error saving TV reminder:', error);
      toast.error('Could not set reminder. Please try again.');
    } finally {
      setPickerSaving(false);
    }
  };

  return (
    <ReminderContext.Provider
      value={{
        reminders,
        addReminder,
        removeReminder,
        hasReminder,
        requestTVReminder,
        telegramConnected,
        telegramSettings,
        openTelegramSetup,
        disconnectTelegram,
        loading,
      }}
    >
      {children}
      <TelegramSetupModal
        open={telegramSetupOpen}
        loading={telegramSetupSaving}
        mode={telegramSetupMode}
        onClose={handleCloseTelegramSetup}
        onComplete={handleCompleteTelegramSetup}
      />
      <ReminderEpisodePicker
        open={pickerOpen}
        show={pickerShow}
        saving={pickerSaving}
        onClose={handlePickerClose}
        onConfirm={handlePickerConfirm}
      />
    </ReminderContext.Provider>
  );
};

export const useReminders = () => {
  const context = useContext(ReminderContext);
  if (context === undefined) {
    throw new Error('useReminders must be used within a ReminderProvider');
  }
  return context;
};
