'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { sb } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [method, setMethod] = useState('password'); // 'password' | 'email' | 'phone'
  const [signup, setSignup] = useState(false);
  const [stage, setStage] = useState('enter'); // for OTP: 'enter' | 'otp'
  const [id, setId] = useState('');
  const [pass, setPass] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const note = (text, type = 'err') => setMsg({ text, type });
  const done = () => { router.replace('/'); router.refresh(); };

  /* ---- password (most reliable) ---- */
  async function submitPassword(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      if (signup) {
        const { data, error } = await sb().auth.signUp({ email: id.trim(), password: pass });
        if (error) throw error;
        if (data.session) return done();            // confirm-email OFF → instant login
        note('Account created! If asked to confirm your email, turn OFF "Confirm email" in Supabase → Auth → Providers → Email, then sign in.', 'ok');
        setSignup(false);
      } else {
        const { error } = await sb().auth.signInWithPassword({ email: id.trim(), password: pass });
        if (error) throw error;
        done();
      }
    } catch (err) { note(err.message); }
    setBusy(false);
  }

  /* ---- google ---- */
  async function google() {
    setBusy(true);
    const { error } = await sb().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) { note(error.message); setBusy(false); }
  }

  /* ---- otp (email / phone) ---- */
  async function sendOtp(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const payload = method === 'email' ? { email: id.trim() } : { phone: id.trim() };
    const { error } = await sb().auth.signInWithOtp(payload);
    setBusy(false);
    if (error) return note(error.message);
    setStage('otp');
    note(`Code sent to your ${method}. Check inbox/spam.`, 'ok');
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
    done();
  }

  return (
    <div className="auth-root">
      <div className="auth-card">
        <div className="auth-head">
          <div className="auth-logo" style={{ width: 64, height: 64, fontSize: 32, margin: '0 auto 14px' }}>🦍</div>
          <h1>BAJRANG GYM</h1>
          <p>{signup ? 'Create your account' : 'Sign in to continue'}</p>
        </div>

        {msg && (
          <div className="otp-demo" style={{ marginBottom: 16, borderColor: msg.type === 'ok' ? 'rgba(22,216,112,.45)' : 'rgba(239,68,68,.45)', textAlign: 'left' }}>
            {msg.text}
          </div>
        )}

        <button className="btn btn-ghost btn-block" onClick={google} disabled={busy} style={{ marginBottom: 16 }}>
          <span style={{ fontWeight: 700 }}>G</span>&nbsp; Continue with Google
        </button>

        <div className="role-toggle">
          <button className={`role-btn ${method === 'password' ? 'active' : ''}`} onClick={() => { setMethod('password'); setStage('enter'); setMsg(null); }}>🔑 Password</button>
          <button className={`role-btn ${method === 'email' ? 'active' : ''}`} onClick={() => { setMethod('email'); setStage('enter'); setMsg(null); }}>✉️ Email OTP</button>
          <button className={`role-btn ${method === 'phone' ? 'active' : ''}`} onClick={() => { setMethod('phone'); setStage('enter'); setMsg(null); }}>📱 Phone</button>
        </div>

        {method === 'password' && (
          <form className="auth-form" onSubmit={submitPassword}>
            <div className="field"><label>Email</label>
              <input type="email" value={id} onChange={(e) => setId(e.target.value)} placeholder="you@gmail.com" required /></div>
            <div className="field"><label>Password</label>
              <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="min 6 characters" minLength={6} required /></div>
            <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
              {busy ? 'Please wait…' : signup ? 'Create Account 🚀' : 'Login'}
            </button>
            <button type="button" className="btn btn-ghost btn-block" onClick={() => { setSignup(!signup); setMsg(null); }}>
              {signup ? '← I already have an account' : 'New here? Create an account'}
            </button>
          </form>
        )}

        {method !== 'password' && stage === 'enter' && (
          <form className="auth-form" onSubmit={sendOtp}>
            <div className="field">
              <label>{method === 'email' ? 'Email address' : 'Phone (with country code)'}</label>
              <input value={id} onChange={(e) => setId(e.target.value)}
                placeholder={method === 'email' ? 'you@gmail.com' : '+919876543210'} required />
            </div>
            <button className="btn btn-primary btn-block" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send Code 📲'}</button>
          </form>
        )}

        {method !== 'password' && stage === 'otp' && (
          <form className="auth-form" onSubmit={verify}>
            <div className="field"><label>Enter 6-digit code</label>
              <input className="otp-input" inputMode="numeric" maxLength={6} value={otp}
                onChange={(e) => setOtp(e.target.value)} placeholder="······" required /></div>
            <button className="btn btn-primary btn-block" type="submit" disabled={busy}>{busy ? 'Verifying…' : 'Verify & Login ✔'}</button>
            <button className="btn btn-ghost btn-block" type="button" onClick={() => setStage('enter')}>← Back</button>
          </form>
        )}

        <p className="auth-note">
          The first person to sign in becomes the <b>Gym Owner</b>. Members sign in with the
          email the gym registered for them.
        </p>
      </div>
    </div>
  );
}
