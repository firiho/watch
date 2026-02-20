# Firebase Functions - Midnight Reminder Sync 🌙

This folder contains the backend logic for processing user reminders. The main function `midnightReminderSync` runs every day at midnight (UTC) to check for TV show updates and Movie HD releases.

## Prerequisites
- Firebase CLI installed (`npm install -g firebase-tools`)
- Firestore enabled in your Firebase project

## Setup & Deployment

### 1. Set the TMDB Secret
Before deploying, you must set your TMDB API Key as a secret in Firebase. Run the following command:

```bash
firebase functions:secrets:set TMDB_API_KEY
```
When prompted, paste your **TMDB Read Access Token** (the long JWT-style token from TMDB settings).

### 2. Deploy Functions
To deploy the scheduled function, run:

```bash
cd firebase/functions
npm install
npm run deploy
```

## Scaling
- **Adding more tasks**: You can add new scheduled functions in `src/index.ts` using the same `onSchedule` pattern.
- **Adding HTTP routes**: If you need API endpoints, you can use `functions.https.onRequest` or `onCall` in `index.ts`.
- **TMDB Utils**: Use `src/tmdb-util.ts` for any logic that involves fetching data from TMDB.

## Development
To test locally, you can use the Firebase Emulator:
```bash
npm run serve
```
