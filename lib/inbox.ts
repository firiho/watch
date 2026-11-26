import { db } from './firebase';
import { collection, doc, query, where, onSnapshot, updateDoc, Timestamp } from 'firebase/firestore';

interface BaseInboxItem {
  id: string;
  reminderId: number;
  name: string;
  deliveredAt?: Timestamp;
  status: 'unread' | 'dismissed' | 'confirmed';
}

export interface TVInboxItem extends BaseInboxItem {
  type: 'tv';
  season: number;
  episode: number;
}

export interface MovieInboxItem extends BaseInboxItem {
  type: 'movie';
  milestone: 'theaters' | 'hd';
}

export type InboxItem = TVInboxItem | MovieInboxItem;

/**
 * Live unread inbox for `uid`, newest first. `onError` fires if the listener
 * dies (permissions, network); Firestore does not resume a failed listener, so
 * subscribe again to retry.
 */
export const subscribeToInbox = (
  uid: string,
  onChange: (items: InboxItem[]) => void,
  onError?: (error: Error) => void
): (() => void) => {
  const q = query(
    collection(db, 'users', uid, 'inbox'),
    where('status', '==', 'unread')
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const items: InboxItem[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<InboxItem, 'id'>),
      }) as InboxItem);
      items.sort((a, b) => {
        const aMs = a.deliveredAt?.toMillis?.() ?? 0;
        const bMs = b.deliveredAt?.toMillis?.() ?? 0;
        return bMs - aMs;
      });
      onChange(items);
    },
    (error) => {
      console.error('Inbox listener failed', error);
      onError?.(error);
    }
  );
};

export const markInboxItem = async (
  uid: string,
  itemId: string,
  status: 'dismissed' | 'confirmed'
): Promise<void> => {
  const ref = doc(db, 'users', uid, 'inbox', itemId);
  await updateDoc(ref, { status });
};
