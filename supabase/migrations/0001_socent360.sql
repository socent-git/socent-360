-- SocEnt 360 · database set-up for Supabase
-- Run once in Supabase › SQL Editor (or `supabase db push`). Safe to re-run.
--
-- Design
--   docs      one row per record, addressed by a path such as 'orgs/o123', 'edit/o123', 'cohorts/n7', 'pub/meta'.
--             The app keeps the same record shapes it was built and tested with; Postgres stores them as JSONB.
--   profiles  one row per signed-in person, with their SocEnt 360 role.
--   Roles     admin  · everything
--             team   · Program Team: reads everything, writes only 'edit/*' (identity, people, notes, documents,
--                      participation status, support log) and 'pub/*' (the published Overview/Impact figures)
--             viewer · other Nudge and the^delta users: reads only 'pub/*'
--             pending· signed in but not yet approved by an Admin: reads nothing
--   Row-level security enforces all of this in the database, not just in the screens.

-- ---------- profiles and roles ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  name        text,
  role        text not null default 'pending' check (role in ('admin', 'team', 'viewer', 'pending')),
  created_at  timestamptz not null default now(),
  last_seen   timestamptz
);

-- Which email domains are let in automatically as viewers (others wait as 'pending' for an Admin).
create table if not exists public.app_settings (
  key   text primary key,
  value jsonb not null
);
insert into public.app_settings (key, value) values ('auto_viewer_domains', '[]'::jsonb) on conflict (key) do nothing;

-- The caller's role, used by every policy. SECURITY DEFINER so policies on profiles can't recurse.
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'pending');
$$;

-- New sign-up → profile. The very first person becomes Admin.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  first_user boolean;
  domains jsonb;
  dom text := lower(split_part(coalesce(new.email, ''), '@', 2));
  r text := 'pending';
begin
  select not exists (select 1 from public.profiles) into first_user;
  select value into domains from public.app_settings where key = 'auto_viewer_domains';
  if first_user then r := 'admin';
  elsif domains is not null and domains ? dom then r := 'viewer';
  end if;
  insert into public.profiles (id, email, name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)), r)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Admin changes someone's role. Refuses to remove the last Admin.
create or replace function public.set_role(target uuid, new_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() <> 'admin' then raise exception 'only an admin can change roles' using errcode = '42501'; end if;
  if new_role not in ('admin', 'team', 'viewer', 'pending') then raise exception 'unknown role %', new_role; end if;
  if new_role <> 'admin' and (select role from public.profiles where id = target) = 'admin'
     and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'SocEnt 360 needs at least one admin';
  end if;
  update public.profiles set role = new_role where id = target;
end $$;

-- Record that someone opened SocEnt 360, and let them set their own display name.
create or replace function public.touch_seen(display_name text default null) returns void
language sql security definer set search_path = public as $$
  update public.profiles set last_seen = now(), name = coalesce(nullif(display_name, ''), name) where id = auth.uid();
$$;

alter table public.profiles enable row level security;
alter table public.app_settings enable row level security;

drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles for select to authenticated
  using (id = auth.uid() or public.my_role() in ('admin', 'team'));
-- Nobody updates profiles directly; roles change only through set_role(), sign-ins through touch_seen().

drop policy if exists "settings: admin" on public.app_settings;
create policy "settings: admin" on public.app_settings for all to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- ---------- records ----------
create table if not exists public.docs (
  path        text primary key,
  coll        text not null,          -- the collection path, e.g. 'orgs'
  doc_id      text not null,          -- the last path segment, e.g. 'o123'
  data        jsonb not null default '{}'::jsonb,
  version     bigint not null default 1,
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid(),
  constraint docs_path_shape check (path = coll || '/' || doc_id)
);
create index if not exists docs_coll_idx on public.docs (coll);

create or replace function public.docs_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if tg_op = 'UPDATE' then new.version := old.version + 1; end if;
  return new;
end $$;
drop trigger if exists docs_touch on public.docs;
create trigger docs_touch before insert or update on public.docs for each row execute function public.docs_touch();

alter table public.docs enable row level security;

drop policy if exists "docs: read" on public.docs;
create policy "docs: read" on public.docs for select to authenticated using (
  case
    when coll = 'pub' then public.my_role() in ('admin', 'team', 'viewer')
    else public.my_role() in ('admin', 'team')
  end
);

drop policy if exists "docs: insert" on public.docs;
create policy "docs: insert" on public.docs for insert to authenticated with check (
  public.my_role() = 'admin'
  or (public.my_role() = 'team' and coll in ('edit', 'pub'))
);

drop policy if exists "docs: update" on public.docs;
create policy "docs: update" on public.docs for update to authenticated
  using (public.my_role() = 'admin' or (public.my_role() = 'team' and coll in ('edit', 'pub')))
  with check (public.my_role() = 'admin' or (public.my_role() = 'team' and coll in ('edit', 'pub')));

drop policy if exists "docs: delete" on public.docs;
create policy "docs: delete" on public.docs for delete to authenticated using (
  public.my_role() = 'admin' or (public.my_role() = 'team' and coll = 'pub')
);

revoke all on public.docs from anon;
revoke all on public.profiles from anon;
revoke all on public.app_settings from anon;
grant select, insert, update, delete on public.docs to authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.app_settings to authenticated;
grant execute on function public.set_role(uuid, text) to authenticated;
grant execute on function public.touch_seen(text) to authenticated;
grant execute on function public.my_role() to authenticated;

-- Deep merge used by update(): nested objects merge, everything else (arrays included) is replaced.
create or replace function public.jsonb_deep_merge(a jsonb, b jsonb) returns jsonb
language sql immutable as $$
  select case
    when jsonb_typeof(a) = 'object' and jsonb_typeof(b) = 'object' then (
      select coalesce(jsonb_object_agg(k,
        case when a ? k and b ? k then public.jsonb_deep_merge(a -> k, b -> k)
             when b ? k then b -> k
             else a -> k end), '{}'::jsonb)
      from (select jsonb_object_keys(a) as k union select jsonb_object_keys(b)) keys)
    else b
  end;
$$;

-- update() for the app: merges into an existing record in one statement, so two people
-- editing different fields of the same organisation don't overwrite each other.
-- SECURITY INVOKER: row-level security still decides who may change what.
create or replace function public.docs_update(p_path text, p_patch jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare result jsonb;
begin
  update public.docs set data = public.jsonb_deep_merge(data, p_patch) where path = p_path returning data into result;
  if not found then raise exception 'record % does not exist or you may not change it', p_path using errcode = 'P0002'; end if;
  return result;
end $$;
grant execute on function public.docs_update(text, jsonb) to authenticated;

-- ---------- live updates ----------
alter table public.docs replica identity full;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'docs') then
    alter publication supabase_realtime add table public.docs;
  end if;
end $$;

-- ---------- reporting (read in SQL Editor or connect a BI tool) ----------
-- One row per organisation with its main identity fields. Respects row-level security.
create or replace view public.v_organisations with (security_invoker = true) as
select
  o.doc_id                                              as org_id,
  coalesce(e.data #>> '{f,displayName,v}', o.data->>'name') as name,
  e.data #>> '{f,legalName,v}'                          as legal_name,
  e.data #>> '{f,sector,v}'                             as sector,
  e.data #>> '{f,status,v}'                             as status,
  e.data #>> '{f,hq,v}'                                 as head_office,
  e.data #>  '{f,states,v}'                             as states,
  e.data #>> '{f,website,v}'                            as website,
  jsonb_array_length(coalesce(e.data->'founders', '[]'::jsonb)) as founders,
  jsonb_array_length(coalesce(o.data->'parts', '[]'::jsonb))    as participations,
  o.data->>'mergedInto'                                 as merged_into,
  greatest(o.updated_at, coalesce(e.updated_at, o.updated_at)) as updated_at
from public.docs o
left join public.docs e on e.coll = 'edit' and e.doc_id = o.doc_id
where o.coll = 'orgs';
grant select on public.v_organisations to authenticated;

-- One row per grant tranche.
create or replace view public.v_grants with (security_invoker = true) as
select o.doc_id as org_id, p->>'cohortId' as cohort_id, (g->>'amt')::numeric as amount, g->>'date' as disbursed_on, g->>'tranche' as tranche, g->>'src' as source
from public.docs o, jsonb_array_elements(coalesce(o.data->'parts', '[]'::jsonb)) p, jsonb_array_elements(coalesce(p->'grants', '[]'::jsonb)) g
where o.coll = 'orgs' and (g->>'amt') ~ '^-?[0-9.]+$';
grant select on public.v_grants to authenticated;

-- One row per impact figure.
create or replace view public.v_impact with (security_invoker = true) as
select o.doc_id as org_id, i->>'metric' as metric, i->>'fy' as financial_year, coalesce(i->>'kind', 'annual') as kind,
       (i->>'value')::numeric as value, i->>'method' as method, i->>'verified' as verification, i->>'src' as source
from public.docs o, jsonb_array_elements(coalesce(o.data->'impact', '[]'::jsonb)) i
where o.coll = 'orgs' and (i->>'value') ~ '^-?[0-9.]+$';
grant select on public.v_impact to authenticated;
