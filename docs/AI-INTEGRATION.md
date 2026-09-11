# MemoryCare AI Integration

This document defines the future integration boundary. It does not mean that either AI system is live.

## Status

- VIDEO AI - PLACEHOLDER
- LOCAL AI - PLACEHOLDER
- Current app behavior remains unchanged when no provider is configured.
- Placeholder calls never send a video, patient record, token, or metric to a third party.

## Code boundaries

- `src/services/ai/types.ts` contains provider-neutral request, result, job, health, and error contracts.
- `src/services/ai/videoAIService.ts` exposes a non-networking `VideoAnalysisProvider` placeholder.
- `src/services/ai/localAIService.ts` exposes a non-networking `LocalAnalysisProvider` placeholder.
- `src/services/monitoring/aiMonitoring.ts` sends safe failures through the existing diagnostic event system.
- `supabase/migrations/20260908000004_ai_analysis_jobs.sql` prepares RLS-protected asynchronous job/result storage.

## Video AI contract

The eventual flow is:

1. An explicitly authorized user uploads a validated video to the private `patient-media` bucket.
2. The app records a safe Storage reference, not a public URL.
3. A trusted Edge Function creates a queued job and calls the friend-owned provider.
4. The provider returns a job reference. The app polls or subscribes to status through the trusted boundary.
5. A validated result is stored with provider, model, timestamps, confidence and safe error details.
6. Patient/caregiver views display only authorized, non-diagnostic results.

Example request:

```json
{
  "videoId": "uuid",
  "storagePath": "patient-id/videos/example.mp4",
  "patientId": "uuid",
  "analysisType": "engagement",
  "metadata": { "durationSeconds": 120, "contentType": "video/mp4" },
  "correlationId": "uuid"
}
```

Example response:

```json
{
  "analysisId": "uuid",
  "jobId": "uuid",
  "status": "queued",
  "provider": "friend-video-service",
  "model": "model-name",
  "summary": null,
  "metrics": {},
  "confidence": null,
  "error": null
}
```

The server must define authentication, request timeout, response validation, provider error mapping and bounded retry behavior before implementation. Never put `VIDEO_AI_API_KEY` in a `VITE_*` variable.

## Local AI contract

The eventual flow is:

`MemoryCare/Supabase aggregate metrics -> trusted local AI endpoint -> validated result -> Supabase -> authorized app/admin view`

The local service must accept a configurable endpoint. Do not assume `localhost`, a private IP, or a permanent computer name in production. Send minimized aggregates rather than raw notes, names, media or unnecessary identifiers.

Example request:

```json
{
  "patientId": "uuid",
  "period": { "from": "2026-01-01", "to": "2026-01-31" },
  "metrics": { "sessions": [], "reminders": [], "trend": {} },
  "correlationId": "uuid"
}
```

Example response:

```json
{
  "analysisId": "uuid",
  "jobId": "uuid",
  "status": "completed",
  "provider": "friend-local-ai",
  "model": "model-name",
  "summary": "structured trend summary",
  "signals": [],
  "recommendations": [],
  "error": null
}
```

## Error handling

Provider adapters must use the shared `errorLogger`. Safe fields include operation, provider, job ID, correlation ID, error code, status and retryability. Never log passwords, OTPs, access tokens, refresh tokens, provider keys, private URLs, raw video, raw patient notes or full request bodies.

When no provider exists, the placeholder throws `AI_PROVIDER_NOT_CONFIGURED`. A page should present this as a configuration state, not as a successful AI result.

## Provider implementation checklist

1. Implement the server-side transport behind the existing interfaces.
2. Validate every request and response at the boundary.
3. Create jobs with `queued` status and bounded retries.
4. Enforce patient authorization before creating or reading a job.
5. Use signed Storage URLs with short expiry for video access.
6. Capture safe failures in `system_events`.
7. Add health checks and show `Unknown` until one has actually completed.
8. Add tests for timeout, invalid response, provider error, retry limit and RLS.
