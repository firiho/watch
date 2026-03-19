'use client';

import { useMemo, useState } from 'react';
import styles from './star.module.css';

interface BiographyToggleProps {
  biography: string;
}

export default function BiographyToggle({ biography }: BiographyToggleProps) {
  const [expanded, setExpanded] = useState(false);

  const sentences = useMemo(() => {
    const normalized = biography.replace(/\s+/g, ' ').trim();
    if (!normalized) return [];
    return normalized.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((sentence) => sentence.trim()) ?? [];
  }, [biography]);

  const previewText = useMemo(() => {
    if (sentences.length <= 3) return biography;
    return `${sentences.slice(0, 3).join(' ')}`;
  }, [biography, sentences]);

  const hasMore = sentences.length > 3;

  return (
    <div className={styles.biography}>
      <p>{expanded || !hasMore ? biography : previewText}</p>
      {hasMore && (
        <button
          type="button"
          className={styles.readMoreButton}
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded ? 'Read less' : 'Read more'}
        </button>
      )}
    </div>
  );
}
