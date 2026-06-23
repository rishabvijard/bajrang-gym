'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { sb } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [method, setMethod] = useState('email'); // 'email' | 'phone' | 'google'
  const [stage, setStage] = useState('enter'); // 'enter' | 'otp'
  const [id, setId] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const note = (text, type = 'err') => setMsg({ text, type });

  async function google() {
    setBusy(true);
    const { error } = await sb().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) { note(error.message); setBusy(false); }
  }

  async function sendOtp(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const payload = method === 'email' ? { email: id.trim() } : { phone: id.trim() };
    const { error } = await sb().auth.signInWithOtp(payload);
    setBusy(false);
    if (error) return note(error.message);
    setStage('otp');
    note(`OTP sent to your ${method}. Enter the 6-digit code.`, 'ok');
  }

  async function verify(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const payload = method === 'email'
      ? { email: id.trim(), token: otp.trim(), type: 'email' }
      : { phone: id.trim(), token: otp.trim(), type: 'sms' };
    const { error } = await sb().auth.verifyOtp(payload);
    setBusy(false);
    if (error) return note(error.message);
    router.replace('/');
    router.refresh();
  }

  return (
    <div className="auth-root">
      <div className="auth-card">
        <div className="auth-head">
          <div className="auth-logo" style={{ width: 64, height: 64, fontSize: 32, margin: '0 auto 14px' }}>🦍</div>
          <h1>BAJRANG GYM</h1>
          <p>Sign in to continue</p>
        </div>

        {msg && (
          <div className={`otp-demo`} style={{ marginBottom: 16, borderColor: msg.type === 'ok' ? 'rgba(22,216,112,.45)' : 'rgba(239,68,68,.45)' }}>
            {msg.text}
          </div>
        )}

        <button className="btn btn-ghost btn-block" onClick={google} disabled={busy} style={{ marginBottom: 16 }}>
          <span style={{ fontWeight: 700 }}>G</span>&nbsp; Continue with Google (Gmail)
        </button>

        <div className="role-toggle">
          <button className={`role-btn ${method === 'email' ? 'active' : ''}`} onClick={() => { setMethod('email'); setStage('enter'); }}>✉️ Email OTP</button>
          <button className={`role-btn ${method === 'phone' ? 'active' : ''}`} onClick={() => { setMethod('phone'); setStage('enter'); }}>📱 Phone OTP</button>
        </div>

        {stage === 'enter' ? (
          <form className="auth-form" onSubmit={sendOtp}>
            <div className="field">
              <label>{method === 'email' ? 'Email address' : 'Phone number (with country code)'}</label>
              <input
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder={method === 'email' ? 'you@gmail.com' : '+919876543210'}
                required
              />
            </div>
            <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
              {busy ? 'Sending…' : 'Send OTP 📲'}
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={verify}>
            <div className="field">
              <label>Enter 6-digit OTP</label>
              <input className="otp-input" inputMode="numeric" maxLength={6} value={otp}
                onChange={(e) => setOtp(e.target.value)} placeholder="······" required />
            </div>
            <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
              {busy ? 'Verifying…' : 'Verify & Login ✔'}
            </button>
            <button className="btn btn-ghost btn-block" type="button" onClick={() => setStage('enter')}>← Back</button>
          </form>
        )}

        <p className="auth-note">
          The first person to sign in becomes the <b>Gym Owner</b>. Members sign in with the
          email/phone the gym registered for them.
        </p>
      </div>
    </div>
  );
}
