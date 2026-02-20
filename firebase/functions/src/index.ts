import * as admin from 'firebase-admin';

admin.initializeApp();

// Export all scheduled functions
export { midnightRun } from './scheduled/midnight-run';

// Add other triggers here as needed
