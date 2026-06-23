// Normalizes the Supabase URL so the app works even if someone pastes the
// REST endpoint (…supabase.co/rest/v1/) instead of the base project URL.
export const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '')
  .trim()
  .replace(/\/+$/, '')        // drop trailing slashes
  .replace(/\/rest\/v1$/, '') // drop a trailing /rest/v1
  .replace(/\/+$/, '');       // drop any slash left behind

export const SUPABASE_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
