-- ============================================================
-- BaitersTracker · 01 · Ventana de votación
--
-- Regla: la votación de un partido abre UNA HORA después de su
-- inicio programado (`matches.kickoff_at`). Antes de eso nadie
-- puede votar, ni siquiera llamando a la API a mano: la regla
-- vive en `cast_vote`.
--
-- Los equipos NO dependen de esta hora: se pueden poner antes,
-- durante o después del partido.
--
-- Las vistas se recrean en la 02 (dependen unas de otras y allí se
-- cuentan los tramos). Ejecutar 01 y después 02.
--
-- Idempotente: se puede ejecutar más de una vez sin daño.
-- Ejecutar en Supabase → SQL Editor (o `supabase db push`).
-- ============================================================

begin;

-- 1. Hora de inicio programada ------------------------------------
alter table public.matches
  add column if not exists kickoff_at timestamptz;

comment on column public.matches.kickoff_at is
  'Inicio programado del partido. La votación abre 1 hora después.';

-- Partidos antiguos sin hora: se les pone 21:00 (hora del grupo).
update public.matches
   set kickoff_at = ((played_on::timestamp + interval '21 hours') at time zone 'Europe/Madrid')
 where kickoff_at is null
   and played_on is not null;

-- 2. Utilidades privadas ------------------------------------------
create or replace function private.vote_opens_at(p_match uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select m.kickoff_at + interval '1 hour'
    from public.matches m
   where m.id = p_match
$$;

create or replace function private.votes_are_open(p_match uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
           (select now() >= m.kickoff_at + interval '1 hour'
              from public.matches m
             where m.id = p_match
               and m.status = 'open'),
           false
         )
$$;

comment on function private.votes_are_open(uuid) is
  'true si el partido está abierto y ya pasó una hora desde el inicio programado.';

revoke all on function private.vote_opens_at(uuid) from public;
revoke all on function private.votes_are_open(uuid) from public;

-- 3. cast_vote: la puerta de la votación --------------------------
-- Se conserva la firma que había en producción: (text, uuid, uuid, integer).
-- Se borran variantes antiguas para no dejar una puerta abierta.
drop function if exists public.cast_vote(text, uuid, uuid, smallint);
drop function if exists public.cast_vote(text, uuid, uuid, integer);

create or replace function public.cast_vote(
  p_token text,
  p_match uuid,
  p_target uuid,
  p_score integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_voter uuid;
  v_opens timestamptz;
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

  -- Una hora después del inicio programado, ni un minuto antes.
  v_opens := private.vote_opens_at(p_match);
  if v_opens is not null and now() < v_opens then
    raise exception 'La votación abre una hora después del inicio: %',
      to_char(v_opens at time zone 'Europe/Madrid', 'DD/MM a las HH24:MI');
  end if;

  if not exists (
    select 1 from public.appearances a
     where a.match_id = p_match and a.player_id = v_voter
  ) then
    raise exception 'Solo votan quienes jugaron este partido';
  end if;

  if not exists (
    select 1 from public.appearances a
     where a.match_id = p_match and a.player_id = p_target
  ) then
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

revoke all on function public.cast_vote(text, uuid, uuid, integer) from public, anon;
grant execute on function public.cast_vote(text, uuid, uuid, integer) to authenticated;

-- 4. Crear partido con hora ---------------------------------------
-- `p_kickoff` es opcional: si no llega, se usa la fecha a las 21:00.
drop function if exists public.admin_create_match(text, date);

create or replace function public.admin_create_match(
  p_pw text,
  p_date date,
  p_kickoff timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_kickoff timestamptz;
begin
  perform private.assert_admin(p_pw);

  if p_date is null then
    raise exception 'Falta el día del partido';
  end if;

  v_kickoff := coalesce(
    p_kickoff,
    (p_date::timestamp + interval '21 hours') at time zone 'Europe/Madrid'
  );

  insert into public.matches (played_on, status, kickoff_at)
  values (p_date, 'open', v_kickoff)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.admin_create_match(text, date, timestamptz) from public, anon;
grant execute on function public.admin_create_match(text, date, timestamptz) to authenticated;

-- 5. Cambiar el día y la hora -------------------------------------
-- Se conserva la firma antigua de `admin_set_match_date`; al mover el
-- día se mantiene la hora que ya tuviera el partido.
create or replace function public.admin_set_match_date(
  p_pw text,
  p_match uuid,
  p_date date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_time time;
begin
  perform private.assert_admin(p_pw);

  if p_date is null then
    raise exception 'Falta el día del partido';
  end if;

  select (m.kickoff_at at time zone 'Europe/Madrid')::time
    into v_time
    from public.matches m
   where m.id = p_match;

  update public.matches
     set played_on = p_date,
         kickoff_at = ((p_date::timestamp + coalesce(v_time, time '21:00')) at time zone 'Europe/Madrid')
   where id = p_match;
end;
$$;

-- Corregir día y hora de golpe.
drop function if exists public.admin_set_match_kickoff(text, uuid, timestamptz);

create or replace function public.admin_set_match_kickoff(
  p_pw text,
  p_match uuid,
  p_kickoff timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_admin(p_pw);

  if p_kickoff is null then
    raise exception 'Falta la hora de inicio';
  end if;

  update public.matches
     set kickoff_at = p_kickoff,
         played_on = (p_kickoff at time zone 'Europe/Madrid')::date
   where id = p_match;
end;
$$;

revoke all on function public.admin_set_match_kickoff(text, uuid, timestamptz) from public, anon;
grant execute on function public.admin_set_match_kickoff(text, uuid, timestamptz) to authenticated;

-- 6. Comprobación -------------------------------------------------
do $$
declare
  v_ok boolean;
begin
  select exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'matches' and column_name = 'kickoff_at'
  ) into v_ok;

  if not v_ok then
    raise exception 'No se pudo crear matches.kickoff_at';
  end if;

  raise notice 'Ventana de votación lista: la votación abre 1 h después de kickoff_at.';
end $$;

commit;
