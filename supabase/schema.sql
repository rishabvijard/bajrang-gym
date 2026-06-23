-- ============================================================
--  BAJRANG GYM — Supabase schema (run once in SQL Editor)
-- ============================================================

-- ---------- tables ----------
create table if not exists profiles (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  email     text,
  phone     text,
  role      text not null default 'member',   -- 'owner' | 'member'
  full_name text,
  created_at timestamptz default now()
);

create table if not exists plans (
  id        uuid primary key default gen_random_uuid(),
  name      text not null,
  months    int  not null default 1,
  price     numeric not null default 0,
  descr     text default '',
  popular   boolean default false,
  created_at timestamptz default now()
);

create table if not exists members (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete set null,
  name       text not null,
  phone      text,
  email      text,
  gender     text,
  dob        date,
  address    text,
  emergency  text,
  plan_id    uuid references plans(id) on delete set null,
  plan_name  text,
  start_date date,
  end_date   date,
  fee_paid   numeric default 0,
  pay_status text default 'Paid',
  frozen     boolean default false,
  notes      text,
  photo      text,
  join_date  date default current_date,
  notified   date,
  created_at timestamptz default now()
);

create table if not exists attendance (
  id        uuid primary key default gen_random_uuid(),
  member_id uuid references members(id) on delete cascade,
  date      date not null,
  time      text,
  created_at timestamptz default now()
);

create table if not exists gallery (
  id        uuid primary key default gen_random_uuid(),
  url       text not null,
  caption   text default '',
  created_at timestamptz default now()
);

create table if not exists settings (
  id    int primary key default 1,
  gym_name text default 'BAJRANG GYM',
  logo  text default '',
  currency text default '₹',
  country_code text default '91',
  reminder_days int default 7,
  message_template text default ''
);

-- ---------- helper: is current user the owner? ----------
create or replace function is_owner()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from profiles where user_id = auth.uid() and role = 'owner');
$$;

-- ---------- session bootstrap (creates profile, assigns role, links member) ----------
create or replace function init_session()
returns json language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  uemail text; uphone text;
  prof profiles; mem members; owner_exists boolean;
begin
  if uid is null then return null; end if;
  select email, phone into uemail, uphone from auth.users where id = uid;
  select * into prof from profiles where user_id = uid;

  if prof.user_id is null then
    select exists(select 1 from profiles where role = 'owner') into owner_exists;
    select * into mem from members
      where (uemail is not null and lower(email) = lower(uemail))
         or (coalesce(uphone,'') <> '' and regexp_replace(coalesce(phone,''),'\D','','g') = regexp_replace(uphone,'\D','','g'))
      limit 1;
    insert into profiles(user_id, email, phone, role, full_name)
      values (uid, uemail, uphone,
              case when not owner_exists then 'owner' else 'member' end,
              coalesce(mem.name, split_part(coalesce(uemail,''),'@',1)))
      returning * into prof;
  end if;

  if prof.role = 'member' then
    update members set user_id = uid
      where user_id is null
        and ((uemail is not null and lower(email) = lower(uemail))
          or (coalesce(uphone,'') <> '' and regexp_replace(coalesce(phone,''),'\D','','g') = regexp_replace(uphone,'\D','','g')));
    select * into mem from members where user_id = uid limit 1;
  end if;

  return json_build_object('profile', row_to_json(prof), 'member', row_to_json(mem));
end; $$;

-- ---------- Row Level Security ----------
alter table profiles  enable row level security;
alter table plans     enable row level security;
alter table members   enable row level security;
alter table attendance enable row level security;
alter table gallery   enable row level security;
alter table settings  enable row level security;

-- profiles: see your own or (owner) all
drop policy if exists p_profiles_sel on profiles;
create policy p_profiles_sel on profiles for select using (user_id = auth.uid() or is_owner());

-- plans: any signed-in user reads; owner writes
drop policy if exists p_plans_sel on plans;
create policy p_plans_sel on plans for select using (auth.uid() is not null);
drop policy if exists p_plans_all on plans;
create policy p_plans_all on plans for all using (is_owner()) with check (is_owner());

-- members: owner all; member sees only own row
drop policy if exists p_members_sel on members;
create policy p_members_sel on members for select using (is_owner() or user_id = auth.uid());
drop policy if exists p_members_all on members;
create policy p_members_all on members for all using (is_owner()) with check (is_owner());

-- attendance: owner all; member sees/inserts own
drop policy if exists p_att_sel on attendance;
create policy p_att_sel on attendance for select
  using (is_owner() or member_id in (select id from members where user_id = auth.uid()));
drop policy if exists p_att_ins on attendance;
create policy p_att_ins on attendance for insert
  with check (is_owner() or member_id in (select id from members where user_id = auth.uid()));
drop policy if exists p_att_del on attendance;
create policy p_att_del on attendance for delete using (is_owner());

-- gallery: read all signed-in; owner writes
drop policy if exists p_gal_sel on gallery;
create policy p_gal_sel on gallery for select using (auth.uid() is not null);
drop policy if exists p_gal_all on gallery;
create policy p_gal_all on gallery for all using (is_owner()) with check (is_owner());

-- settings: read all signed-in; owner writes
drop policy if exists p_set_sel on settings;
create policy p_set_sel on settings for select using (auth.uid() is not null);
drop policy if exists p_set_all on settings;
create policy p_set_all on settings for all using (is_owner()) with check (is_owner());

-- ---------- seed data ----------
insert into settings (id) values (1) on conflict (id) do nothing;
insert into plans (name, months, price, descr, popular) values
  ('Monthly', 1, 800, 'Full gym access for 1 month.', false),
  ('Quarterly', 3, 2100, '3 months access. Save vs monthly!', true),
  ('Half Yearly', 6, 3800, '6 months access + 1 free PT session.', false),
  ('Annual', 12, 6500, 'Best value! 12 months + diet consult.', false)
on conflict do nothing;

-- ============================================================
--  STORAGE: create a PUBLIC bucket named 'gym' (Dashboard → Storage),
--  then run the policies below so the owner can upload images.
-- ============================================================
insert into storage.buckets (id, name, public)
  values ('gym', 'gym', true) on conflict (id) do nothing;

drop policy if exists s_gym_read on storage.objects;
create policy s_gym_read on storage.objects for select using (bucket_id = 'gym');

drop policy if exists s_gym_write on storage.objects;
create policy s_gym_write on storage.objects for insert
  with check (bucket_id = 'gym' and auth.uid() is not null);

drop policy if exists s_gym_del on storage.objects;
create policy s_gym_del on storage.objects for delete
  using (bucket_id = 'gym' and auth.uid() is not null);
