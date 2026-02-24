import { auth, db } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export interface TelegramSettings {
  botToken: string;
  chatId: string;
  createdAt?: string;
  updatedAt?: string;
}

export const getTelegramSettingsRef = (userId: string) =>
  doc(db, 'users', userId, 'notifications', 'telegram');

export const getTelegramSettings = async (): Promise<TelegramSettings | null> => {
  const user = auth.currentUser;
  if (!user) return null;

  const snap = await getDoc(getTelegramSettingsRef(user.uid));
  if (!snap.exists()) return null;
  return snap.data() as TelegramSettings;
};

export const saveTelegramSettings = async (settings: TelegramSettings): Promise<void> => {
  const user = auth.currentUser;
  if (!user) return;

  const now = new Date().toISOString();
  const ref = getTelegramSettingsRef(user.uid);
  const existing = await getDoc(ref);

  await setDoc(ref, {
    ...settings,
    chatId: String(settings.chatId),
    createdAt: existing.exists() ? (existing.data() as TelegramSettings).createdAt || now : now,
    updatedAt: now,
  });
};
