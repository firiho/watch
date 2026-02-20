'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { addToWatchlist, removeFromWatchlist, getWatchlist } from '@/lib/watchlist';

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
  const [watchlist, setWatchlist] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const items = await getWatchlist();
          setWatchlist(new Set(items.map(item => item.id)));
        } catch (error) {
          console.error('Error fetching watchlist:', error);
        }
      } else {
        setWatchlist(new Set());
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const addItem = useCallback(async (item: any, mediaType: 'movie' | 'tv') => {
    try {
      await addToWatchlist(item, mediaType);
      setWatchlist(prev => new Set(prev).add(item.id));
    } catch (error) {
      console.error('Error adding to watchlist:', error);
    }
  }, []);

  const removeItem = useCallback(async (id: number) => {
    try {
      await removeFromWatchlist(id);
      setWatchlist(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (error) {
      console.error('Error removing from watchlist:', error);
    }
  }, []);

  const isInList = useCallback((id: number) => {
    return watchlist.has(id);
  }, [watchlist]);

  return (
    <WatchlistContext.Provider value={{ watchlist, loading, addItem, removeItem, isInList }}>
      {children}
    </WatchlistContext.Provider>
  );
};
