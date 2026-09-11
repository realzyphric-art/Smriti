import type { Session } from '@supabase/supabase-js';
import type { AppRole, LanguageCode } from '@/types';
import { supabase } from '@/lib/supabase';
import { errorLogger } from '@/services/errorLogger';

export type OtpFlow = 'signup' | 'login';

interface OtpSessionResponse {
  challengeId?: string;
  session?: Session;
  error?: string;
}

export interface AuthContext {
  userId: string;
  role: AppRole;
  displayName: string;
  needsRoleSelection: boolean;
  language: LanguageCode;
}

export const PASSWORD_REQUIREMENTS = 'Use at least 8 characters, including one letter and one number.';
const AUTH_REQUEST_TIMEOUT_MS = 15000;

const INTERNAL_AUTH_DOMAIN = 'gnyjnntqyvfamdgcyjce.supabase.co';

export function isValidUsername(username: string): boolean {
  const normalized = username.trim();
  return /^[A-Za-z0-9_]{3,32}$/.test(normalized) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

/** Supabase Auth is email-based; real emails are preferred, with a legacy internal fallback for local username flows. */
function authEmailForUsername(username: string): string {
  const normalized = username.trim().toLowerCase();
  return normalized.includes('@') ? normalized : `${normalized}@${INTERNAL_AUTH_DOMAIN}`;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function isStrongEnoughPassword(password: string): boolean {
  return password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);
}

/** Turns Supabase's low-level messages into clear guidance for caregivers. */
export function authErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const normalized = message.toLowerCase();
  if (normalized.includes('email not confirmed')) {
    return 'Your account is not ready yet. Ask the administrator to finish account setup, then try again.';
  }
  if (normalized.includes('invalid login credentials') || normalized.includes('email or password is incorrect')) {
    return 'The username or password is incorrect. Check both fields and try again.';
  }
  if (normalized.includes('already registered') || normalized.includes('user already exists')) {
    return 'An account with this username already exists. Try signing in instead.';
  }
  if (normalized.includes('rate limit') || normalized.includes('too many requests')) {
    return 'Too many attempts. Please wait a few minutes and try again.';
  }
  if (normalized.includes('supabase is not configured') || normalized.includes('missing supabase') || normalized.includes('configuration')) {
    return 'Smriti sign-in is not configured on this deployment. Guest Mode is still available.';
  }
  if (normalized.includes('email signups are disabled') || normalized.includes('signup is disabled')) {
    return 'New account creation is currently disabled. Ask an administrator to create your account.';
  }
  if (normalized.includes('profile') || normalized.includes('schema cache') || normalized.includes('database error')) {
    return 'Your password was accepted, but your Smriti profile could not be loaded. Please try again, or ask an administrator to check your account.';
  }
  if (normalized.includes('timeout') || normalized.includes('timed out')) {
    return 'Sign-in took too long. Check your connection and try again.';
  }
  if (normalized.includes('fetch') || normalized.includes('network') || normalized.includes('failed to')) {
    return 'We could not reach Supabase. Check your internet connection and try again.';
  }
  return message || fallback;
}

async function withAuthTimeout<T>(operation: Promise<T>): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Authentication request timed out.')), AUTH_REQUEST_TIMEOUT_MS);
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function edgeError(error: unknown, fallback: string): Promise<Error> {
  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    try {
      const body = await context.clone().json() as { error?: string };
      if (body.error) return new Error(body.error);
    } catch {
      // The generic message below intentionally does not disclose account state.
    }
  }
  return new Error(authErrorMessage(error, fallback));
}

async function invokeOtp(payload: Record<string, unknown>): Promise<OtpSessionResponse> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const requestId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `auth-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const { data, error } = await supabase.functions.invoke<OtpSessionResponse>('auth-otp', {
    body: { ...payload, requestId },
    headers: { 'x-request-id': requestId },
  });
  if (error) throw await edgeError(error, 'Unable to complete this request right now.');
  if (data?.error) throw new Error(data.error);
  return data ?? {};
}

/** Sends a Supabase-managed email OTP through the rate-limited Edge Function. */
export async function requestEmailOtp(
  flow: OtpFlow,
  email: string,
  options?: { password?: string; displayName?: string; language?: LanguageCode },
): Promise<string> {
  void errorLogger.captureEvent('OTP_REQUEST_STARTED', { feature: 'auth', action: flow, metadata: { flow } });
  try {
    const result = await invokeOtp({ action: flow, email, password: options?.password, displayName: options?.displayName, language: options?.language });
    if (!result.challengeId) throw new Error('Unable to start verification. Please try again.');
    void errorLogger.captureEvent('OTP_REQUEST_SUCCESS', { feature: 'auth', action: flow, metadata: { flow } });
    return result.challengeId;
  } catch (error) {
    void errorLogger.captureAuthError(error, flow, { eventType: 'OTP_REQUEST_FAILED', metadata: { flow } });
    throw error;
  }
}

/** Requests another OTP without storing or generating a code in the browser. */
export async function resendEmailOtp(flow: OtpFlow, email: string, challengeId: string): Promise<void> {
  void errorLogger.captureEvent('OTP_RESEND_STARTED', { feature: 'auth', action: 'resend', metadata: { flow } });
  try {
    await invokeOtp({ action: 'resend', flow, email, challengeId });
    void errorLogger.captureEvent('OTP_RESEND_SUCCESS', { feature: 'auth', action: 'resend', metadata: { flow } });
  } catch (error) {
    void errorLogger.captureAuthError(error, 'resend', { eventType: 'OTP_RESEND_FAILED', metadata: { flow } });
    throw error;
  }
}

/** Verifies the Supabase OTP server-side and installs only the returned Auth session. */
export async function verifyEmailOtp(flow: OtpFlow, email: string, token: string, challengeId: string, password?: string): Promise<void> {
  void errorLogger.captureEvent('OTP_VERIFY_STARTED', { feature: 'auth', action: 'verify', metadata: { flow } });
  try {
    const result = await invokeOtp({ action: 'verify', flow, email, token, challengeId, password });
    if (!result.session?.access_token || !result.session.refresh_token) {
      throw new Error('That code could not be verified. Request a new code and try again.');
    }
    if (!supabase) throw new Error('Supabase is not configured.');
    const { error } = await supabase.auth.setSession(result.session);
    if (error) throw error;
    void errorLogger.captureEvent('OTP_VERIFY_SUCCESS', { feature: 'auth', action: 'verify', metadata: { flow } });
  } catch (error) {
    void errorLogger.captureAuthError(error, 'verify', { eventType: 'OTP_VERIFY_FAILED', metadata: { flow } });
    throw error;
  }
}

export function authRedirectUrl(path = '/'): string {
  // window.location.origin is the deployed Vercel domain in production and
  // localhost during development, so reset links never contain a hard-coded host.
  return `${window.location.origin}${path.startsWith('/') ? path : `/${path}`}`;
}

export async function signInWithGoogle() {
  if (!supabase) throw new Error('Supabase is not configured.');
  void errorLogger.captureEvent('OAUTH_SIGNIN_STARTED', { feature: 'auth', action: 'google' });
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: authRedirectUrl('/') },
    });
    if (error) throw error;
  } catch (error) {
    void errorLogger.captureAuthError(error, 'google', { eventType: 'OAUTH_SIGNIN_FAILED' });
    throw error;
  }
}

export async function signUp(username: string, password: string, displayName = '', role?: AppRole) {
  if (!supabase) throw new Error('Supabase is not configured.');
  void errorLogger.captureEvent('SIGNUP_STARTED', { feature: 'auth', action: 'password', metadata: { role: role ?? 'unknown' } });
  try {
    const metadata = { display_name: displayName.trim(), ...(role ? { requested_role: role } : {}) };
    const { data, error } = await withAuthTimeout(supabase.auth.signUp({ email: authEmailForUsername(username), password, options: { data: { ...metadata, username: username.trim().toLowerCase() } } }));
    if (error) throw error;
    if (!data.user) throw new Error('No account was returned.');
    void errorLogger.captureEvent('SIGNUP_SUCCESS', { feature: 'auth', action: 'password', metadata: { role: role ?? 'unknown' } });
    return { user: data.user, session: data.session };
  } catch (error) {
    void errorLogger.captureAuthError(error, 'password', { eventType: 'SIGNUP_FAILED' });
    throw error;
  }
}

export async function signIn(username: string, password: string) {
  if (!supabase) throw new Error('Supabase is not configured.');
  void errorLogger.captureEvent('PASSWORD_SIGNIN_STARTED', { feature: 'auth', action: 'password' });
  try {
    const { data, error } = await withAuthTimeout(supabase.auth.signInWithPassword({ email: authEmailForUsername(username), password }));
    if (error) throw error;
    void errorLogger.captureEvent('PASSWORD_SIGNIN_SUCCESS', { feature: 'auth', action: 'password' });
    return data;
  } catch (error) {
    void errorLogger.captureAuthError(error, 'password', { eventType: 'PASSWORD_SIGNIN_FAILED' });
    throw error;
  }
}

export async function resetPasswordForEmail(email: string) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { error } = await withAuthTimeout(supabase.auth.resetPasswordForEmail(email, {
    redirectTo: authRedirectUrl('/reset-password'),
  }));
  if (error) throw error;
}

export async function updatePassword(password: string) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

export async function signOut() {
  if (supabase) {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      void errorLogger.captureEvent('SIGNOUT_SUCCESS', { feature: 'auth', action: 'signout' });
    } catch (error) {
      void errorLogger.captureAuthError(error, 'signout', { eventType: 'SIGNOUT_FAILED' });
      throw error;
    }
  }
}

export async function currentSession() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function currentAuthContext(): Promise<AuthContext | null> {
  if (!supabase) return null;
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    if (!user) return null;
    const { data: profile, error: profileError } = await supabase.from('profiles').select('role, display_name, role_selected_at, language').eq('id', user.id).maybeSingle();
    if (profileError) throw profileError;
    if (!profile) return null;
    return { userId: user.id, role: profile.role as AppRole, displayName: profile.display_name || user.email || 'User', needsRoleSelection: !profile.role_selected_at, language: profile.language as LanguageCode };
  } catch (error) {
    void errorLogger.captureRequestError(error, { feature: 'auth', eventType: 'SESSION_RESTORE_FAILED', action: 'restore_session' });
    throw error;
  }
}

export async function isCurrentUserAdmin(): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { data, error } = await supabase.rpc('is_my_system_admin');
    if (error) throw error;
    return data === true;
  } catch (error) {
    void errorLogger.captureRequestError(error, { feature: 'admin', eventType: 'ADMIN_AUTH_CHECK_FAILED', action: 'check_admin' });
    return false;
  }
}

export async function setMyLanguage(language: LanguageCode): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc('set_my_language', { selected_language: language });
  if (error) throw error;
}

export async function selectMyAppRole(role: AppRole): Promise<string | null> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.rpc('select_my_app_role', { selected_role: role });
  if (error) throw error;
  return data as string | null;
}

export function onAuthStateChange(callback: (authenticated: boolean) => void) {
  if (!supabase) return () => undefined;
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(Boolean(session)));
  return () => data.subscription.unsubscribe();
}
