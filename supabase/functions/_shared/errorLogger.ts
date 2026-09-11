import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

const secretKeyPattern = /(password|passwd|passcode|otp|token|secret|authorization|cookie|api[_-]?key|service[_-]?role|refresh)/i;
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const jwtPattern = /\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g;

export interface EdgeDiagnosticContext {
  eventType: string;
  action?: string;
  severity?: 'debug' | 'info' | 'warning' | 'error' | 'critical';
  message?: string;
  error?: unknown;
  errorCode?: string;
  httpStatus?: number;
  requestId?: string;
  metadata?: Record<string, unknown>;
}

function safeString(value: unknown, maxLength = 1000): string {
  return String(value ?? '')
    .replace(jwtPattern, '[redacted-token]')
    .replace(emailPattern, '[redacted-email]')
    .slice(0, maxLength);
}

function safeMetadata(metadata: Record<string, unknown> = {}): Record<string, unknown> {
  return Object.fromEntries(Object.entries(metadata).slice(0, 20).map(([key, value]) => [
    key,
    secretKeyPattern.test(key) ? '[redacted]' : typeof value === 'string' ? safeString(value, 300) : value,
  ]));
}

function errorDetails(error: unknown): { message: string; code: string | null } {
  if (error && typeof error === 'object') {
    const candidate = error as { message?: unknown; code?: unknown };
    return {
      message: safeString(candidate.message || 'Request failed'),
      code: typeof candidate.code === 'string' ? safeString(candidate.code, 120) : null,
    };
  }
  return { message: safeString(error || 'Request failed'), code: null };
}

export function requestIdFor(request: Request): string {
  const provided = request.headers.get('x-request-id')?.trim() || '';
  if (/^[A-Za-z0-9._:-]{1,120}$/.test(provided)) return provided;
  return `edge-${crypto.randomUUID()}`;
}

/** Best-effort structured logging. A logging outage never changes the auth response. */
export async function logEdgeEvent(admin: SupabaseClient, request: Request, context: EdgeDiagnosticContext): Promise<void> {
  try {
    const details = errorDetails(context.error);
    const message = safeString(context.message || details.message || 'Edge request event');
    const requestId = safeString(context.requestId || requestIdFor(request), 120);
    const { error } = await admin.from('system_events').insert({
      severity: context.severity || (context.error ? 'error' : 'info'),
      event_type: safeString(context.eventType, 80),
      feature: 'auth-otp',
      route: '/functions/v1/auth-otp',
      action: safeString(context.action || '', 120) || null,
      message,
      error_code: safeString(context.errorCode || details.code || '', 120) || null,
      http_status: context.httpStatus || null,
      stack_trace: null,
      request_id: requestId,
      user_id: null,
      session_state: 'anonymous',
      device: safeString(request.headers.get('user-agent') || 'unknown', 120),
      browser: 'edge',
      os: 'edge',
      app_version: 'unknown',
      environment: 'production',
      fingerprint: `auth-otp:${safeString(context.eventType, 80)}:${safeString(context.action || 'none', 80)}`.slice(0, 160),
      metadata: safeMetadata({ ...context.metadata, request_id: requestId }),
    });
    if (error) return;
  } catch {
    // Diagnostics must never make authentication fail.
  }
}
