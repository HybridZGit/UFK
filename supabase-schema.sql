-- UFK Supabase schema v2 — fighter accounts + admin controls
-- Run this entire file in Supabase SQL Editor. Safe to run over the previous UFK schema.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  is_admin boolean not null default false,
  display_name text,
  region text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists region text;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, region)
  values (new.id, nullif(new.raw_user_meta_data->>'fighter_name',''), nullif(new.raw_user_meta_data->>'region',''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.is_ufk_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select is_admin from public.profiles where id = (select auth.uid())), false);
$$;

create table if not exists public.fighters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  name text not null unique,
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  draws integer not null default 0 check (draws >= 0),
  region text,
  resume numeric(3,1) not null default 0,
  momentum numeric(3,1) not null default 0,
  finishing numeric(3,1) not null default 0,
  activity numeric(3,1) not null default 0,
  big_fight numeric(3,1) not null default 0,
  score numeric(3,1) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.fighters add column if not exists user_id uuid unique references auth.users(id) on delete set null;

create table if not exists public.champions (division text primary key, fighter_id uuid references public.fighters(id) on delete set null, defenses integer not null default 0 check (defenses >= 0), granted_at timestamptz not null default now());
create table if not exists public.results (id uuid primary key default gen_random_uuid(), winner_id uuid references public.fighters(id) on delete set null, loser_id uuid references public.fighters(id) on delete set null, method text not null, event_date date not null, created_at timestamptz not null default now());
create table if not exists public.events (id uuid primary key default gen_random_uuid(), name text not null, event_date date not null, details text, status text not null default 'upcoming' check (status in ('upcoming','live','completed')), created_at timestamptz not null default now());
create table if not exists public.contract_activity (id uuid primary key default gen_random_uuid(), fighter_id uuid references public.fighters(id) on delete cascade, action text not null, created_at timestamptz not null default now());
create table if not exists public.betting_markets (id uuid primary key default gen_random_uuid(), fighter_a_id uuid references public.fighters(id) on delete cascade, fighter_b_id uuid references public.fighters(id) on delete cascade, odds_a text not null, odds_b text not null, is_open boolean not null default true, created_at timestamptz not null default now(), check (fighter_a_id is distinct from fighter_b_id));
create table if not exists public.league_settings (key text primary key, value jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now());

alter table public.profiles enable row level security;
alter table public.fighters enable row level security;
alter table public.champions enable row level security;
alter table public.results enable row level security;
alter table public.events enable row level security;
alter table public.contract_activity enable row level security;
alter table public.betting_markets enable row level security;
alter table public.league_settings enable row level security;

-- Fighter account profile policies. Users can only edit safe profile fields in public.profiles.
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select to authenticated using ((select auth.uid()) = id or (select public.is_ufk_admin()));
drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- Fighters are public to read. Admins have full control. A signed-in fighter may create exactly one own row.
drop policy if exists "public read" on public.fighters;
create policy "public read" on public.fighters for select to anon, authenticated using (true);
drop policy if exists "fighter creates own profile" on public.fighters;
create policy "fighter creates own profile" on public.fighters for insert to authenticated
with check (user_id = (select auth.uid()) and wins=0 and losses=0 and draws=0 and resume=0 and momentum=0 and finishing=0 and activity=0 and big_fight=0 and score=0);

-- IMPORTANT: fighters do NOT get UPDATE access to public.fighters. This prevents users changing wins, titles or ratings.
-- Profile name/region changes are stored in profiles; an admin can sync official fighter data when needed.

do $$
declare t text;
begin
  foreach t in array array['fighters','champions','results','events','contract_activity','betting_markets','league_settings'] loop
    execute format('drop policy if exists "admin insert" on public.%I', t);
    execute format('create policy "admin insert" on public.%I for insert to authenticated with check ((select public.is_ufk_admin()))', t);
    execute format('drop policy if exists "admin update" on public.%I', t);
    execute format('create policy "admin update" on public.%I for update to authenticated using ((select public.is_ufk_admin())) with check ((select public.is_ufk_admin()))', t);
    execute format('drop policy if exists "admin delete" on public.%I', t);
    execute format('create policy "admin delete" on public.%I for delete to authenticated using ((select public.is_ufk_admin()))', t);
  end loop;
end $$;

-- Public read for league tables other than fighters.
do $$
declare t text;
begin
  foreach t in array array['champions','results','events','contract_activity','betting_markets','league_settings'] loop
    execute format('drop policy if exists "public read" on public.%I', t);
    execute format('create policy "public read" on public.%I for select to anon, authenticated using (true)', t);
  end loop;
end $$;

grant usage on schema public to anon, authenticated;
grant select on public.fighters, public.champions, public.results, public.events, public.contract_activity, public.betting_markets, public.league_settings to anon, authenticated;
revoke update on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, region, updated_at) on public.profiles to authenticated;
grant insert on public.fighters to authenticated;
grant insert, update, delete on public.fighters, public.champions, public.results, public.events, public.contract_activity, public.betting_markets, public.league_settings to authenticated;
grant execute on function public.is_ufk_admin() to authenticated;

-- Create the first admin through Supabase Authentication, then promote once:
-- update public.profiles p set is_admin = true from auth.users u
-- where p.id = u.id and u.email = 'YOUR-ADMIN-EMAIL@example.com';
