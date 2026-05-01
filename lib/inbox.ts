import { db } from './firebase';
import { collection, doc, query, where, onSnapshot, updateDoc, Timestamp } from 'firebase/firestore';

export interface InboxItem {
  id: string;
  reminderId: number;
  type: 'tv';
  name: string;
  season: number;
  episode: number;
  deliveredAt?: Timestamp;
  status: 'unread' | 'dismissed' | 'confirmed';
}

export const subscribeToInbox = (
  uid: string,
  onChange: (items: InboxItem[]) => void
): (() => void) => {
  const q = query(
    collection(db, 'users', uid, 'inbox'),
    where('status', '==', 'unread')
  );
  return onSnapshot(q, (snapshot) => {
    const items: InboxItem[] = snapshot.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<InboxItem, 'id'>),
    }));
    items.sort((a, b) => {
      const aMs = a.deliveredAt?.toMillis?.() ?? 0;
      const bMs = b.deliveredAt?.toMillis?.() ?? 0;
      return bMs - aMs;
    });
    onChange(items);
  });
};

export const markInboxItem = async (
  uid: string,
  itemId: string,
  status: 'dismissed' | 'confirmed'
): Promise<void> => {
  const ref = doc(db, 'users', uid, 'inbox', itemId);
  await updateDoc(ref, { status });
};
