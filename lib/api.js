import { sb } from './supabase/client';

const BUCKET = 'gym';

/* ---------- session / role ---------- */
export async function initSession() {
  const { data, error } = await sb().rpc('init_session');
  if (error) throw error;
  return data; // { profile, member }
}
export async function signOut() {
  await sb().auth.signOut();
}

/* ---------- members ---------- */
export async function getMembers() {
  const { data, error } = await sb().from('members').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}
export async function upsertMember(rec) {
  const { data, error } = await sb().from('members').upsert(rec).select().single();
  if (error) throw error;
  return data;
}
export async function deleteMember(id) {
  const { error } = await sb().from('members').delete().eq('id', id);
  if (error) throw error;
}

/* ---------- plans ---------- */
export async function getPlans() {
  const { data, error } = await sb().from('plans').select('*').order('months', { ascending: true });
  if (error) throw error;
  return data || [];
}
export async function upsertPlan(rec) {
  const { data, error } = await sb().from('plans').upsert(rec).select().single();
  if (error) throw error;
  return data;
}
export async function deletePlan(id) {
  const { error } = await sb().from('plans').delete().eq('id', id);
  if (error) throw error;
}

/* ---------- attendance ---------- */
export async function getAttendance() {
  const { data, error } = await sb().from('attendance').select('*').order('date', { ascending: false });
  if (error) throw error;
  return data || [];
}
export async function addAttendance(memberId, date, time) {
  const { data, error } = await sb().from('attendance').insert({ member_id: memberId, date, time }).select().single();
  if (error) throw error;
  return data;
}

/* ---------- gallery ---------- */
export async function getGallery() {
  const { data, error } = await sb().from('gallery').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}
export async function addGallery(url, caption) {
  const { data, error } = await sb().from('gallery').insert({ url, caption: caption || '' }).select().single();
  if (error) throw error;
  return data;
}
export async function updateGallery(id, caption) {
  const { error } = await sb().from('gallery').update({ caption }).eq('id', id);
  if (error) throw error;
}
export async function deleteGallery(id) {
  const { error } = await sb().from('gallery').delete().eq('id', id);
  if (error) throw error;
}

/* ---------- settings ---------- */
export const DEFAULT_SETTINGS = {
  id: 1, gym_name: 'BAJRANG GYM', logo: '', currency: '₹', country_code: '91',
  reminder_days: 7,
  message_template:
    'Namaste {name}! 🙏\nYour *{plan}* membership at {gym} {status_line}\nPlease visit us to renew and keep crushing your goals! 💪\n\n— Team {gym}',
};
export async function getSettings() {
  const { data, error } = await sb().from('settings').select('*').eq('id', 1).maybeSingle();
  if (error) throw error;
  return { ...DEFAULT_SETTINGS, ...(data || {}) };
}
export async function saveSettings(rec) {
  const { error } = await sb().from('settings').upsert({ ...rec, id: 1 });
  if (error) throw error;
}

/* ---------- image upload (compress → storage) ---------- */
function compress(file, maxSize, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width: w, height: h } = img;
        if (w > h && w > maxSize) { h = (h * maxSize) / w; w = maxSize; }
        else if (h > maxSize) { w = (w * maxSize) / h; h = maxSize; }
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        c.toBlob((b) => resolve(b), 'image/jpeg', quality);
      };
      img.onerror = reject; img.src = reader.result;
    };
    reader.onerror = reject; reader.readAsDataURL(file);
  });
}
export async function uploadImage(file, folder = 'photos', maxSize = 800, quality = 0.82) {
  const blob = await compress(file, maxSize, quality);
  const path = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await sb().storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  const { data } = sb().storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
