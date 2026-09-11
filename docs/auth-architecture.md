# MemoryCare data and authentication architecture

## Current integration boundary

The UI remains offline-first. IndexedDB/localStorage is still the source of truth when Supabase is not configured. `src/lib/supabase.ts` exposes a nullable browser client and `isSupabaseConfigured`, allowing a later sync/auth service to opt into cloud behavior without breaking the local demo. Only the publishable/anon key belongs in the frontend.

## Authentication

Use Supabase Auth with email/password or passwordless email magic links for caregivers. Add passkeys later through Supabase Auth/WebAuthn or a trusted native wrapper; the current browser passkey/PIN flow is only a local convenience and must not be migrated as a password. After sign-in, create one `user_profiles` row with the role. A patient profile may optionally be linked to an auth user, while a caregiver receives access through `patient_access`.

Every caregiver-to-patient relationship is explicit, revocable, and consent-aware:

1. Patient owns a `patient_profiles` row and controls `share_with_caregiver`.
2. Caregiver requests access; the patient (or an authorized owner) activates it.
3. RLS permits caregiver reads only when access is `active` and sharing is enabled.
4. Client-side route guards remain a UX layer; PostgreSQL RLS is the security boundary.

On logout, clear the Supabase session and reset only the in-memory auth state. Do not delete local offline records. Account deletion/data export should be a separate, confirmed flow using an Edge Function for Auth deletion and a transaction for patient-owned data.

## Sync plan (not implemented yet)

Keep the existing local records and add an outbox with stable IDs, `updated_at`, tombstones, and a `client_id`. On reconnect, push consented changes idempotently, then pull rows by cursor/timestamp. Resolve simple scalar conflicts with last-write-wins and keep game sessions append-only. Reminder completion should use the `(reminder_id, completed_on)` key to make retries safe. Never upload private notes or mood data until the patient has explicitly enabled sharing.

The proposed SQL schema is in `supabase/schema.sql`. Review retention, consent wording, and caregiver write permissions before applying it to production.
