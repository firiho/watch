import { db, auth } from './firebase';
import { doc, setDoc } from 'firebase/firestore';

export interface UserProfile {
  displayName?: string;
  favoriteGenres?: number[];
  updatedAt?: string;
}

export const getUserProfileRef = (uid: string) => doc(db, 'users', uid);

// Merge-writes profile fields onto the user's root document.
export const saveUserProfile = async (data: Partial<UserProfile>): Promise<void> => {
  const user = auth.currentUser;
  if (!user) return;
  await setDoc(
    getUserProfileRef(user.uid),
    { ...data, updatedAt: new Date().toISOString() },
    { merge: true }
  );
};
