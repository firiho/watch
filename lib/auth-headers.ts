import { auth } from './firebase';

/**
 * Returns an Authorization header carrying the current user's Firebase ID token,
 * for calls to auth-gated API routes. Empty object when signed out.
 */
export async function authHeader(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) return {};
  try {
    const token = await user.getIdToken();
    return { Authorization: `Bearer ${token}` };
  } catch {
    return {};
  }
}
