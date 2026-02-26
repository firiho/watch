import * as admin from 'firebase-admin';

admin.initializeApp();

// Export all scheduled functions
export { reminders } from './scheduled/midnight-run';

// Add other triggers here as needed
