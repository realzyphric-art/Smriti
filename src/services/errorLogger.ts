import { supabase } from '@/lib/supabase';

export type DiagnosticSeverity = 'debug' | 'info' | 'warning' | 'error' | 'critical';

export interface DiagnosticContext {
  feature?: string;
  route?: string;
  action?: string;
  eventType?: string;
  severity?: DiagnosticSeverity;
  errorCode?: string;
  httpStatus?: number;
  requestId?: string;
  metadata?: unknown;
  userId?: string | null;
  sessionState?: string;
}

interface DiagnosticRow {
  created_at: string;
  severity: DiagnosticSeverity;
  event_type: string;
  feature: string;
  route: string | null;
  action: string | null;
  message: string;
  error_code: string | null;
  http_status: number | null;
  stack_trace: string | null;
  request_id: string;
  user_id: string | null;
  session_state: string;
  device: string;
  browser: string;
  os: string;
  app_version: string;
  environment: string;
  fingerprint: string;
  metadata: Record<string, unknown>;
}

const QUEUE_KEY = 'mc:diagnostic-events:v1';
const MAX_QUEUE_SIZE = 80;
const MAX_BATCH_SIZE = 20;
const DEDUPE_WINDOW_MS = 30_000;
const RATE_WINDOW_MS = 60_000;
const MAX_EVENTS_PER_WINDOW = 40;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SECRET_KEY_PATTERN = /(password|passwd|passcode|otp|token|secret|authorization|cookie|api[_-]?key|service[_-]?role|refresh)/i;
const JWT_PATTERN = /\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

let queue = loadQueue();
let flushTimer: number | undefined;
let flushing = false;
let eventWindowStarted = 0;
let eventWindowCount = 0;
const recentFingerprints = new Map<string, number>();

function nowIso(): string {
  return new Date().toISOString();
}

function requestId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `diag-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function safeString(value: unknown, maxLength = 1000): string {
  return String(value ?? '')
    .replace(JWT_PATTERN, '[redacted-token]')
    .replace(EMAIL_PATTERN, '[redacted-email]')
    .slice(0, maxLength);
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 3) return '[truncated]';
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return typeof value === 'string' ? safeString(value, 500) : value;
  }
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeValue(item, depth + 1));
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value).slice(0, 30)) {
      if (SECRET_KEY_PATTERN.test(key)) {
        result[key] = '[redacted]';
      } else {
        result[key] = sanitizeValue(entry, depth + 1);
      }
    }
    return result;
  }
  return `[${typeof value}]`;
}

function safeMetadata(value: unknown): Record<string, unknown> {
  const sanitized = sanitizeValue(value);
  if (!sanitized || typeof sanitized !== 'object' || Array.isArray(sanitized)) return {};
  return sanitized as Record<string, unknown>;
}

function errorDetails(error: unknown): { message: string; stack: string | null; code: string | null; status: number | null } {
  if (error instanceof Error) {
    const candidate = error as Error & { code?: unknown; status?: unknown; statusCode?: unknown };
    const status = Number(candidate.status ?? candidate.statusCode);
    return {
      message: safeString(error.message || 'Unexpected error'),
      stack: safeString(error.stack || '', 6000) || null,
      code: typeof candidate.code === 'string' ? safeString(candidate.code, 120) : null,
      status: Number.isInteger(status) && status >= 100 && status <= 599 ? status : null,
    };
  }
  if (typeof error === 'object' && error !== null) {
    const record = error as Record<string, unknown>;
    const status = Number(record.status ?? record.statusCode);
    return {
      message: safeString(record.message || record.error_description || 'Unexpected error'),
      stack: typeof record.stack === 'string' ? safeString(record.stack, 6000) : null,
      code: typeof record.code === 'string' ? safeString(record.code, 120) : null,
      status: Number.isInteger(status) && status >= 100 && status <= 599 ? status : null,
    };
  }
  return { message: safeString(error || 'Unexpected error'), stack: null, code: null, status: null };
}

function browserName(userAgent: string): string {
  if (/edg\//i.test(userAgent)) return 'Edge';
  if (/chrome\//i.test(userAgent)) return 'Chrome';
  if (/firefox\//i.test(userAgent)) return 'Firefox';
  if (/safari\//i.test(userAgent)) return 'Safari';
  return 'Unknown';
}

function osName(userAgent: string): string {
  if (/windows/i.test(userAgent)) return 'Windows';
  if (/android/i.test(userAgent)) return 'Android';
  if (/iphone|ipad|ios/i.test(userAgent)) return 'iOS';
  if (/mac os/i.test(userAgent)) return 'macOS';
  if (/linux/i.test(userAgent)) return 'Linux';
  return 'Unknown';
}

function hash(value: string): string {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(16).padStart(8, '0');
}

function fingerprintFor(row: Pick<DiagnosticRow, 'event_type' | 'feature' | 'error_code' | 'message'>): string {
  const normalized = row.message.toLowerCase().replace(/\d+/g, '[n]').replace(/\s+/g, ' ').trim();
  return `${row.feature}:${row.event_type}:${row.error_code || 'none'}:${hash(normalized)}`.slice(0, 160);
}

function loadQueue(): DiagnosticRow[] {
  try {
    const stored = localStorage.getItem(QUEUE_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed.slice(-MAX_QUEUE_SIZE) : [];
  } catch {
    return [];
  }
}

function persistQueue(): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE_SIZE)));
  } catch {
    // Diagnostics must never break the application when storage is unavailable.
  }
}

function scheduleFlush(): void {
  if (flushTimer !== undefined || typeof window === 'undefined') return;
  flushTimer = window.setTimeout(() => {
    flushTimer = undefined;
    void errorLogger.flush();
  }, 750);
}

function canRecord(fingerprint: string): boolean {
  const now = Date.now();
  if (now - eventWindowStarted >= RATE_WINDOW_MS) {
    eventWindowStarted = now;
    eventWindowCount = 0;
  }
  if (eventWindowCount >= MAX_EVENTS_PER_WINDOW) return false;
  const previous = recentFingerprints.get(fingerprint);
  if (previous && now - previous < DEDUPE_WINDOW_MS) return false;
  recentFingerprints.set(fingerprint, now);
  eventWindowCount += 1;
  return true;
}

async function buildRow(context: DiagnosticContext, error?: unknown): Promise<DiagnosticRow> {
  const details = error !== undefined
    ? errorDetails(error)
    : { message: safeString(context.eventType ?? 'Diagnostic event'), stack: null, code: null, status: null };
  let userId = context.userId ?? null;
  let sessionState = context.sessionState ?? 'unknown';
  if (supabase && !userId) {
    try {
      const { data } = await supabase.auth.getSession();
      userId = data.session?.user.id ?? null;
      sessionState = data.session ? 'authenticated' : 'anonymous';
    } catch {
      sessionState = 'unknown';
    }
  }
  if (!UUID_PATTERN.test(userId || '')) userId = null;
  const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const row = {
    created_at: nowIso(),
    severity: context.severity ?? 'error',
    event_type: safeString(context.eventType ?? 'UNEXPECTED_ERROR', 80),
    feature: safeString(context.feature ?? 'frontend', 80),
    route: safeString(context.route ?? (typeof location === 'undefined' ? '' : location.pathname), 240) || null,
    action: safeString(context.action ?? '', 120) || null,
    message: details.message,
    error_code: safeString(context.errorCode ?? details.code ?? '', 120) || null,
    http_status: [context.httpStatus, details.status].find((status) => Number.isInteger(status) && (status as number) >= 100 && (status as number) <= 599) ?? null,
    stack_trace: details.stack,
    request_id: safeString(context.requestId ?? requestId(), 120),
    user_id: userId,
    session_state: safeString(sessionState, 40),
    device: typeof navigator === 'undefined' ? 'unknown' : safeString(navigator.platform || 'unknown', 80),
    browser: browserName(userAgent),
    os: osName(userAgent),
    app_version: safeString(import.meta.env.VITE_APP_VERSION || import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA || 'unknown', 120),
    environment: import.meta.env.PROD ? 'production' : 'development',
    fingerprint: '',
    metadata: safeMetadata(context.metadata),
  } satisfies Omit<DiagnosticRow, 'fingerprint'> & { fingerprint: string };
  row.fingerprint = fingerprintFor(row);
  return row;
}

async function capture(context: DiagnosticContext, error?: unknown): Promise<void> {
  try {
    const row = await buildRow(context, error);
    if (!canRecord(row.fingerprint)) return;
    queue.push(row);
    queue = queue.slice(-MAX_QUEUE_SIZE);
    persistQueue();
    scheduleFlush();
  } catch {
    // Error reporting is deliberately best-effort.
  }
}

export const errorLogger = {
  capture: (context: DiagnosticContext) => capture(context),
  captureException: (error: unknown, context: DiagnosticContext = {}) => capture({ ...context, eventType: context.eventType ?? 'UNEXPECTED_EXCEPTION' }, error),
  captureRequestError: (error: unknown, context: DiagnosticContext = {}) => capture({ ...context, eventType: context.eventType ?? 'REQUEST_FAILED', severity: context.severity ?? 'error' }, error),
  captureAuthError: (error: unknown, action: string, context: DiagnosticContext = {}) => capture({ ...context, action, feature: context.feature ?? 'auth', eventType: context.eventType ?? 'AUTH_FAILURE', severity: context.severity ?? 'warning' }, error),
  captureEvent: (eventType: string, context: DiagnosticContext = {}) => capture({ ...context, eventType, severity: context.severity ?? 'info' }),
  flush: async (): Promise<void> => {
    if (!supabase || flushing || queue.length === 0) return;
    flushing = true;
    try {
      const batch = queue.slice(0, MAX_BATCH_SIZE);
      const { error } = await supabase.from('system_events').insert(batch);
      if (!error) {
        queue = queue.slice(batch.length);
        persistQueue();
      }
    } catch {
      // Keep the queue for a later online event/retry. Never replace an app error.
    } finally {
      flushing = false;
      if (queue.length > 0 && supabase) scheduleFlush();
    }
  },
  installGlobalHandlers: (): (() => void) => {
    if (typeof window === 'undefined') return () => undefined;
    const onError = (event: ErrorEvent) => {
      void errorLogger.captureException(event.error || new Error(event.message), { feature: 'frontend', eventType: 'JAVASCRIPT_RUNTIME_ERROR', metadata: { filename: event.filename, line: event.lineno, column: event.colno } });
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      void errorLogger.captureException(event.reason, { feature: 'frontend', eventType: 'UNHANDLED_PROMISE_REJECTION' });
    };
    const onOnline = () => { void errorLogger.flush(); };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    window.addEventListener('online', onOnline);
    void errorLogger.flush();
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
      window.removeEventListener('online', onOnline);
    };
  },
};
