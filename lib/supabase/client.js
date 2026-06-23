import { createBrowserClient } from '@supabase/ssr';
import { SUPABASE_URL, SUPABASE_KEY } from './env';

// Lazy singleton — constructed only when first used (in effects / handlers),
// so the build can prerender without env vars present.
let _client = null;
export function sb() {
  if (!_client) {
    _client = createBrowserClient(SUPABASE_URL, SUPABASE_KEY);
  }
  return _client;
}
