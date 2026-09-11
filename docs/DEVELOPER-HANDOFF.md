# MemoryCare Developer Handoff

## Current status

MemoryCare is a working React/Vite/Supabase application with Guest Mode, patient and caregiver routes, games, reminders, progress, people, emergency settings, accessibility options and centralized diagnostics.

The two AI systems are deliberately not implemented:

- VIDEO AI - PLACEHOLDER
- LOCAL AI - PLACEHOLDER

## First-day setup

1. Clone the repository.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local`.
4. Add only the public Supabase values.
5. Run `npm run build`.
6. Run `npm run dev`.
7. Test Guest Mode before signing in.
8. Apply Supabase schema/migrations to a disposable project before changing production.

## Where to continue

- UI and routes: `src/pages`, `src/components`, `src/App.tsx`
- Cloud client: `src/lib/supabase.ts`
- Domain operations: `src/services`
- AI contracts: `src/services/ai/types.ts`
- AI placeholders: `src/services/ai/videoAIService.ts` and `src/services/ai/localAIService.ts`
- Monitoring: `src/services/errorLogger.ts` and `src/services/monitoring/aiMonitoring.ts`
- Database/RLS: `supabase/schema.sql` and `supabase/migrations`
- Live error console: `/admin/errors`

## Rules for the AI work

- Do not place private keys in `VITE_*` variables.
- Do not send video or personal data externally without an explicit configured flow and privacy review.
- Do not claim an analysis is complete until the provider response is validated and stored.
- Use bounded retries and asynchronous jobs.
- Keep provider-specific SDK types behind the adapter boundary.
- Reuse the central redacted diagnostics system.
- Preserve Guest Mode, accessibility settings, route guards and RLS.

## Handoff completion criteria

Before connecting a real provider, the friend should add adapter tests, request/response schema validation, timeout handling, RLS tests, health checks, admin job views, privacy documentation and a rollback plan. Then run the full route and mobile smoke test suite before deployment.
