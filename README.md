# 🦍 BAJRANG GYM — Next.js + Supabase

A real, deployable gym management web app with **real Google login**, **real email/phone OTP**, member management with photos, attendance, gym gallery, plans, and automatic expiry reminders. Owner & Member roles.

- **Frontend/Backend:** Next.js 16 (App Router) — deploys free on Vercel
- **Database + Auth + Image storage:** Supabase (free tier)

---

## ✅ 5-minute setup

### 1. Create a Supabase project (free)
1. Go to <https://supabase.com> → **New project**. Pick a name + database password, choose a region near you.
2. Wait ~2 min for it to provision.

### 2. Create the database
1. In Supabase, open **SQL Editor** → **New query**.
2. Paste the entire contents of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**.
   - This creates all tables, security rules, the seed plans, **and** the public `gym` storage bucket for images.

### 3. Turn on the login methods you want
In Supabase → **Authentication → Providers**:
- **Email** — on by default. Sends a 6-digit OTP code by email. *(Free)*
- **Google (Gmail)** — toggle on, paste a Google OAuth **Client ID + Secret**
  (create them at <https://console.cloud.google.com> → Credentials → OAuth client → *Web application*).
  In Google, set the **Authorized redirect URI** to:
  `https://YOUR-PROJECT.supabase.co/auth/v1/callback` *(Free)*
- **Phone** — toggle on and connect an SMS provider (Twilio / MessageBird / MSG91).
  *(Requires a paid SMS account — skip this if you only want Email + Google.)*

In **Authentication → URL Configuration**, add these to **Redirect URLs**:
```
http://localhost:3000/**
https://YOUR-VERCEL-APP.vercel.app/**
```

### 4. Connect this app to Supabase
1. In Supabase → **Project Settings → API**, copy the **Project URL** and **anon public** key.
2. In this folder, copy `.env.local.example` to `.env.local` and fill them in:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-PUBLIC-KEY
   ```

### 5. Run it
```bash
npm install
npm run dev
```
Open <http://localhost:3000>.

> 👑 **The first person to sign in automatically becomes the Gym Owner.** Sign in with your own Gmail/email first. Everyone who logs in afterward is a **Member** — and if their email/phone matches a member you added, their account is auto-linked to that membership.

---

## 🚀 Deploy free — option A: Render (uses `render.yaml`)
1. Go to <https://render.com> → sign in **with GitHub**.
2. **New + → Blueprint** → pick the `bajrang-gym` repo. Render reads `render.yaml` automatically
   (web service, Node, build = `npm install && npm run build`, start = `npm start`).
3. When prompted, paste the two env vars: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. **Apply / Create.** After the build you get a public URL like `https://bajrang-gym.onrender.com`.
5. Add `https://bajrang-gym.onrender.com/**` to Supabase **Authentication → URL Configuration → Redirect URLs**
   (and to your Google OAuth client's redirects if using Gmail).

> Render's free web service **sleeps after ~15 min idle**, so the first visit after a pause takes ~30–60s to wake. Fine for a gym; upgrade to a paid instance to keep it always-on.

## 🚀 Deploy free — option B: Vercel
1. Go to <https://vercel.com> → **Add New Project** → import the `bajrang-gym` repo.
2. Add the two environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
3. **Deploy.** Then add your `https://your-app.vercel.app/**` URL to Supabase **Redirect URLs** and to Google's authorized redirect (if using Gmail).

---

## ✨ Features
**Owner:** dashboard with live stats & revenue, members (photos + full details, search/filter), one-tap **attendance**, **gym gallery** uploads, membership **plans** (CRUD), **WhatsApp expiry reminders** (single + bulk), gym **branding** (name, logo), data secured per-user with Row Level Security.

**Member:** personal dashboard (membership status, days left, progress, visit stats), **self check-in**, attendance history with streak, view plans & gallery, profile.

## 🔐 How auth & roles work
Supabase Auth handles real Google OAuth and email/phone OTP. On first sign-in the app calls a secure `init_session()` database function that: creates the user's profile, makes the **first** user the **owner**, and links members to their account by matching email/phone. Row Level Security ensures members can only see their own data while the owner manages everything.

## 🛠️ Tech notes
- All data access is client-side via the Supabase anon key — safe because **Row Level Security** policies (in `schema.sql`) enforce who can read/write what.
- Member photos, gym photos, and the logo are compressed in the browser and stored in Supabase Storage (`gym` bucket).
- Phone OTP is the only feature that costs money (SMS). Email OTP + Google are free.
