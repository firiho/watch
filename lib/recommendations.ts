import { db } from './firebase';
import { collection, doc } from 'firebase/firestore';
import type { WatchlistItem } from './watchlist';

/**
 * A public recommendation, mirrored from the admin's rated watchlist items. Carries
 * everything a MovieCard needs so the Recs page renders without hitting TMDB.
 */
export interface Recommendation {
  id: number;
  media_type: 'movie' | 'tv';
  title: string;
  overview: string;
  poster_path: string;
  backdrop_path: string;
  release_date: string;
  vote_average: number;
  stars: number;
  updated_at: number;
}

// TMDB movie and TV ids can collide, so recommendations are keyed by both.
export const recommendationId = (id: number, mediaType: 'movie' | 'tv') => `${mediaType}-${id}`;

export const recommendationsRef = () => collection(db, 'recommendations');

export const recommendationRef = (id: number, mediaType: 'movie' | 'tv') =>
  doc(db, 'recommendations', recommendationId(id, mediaType));

export const toRecommendation = (item: WatchlistItem, stars: number): Recommendation => ({
  id: item.id,
  media_type: item.media_type,
  title: item.title || '',
  overview: item.overview || '',
  poster_path: item.poster_path || '',
  backdrop_path: item.backdrop_path || '',
  release_date: item.release_date || '',
  vote_average: item.vote_average || 0,
  stars,
  updated_at: Date.now(),
});
