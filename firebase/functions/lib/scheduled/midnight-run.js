"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.midnightRun = void 0;
const functions = __importStar(require("firebase-functions/v2"));
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-admin/firestore");
const params_1 = require("firebase-functions/params");
const tmdb_util_1 = require("../services/tmdb-util");
const telegram_1 = require("../services/telegram");
// Define the secrets
const tmdbSecret = (0, params_1.defineSecret)('TMDB_API_KEY');
const telegramBotToken = (0, params_1.defineSecret)('TELEGRAM_BOT_TOKEN');
const telegramChatId = (0, params_1.defineSecret)('TELEGRAM_CHAT_ID');
// Specific user ID for Telegram notifications
const TARGET_USER_ID = 'OYNKB7S6WqQvcbRt6uKSpIcelTt2';
/**
 * Scheduled function that runs every day at midnight to check for reminders.
 * It iterates through all users and their reminders to see if a notification criteria is met.
 */
exports.midnightRun = functions.scheduler.onSchedule({
    schedule: '0 0 * * *', // Run at 00:00 every day
    secrets: [tmdbSecret, telegramBotToken, telegramChatId],
    timeZone: 'UTC',
    memory: '256MiB',
}, async (_event) => {
    const apiKey = tmdbSecret.value();
    const botToken = telegramBotToken.value();
    const chatId = telegramChatId.value();
    const db = (0, firestore_1.getFirestore)('watch-db-prod');
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
            if (type === 'movie' && notified === true)
                continue;
            let updateData = null;
            let notificationMessage = '';
            try {
                if (type === 'movie') {
                    const shouldNotify = await (0, tmdb_util_1.checkMovieHD)(id, apiKey);
                    if (shouldNotify) {
                        updateData = {
                            notified: true,
                            updatedAt: admin.firestore.FieldValue.serverTimestamp()
                        };
                        notificationMessage = `<b>${name}</b> is out now in HD!`;
                    }
                }
                else if (type === 'tv') {
                    // season and episode are expected to be in the document
                    if (season !== undefined && episode !== undefined) {
                        const latest = await (0, tmdb_util_1.checkTVUpdate)(id, season, episode, apiKey);
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
                            await (0, telegram_1.sendTelegramMessage)(notificationMessage, botToken, chatId);
                            console.log(`Telegram notification sent for user ${userId}.`);
                        }
                        catch (telegramErr) {
                            console.error(`Failed to send Telegram message for user ${userId}:`, telegramErr);
                        }
                    }
                }
            }
            catch (err) {
                console.error(`Error processing reminder ${id} for user ${userId}:`, err);
            }
        }
        console.log('Midnight reminder sync completed successfully.');
    }
    catch (error) {
        console.error('Critical error in midnightRun:', error);
    }
});
//# sourceMappingURL=midnight-run.js.map