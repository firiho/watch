'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { addToWatchlist, removeFromWatchlist } from '@/lib/watchlist';
import { useAuth } from '@/context/auth-context';

interface WatchlistContextType {
  watchlist: Set<number>;
  loading: boolean;
  addItem: (item: any, mediaType: 'movie' | 'tv') => Promise<void>;
  removeItem: (id: number) => Promise<void>;
  isInList: (id: number) => boolean;
}

const WatchlistContext = createContext<WatchlistContextType>({
  watchlist: new Set(),
  loading: true,
  addItem: async () => {},
  removeItem: async () => {},
  isInList: () => false,
});

export const useWatchlist = () => useContext(WatchlistContext);

export const WatchlistProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [watchlist, setWatchlist] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  // Live subscription so the list stays in sync across tabs and after external writes.
  useEffect(() => {
    if (!user) {
      setWatchlist(new Set());
      setLoading(false);
      return;
    }

    setLoading(true);
    const ref = collection(db, 'users', user.uid, 'watchlist');
    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        setWatchlist(new Set(snapshot.docs.map((d) => Number(d.id))));
        setLoading(false);
      },
      (error) => {
        console.error('Error subscribing to watchlist:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const addItem = useCallback(async (item: any, mediaType: 'movie' | 'tv') => {
    // Optimistic update; the snapshot listener will reconcile.
    setWatchlist((prev) => new Set(prev).add(item.id));
    try {
      await addToWatchlist(item, mediaType);
      toast.success(`Added ${item.title || item.name || 'title'} to your list`);
    } catch (error) {
      console.error('Error adding to watchlist:', error);
      setWatchlist((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      toast.error('Could not add to your list. Please try again.');
    }
  }, []);

  const removeItem = useCallback(async (id: number) => {
    const wasInList = watchlist.has(id);
    setWatchlist((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    try {
      await removeFromWatchlist(id);
      toast.success('Removed from your list');
    } catch (error) {
      console.error('Error removing from watchlist:', error);
      if (wasInList) setWatchlist((prev) => new Set(prev).add(id));
      toast.error('Could not remove from your list. Please try again.');
    }
  }, [watchlist]);

  const isInList = useCallback((id: number) => {
    return watchlist.has(id);
  }, [watchlist]);

  return (
    <WatchlistContext.Provider value={{ watchlist, loading, addItem, removeItem, isInList }}>
      {children}
    </WatchlistContext.Provider>
  );
};
