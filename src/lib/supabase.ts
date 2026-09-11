import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Temporary local-debug switch. Keep cloud auth disabled while the rest of
 * the app is being debugged; flip this to true to restore Supabase login.
 */
export const ENABLE_CLOUD_AUTH = true;

/**
 * Supabase is optional while the app is being used as an offline-first demo.
 * Add both VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable the cloud
 * boundary. The publishable/anon key is safe for browser use when RLS is on;
 * never put a service-role key in Vite environment variables.
 */
export const isSupabaseConfigured = ENABLE_CLOUD_AUTH && Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = ENABLE_CLOUD_AUTH && supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
