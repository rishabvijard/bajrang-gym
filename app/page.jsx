import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import Dashboard from '@/components/Dashboard';

export const dynamic = 'force-dynamic';

export default async function Home() {
  // No env yet → show a friendly setup notice instead of crashing.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return (
      <div className="auth-root">
        <div className="auth-card">
          <div className="auth-head">
            <div className="auth-logo" style={{ width: 64, height: 64, fontSize: 32, margin: '0 auto 14px' }}>🦍</div>
            <h1>BAJRANG GYM</h1>
            <p>Almost there — connect your database.</p>
          </div>
          <p className="muted" style={{ lineHeight: 1.7, fontSize: 14 }}>
            Create a free <b>Supabase</b> project, run the SQL in <code>supabase/schema.sql</code>,
            then add <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to
            <code> .env.local</code>. See <b>README.md</b> for the 5-minute setup.
          </p>
        </div>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return <Dashboard />;
}
