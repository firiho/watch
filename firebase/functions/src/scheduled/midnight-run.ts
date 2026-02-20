import * as functions from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { checkMovieHD, checkTVUpdate } from '../services/tmdb-util';

import { sendTelegramMessage } from '../services/telegram';

// Define the secrets
const tmdbSecret = defineSecret('TMDB_API_KEY');
const telegramBotToken = defineSecret('TELEGRAM_BOT_TOKEN');
const telegramChatId = defineSecret('TELEGRAM_CHAT_ID');

// Specific user ID for Telegram notifications
const TARGET_USER_ID = 'OYNKB7S6WqQvcbRt6uKSpIcelTt2';

/**
 * Scheduled function that runs every day at midnight to check for reminders.
 * It iterates through all users and their reminders to see if a notification criteria is met.
 */
export const midnightRun = functions.scheduler.onSchedule({
  schedule: '0 0 * * *', // Run at 00:00 every day
  secrets: [tmdbSecret, telegramBotToken, telegramChatId],
  timeZone: 'UTC',
  memory: '256MiB',
}, async (_event: any) => {
  const apiKey = tmdbSecret.value();
  const botToken = telegramBotToken.value();
  const chatId = telegramChatId.value();
  const db = getFirestore('watch-db-prod');
  console.log('Starting midnight reminder sync...');

  try {
    // Get all reminders across all users using collectionGroup
    const remindersSnap = await db.collectionGroup('reminders').get();
    console.log(`Found ${remindersSnap.size} reminders to process.`);
    
    for (const reminderDoc of remindersSnap.docs) {
      const reminder = reminderDoc.data();
      const { id, type, name, season, episode, notified } = reminder;
      
      // Get userId from the document path: users/{userId}/reminders/{reminderId}
      const userId = reminderDoc.ref.parent.parent?.id;
      if (!userId) {
        console.warn(`Could not determine userId for reminder ${id}`);
        continue;
      }

      // Skip movies that have already been notified
      if (type === 'movie' && notified === true) continue;

      let updateData: any = null;
      let notificationMessage = '';

      try {
        if (type === 'movie') {
          const shouldNotify = await checkMovieHD(id, apiKey);
          if (shouldNotify) {
            updateData = {
              notified: true,
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };
            notificationMessage = `<b>${name}</b> is out now in HD!`;
          }
        } else if (type === 'tv') {
          // season and episode are expected to be in the document
          if (season !== undefined && episode !== undefined) {
            const latest = await checkTVUpdate(id, season, episode, apiKey);
            if (latest) {
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
          await reminderDoc.ref.update(updateData);
          console.log(`Updated reminder ${type} ${id} for user ${userId}.`);

          // Send Telegram message for specific user
          if (userId === TARGET_USER_ID && notificationMessage) {
            try {
              await sendTelegramMessage(notificationMessage, botToken, chatId);
              console.log(`Telegram notification sent for user ${userId}.`);
            } catch (telegramErr) {
              console.error(`Failed to send Telegram message for user ${userId}:`, telegramErr);
            }
          }
        }
      } catch (err) {
        console.error(`Error processing reminder ${id} for user ${userId}:`, err);
      }
    }

    console.log('Midnight reminder sync completed successfully.');
  } catch (error) {
    console.error('Critical error in midnightRun:', error);
  }
});
