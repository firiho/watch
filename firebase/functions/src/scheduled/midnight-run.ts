import * as functions from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { getMovieReleaseDates, getTVLatestEpisode, MovieReleaseDates } from '../services/tmdb-util';

import { sendTelegramMessage } from '../services/telegram';

// Define the secrets
const tmdbSecret = defineSecret('TMDB_API_KEY');

/**
 * Scheduled function that runs hourly to check for reminders.
 * It iterates through all users and their reminders to see if a notification criteria is met.
 */
export const reminders = functions.scheduler.onSchedule({
  schedule: '0 * * * *', // Run at the top of every hour
  secrets: [tmdbSecret],
  timeZone: 'UTC',
  memory: '256MiB',
}, async (_event: any) => {
  const apiKey = tmdbSecret.value();
  const db = getFirestore('watch-db-prod');
  const telegramConfigCache = new Map<string, { botToken: string; chatId: string } | null>();
  console.log('Starting hourly reminder sync...');

  // Sends a Telegram message for a user, resolving + caching their Telegram config.
  const sendNotification = async (userId: string, message: string) => {
    try {
      let telegramConfig = telegramConfigCache.get(userId);

      if (telegramConfig === undefined) {
        const telegramDoc = await db.doc(`users/${userId}/notifications/telegram`).get();
        if (!telegramDoc.exists) {
          telegramConfig = null;
        } else {
          const telegramData = telegramDoc.data() as any;
          telegramConfig = telegramData?.botToken && telegramData?.chatId
            ? { botToken: String(telegramData.botToken), chatId: String(telegramData.chatId) }
            : null;
        }
        telegramConfigCache.set(userId, telegramConfig);
      }

      if (!telegramConfig) {
        console.log(`No Telegram config for user ${userId}; skipping notification.`);
        return;
      }

      await sendTelegramMessage(message, telegramConfig.botToken, telegramConfig.chatId);
      console.log(`Telegram notification sent for user ${userId}.`);
    } catch (telegramErr) {
      console.error(`Failed to send Telegram message for user ${userId}:`, telegramErr);
    }
  };

  try {
    // Get all reminders across all users using collectionGroup
    const remindersSnap = await db.collectionGroup('reminders').get();
    console.log(`Found ${remindersSnap.size} reminders to process.`);
    
    const now = new Date();

    // Per-run caches so multiple users tracking the same title only cost one TMDB call.
    const movieReleaseCache = new Map<number, MovieReleaseDates>();
    const tvLatestCache = new Map<number, { season: number; episode: number } | null>();

    for (const reminderDoc of remindersSnap.docs) {
      const reminder = reminderDoc.data();
      const { id, type, name, season, episode } = reminder;
      // HD is the terminal milestone for a movie; `notified` is the legacy HD flag.
      const notifiedHD = reminder.notifiedHD ?? reminder.notified ?? false;
      const notifiedTheaters = reminder.notifiedTheaters ?? false;

      // Get userId from the document path: users/{userId}/reminders/{reminderId}
      const userId = reminderDoc.ref.parent.parent?.id;
      if (!userId) {
        console.warn(`Could not determine userId for reminder ${id}`);
        continue;
      }

      // Once a movie is out in HD there's nothing left to notify about.
      if (type === 'movie' && notifiedHD === true) continue;

      try {
        if (type === 'movie') {
          // Only notify for milestones that land AFTER the reminder was created, so
          // adding a movie that's already in theaters/HD doesn't fire a stale ping.
          const createdAt = reminder.timestamp
            ? new Date(reminder.timestamp)
            : (reminderDoc.createTime?.toDate() ?? now);

          let releaseDates = movieReleaseCache.get(id);
          if (!releaseDates) {
            releaseDates = await getMovieReleaseDates(id, apiKey);
            movieReleaseCache.set(id, releaseDates);
          }
          const { theatrical, hd } = releaseDates;

          const milestones: Array<{ field: 'notifiedTheaters' | 'notifiedHD'; date: Date; message: string }> = [];
          if (theatrical && theatrical <= now && !notifiedTheaters) {
            milestones.push({ field: 'notifiedTheaters', date: theatrical, message: `<b>${name}</b> is now in theaters!` });
          }
          if (hd && hd <= now && !notifiedHD) {
            milestones.push({ field: 'notifiedHD', date: hd, message: `<b>${name}</b> is out now in HD!` });
          }

          for (const milestone of milestones) {
            const shouldNotify = milestone.date >= createdAt;
            const inboxMilestone = milestone.field === 'notifiedTheaters' ? 'theaters' : 'hd';
            // Pre-allocate an inbox doc ref so the in-app delivery is atomic with the flag update.
            const inboxRef = shouldNotify ? db.collection(`users/${userId}/inbox`).doc() : null;

            // Re-check + mark atomically so overlapping scheduler runs don't double-send.
            const committed = await db.runTransaction(async (tx) => {
              const freshSnap = await tx.get(reminderDoc.ref);
              if (!freshSnap.exists) return false;

              const fresh = freshSnap.data() as any;
              const alreadyDone = milestone.field === 'notifiedHD'
                ? (fresh?.notifiedHD ?? fresh?.notified ?? false) === true
                : (fresh?.notifiedTheaters ?? false) === true;
              if (alreadyDone) return false;

              const update: any = {
                [milestone.field]: true,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              };
              // Keep the legacy `notified` flag in sync so older clients still read it.
              if (milestone.field === 'notifiedHD') update.notified = true;

              tx.update(reminderDoc.ref, update);
              if (shouldNotify && inboxRef) {
                tx.set(inboxRef, {
                  reminderId: id,
                  type: 'movie',
                  name,
                  milestone: inboxMilestone,
                  deliveredAt: admin.firestore.FieldValue.serverTimestamp(),
                  status: 'unread',
                });
              }
              return shouldNotify;
            });

            if (committed) {
              console.log(`Movie reminder ${id} reached ${milestone.field} for user ${userId}.`);
              // Telegram is an optional extra; the inbox bubble is the primary delivery.
              await sendNotification(userId, milestone.message);
            }
          }

          continue;
        }

        let updateData: any = null;
        let notificationMessage = '';
        let shouldSendNotification = false;

        if (type === 'tv') {
          // season and episode are expected to be in the document
          if (season !== undefined && episode !== undefined) {
            let latest = tvLatestCache.get(id);
            if (latest === undefined) {
              latest = await getTVLatestEpisode(id, apiKey);
              tvLatestCache.set(id, latest);
            }

            const hasUpdate = latest
              ? latest.season > season || (latest.season === season && latest.episode > episode)
              : false;

            if (latest && hasUpdate) {
              updateData = {
                season: latest.season,
                episode: latest.episode,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
              };
              notificationMessage = `<b>${name}'s</b> new episode dropped: Season ${latest.season}, Episode ${latest.episode}`;
            }
          }
        }

        if (updateData) {
          // Pre-allocate an inbox doc ref so the inbox write happens atomically with the reminder update.
          const inboxRef = db.collection(`users/${userId}/inbox`).doc();

          // Re-check and update atomically so overlapping scheduler runs don't send duplicate notifications.
          shouldSendNotification = await db.runTransaction(async (tx) => {
            const freshSnap = await tx.get(reminderDoc.ref);
            if (!freshSnap.exists) return false;

            const fresh = freshSnap.data() as any;

            const currentSeason = Number(fresh?.season ?? 0);
            const currentEpisode = Number(fresh?.episode ?? 0);
            const nextSeason = Number(updateData.season ?? 0);
            const nextEpisode = Number(updateData.episode ?? 0);
            const isNewer = nextSeason > currentSeason || (nextSeason === currentSeason && nextEpisode > currentEpisode);

            if (!isNewer) return false;
            tx.update(reminderDoc.ref, updateData);
            tx.set(inboxRef, {
              reminderId: id,
              type: 'tv',
              name,
              season: nextSeason,
              episode: nextEpisode,
              deliveredAt: admin.firestore.FieldValue.serverTimestamp(),
              status: 'unread',
            });
            return true;
          });

          if (!shouldSendNotification) {
            continue;
          }

          console.log(`Updated reminder ${type} ${id} for user ${userId}.`);

          if (notificationMessage) {
            await sendNotification(userId, notificationMessage);
          }
        }
      } catch (err) {
        console.error(`Error processing reminder ${id} for user ${userId}:`, err);
      }
    }

    console.log('Hourly reminder sync completed successfully.');
  } catch (error) {
    console.error('Critical error in reminders:', error);
  }
});
