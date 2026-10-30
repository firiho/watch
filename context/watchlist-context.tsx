'use client';

import React, { createContext, useContext, useEffect, useMemo, useState, useCallback, ReactNode } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { addToWatchlist, removeFromWatchlist, rateWatchlistItem, WatchlistItem } from '@/lib/watchlist';
import { useAuth } from '@/context/auth-context';

interface WatchlistContextType {
  watchlist: Set<number>;
  /** Full list documents, newest first. */
  items: WatchlistItem[];
  loading: boolean;
  addItem: (item: any, mediaType: 'movie' | 'tv') => Promise<void>;
  removeItem: (id: number) => Promise<void>;
  isInList: (id: number) => boolean;
  getRating: (id: number) => number | undefined;
  setRating: (id: number, stars: number | null) => Promise<void>;
}

const WatchlistContext = createContext<WatchlistContextType>({
  watchlist: new Set(),
  items: [],
  loading: true,
  addItem: async () => {},
  removeItem: async () => {},
  isInList: () => false,
  getRating: () => undefined,
  setRating: async () => {},
});

export const useWatchlist = () => useContext(WatchlistContext);

export const WatchlistProvider = ({ children }: { children: ReactNode }) => {
  const { user, isAdmin } = useAuth();
  const [watchlist, setWatchlist] = useState<Set<number>>(new Set());
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Live subscription so the list stays in sync across tabs and after external writes.
  useEffect(() => {
    if (!user) {
      setWatchlist(new Set());
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const ref = collection(db, 'users', user.uid, 'watchlist');
    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        setWatchlist(new Set(snapshot.docs.map((d) => Number(d.id))));
        setItems(
          snapshot.docs
            .map((d) => d.data() as WatchlistItem)
            .sort((a, b) => b.added_at - a.added_at)
        );
        setLoading(false);
      },
      (error) => {
        console.error('Error subscribing to watchlist:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

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
    const wasRecommended = isAdmin && !!itemsById.get(id)?.rating;
    setWatchlist((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    try {
      await removeFromWatchlist(id);
      toast.success(wasRecommended ? 'Removed from your list and recommendations' : 'Removed from your list');
    } catch (error) {
      console.error('Error removing from watchlist:', error);
      if (wasInList) setWatchlist((prev) => new Set(prev).add(id));
      toast.error('Could not remove from your list. Please try again.');
    }
  }, [watchlist, isAdmin, itemsById]);

  const isInList = useCallback((id: number) => {
    return watchlist.has(id);
  }, [watchlist]);

  const getRating = useCallback((id: number) => itemsById.get(id)?.rating, [itemsById]);

  // No optimistic state needed: Firestore applies the write locally first, so the
  // snapshot listener reflects the new rating immediately (and reverts on failure).
  const setRating = useCallback(async (id: number, stars: number | null) => {
    const item = itemsById.get(id);
    if (!item) return;
    try {
      await rateWatchlistItem(item, stars);
      if (isAdmin) {
        toast.success(stars ? `Recommended ${item.title} · ${stars}★` : `Removed ${item.title} from your recommendations`);
      }
    } catch (error) {
      console.error('Error saving rating:', error);
      toast.error('Could not save your rating. Please try again.');
    }
  }, [itemsById, isAdmin]);

  return (
    <WatchlistContext.Provider value={{ watchlist, items, loading, addItem, removeItem, isInList, getRating, setRating }}>
      {children}
    </WatchlistContext.Provider>
  );
};
