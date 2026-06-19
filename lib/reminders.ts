import { db, auth } from './firebase';
import { collection, doc, setDoc, deleteDoc, getDoc, getDocs, query, where } from 'firebase/firestore';

export interface ReminderItem {
  id: number;
  name: string;
  type: 'movie' | 'tv';
  /** @deprecated legacy HD flag — kept in sync with notifiedHD for older docs */
  notified?: boolean;
  notifiedTheaters?: boolean; // notified that the movie hit theaters (TMDB type 3)
  notifiedHD?: boolean; // notified that the movie is out in HD/digital (TMDB type 4)
  season?: number;
  episode?: number;
  timestamp?: string;
}

export const addReminder = async (item: ReminderItem) => {
  const user = auth.currentUser;
  if (!user) return;

  const reminderRef = doc(db, 'users', user.uid, 'reminders', item.id.toString());
  
  const data: any = {
    ...item,
    timestamp: new Date().toISOString(),
  };

  if (item.type === 'movie') {
    // Track theatrical (type 3) and HD (type 4) milestones independently. The
    // scheduler uses `timestamp` as a baseline so milestones already passed at
    // add-time are marked silently instead of firing a stale notification.
    data.notifiedTheaters = item.notifiedTheaters ?? false;
    data.notifiedHD = item.notifiedHD ?? item.notified ?? false;
  }

  // Remove undefined fields for Firestore compatibility
  Object.keys(data).forEach(key => data[key] === undefined && delete data[key]);

  await setDoc(reminderRef, data);
};

export const removeReminder = async (itemId: number) => {
  const user = auth.currentUser;
  if (!user) return;

  const reminderRef = doc(db, 'users', user.uid, 'reminders', itemId.toString());
  await deleteDoc(reminderRef);
};

export const hasReminder = async (itemId: number): Promise<boolean> => {
  const user = auth.currentUser;
  if (!user) return false;

  const reminderRef = doc(db, 'users', user.uid, 'reminders', itemId.toString());
  const docSnap = await getDoc(reminderRef);
  return docSnap.exists();
};

export const getReminders = async (): Promise<ReminderItem[]> => {
  const user = auth.currentUser;
  if (!user) return [];

  const remindersRef = collection(db, 'users', user.uid, 'reminders');
  const querySnap = await getDocs(remindersRef);
  
  return querySnap.docs.map(doc => doc.data() as ReminderItem);
};
