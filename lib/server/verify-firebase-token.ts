import { NextRequest } from 'next/server';

const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

/**
 * Verifies a Firebase ID token from the request's Authorization header using the
 * Identity Toolkit REST API. Returns the user's uid, or null if missing/invalid.
 *
 * This keeps the web tier free of firebase-admin — we trade a small network call
 * for not pulling in the Admin SDK + service-account credentials.
 */
export async function verifyFirebaseToken(req: NextRequest): Promise<string | null> {
  const header = req.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const idToken = match[1].trim();
  if (!idToken || !FIREBASE_API_KEY) return null;

  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
        cache: 'no-store',
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const uid = data?.users?.[0]?.localId;
    return typeof uid === 'string' ? uid : null;
  } catch {
    return null;
  }
}
