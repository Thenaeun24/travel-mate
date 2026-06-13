// ─── Auth configuration ──────────────────────────────────────────────────────
// Google Identity Services (GIS) web client ID for the Firebase project
// `fire-station-6c2b2`. Registered "Authorized JavaScript origins" must include
// the live site origin (https://travel-mate-epg.pages.dev) and any dev origin
// (http://localhost:5173). See AUTH_SETUP.md for the console steps.
export const CLIENT_ID =
  '264965329371-ivfa61qcv81619t8vr42hpvcb0bg5mv5.apps.googleusercontent.com';

// The owner account. Always allowed (even if the allow-list is empty) and the
// only account that can manage the allow-list. This is the single source of
// truth for "who is the admin" and must match the value in database.rules.json.
export const OWNER_EMAIL = 'cuucuu877@gmail.com';

// Realtime Database keys cannot contain '.', so we store/look up allowed emails
// under a sanitized key (dots → commas). '@' is a legal RTDB key char, so we
// only swap dots. Must mirror the .replace('.', ',') used in database.rules.json.
export const sanitizeEmail = (email) =>
  (email || '').trim().toLowerCase().replace(/\./g, ',');
