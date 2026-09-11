import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export interface SupabaseDiagnostics {
  urlPresent: boolean;
  anonKeyPresent: boolean;
  clientInitialized: boolean;
}

export async function inspectSupabase(): Promise<SupabaseDiagnostics> {
  const result: SupabaseDiagnostics = {
    urlPresent: Boolean(import.meta.env.VITE_SUPABASE_URL),
    anonKeyPresent: Boolean(import.meta.env.VITE_SUPABASE_ANON_KEY),
    clientInitialized: isSupabaseConfigured && Boolean(supabase),
  };

  if (import.meta.env.DEV) {
    console.info('[Smriti] Supabase diagnostics', result);
  }
  return result;
}
