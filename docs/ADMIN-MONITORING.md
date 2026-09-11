# MemoryCare Admin Monitoring

## Existing diagnostics

The existing `/admin/errors` page is the central diagnostics console. It reads `public.system_events` only after the current user passes the explicitly provisioned system-admin check. Normal users can submit sanitized diagnostic events but cannot read or resolve them.

The client logger provides deduplication, rate limiting, bounded offline queueing and redaction. The Edge Function has a shared logger for server-side failures.

## AI monitoring preparation

The page now includes an AI operations section with:

- Video AI: `Unknown`
- Local AI: `Unknown`
- A clear explanation that no provider health check is configured

This is intentional. The UI must never show `Connected` without a real health check.

The statuses are provided by `src/services/monitoring/aiMonitoring.ts`. The helper currently returns the safe unknown state. A future implementation should replace it with a server-side health check that records:

- `Operational`
- `Degraded`
- `Failing`
- `Unknown`

## Future job monitoring

The future `ai_analysis_jobs` table supports `queued`, `processing`, `completed` and `failed` states, provider/model, timestamps, retry count, request ID and safe error fields. `ai_analysis_results` stores validated model output separately. The migration intentionally adds read-only RLS for authorized users and administrators; client-side job mutation is not enabled.

## Event fields

AI events should include feature, operation, provider, status, error code, safe message, request/correlation ID and timestamps. They must not include credentials, raw prompts, video bytes, private Storage URLs, passwords, OTPs or unnecessary patient information.

## Admin provisioning

Provision an admin explicitly in Supabase:

```sql
insert into private.admin_users (user_id) values ('<auth-user-uuid>');
```

Do not expose `private.admin_users` to the browser. Do not use a client-side role flag as an authorization boundary.
