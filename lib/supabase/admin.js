import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from './env';

// Server-only client using the service role key. NEVER import this in client code.
export function admin() {
  return createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
