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
} from '@/lib/telegram-settings';
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
  ensureTelegramSetup: () => Promise<boolean>;
  requestTVReminder: (opts: RequestTVReminderOpts) => Promise<void>;
  loading: boolean;
}

const ReminderContext = createContext<ReminderContextType | undefined>(undefined);

export const ReminderProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [reminders, setReminders] = useState<Record<number, ReminderItem>>({});
  const [loading, setLoading] = useState(true);
  const [telegramSettings, setTelegramSettings] = useState<TelegramSettings | null>(null);
  const [telegramSetupOpen, setTelegramSetupOpen] = useState(false);
  const [telegramSetupSaving, setTelegramSetupSaving] = useState(false);
  const pendingTelegramSetupResolver = useRef<((result: boolean) => void) | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerShow, setPickerShow] = useState<ContentItem | null>(null);
  const [pickerSaving, setPickerSaving] = useState(false);

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

  const addReminder = async (item: ReminderItem) => {
    if (!user) return;
    try {
      await addReminderToDb(item);
    } catch (error) {
      console.error('Error adding reminder:', error);
      throw error;
    }
  };

  const removeReminder = async (id: number) => {
    if (!user) return;
    try {
      await removeReminderFromDb(id);
    } catch (error) {
      console.error('Error removing reminder:', error);
      throw error;
    }
  };

  const hasReminder = (id: number) => !!reminders[id];

  const ensureTelegramSetup = async (): Promise<boolean> => {
    if (!user) return false;

    if (telegramSettings?.botToken && telegramSettings?.chatId) {
      return true;
    }

    return new Promise<boolean>((resolve) => {
      pendingTelegramSetupResolver.current = resolve;
      setTelegramSetupOpen(true);
    });
  };

  const resolveTelegramSetup = (result: boolean) => {
    pendingTelegramSetupResolver.current?.(result);
    pendingTelegramSetupResolver.current = null;
  };

  const handleCloseTelegramSetup = () => {
    setTelegramSetupOpen(false);
    resolveTelegramSetup(false);
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
          headers: { 'Content-Type': 'application/json' },
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

      setTelegramSetupOpen(false);
      resolveTelegramSetup(true);
    } catch (error) {
      console.error('Error saving Telegram settings:', error);
      throw error;
    } finally {
      setTelegramSetupSaving(false);
    }
  };

  const requestTVReminder = async ({ id, title, preloaded }: RequestTVReminderOpts) => {
    if (!user) return;
    if (reminders[id]) return;

    const telegramReady = await ensureTelegramSetup();
    if (!telegramReady) return;

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
    } catch (error) {
      console.error('Error saving TV reminder:', error);
    } finally {
      setPickerSaving(false);
    }
  };

  return (
    <ReminderContext.Provider value={{ reminders, addReminder, removeReminder, hasReminder, ensureTelegramSetup, requestTVReminder, loading }}>
      {children}
      <TelegramSetupModal
        open={telegramSetupOpen}
        loading={telegramSetupSaving}
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
