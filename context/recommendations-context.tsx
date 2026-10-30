'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { onSnapshot } from 'firebase/firestore';
import { Recommendation, recommendationId, recommendationsRef } from '@/lib/recommendations';

interface RecommendationsContextType {
  recommendations: Recommendation[];
  loading: boolean;
  error: boolean;
  getRecommendation: (id: number, mediaType: 'movie' | 'tv') => Recommendation | undefined;
}

const RecommendationsContext = createContext<RecommendationsContextType | undefined>(undefined);

// Recommendations are public, so this subscribes for everyone — signed in or not.
export const RecommendationsProvider = ({ children }: { children: ReactNode }) => {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      recommendationsRef(),
      (snapshot) => {
        setRecommendations(snapshot.docs.map((d) => d.data() as Recommendation));
        setError(false);
        setLoading(false);
      },
      (err) => {
        console.error('Error subscribing to recommendations:', err);
        setError(true);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const byKey = useMemo(
    () => new Map(recommendations.map((rec) => [recommendationId(rec.id, rec.media_type), rec])),
    [recommendations]
  );

  const getRecommendation = useCallback(
    (id: number, mediaType: 'movie' | 'tv') => byKey.get(recommendationId(id, mediaType)),
    [byKey]
  );

  return (
    <RecommendationsContext.Provider value={{ recommendations, loading, error, getRecommendation }}>
      {children}
    </RecommendationsContext.Provider>
  );
};

export const useRecommendations = () => {
  const context = useContext(RecommendationsContext);
  if (context === undefined) {
    throw new Error('useRecommendations must be used within a RecommendationsProvider');
  }
  return context;
};
