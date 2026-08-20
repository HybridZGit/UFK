-- UCS Supabase schema v4 — fighter avatars, smart rankings, account wallets + betting
-- Run this entire file in Supabase SQL Editor. Safe to run over the previous UCS/UFK schema.
-- UCS Credits are virtual league currency only; this schema is not for real-money gambling.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  is_admin boolean not null default false,
  display_name text,
  region text,
  platform text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists region text;
alter table public.profiles add column if not exists platform text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

create table if not exists public.wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance numeric(12,2) not null default 5000 check (balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fighters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  name text not null unique,
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  draws integer not null default 0 check (draws >= 0),
  region text,
  platform text,
  avatar_url text,
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
alter table public.fighters add column if not exists platform text;
alter table public.fighters add column if not exists avatar_url text;

create table if not exists public.champions (
  division text primary key,
  fighter_id uuid references public.fighters(id) on delete set null,
  defenses integer not null default 0 check (defenses >= 0),
  granted_at timestamptz not null default now()
);
-- Retire older title labels and migrate the league divisions to UCS branding.
delete from public.champions where division in ('RBC','ABC','UFK IC');
insert into public.champions (division,fighter_id,defenses,granted_at)
select replace(division,'UFK','UCS'), fighter_id, defenses, granted_at
from public.champions where division in ('UFK World','UFK PS5','UFK PC','UFK XBOX')
on conflict (division) do update set fighter_id=excluded.fighter_id, defenses=excluded.defenses, granted_at=excluded.granted_at;
delete from public.champions where division in ('UFK World','UFK PS5','UFK PC','UFK XBOX');

create table if not exists public.results (
  id uuid primary key default gen_random_uuid(),
  winner_id uuid references public.fighters(id) on delete set null,
  loser_id uuid references public.fighters(id) on delete set null,
  method text not null,
  event_date date not null,
  created_at timestamptz not null default now()
);
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event_date date not null,
  details text,
  status text not null default 'upcoming' check (status in ('upcoming','live','completed')),
  created_at timestamptz not null default now()
);
create table if not exists public.contract_activity (
  id uuid primary key default gen_random_uuid(),
  fighter_id uuid references public.fighters(id) on delete cascade,
  action text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.betting_markets (
  id uuid primary key default gen_random_uuid(),
  fighter_a_id uuid references public.fighters(id) on delete cascade,
  fighter_b_id uuid references public.fighters(id) on delete cascade,
  odds_a text not null,
  odds_b text not null,
  is_open boolean not null default true,
  created_at timestamptz not null default now(),
  check (fighter_a_id is distinct from fighter_b_id)
);
create table if not exists public.user_bets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  market_id uuid references public.betting_markets(id) on delete set null,
  selection_fighter_id uuid references public.fighters(id) on delete set null,
  stake numeric(12,2) not null check (stake > 0),
  odds text not null,
  potential_return numeric(12,2) not null check (potential_return >= 0),
  status text not null default 'open' check (status in ('open','won','lost','void')),
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
create table if not exists public.league_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Create profile + wallet automatically for every Supabase Auth account.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, region, platform)
  values (
    new.id,
    nullif(new.raw_user_meta_data->>'fighter_name',''),
    nullif(new.raw_user_meta_data->>'region',''),
    coalesce(nullif(upper(new.raw_user_meta_data->>'platform'),''), 'PS5')
  )
  on conflict (id) do nothing;

  insert into public.wallets (user_id, balance)
  values (new.id, 5000)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Backfill wallets/profiles for accounts that existed before v3.
insert into public.profiles (id, display_name, region, platform)
select u.id,
       nullif(u.raw_user_meta_data->>'fighter_name',''),
       nullif(u.raw_user_meta_data->>'region',''),
       coalesce(nullif(upper(u.raw_user_meta_data->>'platform'),''), 'PS5')
from auth.users u
on conflict (id) do nothing;

insert into public.wallets (user_id, balance)
select id, 5000 from auth.users
on conflict (user_id) do nothing;

create or replace function public.is_ufk_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select is_admin from public.profiles where id = (select auth.uid())), false);
$$;

-- Atomic server-side wager placement. Users cannot directly edit wallet balances.
create or replace function public.place_ufk_bet(p_market_id uuid, p_selection_id uuid, p_stake numeric)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_market public.betting_markets%rowtype;
  v_balance numeric(12,2);
  v_odds_text text;
  v_odds numeric;
  v_return numeric(12,2);
  v_bet_id uuid;
begin
  if v_uid is null then raise exception 'Sign in to place a UFK bet.'; end if;
  if p_stake is null or p_stake < 1 then raise exception 'Minimum stake is UF 1.'; end if;

  select * into v_market from public.betting_markets where id = p_market_id and is_open = true;
  if not found then raise exception 'This betting market is closed.'; end if;
  if p_selection_id <> v_market.fighter_a_id and p_selection_id <> v_market.fighter_b_id then
    raise exception 'Invalid fighter selection.';
  end if;

  select balance into v_balance from public.wallets where user_id = v_uid for update;
  if not found then raise exception 'UFK wallet not found. Run the latest database schema.'; end if;
  if v_balance < p_stake then raise exception 'Not enough UFK Credits.'; end if;

  v_odds_text := case when p_selection_id = v_market.fighter_a_id then v_market.odds_a else v_market.odds_b end;
  begin
    v_odds := regexp_replace(v_odds_text, '[^0-9+.-]', '', 'g')::numeric;
  exception when others then
    v_odds := 0;
  end;

  if v_odds > 0 then
    v_return := round(p_stake + (p_stake * v_odds / 100), 2);
  elsif v_odds < 0 then
    v_return := round(p_stake + (p_stake * 100 / abs(v_odds)), 2);
  else
    v_return := p_stake;
  end if;

  update public.wallets set balance = balance - p_stake, updated_at = now() where user_id = v_uid;
  insert into public.user_bets (user_id, market_id, selection_fighter_id, stake, odds, potential_return)
  values (v_uid, p_market_id, p_selection_id, p_stake, v_odds_text, v_return)
  returning id into v_bet_id;
  return v_bet_id;
end;
$$;



-- Backfill public avatar links for already-linked fighter accounts.
update public.fighters f set avatar_url=p.avatar_url, updated_at=now()
from public.profiles p where f.user_id=p.id and f.avatar_url is null and p.avatar_url is not null;

-- Public fighter avatar storage. Users may only write inside their own auth-id folder.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('fighter-avatars','fighter-avatars',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true, file_size_limit=5242880, allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "public fighter avatar read" on storage.objects;
create policy "public fighter avatar read" on storage.objects for select to public using (bucket_id='fighter-avatars');
drop policy if exists "fighter avatar upload" on storage.objects;
create policy "fighter avatar upload" on storage.objects for insert to authenticated
with check (bucket_id='fighter-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "fighter avatar update" on storage.objects;
create policy "fighter avatar update" on storage.objects for update to authenticated
using (bucket_id='fighter-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text)
with check (bucket_id='fighter-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "fighter avatar delete" on storage.objects;
create policy "fighter avatar delete" on storage.objects for delete to authenticated
using (bucket_id='fighter-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);

-- Safely copy account identity fields into the user's linked public fighter row.
create or replace function public.sync_my_fighter_identity()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Sign in first.'; end if;
  update public.fighters f
  set name=coalesce(nullif(p.display_name,''),f.name),
      region=p.region,
      platform=p.platform,
      avatar_url=p.avatar_url,
      updated_at=now()
  from public.profiles p
  where p.id=v_uid and f.user_id=v_uid;
end;
$$;

-- Smart ranking model: record strength + recent form + finishes + activity + championship experience.
-- This is deterministic/transparent rather than pretending a browser-side model is AI.
create or replace function public.recalculate_ucs_rankings()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  f record;
  v_total numeric;
  v_win_rate numeric;
  v_recent_count integer;
  v_recent_points numeric;
  v_ko_wins integer;
  v_recent_activity integer;
  v_titles integer;
  v_resume numeric;
  v_momentum numeric;
  v_finishing numeric;
  v_activity numeric;
  v_big numeric;
  v_score numeric;
begin
  if auth.uid() is not null and not public.is_ufk_admin() then
    raise exception 'Admin permission required.';
  end if;

  for f in select * from public.fighters where active=true loop
    v_total := coalesce(f.wins,0)+coalesce(f.losses,0)+coalesce(f.draws,0);
    v_win_rate := case when v_total>0 then f.wins/v_total else 0 end;

    select count(*), coalesce(sum(case when r.winner_id=f.id then 1 when r.loser_id=f.id then -1 else 0 end),0)
      into v_recent_count,v_recent_points
      from (select * from public.results where winner_id=f.id or loser_id=f.id order by event_date desc, created_at desc limit 5) r;

    select count(*) into v_ko_wins from public.results r where r.winner_id=f.id and upper(r.method) like '%KO%';
    select count(*) into v_recent_activity from public.results r where (r.winner_id=f.id or r.loser_id=f.id) and r.event_date >= current_date-120;
    select count(*) into v_titles from public.champions c where c.fighter_id=f.id;

    if v_total=0 then
      v_resume:=0; v_momentum:=0; v_finishing:=0; v_activity:=0; v_big:=0; v_score:=0;
    else
      v_resume := least(10, 3.2 + (v_win_rate*4.8) + least(2, v_total/8.0));
      v_momentum := least(10, greatest(0, case when v_recent_count=0 then 4.5 else 5 + (v_recent_points*1.0) end));
      v_finishing := least(10, 2 + (case when f.wins>0 then (v_ko_wins::numeric/f.wins)*8 else 0 end));
      v_activity := least(10, 2 + (v_recent_activity*2.0));
      v_big := least(10, 2.5 + (v_titles*3.0) + least(2.5,v_total/8.0) + (v_win_rate*2.0));
      v_score := least(10, (v_resume*.30)+(v_momentum*.25)+(v_finishing*.15)+(v_activity*.15)+(v_big*.15));
    end if;

    update public.fighters set
      resume=round(v_resume,1), momentum=round(v_momentum,1), finishing=round(v_finishing,1),
      activity=round(v_activity,1), big_fight=round(v_big,1), score=round(v_score,1), updated_at=now()
    where id=f.id;
  end loop;
end;
$$;

-- Publish a result atomically, update the official W/L record, then recalculate ratings.
create or replace function public.publish_ucs_result(p_winner_id uuid,p_loser_id uuid,p_method text,p_event_date date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if not public.is_ufk_admin() then raise exception 'Admin permission required.'; end if;
  if p_winner_id is null or p_loser_id is null or p_winner_id=p_loser_id then raise exception 'Choose two different fighters.'; end if;
  insert into public.results(winner_id,loser_id,method,event_date)
  values(p_winner_id,p_loser_id,p_method,p_event_date) returning id into v_id;
  update public.fighters set wins=wins+1,updated_at=now() where id=p_winner_id;
  update public.fighters set losses=losses+1,updated_at=now() where id=p_loser_id;
  perform public.recalculate_ucs_rankings();
  return v_id;
end;
$$;

alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.fighters enable row level security;
alter table public.champions enable row level security;
alter table public.results enable row level security;
alter table public.events enable row level security;
alter table public.contract_activity enable row level security;
alter table public.betting_markets enable row level security;
alter table public.user_bets enable row level security;
alter table public.league_settings enable row level security;

-- Profiles: owner reads/edits safe fields; admins can read profiles.
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select to authenticated using ((select auth.uid()) = id or (select public.is_ufk_admin()));
drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- Wallets: users can only READ their wallet. Balance mutation happens through server-side functions or admin access.
drop policy if exists "read own wallet" on public.wallets;
create policy "read own wallet" on public.wallets for select to authenticated using (user_id = (select auth.uid()) or (select public.is_ufk_admin()));
drop policy if exists "admin wallet update" on public.wallets;
create policy "admin wallet update" on public.wallets for update to authenticated using ((select public.is_ufk_admin())) with check ((select public.is_ufk_admin()));

-- Fighters are public to read. A signed-in user can create exactly one clean official fighter profile.
drop policy if exists "public read" on public.fighters;
create policy "public read" on public.fighters for select to anon, authenticated using (true);
drop policy if exists "fighter creates own profile" on public.fighters;
create policy "fighter creates own profile" on public.fighters for insert to authenticated
with check (user_id = (select auth.uid()) and wins=0 and losses=0 and draws=0 and resume=0 and momentum=0 and finishing=0 and activity=0 and big_fight=0 and score=0);

-- User bet history is private to the account, admins can also inspect it.
drop policy if exists "read own bets" on public.user_bets;
create policy "read own bets" on public.user_bets for select to authenticated using (user_id = (select auth.uid()) or (select public.is_ufk_admin()));

-- Admin CRUD for league-managed data.
do $$
declare t text;
begin
  foreach t in array array['fighters','champions','results','events','contract_activity','betting_markets','league_settings','user_bets'] loop
    execute format('drop policy if exists "admin insert" on public.%I', t);
    execute format('create policy "admin insert" on public.%I for insert to authenticated with check ((select public.is_ufk_admin()))', t);
    execute format('drop policy if exists "admin update" on public.%I', t);
    execute format('create policy "admin update" on public.%I for update to authenticated using ((select public.is_ufk_admin())) with check ((select public.is_ufk_admin()))', t);
    execute format('drop policy if exists "admin delete" on public.%I', t);
    execute format('create policy "admin delete" on public.%I for delete to authenticated using ((select public.is_ufk_admin()))', t);
  end loop;
end $$;

-- Public read for league-facing data.
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
grant select on public.profiles, public.wallets, public.user_bets to authenticated;
revoke update on public.profiles from authenticated;
grant update (display_name, region, platform, avatar_url, updated_at) on public.profiles to authenticated;
revoke all on public.wallets from anon;
revoke insert, update, delete on public.wallets from authenticated;
grant update on public.wallets to authenticated; -- RLS limits this to admins only.
grant insert on public.fighters to authenticated;
grant insert, update, delete on public.fighters, public.champions, public.results, public.events, public.contract_activity, public.betting_markets, public.league_settings, public.user_bets to authenticated;
grant execute on function public.is_ufk_admin() to authenticated;
grant execute on function public.place_ufk_bet(uuid,uuid,numeric) to authenticated;
grant execute on function public.sync_my_fighter_identity() to authenticated;
grant execute on function public.recalculate_ucs_rankings() to authenticated;
grant execute on function public.publish_ucs_result(uuid,uuid,text,date) to authenticated;

-- Existing fighters can be assigned a platform from Table Editor or admin UI after running this schema.
-- Existing title names such as RBC/ABC are not deleted automatically; vacate/delete them if no longer used.
-- First admin promotion remains:
-- update public.profiles p set is_admin = true from auth.users u
-- where p.id = u.id and u.email = 'YOUR-ADMIN-EMAIL@example.com';

-- Recalculate once after migration so existing fighters receive fresh UCS ratings.
select public.recalculate_ucs_rankings();


-- ============================================================
-- UCS v5 — FIGHTER-TO-FIGHTER CONTRACT CHALLENGES + ESCROW
-- ============================================================
-- Contract wagers use virtual UCS Credits only. No real-money settlement.

create table if not exists public.fighter_contracts (
  id uuid primary key default gen_random_uuid(),
  sender_fighter_id uuid not null references public.fighters(id) on delete cascade,
  receiver_fighter_id uuid not null references public.fighters(id) on delete cascade,
  wager numeric(12,2) not null default 0 check (wager >= 0),
  purse_split text not null default '100/0' check (purse_split in ('100/0','80/20','70/30','60/40','50/50')),
  rounds integer not null default 10 check (rounds in (3,5,8,10,12)),
  damage numeric(3,1) not null default 1.0 check (damage in (0.5,1.0,1.5,2.0)),
  weight_class text,
  rating_limit integer check (rating_limit is null or (rating_limit >= 0 and rating_limit <= 100)),
  bans text not null default 'No bans',
  rematch_clause boolean not null default false,
  live_fight boolean not null default false,
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled','expired','completed')),
  expires_at timestamptz not null default (now() + interval '72 hours'),
  accepted_at timestamptz,
  completed_at timestamptz,
  winner_fighter_id uuid references public.fighters(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sender_fighter_id <> receiver_fighter_id)
);

create index if not exists fighter_contracts_sender_idx on public.fighter_contracts(sender_fighter_id, created_at desc);
create index if not exists fighter_contracts_receiver_idx on public.fighter_contracts(receiver_fighter_id, created_at desc);
create index if not exists fighter_contracts_status_idx on public.fighter_contracts(status, expires_at);

alter table public.fighter_contracts enable row level security;

drop policy if exists "fighters read own contracts" on public.fighter_contracts;
create policy "fighters read own contracts" on public.fighter_contracts
for select to authenticated
using (
  (select public.is_ufk_admin())
  or exists (
    select 1 from public.fighters f
    where f.user_id = (select auth.uid())
      and (f.id = sender_fighter_id or f.id = receiver_fighter_id)
  )
);

drop policy if exists "admin manages fighter contracts" on public.fighter_contracts;
create policy "admin manages fighter contracts" on public.fighter_contracts
for all to authenticated
using ((select public.is_ufk_admin()))
with check ((select public.is_ufk_admin()));

grant select on public.fighter_contracts to authenticated;
revoke insert, update, delete on public.fighter_contracts from authenticated;

-- Send a challenge and escrow the sender's wager immediately.
create or replace function public.create_fighter_contract(
  p_receiver_fighter_id uuid,
  p_wager numeric,
  p_purse_split text,
  p_rounds integer,
  p_damage numeric,
  p_weight_class text,
  p_rating_limit integer,
  p_bans text,
  p_rematch_clause boolean,
  p_live_fight boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_sender public.fighters%rowtype;
  v_receiver public.fighters%rowtype;
  v_balance numeric(12,2);
  v_max numeric(12,2);
  v_id uuid;
begin
  if v_uid is null then raise exception 'Sign in to send a contract.'; end if;

  select * into v_sender from public.fighters where user_id = v_uid and active = true;
  if not found then raise exception 'Create your official fighter profile first.'; end if;

  select * into v_receiver from public.fighters where id = p_receiver_fighter_id and active = true;
  if not found then raise exception 'Opponent not found.'; end if;
  if v_receiver.id = v_sender.id then raise exception 'You cannot challenge yourself.'; end if;
  if v_receiver.user_id is null then raise exception 'That fighter is not linked to a UCS account yet.'; end if;

  if exists (
    select 1 from public.fighter_contracts c
    where c.status = 'pending'
      and ((c.sender_fighter_id=v_sender.id and c.receiver_fighter_id=v_receiver.id)
        or (c.sender_fighter_id=v_receiver.id and c.receiver_fighter_id=v_sender.id))
  ) then
    raise exception 'A pending contract already exists between these fighters.';
  end if;

  if coalesce(p_wager,0) < 0 then raise exception 'Wager cannot be negative.'; end if;
  if coalesce(p_purse_split,'') not in ('100/0','80/20','70/30','60/40','50/50') then raise exception 'Invalid purse split.'; end if;
  if p_rounds not in (3,5,8,10,12) then raise exception 'Invalid round count.'; end if;
  if p_damage not in (0.5,1.0,1.5,2.0) then raise exception 'Invalid damage setting.'; end if;

  select balance into v_balance from public.wallets where user_id = v_uid for update;
  if not found then raise exception 'UCS wallet not found.'; end if;
  v_max := floor(v_balance * 0.25);
  if coalesce(p_wager,0) > v_max then raise exception 'Wager exceeds the 25%% contract limit.'; end if;
  if v_balance < coalesce(p_wager,0) then raise exception 'Not enough UCS Credits.'; end if;

  update public.wallets
  set balance = balance - coalesce(p_wager,0), updated_at = now()
  where user_id = v_uid;

  insert into public.fighter_contracts(
    sender_fighter_id, receiver_fighter_id, wager, purse_split, rounds, damage,
    weight_class, rating_limit, bans, rematch_clause, live_fight
  ) values (
    v_sender.id, v_receiver.id, coalesce(p_wager,0), p_purse_split, p_rounds, p_damage,
    nullif(trim(coalesce(p_weight_class,'')),''), p_rating_limit,
    coalesce(nullif(trim(coalesce(p_bans,'')),''),'No bans'),
    coalesce(p_rematch_clause,false), coalesce(p_live_fight,false)
  ) returning id into v_id;

  insert into public.contract_activity(fighter_id,action)
  values(v_sender.id, 'sent a fight contract to ' || v_receiver.name);

  return v_id;
end;
$$;

-- Accept, decline, or cancel a pending contract.
-- Accepting escrows the receiver's matching wager.
create or replace function public.respond_fighter_contract(p_contract_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_me public.fighters%rowtype;
  v_c public.fighter_contracts%rowtype;
  v_sender public.fighters%rowtype;
  v_receiver public.fighters%rowtype;
  v_balance numeric(12,2);
begin
  if v_uid is null then raise exception 'Sign in first.'; end if;
  select * into v_me from public.fighters where user_id=v_uid and active=true;
  if not found then raise exception 'Official fighter profile required.'; end if;

  select * into v_c from public.fighter_contracts where id=p_contract_id for update;
  if not found then raise exception 'Contract not found.'; end if;

  if v_c.status <> 'pending' then raise exception 'This contract is no longer pending.'; end if;

  if v_c.expires_at <= now() then
    update public.fighter_contracts set status='expired',updated_at=now() where id=v_c.id;
    select * into v_sender from public.fighters where id=v_c.sender_fighter_id;
    if v_sender.user_id is not null and v_c.wager > 0 then
      update public.wallets set balance=balance+v_c.wager,updated_at=now() where user_id=v_sender.user_id;
    end if;
    return;
  end if;

  select * into v_sender from public.fighters where id=v_c.sender_fighter_id;
  select * into v_receiver from public.fighters where id=v_c.receiver_fighter_id;

  if p_action='accept' then
    if v_me.id <> v_c.receiver_fighter_id then raise exception 'Only the challenged fighter can accept.'; end if;
    select balance into v_balance from public.wallets where user_id=v_uid for update;
    if not found then raise exception 'UCS wallet not found.'; end if;
    if v_balance < v_c.wager then raise exception 'You need enough UCS Credits to match the wager.'; end if;
    update public.wallets set balance=balance-v_c.wager,updated_at=now() where user_id=v_uid;
    update public.fighter_contracts set status='accepted',accepted_at=now(),updated_at=now() where id=v_c.id;
    insert into public.contract_activity(fighter_id,action)
    values(v_receiver.id, 'accepted a fight contract vs ' || v_sender.name);

  elsif p_action='decline' then
    if v_me.id <> v_c.receiver_fighter_id then raise exception 'Only the challenged fighter can decline.'; end if;
    if v_sender.user_id is not null and v_c.wager > 0 then
      update public.wallets set balance=balance+v_c.wager,updated_at=now() where user_id=v_sender.user_id;
    end if;
    update public.fighter_contracts set status='declined',updated_at=now() where id=v_c.id;
    insert into public.contract_activity(fighter_id,action)
    values(v_receiver.id, 'declined a fight contract from ' || v_sender.name);

  elsif p_action='cancel' then
    if v_me.id <> v_c.sender_fighter_id then raise exception 'Only the sender can cancel this contract.'; end if;
    if v_sender.user_id is not null and v_c.wager > 0 then
      update public.wallets set balance=balance+v_c.wager,updated_at=now() where user_id=v_sender.user_id;
    end if;
    update public.fighter_contracts set status='cancelled',updated_at=now() where id=v_c.id;
    insert into public.contract_activity(fighter_id,action)
    values(v_sender.id, 'cancelled a fight contract vs ' || v_receiver.name);
  else
    raise exception 'Action must be accept, decline or cancel.';
  end if;
end;
$$;

-- Refund expired pending contracts. Safe to call whenever an account loads.
create or replace function public.expire_my_fighter_contracts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer := 0;
  c record;
  v_sender_user uuid;
begin
  if v_uid is null then return 0; end if;

  for c in
    select fc.*
    from public.fighter_contracts fc
    join public.fighters me on me.user_id=v_uid
    where fc.status='pending'
      and fc.expires_at <= now()
      and (fc.sender_fighter_id=me.id or fc.receiver_fighter_id=me.id)
    for update of fc
  loop
    select user_id into v_sender_user from public.fighters where id=c.sender_fighter_id;
    if v_sender_user is not null and c.wager > 0 then
      update public.wallets set balance=balance+c.wager,updated_at=now() where user_id=v_sender_user;
    end if;
    update public.fighter_contracts set status='expired',updated_at=now() where id=c.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Settle an accepted contract after an official result.
-- The accepted contract holds one wager from each fighter.
create or replace function public.settle_fighter_contract(p_contract_id uuid, p_winner_fighter_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.fighter_contracts%rowtype;
  v_sender public.fighters%rowtype;
  v_receiver public.fighters%rowtype;
  v_winner_user uuid;
  v_loser_user uuid;
  v_pool numeric(12,2);
  v_win_pct numeric;
  v_lose_pct numeric;
  v_win_pay numeric(12,2);
  v_lose_pay numeric(12,2);
begin
  if not public.is_ufk_admin() then raise exception 'Admin permission required.'; end if;
  select * into v_c from public.fighter_contracts where id=p_contract_id for update;
  if not found then raise exception 'Contract not found.'; end if;
  if v_c.status <> 'accepted' then raise exception 'Only accepted contracts can be completed.'; end if;
  if p_winner_fighter_id not in (v_c.sender_fighter_id,v_c.receiver_fighter_id) then raise exception 'Winner is not part of this contract.'; end if;

  select * into v_sender from public.fighters where id=v_c.sender_fighter_id;
  select * into v_receiver from public.fighters where id=v_c.receiver_fighter_id;
  v_winner_user := case when p_winner_fighter_id=v_sender.id then v_sender.user_id else v_receiver.user_id end;
  v_loser_user := case when p_winner_fighter_id=v_sender.id then v_receiver.user_id else v_sender.user_id end;
  v_pool := v_c.wager * 2;

  v_win_pct := split_part(v_c.purse_split,'/',1)::numeric / 100;
  v_lose_pct := split_part(v_c.purse_split,'/',2)::numeric / 100;
  v_win_pay := round(v_pool*v_win_pct,2);
  v_lose_pay := round(v_pool*v_lose_pct,2);

  if v_winner_user is not null and v_win_pay > 0 then
    update public.wallets set balance=balance+v_win_pay,updated_at=now() where user_id=v_winner_user;
  end if;
  if v_loser_user is not null and v_lose_pay > 0 then
    update public.wallets set balance=balance+v_lose_pay,updated_at=now() where user_id=v_loser_user;
  end if;

  update public.fighter_contracts
  set status='completed',winner_fighter_id=p_winner_fighter_id,completed_at=now(),updated_at=now()
  where id=v_c.id;
end;
$$;

-- Override result publishing so an accepted fighter contract between the two
-- competitors is automatically completed and its UCS Credit escrow is paid.
create or replace function public.publish_ucs_result(p_winner_id uuid,p_loser_id uuid,p_method text,p_event_date date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_contract_id uuid;
begin
  if not public.is_ufk_admin() then raise exception 'Admin permission required.'; end if;
  if p_winner_id is null or p_loser_id is null or p_winner_id=p_loser_id then raise exception 'Choose two different fighters.'; end if;

  insert into public.results(winner_id,loser_id,method,event_date)
  values(p_winner_id,p_loser_id,p_method,p_event_date) returning id into v_id;

  update public.fighters set wins=wins+1,updated_at=now() where id=p_winner_id;
  update public.fighters set losses=losses+1,updated_at=now() where id=p_loser_id;

  select id into v_contract_id
  from public.fighter_contracts
  where status='accepted'
    and ((sender_fighter_id=p_winner_id and receiver_fighter_id=p_loser_id)
      or (sender_fighter_id=p_loser_id and receiver_fighter_id=p_winner_id))
  order by accepted_at desc nulls last, created_at desc
  limit 1;

  if v_contract_id is not null then
    perform public.settle_fighter_contract(v_contract_id,p_winner_id);
  end if;

  perform public.recalculate_ucs_rankings();
  return v_id;
end;
$$;

grant execute on function public.create_fighter_contract(uuid,numeric,text,integer,numeric,text,integer,text,boolean,boolean) to authenticated;
grant execute on function public.respond_fighter_contract(uuid,text) to authenticated;
grant execute on function public.expire_my_fighter_contracts() to authenticated;
grant execute on function public.settle_fighter_contract(uuid,uuid) to authenticated;
