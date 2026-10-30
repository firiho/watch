// The single hardcoded admin (Flambeau). Their star ratings are published as public
// recommendations. This constant only drives the UI — the real enforcement lives in
// firestore.rules, which hardcodes the same uid.
export const ADMIN_UID = 'OYNKB7S6WqQvcbRt6uKSpIcelTt2';
export const ADMIN_NAME = 'Flambeau';

export const isAdminUid = (uid?: string | null) => uid === ADMIN_UID;
