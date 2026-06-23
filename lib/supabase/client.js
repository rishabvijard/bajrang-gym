import { createBrowserClient } from '@supabase/ssr';

// Lazy singleton — constructed only when first used (in effects / handlers),
// so the build can prerender without env vars present.
let _client = null;
export function sb() {
  if (!_client) {
    _client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
  }
  return _client;
}
