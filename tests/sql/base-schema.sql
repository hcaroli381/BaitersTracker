-- ============================================================
-- Reconstrucción del esquema de producción SOLO para pruebas locales.
--
-- No es la fuente de verdad: se ha reconstruido a partir de
-- HANDOFF.md §4 (tablas, vistas, RPCs y columnas documentadas).
-- En producción este archivo NO se ejecuta nunca: allí ya existe.
-- Se usa en `tests/db.test.mjs` con PGlite para probar que las
-- migraciones de `supabase/migrations/` hacen lo que dicen.
-- ============================================================

-- Roles de Supabase (para los GRANT de las migraciones).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

create schema if not exists private;

-- 1. Tablas -------------------------------------------------------
create table public.players (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  shirt_number integer unique check (shirt_number between 1 and 99),
  device_hash text unique,
  claimed boolean generated always as (device_hash is not null) stored,
  active boolean not null default true,
  can_vote boolean not null default true,
  avatar_path text,
  created_at timestamptz not null default now()
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  played_on date not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now()
);

create table public.appearances (
  match_id uuid not null references public.matches (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  team text check (team in ('A', 'B')),
  goals integer not null default 0 check (goals >= 0),
  primary key (match_id, player_id)
);

create table public.votes (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  voter_id uuid not null references public.players (id) on delete cascade,
  target_id uuid not null references public.players (id) on delete cascade,
  score smallint not null check (score between 1 and 10),
  created_at timestamptz not null default now(),
  unique (match_id, voter_id, target_id)
);

create table public.settings (
  id integer primary key default 1 check (id = 1),
  allow_self_vote boolean not null default false
);

insert into public.settings (id, allow_self_vote) values (1, false)
on conflict (id) do nothing;

create table private.admin (
  id integer primary key default 1,
  pw_hash text not null
);

-- En producción es bcrypt con pgcrypto; aquí basta para distinguir.
create or replace function private.assert_admin(p_pw text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from private.admin a where a.pw_hash = 'plain:' || coalesce(p_pw, '')
  ) then
    raise exception 'Contraseña de admin incorrecta';
  end if;
end;
$$;

-- 2. Identidad del dispositivo ------------------------------------
create or replace function public.me(p_token text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id from public.players p where p.device_hash = md5(p_token) limit 1
$$;

create or replace function public.claim_player(p_token text, p_player uuid, p_number integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.players p where p.shirt_number = p_number and p.id <> p_player) then
    raise exception 'Ese dorsal lo acaba de coger otro';
  end if;

  -- `claimed` es generada (device_hash is not null): no se toca.
  update public.players
     set device_hash = md5(p_token),
         shirt_number = coalesce(p_number, shirt_number)
   where id = p_player;
end;
$$;

-- 3. cast_vote (versión ANTIGUA, sin ventana de votación) ----------
-- La migración 01 la sustituye. Sirve para comprobar que el reemplazo
-- conserva el resto de reglas.
create or replace function public.cast_vote(
  p_token text,
  p_match uuid,
  p_target uuid,
  p_score smallint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_voter uuid;
begin
  if p_score is null or p_score < 1 or p_score > 10 then
    raise exception 'La nota va del 1 al 10';
  end if;

  v_voter := public.me(p_token);
  if v_voter is null then
    raise exception 'Elige quién eres para poder votar';
  end if;

  if not exists (select 1 from public.players p where p.id = v_voter and p.can_vote) then
    raise exception 'Los comodines no votan, solo juegan';
  end if;

  if not exists (select 1 from public.matches m where m.id = p_match and m.status = 'open') then
    raise exception 'La votación de este partido está cerrada';
  end if;

  if not exists (select 1 from public.appearances a where a.match_id = p_match and a.player_id = v_voter) then
    raise exception 'Solo votan quienes jugaron este partido';
  end if;

  if not exists (select 1 from public.appearances a where a.match_id = p_match and a.player_id = p_target) then
    raise exception 'Ese jugador no jugó este partido';
  end if;

  if v_voter = p_target
     and not coalesce((select s.allow_self_vote from public.settings s where s.id = 1), false) then
    raise exception 'No puedes votarte a ti mismo';
  end if;

  if exists (
    select 1 from public.votes v
     where v.match_id = p_match and v.voter_id = v_voter and v.target_id = p_target
  ) then
    raise exception 'Ya has votado a este jugador';
  end if;

  insert into public.votes (match_id, voter_id, target_id, score)
  values (p_match, v_voter, p_target, p_score);
end;
$$;

-- 4. Admin (versiones antiguas) -----------------------------------
create or replace function public.admin_create_match(p_pw text, p_date date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.assert_admin(p_pw);
  insert into public.matches (played_on, status) values (p_date, 'open') returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.admin_set_match_date(p_pw text, p_match uuid, p_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_admin(p_pw);
  update public.matches set played_on = p_date where id = p_match;
end;
$$;

create or replace function public.admin_set_match_status(p_pw text, p_match uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_admin(p_pw);
  update public.matches set status = p_status where id = p_match;
end;
$$;

create or replace function public.admin_set_lineup(p_pw text, p_match uuid, p_player uuid, p_team text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_admin(p_pw);
  if p_team is null then
    delete from public.appearances where match_id = p_match and player_id = p_player;
  elsif p_team in ('A', 'B') then
    insert into public.appearances (match_id, player_id, team, goals)
    values (p_match, p_player, p_team, 0)
    on conflict (match_id, player_id) do update set team = excluded.team;
  else
    raise exception 'Equipo no válido: usa A o B';
  end if;
end;
$$;

create or replace function public.admin_set_goals(p_pw text, p_match uuid, p_player uuid, p_goals integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_admin(p_pw);
  update public.appearances set goals = greatest(0, coalesce(p_goals, 0))
   where match_id = p_match and player_id = p_player;
  if not found then
    raise exception 'Asigna equipo antes de poner goles';
  end if;
end;
$$;

create or replace function public.admin_delete_match(p_pw text, p_match uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_admin(p_pw);
  delete from public.matches where id = p_match;
end;
$$;

create or replace function public.admin_set_allow_self_vote(p_pw text, p_value boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_admin(p_pw);
  update public.settings set allow_self_vote = coalesce(p_value, false) where id = 1;
end;
$$;

-- 5. Vistas (versiones antiguas de HANDOFF §4.2) ------------------
create view public.match_summary as
select m.id,
       m.played_on,
       m.status,
       m.created_at,
       coalesce(sum(a.goals) filter (where a.team = 'A'), 0)::int as goals_a,
       coalesce(sum(a.goals) filter (where a.team = 'B'), 0)::int as goals_b
  from public.matches m
  left join public.appearances a on a.match_id = m.id
 group by m.id;

create view public.player_match as
select a.match_id,
       a.player_id,
       a.team,
       a.goals,
       m.status,
       coalesce((select sum(x.goals) from public.appearances x
                  where x.match_id = a.match_id and x.team = a.team), 0)::int as gf,
       coalesce((select sum(x.goals) from public.appearances x
                  where x.match_id = a.match_id and x.team <> a.team), 0)::int as ga,
       (select round(avg(v.score)::numeric, 2) from public.votes v
         where v.match_id = a.match_id and v.target_id = a.player_id) as avg_score,
       (select count(*) from public.votes v
         where v.match_id = a.match_id and v.target_id = a.player_id)::int as votes
  from public.appearances a
  join public.matches m on m.id = a.match_id;

create view public.player_stats as
select p.id,
       p.name,
       p.can_vote,
       p.active,
       p.shirt_number,
       count(pm.match_id)::int as played,
       count(pm.match_id) filter (where pm.status = 'closed' and pm.gf > pm.ga)::int as wins,
       count(pm.match_id) filter (where pm.status = 'closed' and pm.gf = pm.ga)::int as draws,
       count(pm.match_id) filter (where pm.status = 'closed' and pm.gf < pm.ga)::int as losses,
       coalesce(sum(pm.goals), 0)::int as goals,
       0::int as mvps,
       round(avg(pm.avg_score), 2) as avg_rating,
       round(avg(pm.ga), 2) as conceded_pm
  from public.players p
  left join public.player_match pm on pm.player_id = p.id
 group by p.id;

create view public.mvp_matches as
select null::uuid as match_id, null::uuid as player_id, null::text as name, null::numeric as avg_score
 where false;
