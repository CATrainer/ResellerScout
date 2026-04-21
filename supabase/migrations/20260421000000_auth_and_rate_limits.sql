-- WorthIt — Day 4 auth + rate-limiting schema.
--
-- Adds:
--   1. `users` table — one row per Supabase Auth user, with plan + daily scan counter.
--   2. `rate_limits` table — server-side per-user daily scan enforcement (Day 5 consumer).
--   3. Trigger to create a `users` row on auth.users insert (plan defaults to 'free').
--   4. RLS policies — users can read/update their own row only. Function uses service role.
--
-- Safe to re-run: uses IF NOT EXISTS where Postgres supports it. Run-once preferred.
--
-- Applied via: `supabase db push` after `supabase link`. Or paste into the SQL editor.

-- ---------------------------------------------------------------
-- 1. users table
-- ---------------------------------------------------------------

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  plan text not null default 'free' check (plan in ('free', 'pro', 'pro_plus')),
  scans_today integer not null default 0,
  scans_today_reset_at timestamptz not null default date_trunc('day', now() + interval '1 day')
);

comment on table public.users is 'WorthIt user record, 1:1 with auth.users. Holds plan + daily scan counter used by the anthropic-proxy Edge Function.';

-- ---------------------------------------------------------------
-- 2. rate_limits — per-user / per-day / per-flow counter
-- ---------------------------------------------------------------
-- Day-4: written to by Edge Function on every proxy invocation (Day-5 enforcement).
-- Partitioned by day via the `day` column; composite PK makes upsert atomic.

create table if not exists public.rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default (now() at time zone 'utc')::date,
  flow text not null check (flow in ('estimate', 'listing')),
  count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, day, flow)
);

comment on table public.rate_limits is 'Per-user daily count per flow. Day-5 Edge Function upserts on each proxy invocation; rejects with 429 if over the plan cap.';

create index if not exists rate_limits_day_idx on public.rate_limits (day);

-- ---------------------------------------------------------------
-- 3. Trigger: auto-create public.users row on auth.users insert
-- ---------------------------------------------------------------
-- Supabase's Apple Sign-In hook calls auth.users insert. We mirror it into public.users
-- so we can join plan + scan counter without a conditional on every read.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, plan)
  values (new.id, 'free')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------
-- 4. RLS policies
-- ---------------------------------------------------------------

alter table public.users enable row level security;
alter table public.rate_limits enable row level security;

-- users: self-read, self-update (plan + scans_today are server-authoritative from
-- Day 5 onward, but we let the client read for the Settings screen + Home counter).
drop policy if exists "users_self_select" on public.users;
create policy "users_self_select"
  on public.users for select
  using (auth.uid() = id);

-- rate_limits: self-read only. Writes happen via the service-role key inside the
-- Edge Function — clients cannot write directly. No policy granted for insert/update.
drop policy if exists "rate_limits_self_select" on public.rate_limits;
create policy "rate_limits_self_select"
  on public.rate_limits for select
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------
-- 5. Helper: atomic per-day increment used by Day-5 Edge Function
-- ---------------------------------------------------------------
-- Usage from Edge Function (service role):
--   select * from public.increment_rate_limit(p_user := uid, p_flow := 'estimate');
-- Returns the new count for the day after the increment.

create or replace function public.increment_rate_limit(p_user uuid, p_flow text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.rate_limits (user_id, day, flow, count, updated_at)
  values (p_user, (now() at time zone 'utc')::date, p_flow, 1, now())
  on conflict (user_id, day, flow) do update
    set count = rate_limits.count + 1,
        updated_at = now()
  returning count into v_count;
  return v_count;
end;
$$;

comment on function public.increment_rate_limit is 'Atomic daily counter. Call from Edge Function (service role) before forwarding to Anthropic. Return value is the post-increment count; compare against plan cap.';
