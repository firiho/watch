import { db, auth } from './firebase';
import { collection, doc, setDoc, deleteDoc, getDoc, getDocs, writeBatch, deleteField } from 'firebase/firestore';
import { isAdminUid } from './admin';
import { recommendationRef, toRecommendation } from './recommendations';

export interface WatchlistItem {
  id: number;
  title: string;
  original_title?: string;
  overview: string;
  poster_path: string;
  backdrop_path: string;
  release_date: string;
  vote_average: number;
  vote_count: number;
  popularity: number;
  genre_ids: number[];
  adult: boolean;
  video: boolean;
  original_language: string;
  media_type: 'movie' | 'tv';
  added_at: number;
  rating?: number; // personal 1–5 star ranking
  rated_at?: number;
}

export const addToWatchlist = async (item: any, mediaType: 'movie' | 'tv') => {
  const user = auth.currentUser;
  if (!user) return;

  const watchlistRef = doc(db, 'users', user.uid, 'watchlist', item.id.toString());
  
  // Format data to use small-letters (snake_case) and contain all TMDB fields
  const data: WatchlistItem = {
    id: item.id,
    title: item.title || item.name,
    original_title: item.original_title || item.original_name || null,
    overview: item.overview || '',
    poster_path: item.poster_path || (item.image ? item.image.replace('https://image.tmdb.org/t/p/w500', '') : ''),
    backdrop_path: item.backdrop_path || (item.backdrop ? item.backdrop.replace('https://image.tmdb.org/t/p/w780', '') : ''),
    release_date: item.release_date || item.first_air_date || '',
    vote_average: parseFloat(item.vote_average || item.rating || 0),
    vote_count: item.vote_count || 0,
    popularity: item.popularity || 0,
    genre_ids: item.genre_ids || [],
    adult: item.adult || false,
    video: item.video || false,
    original_language: item.original_language || 'en',
    media_type: mediaType,
    added_at: Date.now(),
  };

  await setDoc(watchlistRef, data);
};

export const removeFromWatchlist = async (itemId: number) => {
  const user = auth.currentUser;
  if (!user) return;

  const watchlistRef = doc(db, 'users', user.uid, 'watchlist', itemId.toString());
  if (!isAdminUid(user.uid)) {
    await deleteDoc(watchlistRef);
    return;
  }

  // The admin's list backs their public recommendations, so the rec goes with it.
  const snap = await getDoc(watchlistRef);
  const batch = writeBatch(db);
  batch.delete(watchlistRef);
  if (snap.exists()) {
    batch.delete(recommendationRef(itemId, (snap.data() as WatchlistItem).media_type));
  }
  await batch.commit();
};

// Sets (1–5) or clears (null) the star ranking on a title in the user's list.
export const rateWatchlistItem = async (item: WatchlistItem, stars: number | null) => {
  const user = auth.currentUser;
  if (!user) return;

  const watchlistRef = doc(db, 'users', user.uid, 'watchlist', item.id.toString());
  const batch = writeBatch(db);
  batch.update(
    watchlistRef,
    stars ? { rating: stars, rated_at: Date.now() } : { rating: deleteField(), rated_at: deleteField() }
  );

  // The admin's rankings are published as public recommendations.
  if (isAdminUid(user.uid)) {
    const recRef = recommendationRef(item.id, item.media_type);
    if (stars) batch.set(recRef, toRecommendation(item, stars));
    else batch.delete(recRef);
  }

  await batch.commit();
};

export const isInWatchlist = async (itemId: number): Promise<boolean> => {
  const user = auth.currentUser;
  if (!user) return false;

  const watchlistRef = doc(db, 'users', user.uid, 'watchlist', itemId.toString());
  const docSnap = await getDoc(watchlistRef);
  return docSnap.exists();
};

export const getWatchlist = async (): Promise<WatchlistItem[]> => {
  const user = auth.currentUser;
  if (!user) return [];

  const watchlistRef = collection(db, 'users', user.uid, 'watchlist');
  const querySnap = await getDocs(watchlistRef);
  
  return querySnap.docs.map(doc => doc.data() as WatchlistItem)
    .sort((a, b) => b.added_at - a.added_at);
};
