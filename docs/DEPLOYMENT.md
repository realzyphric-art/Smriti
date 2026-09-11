# MemoryCare Deployment

## Local development

```bash
npm install
copy .env.example .env.local
npm run dev
```

Set only the public Supabase URL and anon/publishable key in `.env.local`. Restart Vite after changing them.

## Build and preview

```bash
npm run build
npm run preview
```

The build runs TypeScript checking before Vite bundling.

## Supabase

Apply `supabase/schema.sql` to a new project, then apply migrations in order. Existing projects should apply only migrations that are not already present. Verify:

- RLS is enabled on every patient-scoped table
- Storage bucket `patient-media` is private
- caregiver links are active only when authorized
- `private.admin_users` contains only intended administrators
- Edge Function secrets are configured in Supabase, never in Git or `VITE_*`

Deploy the existing `auth-otp` function separately and configure its service-role secret through the Supabase dashboard or CLI secret store.

## Vercel

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for Production, Preview and Development. Do not set a service-role key or AI secret as a Vite variable. Push to the production branch and verify the deployment is Ready before testing the public domain.

## Future AI deployment

AI provider keys belong in a trusted Edge Function or backend environment. The browser may call a safe backend route, but it must not receive the provider key. Configure `VIDEO_AI_API_URL`, `VIDEO_AI_API_KEY`, `LOCAL_AI_API_URL` and any local AI key only where the server-side adapter runs.
