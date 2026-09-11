import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { logEdgeEvent, requestIdFor } from '../_shared/errorLogger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-request-id',
  'Content-Type': 'application/json',
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const languageCodes = ['en', 'hi', 'as', 'bn'];

type Flow = 'signup' | 'login';

function clientIp(request: Request): string {
  return (request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown').trim();
}

async function digest(value: string, salt: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${salt}:${value}`);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function validFlow(value: unknown): value is Flow {
  return value === 'signup' || value === 'login';
}

function invalidCredentials() {
  return json({ error: 'The email or password is incorrect. Check both fields and try again.' }, 401);
}

function errorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : 'unknown';
}

function signupErrorMessage(error: unknown, duplicate: boolean): string {
  if (duplicate) return 'An account with this email already exists. Try signing in instead.';
  const code = errorCode(error);
  if (code === 'email_address_invalid') return 'Supabase rejected this email address. Use a valid personal email address.';
  if (code === 'weak_password') return 'Choose a stronger password with at least 8 characters, including a letter and a number.';
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') return 'Too many attempts. Please wait before trying again.';
  return 'Unable to create this account right now.';
}

function otpSendErrorMessage(error: unknown): string {
  const code = errorCode(error);
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') {
    return 'Supabase email sending is rate-limited. Please wait before requesting another code.';
  }
  if (code === 'email_provider_disabled' || code === 'smtp_error') {
    return 'Supabase email delivery is not configured correctly. Please contact the administrator.';
  }
  return 'Unable to send a verification code right now.';
}

async function createChallenge(admin: SupabaseClient, emailHash: string, flow: Flow, ipHash: string): Promise<string> {
  const challengeId = crypto.randomUUID();
  const { error } = await admin.rpc('create_auth_otp_challenge', {
    p_challenge_id: challengeId,
    p_email_key: emailHash,
    p_flow: flow,
    p_ip_key: ipHash,
  });
  if (error) throw error;
  return challengeId;
}

async function challengeIsActive(admin: SupabaseClient, challengeId: string, emailHash: string, flow: Flow): Promise<boolean> {
  const { data, error } = await admin.rpc('get_auth_otp_challenge', {
    p_challenge_id: challengeId,
    p_email_key: emailHash,
    p_flow: flow,
  });
  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}

async function consumeChallenge(admin: SupabaseClient, challengeId: string, emailHash: string, flow: Flow): Promise<boolean> {
  const { data, error } = await admin.rpc('consume_auth_otp_challenge', {
    p_challenge_id: challengeId,
    p_email_key: emailHash,
    p_flow: flow,
  });
  if (error) throw error;
  return data === true;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Request could not be completed.' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const rateLimitSalt = Deno.env.get('AUTH_RATE_LIMIT_SALT');
  if (!url || !anonKey || !serviceRoleKey || !rateLimitSalt) return json({ error: 'Request could not be completed.' }, 500);

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return json({ error: 'Request could not be completed.' }, 400); }

  const action = typeof body.action === 'string' ? body.action : '';
  const flow = typeof body.flow === 'string' ? body.flow : action;
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!emailPattern.test(email) || !validFlow(flow) || !['signup', 'login', 'resend', 'verify'].includes(action)) {
    return json({ error: 'Please check the information and try again.' }, 400);
  }

  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const auth = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const correlationId = requestIdFor(request);
  void logEdgeEvent(admin, request, { eventType: 'AUTH_OTP_REQUEST_STARTED', action, requestId: correlationId, metadata: { flow } });
  const limitAction = action === 'verify' ? 'otp_verify' : flow === 'login' ? 'otp_login' : 'otp_signup';
  // Allow up to eight OTP sends/resends per email and IP in the window, while
  // keeping verification attempts at five to limit brute-force guessing.
  const maxAttempts = action === 'verify' ? 5 : 8;
  const windowSeconds = 15 * 60;
  const lockSeconds = 15 * 60;
  let emailHash = '';
  let ipHash = '';

  try {
    [emailHash, ipHash] = await Promise.all([
      digest(`email:${email}`, rateLimitSalt),
      digest(`ip:${clientIp(request)}`, rateLimitSalt),
    ]);
    const attempts = await Promise.all([emailHash, ipHash].map(async (subjectKey) => {
      const { data, error } = await admin.rpc('consume_auth_rate_limit', {
        p_subject_key: subjectKey, p_action_name: limitAction, p_max_attempts: maxAttempts,
        p_window_seconds: windowSeconds, p_lock_seconds: lockSeconds,
      });
      if (error) throw error;
      return data === true;
    }));
    if (attempts.some((allowed) => !allowed)) return json({ error: 'Too many requests. Please wait before trying again.' }, 429);
  } catch (error) {
    void logEdgeEvent(admin, request, { eventType: 'AUTH_OTP_RATE_LIMIT_FAILED', action, requestId: correlationId, error, errorCode: errorCode(error), httpStatus: 503, metadata: { flow } });
    return json({ error: 'Request could not be completed right now. Please try again.' }, 503);
  }

  try {
    if (action === 'signup') {
      const password = typeof body.password === 'string' ? body.password : '';
      const displayName = typeof body.displayName === 'string' ? body.displayName.trim().slice(0, 100) : '';
      const language = typeof body.language === 'string' && languageCodes.includes(body.language) ? body.language : 'en';
      if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password) || !displayName) {
        return json({ error: 'Please check the information and try again.' }, 400);
      }

      const { data, error } = await auth.auth.signUp({ email, password, options: { data: { display_name: displayName, language } } });
      const duplicate = error?.message?.toLowerCase().includes('already') || data.user?.identities?.length === 0;
      if (error || !data.user || duplicate) {
        void logEdgeEvent(admin, request, { eventType: 'SIGNUP_FAILED', action, requestId: correlationId, error, errorCode: errorCode(error), httpStatus: 400, metadata: { flow, duplicate } });
        return json({ error: signupErrorMessage(error, duplicate) }, 400);
      }

      // A normal signup sends the confirmation OTP. If a project is temporarily
      // autoconfirmed, send an OTP explicitly while keeping its session server-side.
      if (data.session) {
        const { error: otpError } = await auth.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
        if (otpError) {
          void logEdgeEvent(admin, request, { eventType: 'OTP_REQUEST_FAILED', action, requestId: correlationId, error: otpError, errorCode: errorCode(otpError), httpStatus: 503, metadata: { flow } });
          return json({ error: otpSendErrorMessage(otpError) }, 503);
        }
      }
      const challengeId = await createChallenge(admin, emailHash, 'signup', ipHash);
      void logEdgeEvent(admin, request, { eventType: 'OTP_REQUEST_SUCCESS', action, requestId: correlationId, metadata: { flow } });
      return json({ ok: true, challengeId });
    }

    if (action === 'login') {
      const password = typeof body.password === 'string' ? body.password : '';
      if (!password) return invalidCredentials();

      // This is the password gate. The returned session stays inside this
      // non-persisted server-side client and is never sent to the browser.
      const { data: passwordResult, error: passwordError } = await auth.auth.signInWithPassword({ email, password });
      if (passwordError || !passwordResult.user) {
        void logEdgeEvent(admin, request, { eventType: 'PASSWORD_SIGNIN_FAILED', action, requestId: correlationId, error: passwordError, errorCode: errorCode(passwordError), httpStatus: 401, metadata: { flow } });
        return invalidCredentials();
      }

      const { error: otpError } = await auth.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
      if (otpError) {
        void logEdgeEvent(admin, request, { eventType: 'OTP_REQUEST_FAILED', action, requestId: correlationId, error: otpError, errorCode: errorCode(otpError), httpStatus: 503, metadata: { flow } });
        return json({ error: otpSendErrorMessage(otpError) }, 503);
      }
      const challengeId = await createChallenge(admin, emailHash, 'login', ipHash);
      void logEdgeEvent(admin, request, { eventType: 'OTP_REQUEST_SUCCESS', action, requestId: correlationId, metadata: { flow } });
      return json({ ok: true, challengeId });
    }

    const challengeId = typeof body.challengeId === 'string' ? body.challengeId : '';
    if (!uuidPattern.test(challengeId) || !(await challengeIsActive(admin, challengeId, emailHash, flow))) {
      return json({ error: 'This verification request has expired. Start again and request a new code.' }, 400);
    }

    if (action === 'resend') {
      const resendResult = flow === 'signup'
        ? await auth.auth.resend({ type: 'signup', email })
        : await auth.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
      if (resendResult.error) {
        void logEdgeEvent(admin, request, { eventType: 'OTP_RESEND_FAILED', action, requestId: correlationId, error: resendResult.error, errorCode: errorCode(resendResult.error), httpStatus: 503, metadata: { flow } });
        return json({ error: otpSendErrorMessage(resendResult.error) }, 503);
      }
      void logEdgeEvent(admin, request, { eventType: 'OTP_RESEND_SUCCESS', action, requestId: correlationId, metadata: { flow } });
      return json({ ok: true, challengeId });
    }

    const token = typeof body.token === 'string' ? body.token.replace(/\s/g, '') : '';
    if (!/^\d{6}$/.test(token)) return json({ error: 'That code is invalid or has expired.' }, 400);

    // Re-check the password immediately before issuing the final session. This
    // prevents a caller from turning an OTP alone into a passwordless login.
    if (flow === 'login') {
      const password = typeof body.password === 'string' ? body.password : '';
      if (!password) return invalidCredentials();
      const { data: passwordResult, error: passwordError } = await auth.auth.signInWithPassword({ email, password });
      if (passwordError || !passwordResult.user) {
        void logEdgeEvent(admin, request, { eventType: 'PASSWORD_SIGNIN_FAILED', action, requestId: correlationId, error: passwordError, errorCode: errorCode(passwordError), httpStatus: 401, metadata: { flow, stage: 'otp_verify' } });
        return invalidCredentials();
      }
    }

    const { data, error } = await auth.auth.verifyOtp({ email, token, type: 'email' });
    if (error || !data.session) {
      void logEdgeEvent(admin, request, { eventType: 'OTP_VERIFY_FAILED', action, requestId: correlationId, error, errorCode: errorCode(error), httpStatus: 400, metadata: { flow } });
      return json({ error: 'That code is invalid or has expired.' }, 400);
    }
    if (!(await consumeChallenge(admin, challengeId, emailHash, flow))) {
      return json({ error: 'This verification request has expired. Start again and request a new code.' }, 400);
    }
    void logEdgeEvent(admin, request, { eventType: 'OTP_VERIFY_SUCCESS', action, requestId: correlationId, metadata: { flow } });
    return json({ session: data.session });
  } catch (error) {
    void logEdgeEvent(admin, request, { eventType: 'AUTH_OTP_REQUEST_FAILED', action, requestId: correlationId, error, errorCode: errorCode(error), httpStatus: 503, metadata: { flow } });
    return json({ error: 'Request could not be completed right now. Please try again.' }, 503);
  }
});
