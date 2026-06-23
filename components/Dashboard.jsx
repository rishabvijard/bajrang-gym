'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as api from '@/lib/api';

/* ---------------- helpers ---------------- */
const todayISO = () => new Date().toISOString().slice(0, 10);
const nowTime = () => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt) ? '—' : dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};
const daysBetween = (a, b) => Math.round((new Date(b).setHours(0, 0, 0, 0) - new Date(a).setHours(0, 0, 0, 0)) / 86400000);
const daysLeft = (m) => daysBetween(todayISO(), m.end_date);
const addMonths = (iso, months) => { const d = new Date(iso); d.setMonth(d.getMonth() + Number(months)); return d.toISOString().slice(0, 10); };
const initials = (n) => (n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const normPhone = (p) => (p || '').replace(/\D/g, '');
const STATUS_LABEL = { active: 'Active', expiring: 'Expiring', expired: 'Expired', frozen: 'Frozen' };

export default function Dashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState(null);
  const [me, setMe] = useState(null);
  const [settings, setSettings] = useState(api.DEFAULT_SETTINGS);
  const [members, setMembers] = useState([]);
  const [plans, setPlans] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [gallery, setGallery] = useState([]);
  const [view, setView] = useState('dashboard');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [navOpen, setNavOpen] = useState(false);
  const [modal, setModal] = useState(null); // {title, node, wide}
  const [toasts, setToasts] = useState([]);

  const toast = (text, type = '') => {
    const id = Math.random();
    setToasts((t) => [...t, { id, text, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000);
  };
  const closeModal = () => setModal(null);

  const money = (n) => (settings.currency || '₹') + Number(n || 0).toLocaleString('en-IN');
  const statusOf = (m) => {
    if (m.frozen) return 'frozen';
    const dl = daysLeft(m);
    if (dl < 0) return 'expired';
    if (dl <= (settings.reminder_days || 7)) return 'expiring';
    return 'active';
  };

  /* ---------------- load ---------------- */
  async function loadAll() {
    const [se, pl, at, ga] = await Promise.all([
      api.getSettings(), api.getPlans(), api.getAttendance(), api.getGallery(),
    ]);
    setSettings(se); setPlans(pl); setAttendance(at); setGallery(ga);
    try { setMembers(await api.getMembers()); } catch { setMembers([]); }
  }
  useEffect(() => {
    (async () => {
      try {
        const sess = await api.initSession();
        const r = sess?.profile?.role || 'member';
        setRole(r);
        setMe(sess?.member || null);
        await loadAll();
        setView(r === 'owner' ? 'dashboard' : 'mydash');
      } catch (e) {
        toast('Setup needed — check database & SQL. ' + (e.message || ''), 'err');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const reloadMembers = async () => setMembers(await api.getMembers());
  const reloadAttendance = async () => setAttendance(await api.getAttendance());

  async function doSignOut() {
    if (!confirm('Log out of BAJRANG GYM?')) return;
    await api.signOut(); router.replace('/login'); router.refresh();
  }

  /* ---------------- derived ---------------- */
  const curMember = useMemo(() => me || members.find((m) => m.id === me?.id), [me, members]);

  if (loading) {
    return (
      <div className="auth-root"><div className="auth-card" style={{ textAlign: 'center' }}>
        <div className="auth-logo" style={{ width: 64, height: 64, fontSize: 32, margin: '0 auto 16px' }}>🦍</div>
        <h1 style={{ fontFamily: 'var(--head)' }}>BAJRANG GYM</h1>
        <p className="muted" style={{ marginTop: 8 }}>Loading your gym…</p>
      </div></div>
    );
  }

  /* ---------------- shared UI bits ---------------- */
  const Avatar = ({ m, lg }) => m.photo
    ? <img className={lg ? 'avatar lg' : 'avatar'} src={m.photo} alt="" />
    : <div className={`avatar ${lg ? 'lg' : ''} avatar-fallback ${lg ? 'lg' : ''}`}>{initials(m.name)}</div>;
  const Badge = ({ s }) => <span className={`badge ${s}`}>{STATUS_LABEL[s]}</span>;
  const Stat = ({ cls, ic, val, lbl }) => (
    <div className={`stat ${cls}`}><div className="s-ic">{ic}</div><div className="s-val">{val}</div><div className="s-lbl">{lbl}</div></div>
  );
  const Empty = ({ ic, h, p }) => <div className="empty"><div className="e-ic">{ic}</div><h3>{h}</h3><p>{p}</p></div>;

  const OWNER_NAV = [['dashboard', '📊', 'Dashboard'], ['members', '🧑‍🤝‍🧑', 'Members'], ['attendance', '📋', 'Attendance'],
    ['plans', '🏷️', 'Plans'], ['gallery', '🖼️', 'Gym Gallery'], ['reminders', '🔔', 'Reminders'], ['settings', '⚙️', 'Settings']];
  const MEMBER_NAV = [['mydash', '🏠', 'My Dashboard'], ['myattendance', '📋', 'My Attendance'],
    ['plans', '🏷️', 'Plans'], ['gallery', '🖼️', 'Gym Gallery'], ['myprofile', '👤', 'My Profile']];
  const NAV = role === 'owner' ? OWNER_NAV : MEMBER_NAV;
  const TITLES = { dashboard: 'Dashboard', members: 'Members', attendance: 'Attendance', plans: 'Membership Plans',
    gallery: 'Gym Gallery', reminders: 'Reminders', settings: 'Settings', mydash: 'My Dashboard',
    myattendance: 'My Attendance', myprofile: 'My Profile' };

  /* ---------------- attendance ---------------- */
  async function checkIn(memberId) {
    const m = members.find((x) => x.id === memberId) || (me?.id === memberId ? me : null);
    if (!m) return;
    if (attendance.some((a) => a.member_id === memberId && a.date === todayISO())) return toast(m.name + ' already checked in today', 'err');
    try {
      await api.addAttendance(memberId, todayISO(), nowTime());
      await reloadAttendance();
      toast('✅ ' + m.name + ' checked in', 'ok');
      closeModal();
    } catch (e) { toast(e.message || 'Check-in failed', 'err'); }
  }

  /* ---------------- reminders ---------------- */
  const buildMessage = (m) => {
    const dl = daysLeft(m);
    const statusLine = dl < 0 ? `has *expired* ${Math.abs(dl)} day(s) ago (on ${fmtDate(m.end_date)}).`
      : dl === 0 ? `*expires today* (${fmtDate(m.end_date)}).`
      : `will *expire in ${dl} day(s)* on ${fmtDate(m.end_date)}.`;
    return (settings.message_template || api.DEFAULT_SETTINGS.message_template)
      .replaceAll('{name}', m.name || '').replaceAll('{plan}', m.plan_name || 'gym')
      .replaceAll('{gym}', settings.gym_name || 'our gym').replaceAll('{end}', fmtDate(m.end_date))
      .replaceAll('{days}', String(dl)).replaceAll('{status_line}', statusLine);
  };
  const waLink = (m) => {
    let phone = normPhone(m.phone);
    if (phone.length <= 10) phone = (settings.country_code || '91') + phone;
    return `https://wa.me/${phone}?text=${encodeURIComponent(buildMessage(m))}`;
  };
  async function sendReminder(m) {
    if (!m.phone) return toast('No phone number on record', 'err');
    window.open(waLink(m), '_blank');
    try { await api.upsertMember({ ...m, notified: todayISO() }); await reloadMembers(); } catch {}
    toast('Opening WhatsApp… reminder logged ✔', 'ok');
  }

  /* ---------------- member form ---------------- */
  function MemberForm({ existing }) {
    const m = existing;
    const [photo, setPhoto] = useState(m?.photo || '');
    const [planId, setPlanId] = useState(m?.plan_id || plans[0]?.id || '');
    const [startDate, setStartDate] = useState(m?.start_date || todayISO());
    const [endDate, setEndDate] = useState(m?.end_date || '');
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
      const p = plans.find((x) => x.id === planId);
      if (p && startDate && !existing) setEndDate(addMonths(startDate, p.months));
    }, [planId, startDate]);

    async function pickPhoto(e) {
      const f = e.target.files[0]; if (!f) return;
      setUploading(true);
      try { setPhoto(await api.uploadImage(f, 'photos', 600, 0.82)); }
      catch (err) { toast('Upload failed: ' + err.message, 'err'); }
      setUploading(false);
    }
    async function submit(e) {
      e.preventDefault();
      const f = e.target;
      const plan = plans.find((p) => p.id === planId);
      const rec = {
        ...(m?.id ? { id: m.id } : {}),
        name: f.name.value.trim(), phone: f.phone.value.trim(), gender: f.gender.value,
        dob: f.dob.value || null, email: f.email.value.trim(), emergency: f.emergency.value.trim(),
        address: f.address.value.trim(), plan_id: planId || null, plan_name: plan ? plan.name : '',
        start_date: startDate, end_date: endDate || (plan ? addMonths(startDate, plan.months) : startDate),
        fee_paid: Number(f.fee.value || 0), pay_status: f.pay.value, frozen: f.frozen.value === '1',
        notes: f.notes.value.trim(), photo, join_date: m?.join_date || todayISO(), notified: m?.notified || null,
      };
      try {
        await api.upsertMember(rec); await reloadMembers(); closeModal();
        toast(m ? 'Member updated ✔' : 'Member added ✔', 'ok');
      } catch (err) { toast(err.message || 'Save failed', 'err'); }
    }

    return (
      <form onSubmit={submit}>
        <div className="photo-up" style={{ marginBottom: 18 }}>
          {photo ? <img className="photo-preview" src={photo} alt="" style={{ objectFit: 'cover' }} />
            : <div className="photo-preview">{uploading ? '…' : 'No photo'}</div>}
          <div>
            <input type="file" id="mphoto" accept="image/*" style={{ display: 'none' }} onChange={pickPhoto} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => document.getElementById('mphoto').click()}>📷 Upload Photo</button>
            <div className="hint">{uploading ? 'Uploading…' : 'JPG / PNG, auto-resized.'}</div>
          </div>
        </div>
        <div className="form-grid">
          <div className="field"><label>Full Name *</label><input name="name" required defaultValue={m?.name || ''} /></div>
          <div className="field"><label>Phone *</label><input name="phone" required defaultValue={m?.phone || ''} /></div>
          <div className="field"><label>Gender</label><select name="gender" defaultValue={m?.gender || 'Male'}>{['Male', 'Female', 'Other'].map((g) => <option key={g}>{g}</option>)}</select></div>
          <div className="field"><label>Date of Birth</label><input type="date" name="dob" defaultValue={m?.dob || ''} /></div>
          <div className="field"><label>Email</label><input type="email" name="email" defaultValue={m?.email || ''} /></div>
          <div className="field"><label>Emergency Contact</label><input name="emergency" defaultValue={m?.emergency || ''} /></div>
          <div className="field full"><label>Address</label><input name="address" defaultValue={m?.address || ''} /></div>
          <div className="field"><label>Membership Plan *</label>
            <select name="plan" value={planId} onChange={(e) => setPlanId(e.target.value)} required>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name} — {money(p.price)} / {p.months}mo</option>)}
            </select></div>
          <div className="field"><label>Start Date *</label><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required /></div>
          <div className="field"><label>End Date (auto)</label><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
          <div className="field"><label>Fee Paid ({settings.currency})</label><input type="number" name="fee" min="0" defaultValue={m?.fee_paid ?? ''} /></div>
          <div className="field"><label>Payment Status</label><select name="pay" defaultValue={m?.pay_status || 'Paid'}>{['Paid', 'Pending', 'Partial'].map((p) => <option key={p}>{p}</option>)}</select></div>
          <div className="field"><label>Freeze Membership</label><select name="frozen" defaultValue={m?.frozen ? '1' : ''}><option value="">No</option><option value="1">Yes (paused)</option></select></div>
          <div className="field full"><label>Notes</label><textarea name="notes" defaultValue={m?.notes || ''} /></div>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={closeModal}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={uploading}>{m ? 'Save Changes' : 'Add Member'}</button>
        </div>
      </form>
    );
  }
  const openMemberForm = (existing) => setModal({ title: existing ? 'Edit Member' : 'Add New Member', wide: true, node: <MemberForm existing={existing} /> });

  /* ---------------- member detail ---------------- */
  function openMemberDetail(m) {
    const s = statusOf(m), dl = daysLeft(m);
    const total = m.start_date ? daysBetween(m.start_date, m.end_date) : 0;
    const used = m.start_date ? Math.min(total, Math.max(0, daysBetween(m.start_date, todayISO()))) : 0;
    const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
    const age = m.dob ? Math.floor(daysBetween(m.dob, todayISO()) / 365.25) + ' yrs' : '—';
    const visits = attendance.filter((a) => a.member_id === m.id).length;
    const di = (k, v) => <div className="di"><div className="k">{k}</div><div className="v">{v}</div></div>;
    setModal({
      title: 'Member Details', wide: true, node: (
        <>
          <div className="detail-head"><Avatar m={m} lg />
            <div><div className="dh-name">{m.name}</div>
              <div className="dh-sub">{m.phone} {m.email ? '• ' + m.email : ''}</div>
              <div style={{ marginTop: 8 }}><Badge s={s} /> <span className="muted" style={{ fontSize: 13 }}>• {visits} check-ins</span></div></div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }} className="muted">
              <span>Membership progress</span><span>{s === 'expired' ? `Expired ${Math.abs(dl)}d ago` : `${dl} days left`}</span></div>
            <div className="progress"><i style={{ width: pct + '%' }} /></div>
          </div>
          <div className="detail-list">
            {di('Plan', m.plan_name || '—')}{di('Fee Paid', `${money(m.fee_paid)} (${m.pay_status || '—'})`)}
            {di('Start', fmtDate(m.start_date))}{di('End', fmtDate(m.end_date))}
            {di('Gender', m.gender || '—')}{di('Age', age)}
            {di('DOB', fmtDate(m.dob))}{di('Joined', fmtDate(m.join_date))}
            {di('Emergency', m.emergency || '—')}{di('Address', m.address || '—')}
            {di('Notes', m.notes || '—')}{di('Last Reminder', m.notified ? fmtDate(m.notified) : 'Never')}
          </div>
          <div className="modal-foot">
            <button className="btn btn-danger" onClick={() => removeMember(m)}>🗑 Delete</button>
            <button className="btn btn-green" onClick={() => checkIn(m.id)}>📋 Check In</button>
            <button className="btn btn-green" onClick={() => sendReminder(m)}>💬 Remind</button>
            <button className="btn btn-ghost" onClick={() => openRenew(m)}>🔄 Renew</button>
            <button className="btn btn-primary" onClick={() => openMemberForm(m)}>✏️ Edit</button>
          </div>
        </>
      ),
    });
  }
  async function removeMember(m) {
    if (!confirm(`Delete ${m.name}? This cannot be undone.`)) return;
    try { await api.deleteMember(m.id); await reloadMembers(); closeModal(); toast('Member deleted', 'err'); }
    catch (e) { toast(e.message, 'err'); }
  }
  function openRenew(m) {
    const plan = plans.find((p) => p.id === m.plan_id);
    const base = daysLeft(m) > 0 ? m.end_date : todayISO();
    setModal({
      title: 'Renew Membership', node: (
        <form onSubmit={async (e) => {
          e.preventDefault(); const f = e.target;
          const rec = { ...m, start_date: f.sd.value, end_date: addMonths(f.sd.value, f.mo.value),
            fee_paid: Number(m.fee_paid || 0) + Number(f.fee.value || 0), pay_status: f.pay.value, frozen: false, notified: null };
          try { await api.upsertMember(rec); await reloadMembers(); closeModal(); toast('Membership renewed ✔', 'ok'); }
          catch (err) { toast(err.message, 'err'); }
        }}>
          <p className="muted" style={{ marginBottom: 16 }}>Renewing <b style={{ color: 'var(--txt)' }}>{m.name}</b>.</p>
          <div className="form-grid">
            <div className="field"><label>New Start Date</label><input type="date" name="sd" defaultValue={base} /></div>
            <div className="field"><label>Months</label><input type="number" name="mo" min="1" defaultValue={plan?.months || 1} /></div>
            <div className="field"><label>Fee ({settings.currency})</label><input type="number" name="fee" min="0" defaultValue={plan?.price || ''} /></div>
            <div className="field"><label>Payment</label><select name="pay"><option>Paid</option><option>Pending</option><option>Partial</option></select></div>
          </div>
          <div className="modal-foot"><button type="button" className="btn btn-ghost" onClick={closeModal}>Cancel</button>
            <button type="submit" className="btn btn-primary">Confirm Renewal</button></div>
        </form>
      ),
    });
  }

  /* ---------------- plan form ---------------- */
  function openPlanForm(existing) {
    const p = existing;
    setModal({
      title: p ? 'Edit Plan' : 'Add Plan', node: (
        <form onSubmit={async (e) => {
          e.preventDefault(); const f = e.target;
          const rec = { ...(p?.id ? { id: p.id } : {}), name: f.name.value.trim(), months: Number(f.months.value),
            price: Number(f.price.value), descr: f.descr.value.trim(), popular: f.popular.checked };
          try { await api.upsertPlan(rec); setPlans(await api.getPlans()); closeModal(); toast(p ? 'Plan updated ✔' : 'Plan added ✔', 'ok'); }
          catch (err) { toast(err.message, 'err'); }
        }}>
          <div className="form-grid">
            <div className="field full"><label>Plan Name *</label><input name="name" required defaultValue={p?.name || ''} /></div>
            <div className="field"><label>Duration (months) *</label><input type="number" name="months" min="1" required defaultValue={p?.months || 1} /></div>
            <div className="field"><label>Price ({settings.currency}) *</label><input type="number" name="price" min="0" required defaultValue={p?.price ?? ''} /></div>
            <div className="field full"><label>Description</label><textarea name="descr" defaultValue={p?.descr || ''} /></div>
            <div className="field full"><label><input type="checkbox" name="popular" defaultChecked={p?.popular} /> Mark as “Popular”</label></div>
          </div>
          <div className="modal-foot"><button type="button" className="btn btn-ghost" onClick={closeModal}>Cancel</button>
            <button type="submit" className="btn btn-primary">{p ? 'Save' : 'Add Plan'}</button></div>
        </form>
      ),
    });
  }
  async function removePlan(p) {
    const inUse = members.filter((m) => m.plan_id === p.id).length;
    if (!confirm(inUse ? `${inUse} member(s) use this plan. Delete anyway?` : 'Delete this plan?')) return;
    try { await api.deletePlan(p.id); setPlans(await api.getPlans()); toast('Plan deleted', 'err'); }
    catch (e) { toast(e.message, 'err'); }
  }

  /* ---------------- gallery ---------------- */
  async function addPhotos(e) {
    const files = [...e.target.files]; if (!files.length) return;
    toast('Uploading ' + files.length + ' photo(s)…');
    try {
      for (const f of files) { const url = await api.uploadImage(f, 'gallery', 1200, 0.8); await api.addGallery(url, ''); }
      setGallery(await api.getGallery()); toast('Photos added ✔', 'ok');
    } catch (err) { toast(err.message, 'err'); }
  }
  async function removePhoto(g) {
    if (!confirm('Delete this photo?')) return;
    try { await api.deleteGallery(g.id); setGallery(await api.getGallery()); closeModal(); toast('Photo deleted', 'err'); }
    catch (e) { toast(e.message, 'err'); }
  }
  function openPhoto(g) {
    setModal({
      title: 'Photo', wide: true, node: (
        <>
          <img src={g.url} style={{ width: '100%', borderRadius: 12 }} alt="" />
          {role === 'owner' ? (
            <form onSubmit={async (e) => {
              e.preventDefault();
              try { await api.updateGallery(g.id, e.target.cap.value.trim()); setGallery(await api.getGallery()); closeModal(); toast('Saved ✔', 'ok'); }
              catch (err) { toast(err.message, 'err'); }
            }}>
              <div className="field" style={{ marginTop: 14 }}><label>Caption</label><input name="cap" defaultValue={g.caption || ''} placeholder="e.g. Cardio zone" /></div>
              <div className="modal-foot"><button type="button" className="btn btn-danger" onClick={() => removePhoto(g)}>🗑 Delete</button>
                <button type="submit" className="btn btn-primary">Save Caption</button></div>
            </form>
          ) : (g.caption ? <p className="muted" style={{ marginTop: 12, textAlign: 'center' }}>{g.caption}</p> : null)}
        </>
      ),
    });
  }

  /* ---------------- settings ---------------- */
  async function pickLogo(e) {
    const f = e.target.files[0]; if (!f) return;
    try { const url = await api.uploadImage(f, 'logo', 256, 0.9); const ns = { ...settings, logo: url }; setSettings(ns); await api.saveSettings(ns); toast('Logo updated ✔', 'ok'); }
    catch (err) { toast(err.message, 'err'); }
  }
  async function saveSettingsForm(e) {
    e.preventDefault(); const f = e.target;
    const ns = { ...settings, gym_name: f.gym.value, currency: f.cur.value || '₹', country_code: normPhone(f.cc.value) || '91',
      reminder_days: Number(f.rd.value) || 7, message_template: f.tpl.value };
    try { await api.saveSettings(ns); setSettings(ns); toast('Settings saved ✔', 'ok'); }
    catch (err) { toast(err.message, 'err'); }
  }

  /* ===================== VIEWS ===================== */
  function renderView() {
    switch (view) {
      case 'dashboard': return ownerDashboard();
      case 'members': return membersView();
      case 'attendance': return attendanceView();
      case 'plans': return plansView();
      case 'gallery': return galleryView();
      case 'reminders': return remindersView();
      case 'settings': return settingsView();
      case 'mydash': return myDash();
      case 'myattendance': return myAttendance();
      case 'myprofile': return myProfile();
      default: return null;
    }
  }

  function ownerDashboard() {
    const active = members.filter((x) => statusOf(x) === 'active').length;
    const expiring = members.filter((x) => statusOf(x) === 'expiring');
    const expired = members.filter((x) => statusOf(x) === 'expired');
    const revenue = members.reduce((s, x) => s + Number(x.fee_paid || 0), 0);
    const todayCount = attendance.filter((a) => a.date === todayISO()).length;
    const recent = [...members].slice(0, 6);
    const attention = [...expiring, ...expired].sort((a, b) => daysLeft(a) - daysLeft(b)).slice(0, 6);

    // weekly check-in activity (last 7 days)
    const week = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      week.push({ iso, label: d.toLocaleDateString('en-GB', { weekday: 'short' }), count: attendance.filter((a) => a.date === iso).length });
    }
    const weekMax = Math.max(1, ...week.map((d) => d.count));

    // membership status distribution
    const dist = [
      { name: 'Active', color: '#22c55e', count: active },
      { name: 'Expiring', color: '#fbbf24', count: expiring.length },
      { name: 'Expired', color: '#ef4444', count: expired.length },
      { name: 'Frozen', color: '#60a5fa', count: members.filter((m) => m.frozen).length },
    ];
    const distMax = Math.max(1, ...dist.map((d) => d.count));

    // members by plan (donut)
    const COLORS = ['#ff6a00', '#ffb024', '#3b82f6', '#22c55e', '#a855f7', '#ec4899', '#14b8a6'];
    const byPlan = plans.map((p, i) => ({ name: p.name, color: COLORS[i % COLORS.length], count: members.filter((m) => m.plan_id === p.id).length }));
    const noPlan = members.filter((m) => !plans.some((p) => p.id === m.plan_id)).length;
    if (noPlan) byPlan.push({ name: 'No plan', color: '#64748b', count: noPlan });
    const planTotal = byPlan.reduce((s, x) => s + x.count, 0);
    let acc = 0;
    const segs = byPlan.filter((p) => p.count > 0).map((p) => {
      const start = (acc / planTotal) * 360; acc += p.count; const end = (acc / planTotal) * 360;
      return `${p.color} ${start}deg ${end}deg`;
    }).join(', ');
    const donutBg = planTotal ? `conic-gradient(${segs})` : 'conic-gradient(#26303f 0deg 360deg)';

    return (
      <>
        <div className="hero">
          <div><div className="kicker">Welcome back 👑</div>
            <h2 className="hero-title">{settings.gym_name}</h2>
            <p className="muted">Here's how your gym is doing today.</p></div>
          <div className="hero-cta">
            <button className="btn btn-primary" onClick={() => openMemberForm()}>＋ Add Member</button>
            <button className="btn btn-ghost" onClick={() => setView('attendance')}>📋 Attendance</button></div>
        </div>
        <div className="stats-grid">
          <Stat cls="accent" ic="🧑‍🤝‍🧑" val={members.length} lbl="Total Members" />
          <Stat cls="green" ic="✅" val={active} lbl="Active" />
          <Stat cls="amber" ic="⏳" val={expiring.length} lbl="Expiring Soon" />
          <Stat cls="red" ic="⛔" val={expired.length} lbl="Expired" />
          <Stat cls="blue" ic="📋" val={todayCount} lbl="Check-ins Today" />
          <Stat cls="accent" ic="💰" val={money(revenue)} lbl="Total Revenue" />
        </div>

        <div className="section-grid">
          <div className="panel">
            <div className="panel-head"><div><span className="kicker">Last 7 days</span><h2>Check-in Activity</h2></div>
              <span className="badge active">{week.reduce((s, d) => s + d.count, 0)} total</span></div>
            <div className="bars">{week.map((d) => (
              <div className={`bar-col ${d.iso === todayISO() ? 'today' : ''}`} key={d.iso}>
                <span className="bar-val">{d.count}</span>
                <div className="bar-track"><div className="bar-fill" style={{ height: Math.round((d.count / weekMax) * 100) + '%' }} /></div>
                <span className="bar-lbl">{d.label}</span>
              </div>
            ))}</div>
          </div>
          <div className="panel">
            <div className="panel-head"><div><span className="kicker">Distribution</span><h2>Members by Plan</h2></div></div>
            <div className="donut-wrap">
              <div className="donut" style={{ background: donutBg }}>
                <div className="donut-hole"><b>{members.length}</b><span>Members</span></div>
              </div>
              <div className="legend">{byPlan.filter((p) => p.count > 0).map((p) => (
                <div className="legend-row" key={p.name}><span className="legend-dot" style={{ background: p.color }} />
                  {p.name}<b>{p.count}</b></div>
              ))}{planTotal === 0 && <div className="muted" style={{ textAlign: 'center' }}>No members yet</div>}</div>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><div><span className="kicker">Health</span><h2>Membership Status</h2></div></div>
          <div className="dist">{dist.map((d) => (
            <div className="dist-row" key={d.name}>
              <span className="dist-name"><span className="dist-dot" style={{ background: d.color }} />{d.name}</span>
              <div className="dist-bar"><i style={{ width: Math.round((d.count / distMax) * 100) + '%', background: d.color }} /></div>
              <b>{d.count}</b>
            </div>
          ))}</div>
        </div>

        <div className="section-grid">
          <div className="panel">
            <div className="panel-head"><h2>Recent Members</h2><button className="btn btn-ghost btn-sm" onClick={() => setView('members')}>View all →</button></div>
            {recent.length ? (
              <table className="tbl"><thead><tr><th>Member</th><th>Plan</th><th>Status</th><th>Ends</th></tr></thead>
                <tbody>{recent.map((x) => (
                  <tr key={x.id} style={{ cursor: 'pointer' }} onClick={() => openMemberDetail(x)}>
                    <td><div className="cell-user"><Avatar m={x} /><div><div style={{ fontWeight: 600 }}>{x.name}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{x.phone}</div></div></div></td>
                    <td>{x.plan_name || '—'}</td><td><Badge s={statusOf(x)} /></td><td>{fmtDate(x.end_date)}</td></tr>
                ))}</tbody></table>
            ) : <Empty ic="🏋️" h="No members yet" p="Add your first member to get started." />}
          </div>
          <div className="panel">
            <div className="panel-head"><h2>Needs Attention</h2><button className="btn btn-ghost btn-sm" onClick={() => setView('reminders')}>Reminders →</button></div>
            {attention.length ? attention.map((x) => {
              const dl = daysLeft(x);
              return (<div className="rem-item" key={x.id}><Avatar m={x} />
                <div className="ri-main"><div className="ri-name">{x.name}</div>
                  <div className="ri-sub">{dl < 0 ? `Expired ${Math.abs(dl)}d ago` : `Expires in ${dl}d`} • {x.plan_name || ''}</div></div>
                <button className="btn btn-green btn-sm" onClick={() => sendReminder(x)}>💬 Remind</button></div>);
            }) : <Empty ic="🎉" h="All good!" p="No memberships need attention." />}
          </div>
        </div>
      </>
    );
  }

  function membersView() {
    const filters = ['all', 'active', 'expiring', 'expired', 'frozen'];
    let list = members.slice();
    if (search) list = list.filter((m) => [m.name, m.phone, m.email].some((v) => (v || '').toLowerCase().includes(search.toLowerCase())));
    if (filter !== 'all') list = list.filter((m) => statusOf(m) === filter);
    return (
      <>
        <div className="panel-head" style={{ marginBottom: 18 }}>
          <div className="chips">{filters.map((f) => <button key={f} className={`chip ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>{f[0].toUpperCase() + f.slice(1)}</button>)}</div>
          <button className="btn btn-primary" onClick={() => openMemberForm()}>＋ Add Member</button>
        </div>
        {list.length ? (
          <div className="member-grid">{list.map((m) => {
            const s = statusOf(m), dl = daysLeft(m);
            const right = s === 'expired' ? `Expired ${Math.abs(dl)}d ago` : s === 'frozen' ? 'Frozen' : `${dl}d left`;
            return (<div className="member-card" key={m.id} onClick={() => openMemberDetail(m)}>
              <div className="mc-top"><Avatar m={m} /><div><div className="mc-name">{m.name}</div><div className="mc-sub">{m.phone || 'No phone'}</div></div></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><Badge s={s} /><span className="muted" style={{ fontSize: 12.5 }}>{right}</span></div>
              <div className="mc-meta"><span>Plan: <b>{m.plan_name || '—'}</b></span><span>Ends: <b>{fmtDate(m.end_date)}</b></span></div></div>);
          })}</div>
        ) : <Empty ic="🔍" h="No members found" p={search || filter !== 'all' ? 'Try a different filter.' : 'Click “Add Member”.'} />}
      </>
    );
  }

  function attendanceView() {
    const today = todayISO();
    const todays = attendance.filter((a) => a.date === today);
    const checked = new Set(todays.map((a) => a.member_id));
    let list = [...members].sort((a, b) => a.name.localeCompare(b.name));
    if (search) list = list.filter((m) => (m.name || '').toLowerCase().includes(search.toLowerCase()));
    const recentDays = [...new Set(attendance.map((a) => a.date))].sort().reverse().slice(0, 7);
    return (
      <>
        <div className="stats-grid">
          <Stat cls="green" ic="✅" val={todays.length} lbl="Checked in Today" />
          <Stat cls="accent" ic="🧑‍🤝‍🧑" val={members.length} lbl="Total Members" />
          <Stat cls="amber" ic="📈" val={attendance.length} lbl="All-time Check-ins" />
        </div>
        <div className="section-grid">
          <div className="panel">
            <div className="panel-head"><h2>Mark Attendance — {fmtDate(today)}</h2>
              <div className="search-box" style={{ display: 'flex' }}><span>🔎</span><input placeholder="Find…" value={search} onChange={(e) => setSearch(e.target.value)} /></div></div>
            {list.length ? <div className="att-list">{list.map((m) => (
              <div className="rem-item" key={m.id}><Avatar m={m} />
                <div className="ri-main"><div className="ri-name">{m.name}</div><div className="ri-sub">{m.plan_name || ''}</div></div>
                {checked.has(m.id) ? <span className="badge active">In • {todays.find((a) => a.member_id === m.id).time}</span>
                  : <button className="btn btn-green btn-sm" onClick={() => checkIn(m.id)}>＋ Check In</button>}</div>
            ))}</div> : <Empty ic="🧍" h="No members" p="Add members first." />}
          </div>
          <div className="panel"><div className="panel-head"><h2>Recent Days</h2></div>
            {recentDays.length ? recentDays.map((d) => {
              const c = attendance.filter((a) => a.date === d).length;
              return (<div className="rem-item" key={d}><div className="ri-main"><div className="ri-name">{fmtDate(d)}</div>
                <div className="ri-sub">{d === today ? 'Today' : ''}</div></div><span className="badge active">{c} check-in{c !== 1 ? 's' : ''}</span></div>);
            }) : <Empty ic="📋" h="No attendance yet" p="Check members in to build history." />}
          </div>
        </div>
      </>
    );
  }

  function plansView() {
    const owner = role === 'owner';
    return (
      <>
        <div className="panel-head" style={{ marginBottom: 18 }}>
          <div><span className="kicker">Pricing</span><h2 style={{ fontFamily: 'var(--head)', fontSize: 20, marginTop: 2 }}>Membership Plans</h2></div>
          {owner && <button className="btn btn-primary" onClick={() => openPlanForm()}>＋ Add Plan</button>}
        </div>
        {plans.length ? <div className="plan-grid">{plans.map((p) => {
          const count = members.filter((m) => m.plan_id === p.id).length;
          return (<div className="plan-card" key={p.id}>{p.popular && <div className="plan-ribbon">POPULAR</div>}
            <div className="pc-name">{p.name}</div>
            <div className="pc-price">{money(p.price)}<small> / {p.months} mo</small></div>
            <div className="pc-dur">{p.months} month{p.months > 1 ? 's' : ''}{owner ? ` • ${count} member${count !== 1 ? 's' : ''}` : ''}</div>
            <div className="pc-desc">{p.descr || ''}</div>
            {owner && <div className="pc-actions"><button className="btn btn-ghost btn-sm" onClick={() => openPlanForm(p)}>✏️ Edit</button>
              <button className="btn btn-danger btn-sm" onClick={() => removePlan(p)}>🗑 Delete</button></div>}</div>);
        })}</div> : <Empty ic="🏷️" h="No plans yet" p={owner ? 'Create your plans.' : 'No plans available yet.'} />}
      </>
    );
  }

  function galleryView() {
    const owner = role === 'owner';
    return (
      <>
        <div className="panel-head" style={{ marginBottom: 18 }}>
          <div><span className="kicker">Our Space</span><h2 style={{ fontFamily: 'var(--head)', fontSize: 20, marginTop: 2 }}>Gym Gallery</h2></div>
          {owner && <><input type="file" id="galin" accept="image/*" multiple style={{ display: 'none' }} onChange={addPhotos} />
            <button className="btn btn-primary" onClick={() => document.getElementById('galin').click()}>📷 Add Photos</button></>}
        </div>
        {gallery.length ? <div className="gallery-grid">{gallery.map((g) => (
          <div className="gal-item" key={g.id}><img src={g.url} alt={g.caption || ''} onClick={() => openPhoto(g)} />
            {g.caption && <div className="gal-cap">{g.caption}</div>}
            {owner && <button className="gal-del" onClick={() => removePhoto(g)} title="Delete">🗑</button>}</div>
        ))}</div> : <Empty ic="🖼️" h="No photos yet" p={owner ? 'Showcase your gym.' : 'Photos coming soon.'} />}
      </>
    );
  }

  function remindersView() {
    const expiring = members.filter((m) => statusOf(m) === 'expiring').sort((a, b) => daysLeft(a) - daysLeft(b));
    const expired = members.filter((m) => statusOf(m) === 'expired').sort((a, b) => daysLeft(a) - daysLeft(b));
    const bulk = (arr) => {
      const ok = arr.filter((m) => m.phone);
      if (!ok.length) return toast('No phone numbers', 'err');
      if (!confirm(`Open ${ok.length} WhatsApp tab(s)?`)) return;
      ok.forEach((m, i) => setTimeout(() => sendReminder(m), i * 600));
    };
    const Block = ({ title, ic, arr }) => (
      <div className="panel"><div className="panel-head"><h2>{ic} {title} <span className="muted" style={{ fontSize: 14 }}>({arr.length})</span></h2>
        {arr.length > 0 && <button className="btn btn-green btn-sm" onClick={() => bulk(arr)}>💬 Remind All</button>}</div>
        {arr.length ? arr.map((m) => {
          const dl = daysLeft(m);
          return (<div className="rem-item" key={m.id}><Avatar m={m} />
            <div className="ri-main"><div className="ri-name">{m.name}</div>
              <div className="ri-sub">{m.phone || 'no phone'} • {m.plan_name || ''} • {dl < 0 ? `Expired ${Math.abs(dl)}d ago` : `Expires in ${dl}d`}{m.notified ? ' • reminded ' + fmtDate(m.notified) : ''}</div></div>
            <button className="btn btn-ghost btn-sm" onClick={() => openMemberDetail(m)}>View</button>
            <button className="btn btn-green btn-sm" onClick={() => sendReminder(m)}>💬 WhatsApp</button></div>);
        }) : <Empty ic="👍" h="Nothing here" p="No members in this group." />}</div>
    );
    return (
      <>
        <div className="panel" style={{ background: 'linear-gradient(135deg,rgba(255,77,18,.12),transparent)' }}>
          <div className="kicker">Auto Reminders</div>
          <p style={{ marginTop: 6, maxWidth: 640, lineHeight: 1.6 }}>Memberships expiring within <b>{settings.reminder_days} days</b> and expired ones are flagged automatically. Click <b>WhatsApp</b> to send a pre-filled renewal message.</p>
        </div>
        <Block title="Expiring Soon" ic="⏳" arr={expiring} />
        <Block title="Already Expired" ic="⛔" arr={expired} />
      </>
    );
  }

  function settingsView() {
    const di = (k, v) => <div className="di"><div className="k">{k}</div><div className="v">{v}</div></div>;
    return (
      <>
        <div className="panel" style={{ maxWidth: 760 }}>
          <div className="panel-head"><h2>🏋️ Gym Branding</h2></div>
          <div className="photo-up" style={{ marginBottom: 18 }}>
            {settings.logo ? <img className="photo-preview" src={settings.logo} alt="" style={{ objectFit: 'cover' }} /> : <div className="photo-preview">No logo</div>}
            <div><input type="file" id="logoin" accept="image/*" style={{ display: 'none' }} onChange={pickLogo} />
              <button className="btn btn-ghost btn-sm" onClick={() => document.getElementById('logoin').click()}>📷 Upload Logo</button>
              <div className="hint">Shown on the sidebar.</div></div>
          </div>
          <form onSubmit={saveSettingsForm}>
            <div className="form-grid">
              <div className="field"><label>Gym Name</label><input name="gym" defaultValue={settings.gym_name} /></div>
              <div className="field"><label>Currency Symbol</label><input name="cur" defaultValue={settings.currency} /></div>
              <div className="field"><label>WhatsApp Country Code</label><input name="cc" defaultValue={settings.country_code} /></div>
              <div className="field"><label>Reminder window (days)</label><input type="number" name="rd" min="1" defaultValue={settings.reminder_days} /></div>
              <div className="field full"><label>WhatsApp Template</label><textarea name="tpl" style={{ minHeight: 140 }} defaultValue={settings.message_template} /></div>
            </div>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.7 }}>Placeholders: <b>{'{name}'}</b> {'{plan} {gym} {end} {days} {status_line}'}. <code style={{ color: 'var(--accent-2)' }}>*text*</code> = bold in WhatsApp.</p>
            <div className="modal-foot"><button type="submit" className="btn btn-primary">Save Settings</button></div>
          </form>
        </div>
        <div className="panel" style={{ maxWidth: 760 }}>
          <div className="panel-head"><h2>👑 Owner Account</h2></div>
          <div className="detail-list">{di('Role', 'Gym Owner 👑')}{di('Signed in', 'Authenticated via Supabase')}</div>
          <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>Manage login methods & passwords in your Supabase Auth dashboard. Use Logout (sidebar) to switch accounts.</p>
        </div>
      </>
    );
  }

  /* ---------- member self-service ---------- */
  function myDash() {
    const m = curMember;
    if (!m) return <div className="panel"><Empty ic="🙋" h="No membership linked yet" p="Ask the gym to register your email/phone, then sign in again." /></div>;
    const s = statusOf(m), dl = daysLeft(m);
    const total = m.start_date ? daysBetween(m.start_date, m.end_date) : 0;
    const used = m.start_date ? Math.min(total, Math.max(0, daysBetween(m.start_date, todayISO()))) : 0;
    const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
    const mine = attendance.filter((a) => a.member_id === m.id);
    const monthCount = mine.filter((a) => a.date.startsWith(todayISO().slice(0, 7))).length;
    const checkedToday = mine.some((a) => a.date === todayISO());
    const plan = plans.find((p) => p.id === m.plan_id);
    return (
      <>
        <div className="hero">
          <div className="hero-user"><Avatar m={m} lg /><div><div className="kicker">Welcome 💪</div>
            <h2 className="hero-title">{m.name}</h2><div style={{ marginTop: 6 }}><Badge s={s} /></div></div></div>
          <div className="hero-cta">{checkedToday ? <span className="badge active" style={{ padding: '10px 16px' }}>✅ Checked in today</span>
            : <button className="btn btn-green" onClick={() => checkIn(m.id)}>📋 Check In Now</button>}</div>
        </div>
        <div className="stats-grid">
          <Stat cls={s === 'expired' ? 'red' : 'green'} ic="🎫" val={s === 'expired' ? 'Expired' : dl + ' days'} lbl={s === 'expired' ? 'Membership' : 'Days Remaining'} />
          <Stat cls="accent" ic="🏷️" val={m.plan_name || '—'} lbl="Your Plan" />
          <Stat cls="blue" ic="📋" val={monthCount} lbl="Visits This Month" />
          <Stat cls="amber" ic="📈" val={mine.length} lbl="Total Visits" />
        </div>
        <div className="section-grid">
          <div className="panel"><div className="panel-head"><h2>Membership</h2><Badge s={s} /></div>
            <div style={{ margin: '8px 0 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }} className="muted">
                <span>{fmtDate(m.start_date)}</span><span>{s === 'expired' ? `Expired ${Math.abs(dl)}d ago` : dl + ' days left'}</span><span>{fmtDate(m.end_date)}</span></div>
              <div className="progress"><i style={{ width: pct + '%' }} /></div></div>
            <div className="detail-list">
              <div className="di"><div className="k">Plan</div><div className="v">{m.plan_name || '—'}</div></div>
              <div className="di"><div className="k">Price</div><div className="v">{plan ? money(plan.price) : '—'}</div></div>
              <div className="di"><div className="k">Valid Till</div><div className="v">{fmtDate(m.end_date)}</div></div>
              <div className="di"><div className="k">Payment</div><div className="v">{m.pay_status || '—'}</div></div>
            </div>
            {s !== 'active' && <p className="muted" style={{ marginTop: 14 }}>⚠️ Your membership {s === 'expired' ? 'has expired' : 'is expiring soon'}. Please contact the gym to renew.</p>}
          </div>
          <div className="panel"><div className="panel-head"><h2>Recent Check-ins</h2><button className="btn btn-ghost btn-sm" onClick={() => setView('myattendance')}>All →</button></div>
            {mine.length ? [...mine].slice(0, 6).map((a) => (
              <div className="rem-item" key={a.id}><div className="ri-main"><div className="ri-name">{fmtDate(a.date)}</div>
                <div className="ri-sub">Checked in at {a.time}</div></div><span className="badge active">✓</span></div>
            )) : <Empty ic="📋" h="No visits yet" p="Check in when you arrive!" />}
          </div>
        </div>
      </>
    );
  }

  function myAttendance() {
    const m = curMember;
    if (!m) return <div className="panel"><Empty ic="🙋" h="No membership linked" p="Ask the gym to register you." /></div>;
    const mine = [...attendance.filter((a) => a.member_id === m.id)];
    const streak = (() => { const set = new Set(mine.map((r) => r.date)); let n = 0; const d = new Date(); while (set.has(d.toISOString().slice(0, 10))) { n++; d.setDate(d.getDate() - 1); } return n; })();
    return (
      <>
        <div className="stats-grid">
          <Stat cls="accent" ic="📈" val={mine.length} lbl="Total Check-ins" />
          <Stat cls="blue" ic="📋" val={mine.filter((a) => a.date.startsWith(todayISO().slice(0, 7))).length} lbl="This Month" />
          <Stat cls="green" ic="🔥" val={streak} lbl="Current Streak" />
        </div>
        <div className="panel"><div className="panel-head"><h2>My Attendance History</h2><button className="btn btn-green btn-sm" onClick={() => checkIn(m.id)}>＋ Check In</button></div>
          {mine.length ? <table className="tbl"><thead><tr><th>Date</th><th>Day</th><th>Time</th></tr></thead>
            <tbody>{mine.map((a) => <tr key={a.id}><td>{fmtDate(a.date)}</td><td>{new Date(a.date).toLocaleDateString('en-GB', { weekday: 'long' })}</td><td>{a.time}</td></tr>)}</tbody></table>
            : <Empty ic="📋" h="No check-ins yet" p="Tap “Check In” at the gym." />}
        </div>
      </>
    );
  }

  function myProfile() {
    const m = curMember;
    if (!m) return <div className="panel"><Empty ic="🙋" h="No membership linked" p="Ask the gym to register you." /></div>;
    const age = m.dob ? Math.floor(daysBetween(m.dob, todayISO()) / 365.25) + ' yrs' : '—';
    const di = (k, v) => <div className="di"><div className="k">{k}</div><div className="v">{v}</div></div>;
    return (
      <div className="panel" style={{ maxWidth: 720 }}>
        <div className="detail-head"><Avatar m={m} lg /><div><div className="dh-name">{m.name}</div>
          <div className="dh-sub">{m.phone} {m.email ? '• ' + m.email : ''}</div><div style={{ marginTop: 8 }}><Badge s={statusOf(m)} /></div></div></div>
        <div className="detail-list">
          {di('Phone', m.phone || '—')}{di('Email', m.email || '—')}{di('Gender', m.gender || '—')}{di('Age', age)}
          {di('DOB', fmtDate(m.dob))}{di('Address', m.address || '—')}{di('Emergency', m.emergency || '—')}{di('Member Since', fmtDate(m.join_date))}
        </div>
        <p className="muted" style={{ marginTop: 16, fontSize: 13 }}>To update details, contact the gym front desk.</p>
      </div>
    );
  }

  /* ===================== SHELL ===================== */
  const who = role === 'owner' ? { name: 'Owner', sub: 'Gym Owner 👑' } : { name: curMember?.name || 'Member', sub: 'Member 🧍' };
  return (
    <div className="app-root">
      <aside className={`sidebar ${navOpen ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-logo">{settings.logo ? <img src={settings.logo} alt="" /> : '🦍'}</div>
          <div className="brand-text"><h1>{(settings.gym_name || 'BAJRANG').split(' ')[0]}</h1>
            <span>{(settings.gym_name || 'GYM').split(' ').slice(1).join(' ') || 'GYM'}</span></div>
        </div>
        <nav className="nav">{NAV.map(([v, ic, lbl]) => (
          <button key={v} className={`nav-item ${view === v ? 'active' : ''}`} onClick={() => { setView(v); setNavOpen(false); }}>
            <span className="ic">{ic}</span> {lbl}</button>
        ))}</nav>
        <div className="sidebar-foot">
          <div className="foot-user"><div className="foot-av">{initials(who.name)}</div>
            <div><div className="fu-name">{who.name}</div><div className="fu-sub">{who.sub}</div></div></div>
          <button className="btn btn-ghost btn-block btn-sm" onClick={doSignOut}>⎋ Logout</button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button className="hamburger" onClick={() => setNavOpen((o) => !o)}>☰</button>
          <div className="topbar-title">{TITLES[view]}</div>
          <div className="topbar-actions">
            {role === 'owner' ? (
              <>
                <div className="search-box"><span>🔎</span><input placeholder="Search members…" value={search}
                  onChange={(e) => { setSearch(e.target.value); if (view !== 'members') setView('members'); }} /></div>
                <button className="btn btn-primary" onClick={() => openMemberForm()}>＋ Add Member</button>
              </>
            ) : (curMember && <button className="btn btn-green" onClick={() => checkIn(curMember.id)}>📋 Check In</button>)}
          </div>
        </header>
        <section className="content">{renderView()}</section>
      </main>

      {modal && (
        <div className="modal-overlay open" onClick={(e) => { if (e.target.classList.contains('modal-overlay')) closeModal(); }}>
          <div className={`modal ${modal.wide ? 'wide' : ''}`}>
            <div className="modal-head"><h3>{modal.title}</h3><button className="modal-close" onClick={closeModal}>✕</button></div>
            <div className="modal-body">{modal.node}</div>
          </div>
        </div>
      )}

      <div className="toast-wrap">{toasts.map((t) => <div key={t.id} className={`toast ${t.type}`}>{t.text}</div>)}</div>
    </div>
  );
}
