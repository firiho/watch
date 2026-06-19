'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { onSnapshot } from 'firebase/firestore';
import { useAuth } from './auth-context';
import { UserProfile, getUserProfileRef, saveUserProfile } from '@/lib/profile';

interface ProfileContextType {
  profile: UserProfile | null;
  /** displayName if set, otherwise the phone number, otherwise a generic label. */
  label: string;
  loading: boolean;
  updateProfile: (data: Partial<UserProfile>) => Promise<void>;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

export const ProfileProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = onSnapshot(
      getUserProfileRef(user.uid),
      (snap) => {
        setProfile(snap.exists() ? (snap.data() as UserProfile) : {});
        setLoading(false);
      },
      (error) => {
        console.error('Error subscribing to profile:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const updateProfile = async (data: Partial<UserProfile>) => {
    await saveUserProfile(data);
  };

  const label = profile?.displayName?.trim() || user?.phoneNumber || 'Account';

  return (
    <ProfileContext.Provider value={{ profile, label, loading, updateProfile }}>
      {children}
    </ProfileContext.Provider>
  );
};

export const useProfile = () => {
  const context = useContext(ProfileContext);
  if (context === undefined) {
    throw new Error('useProfile must be used within a ProfileProvider');
  }
  return context;
};
