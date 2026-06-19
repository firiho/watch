'use client';

import { useCallback, useState } from 'react';
import { useAuth } from '@/context/auth-context';
import { useReminders } from '@/context/reminder-context';
import { ContentItem } from '@/lib/tmdb';

interface ToggleReminderArgs {
  id: number;
  title: string;
  mediaType: 'movie' | 'tv';
  preloaded?: ContentItem | null;
}

/**
 * Shared reminder toggle used by movie cards and the detail modal. Handles the
 * remove / TV-picker / movie-add branches and exposes a `pending` flag for the UI.
 */
export function useToggleReminder() {
  const { user } = useAuth();
  const { hasReminder, addReminder, removeReminder, requestTVReminder } = useReminders();
  const [pending, setPending] = useState(false);

  const toggleReminder = useCallback(
    async ({ id, title, mediaType, preloaded }: ToggleReminderArgs) => {
      if (!user || pending) return;
      setPending(true);
      try {
        if (hasReminder(id)) {
          await removeReminder(id);
          return;
        }

        if (mediaType === 'tv') {
          await requestTVReminder({ id, title, preloaded });
          return;
        }

        await addReminder({ id, name: title, type: 'movie' });
      } catch (error) {
        console.error('Error toggling reminder:', error);
      } finally {
        setPending(false);
      }
    },
    [user, pending, hasReminder, addReminder, removeReminder, requestTVReminder]
  );

  return { toggleReminder, pending };
}
