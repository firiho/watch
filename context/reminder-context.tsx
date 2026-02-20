'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { 
  collection, 
  onSnapshot,
  query
} from 'firebase/firestore';
import { useAuth } from './auth-context';
import { 
  ReminderItem, 
  addReminder as addReminderToDb, 
  removeReminder as removeReminderFromDb 
} from '@/lib/reminders';

interface ReminderContextType {
  reminders: Record<number, ReminderItem>;
  addReminder: (item: ReminderItem) => Promise<void>;
  removeReminder: (id: number) => Promise<void>;
  hasReminder: (id: number) => boolean;
  loading: boolean;
}

const ReminderContext = createContext<ReminderContextType | undefined>(undefined);

export const ReminderProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [reminders, setReminders] = useState<Record<number, ReminderItem>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setReminders({});
      setLoading(false);
      return;
    }

    // Path updated to users/{userId}/reminders
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

  return (
    <ReminderContext.Provider value={{ reminders, addReminder, removeReminder, hasReminder, loading }}>
      {children}
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
