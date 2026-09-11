# OTP authentication deployment

Apply the four SQL migrations in `supabase/migrations/` (or the updated
`supabase/schema.sql` for a new project), then deploy the `auth-otp` Edge
Function with JWT verification disabled because sign-in and signup occur before
there is a user session:

```sh
supabase functions deploy auth-otp --no-verify-jwt
```

Set `AUTH_RATE_LIMIT_SALT` as an Edge Function secret to a unique, random value
of at least 32 bytes. Do not add it, `SUPABASE_SERVICE_ROLE_KEY`, or any other
secret to a Vite environment file. Hosted Supabase supplies `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to functions.

In Supabase Dashboard, enable the Email provider and **Confirm email**. In the
Email Templates section, update both **Confirm signup** and **Magic Link** to
render `{{ .Token }}` (the six-digit OTP), not `{{ .ConfirmationURL }}`. Keep
the password-recovery template unchanged. Google provider settings and Guest
Mode need no changes.

Login is intentionally not passwordless: `auth-otp` validates the email/password
with a non-persisted server-side Supabase client before it requests the login OTP,
then validates the password again before returning the session after OTP
verification. The browser never receives that intermediate password-auth session.
The short-lived challenge id is stored server-side in
`private.auth_otp_challenges` and is only a correlation handle for the OTP screen.

The Edge Function permits eight OTP sends/resends per email and per IP in
fifteen minutes, and five code-verification attempts in fifteen minutes; the next
request locks that key for fifteen minutes. Supabase Auth retains its own
mailer, token-expiry, and abuse protections. The database only receives salted
SHA-256 identifiers, never a raw email address or IP.
