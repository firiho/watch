import { db } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export interface Checkpoint {
  seasonNumber: number;
  episodeNumber: number;
  timestamp: string;
}

export const getCheckpoint = async (uid: string, tvshowid: number): Promise<Checkpoint | null> => {
  if (!uid || !tvshowid) return null;
  const docRef = doc(db, 'users', uid, 'checkpoints', tvshowid.toString());
  const snapshot = await getDoc(docRef);
  if (snapshot.exists()) {
    return snapshot.data() as Checkpoint;
  }
  return null;
};

export const setCheckpoint = async (uid: string, tvshowid: number, seasonNumber: number, episodeNumber: number): Promise<void> => {
  if (!uid || !tvshowid) return;
  const docRef = doc(db, 'users', uid, 'checkpoints', tvshowid.toString());
  await setDoc(docRef, {
    seasonNumber,
    episodeNumber,
    timestamp: new Date().toISOString()
  }, { merge: true });
};
