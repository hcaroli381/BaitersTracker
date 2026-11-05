-- ============================================================
-- BaitersTracker · 02 · ¿Hubo cambio de equipo? (tramos)
--
-- Cuando los equipos están desequilibrados hay que rebalancear a
-- mitad de partido. Al marcar «hubo cambio de equipo» el partido se
-- divide en TRAMOS y cada tramo tiene sus propios equipos:
--
--   appearances (match_id, player_id, segment, team, goals)
--
-- Los goles se guardan en el tramo en que se marcaron, así que el
-- marcador A/B sigue siendo la suma de todos los tramos y un jugador
-- que cambió de equipo reparte sus goles al lado correcto.
--
-- Los equipos se pueden tocar siempre: antes, durante y después del
-- partido, y también con el partido cerrado.
--
-- Idempotente. Ejecutar DESPUÉS de la migración 01.
-- ============================================================

begin;

-- 0. Claves foráneas de votos hacia la alineación ------------------
-- En producción `votes` apunta a `appearances(match_id, player_id)` con
-- ON DELETE CASCADE. Al añadir el tramo a la clave primaria esas claves
-- tienen que caer: Postgres no deja cambiar la PK con ellas colgando.
-- La integridad no se pierde: `cast_vote` valida que votante y objetivo
-- hayan jugado, y además sacar a alguien del tramo 2 no debe borrar sus
-- votos del tramo 1 (que es lo que haría el cascade).
do $$
declare
  r record;
begin
  for r in
    select conname
      from pg_constraint
     where conrelid = 'public.votes'::regclass
       and contype = 'f'
       and confrelid = 'public.appearances'::regclass
  loop
    execute format('alter table public.votes drop constraint %I', r.conname);
  end loop;
end $$;

-- Y se recupera la integridad por donde sí se puede: votante, objetivo y partido
-- siguen apuntando a `players` y `matches`, con el mismo borrado en cascada.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.votes'::regclass and conname = 'votes_voter_id_fkey') then
    alter table public.votes add constraint votes_voter_id_fkey
      foreign key (voter_id) references public.players(id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conrelid = 'public.votes'::regclass and conname = 'votes_target_id_fkey') then
    alter table public.votes add constraint votes_target_id_fkey
      foreign key (target_id) references public.players(id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conrelid = 'public.votes'::regclass and conname = 'votes_match_id_fkey') then
    alter table public.votes add constraint votes_match_id_fkey
      foreign key (match_id) references public.matches(id) on delete cascade;
  end if;
end $$;

-- 1. Columna de tramo y clave -------------------------------------
alter table public.appearances
  add column if not exists segment integer not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.appearances'::regclass
       and conname = 'appearances_segment_ck'
  ) then
    alter table public.appearances
      add constraint appearances_segment_ck check (segment between 1 and 9);
  end if;

  -- La clave primaria pasa a incluir el tramo (un jugador puede repetir).
  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.appearances'::regclass
       and conname = 'appearances_pkey'
  ) then
    if not exists (
      select 1 from pg_constraint
       where conrelid = 'public.appearances'::regclass
         and conname = 'appearances_pkey'
         and pg_get_constraintdef(oid) like '%segment%'
    ) then
      alter table public.appearances drop constraint appearances_pkey;
      alter table public.appearances
        add constraint appearances_pkey primary key (match_id, player_id, segment);
    end if;
  else
    alter table public.appearances
      add constraint appearances_pkey primary key (match_id, player_id, segment);
  end if;
end $$;

create index if not exists appearances_match_segment_idx
  on public.appearances (match_id, segment);

comment on column public.appearances.segment is
  'Tramo del partido (1 = sin cambios de equipo). Cada tramo tiene sus equipos.';

-- 2. Vistas ------------------------------------------------------
-- Orden obligatorio: `player_stats` y `mvp_matches` dependen de `player_match`.
-- También se rehace `match_summary` para que cuente los tramos.
-- De hijos a padres: `player_stats` depende de `mvp_matches` y de `player_match`,
-- y `player_match` depende de `match_summary`. En ese orden exacto.
drop view if exists public.player_stats;
drop view if exists public.mvp_matches;
drop view if exists public.player_match;
drop view if exists public.match_summary;

create view public.match_summary as
select m.id,
       m.played_on,
       m.status,
       m.created_at,
       m.kickoff_at,
       (m.kickoff_at + interval '1 hour') as votes_open_at,
       coalesce(sum(a.goals) filter (where a.team = 'A'), 0)::int as goals_a,
       coalesce(sum(a.goals) filter (where a.team = 'B'), 0)::int as goals_b,
       coalesce(max(a.segment), 1) as segments,
       (select count(*) from public.votes v where v.match_id = m.id)::int as votes_count
  from public.matches m
  left join public.appearances a on a.match_id = m.id
 group by m.id;

create view public.player_match as
with per_player as (
  select a.match_id,
         a.player_id,
         coalesce(sum(a.goals), 0)::int as goals,
         array_agg(distinct a.team order by a.team) as teams,
         count(*)::int as stints
    from public.appearances a
   group by a.match_id, a.player_id
),
team_goals as (
  select a.match_id,
         a.team,
         coalesce(sum(a.goals), 0)::int as gf
    from public.appearances a
   group by a.match_id, a.team
)
select pm.match_id,
       pm.player_id,
       -- 'A', 'B' o 'AB' si cambió de equipo
       case when array_length(pm.teams, 1) = 1 then pm.teams[1] else 'AB' end as team,
       pm.goals,
       m.status,
       -- A favor / en contra. Si cambió de equipo, no hay un resultado único:
       -- se deja null y la interfaz lo explica en vez de inventarse un marcador.
       case
         when array_length(pm.teams, 1) = 1 then
           coalesce((select tg.gf from team_goals tg
                      where tg.match_id = pm.match_id and tg.team = pm.teams[1]), 0)
         else null
       end::int as gf,
       case
         when array_length(pm.teams, 1) = 1 then
           coalesce((select sum(tg.gf) from team_goals tg
                      where tg.match_id = pm.match_id and tg.team <> pm.teams[1]), 0)
         else null
       end::int as ga,
       (select round(avg(v.score)::numeric, 2) from public.votes v
         where v.match_id = pm.match_id and v.target_id = pm.player_id) as avg_score,
       (select count(*) from public.votes v
         where v.match_id = pm.match_id and v.target_id = pm.player_id)::int as votes,
       pm.teams,
       pm.stints
  from per_player pm
  join public.matches m on m.id = pm.match_id;

create view public.mvp_matches as
select distinct on (pm.match_id)
       pm.match_id,
       pm.player_id,
       p.name,
       pm.avg_score
  from public.player_match pm
  join public.players p on p.id = pm.player_id
 where pm.status = 'closed'
   and pm.avg_score is not null
 order by pm.match_id, pm.avg_score desc, pm.player_id;

create view public.player_stats as
with agg as (
  select pm.player_id,
         count(distinct pm.match_id)::int as played,
         count(distinct pm.match_id) filter (
           where pm.status = 'closed' and pm.gf > pm.ga
         )::int as wins,
         count(distinct pm.match_id) filter (
           where pm.status = 'closed' and pm.gf = pm.ga
         )::int as draws,
         count(distinct pm.match_id) filter (
           where pm.status = 'closed' and pm.gf < pm.ga
         )::int as losses,
         coalesce(sum(pm.goals), 0)::int as goals,
         avg(pm.avg_score) as rating,
         avg(pm.ga) as conceded
    from public.player_match pm
   group by pm.player_id
)
select p.id,
       p.name,
       p.can_vote,
       p.active,
       p.shirt_number,
       coalesce(agg.played, 0)::int as played,
       coalesce(agg.wins, 0)::int as wins,
       coalesce(agg.draws, 0)::int as draws,
       coalesce(agg.losses, 0)::int as losses,
       coalesce(agg.goals, 0)::int as goals,
       -- El MVP se calcula aquí dentro a propósito: así `player_stats` no depende
       -- de `mvp_matches` y esta migración se puede reaplicar sin cascada.
       (select count(*)::int
          from (select distinct on (pm.match_id) pm.match_id, pm.player_id
                  from public.player_match pm
                 where pm.status = 'closed'
                   and pm.avg_score is not null
                 order by pm.match_id, pm.avg_score desc, pm.player_id) m
         where m.player_id = p.id) as mvps,
       round(agg.rating, 2) as avg_rating,
       round(agg.conceded, 2) as conceded_pm
  from public.players p
  left join agg on agg.player_id = p.id;

alter view public.match_summary set (security_invoker = true);
alter view public.player_match set (security_invoker = true);
alter view public.mvp_matches set (security_invoker = true);
alter view public.player_stats set (security_invoker = true);

revoke all on public.match_summary from anon;
revoke all on public.player_match from anon;
revoke all on public.mvp_matches from anon;
revoke all on public.player_stats from anon;

grant select on public.match_summary to authenticated;
grant select on public.player_match to authenticated;
grant select on public.mvp_matches to authenticated;
grant select on public.player_stats to authenticated;

-- 3. Alineación por tramo ----------------------------------------
-- `p_segment` es opcional (1 por defecto) para no romper llamadas viejas.
-- `p_team = null` sigue sacando al jugador de la alineación de ese tramo.
drop function if exists public.admin_set_lineup(text, uuid, uuid, text);

create or replace function public.admin_set_lineup(
  p_pw text,
  p_match uuid,
  p_player uuid,
  p_team text,
  p_segment integer default 1
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_segment integer := coalesce(p_segment, 1);
begin
  perform private.assert_admin(p_pw);

  if v_segment < 1 or v_segment > 9 then
    raise exception 'Tramo no válido (del 1 al 9)';
  end if;

  if not exists (select 1 from public.matches m where m.id = p_match) then
    raise exception 'Ese partido no existe';
  end if;

  if p_team is null then
    delete from public.appearances
     where match_id = p_match and player_id = p_player and segment = v_segment;
    return;
  end if;

  if p_team not in ('A', 'B') then
    raise exception 'Equipo no válido: usa A (Oscuros) o B (Claros)';
  end if;

  insert into public.appearances (match_id, player_id, segment, team, goals)
  values (p_match, p_player, v_segment, p_team, 0)
  on conflict (match_id, player_id, segment)
  do update set team = excluded.team;
end;
$$;

revoke all on function public.admin_set_lineup(text, uuid, uuid, text, integer) from public, anon;
grant execute on function public.admin_set_lineup(text, uuid, uuid, text, integer) to authenticated;

-- 4. Goles por tramo ---------------------------------------------
drop function if exists public.admin_set_goals(text, uuid, uuid, integer);

create or replace function public.admin_set_goals(
  p_pw text,
  p_match uuid,
  p_player uuid,
  p_goals integer,
  p_segment integer default 1
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_segment integer := coalesce(p_segment, 1);
begin
  perform private.assert_admin(p_pw);

  update public.appearances
     set goals = greatest(0, coalesce(p_goals, 0))
   where match_id = p_match
     and player_id = p_player
     and segment = v_segment;

  if not found then
    raise exception 'Asigna equipo antes de poner goles';
  end if;
end;
$$;

revoke all on function public.admin_set_goals(text, uuid, uuid, integer, integer) from public, anon;
grant execute on function public.admin_set_goals(text, uuid, uuid, integer, integer) to authenticated;

-- 5. «¿Hubo cambio de equipo?» -----------------------------------
-- Abre un tramo nuevo copiando los equipos del último tramo como punto
-- de partida (para rebalancear solo los que hagan falta). Los goles del
-- tramo nuevo empiezan a cero.
drop function if exists public.admin_split_match(text, uuid);

create or replace function public.admin_split_match(
  p_pw text,
  p_match uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last integer;
  v_next integer;
begin
  perform private.assert_admin(p_pw);

  select coalesce(max(a.segment), 0) into v_last
    from public.appearances a
   where a.match_id = p_match;

  if v_last = 0 then
    raise exception 'Primero asigna la alineación: no hay equipos que cambiar';
  end if;

  v_next := v_last + 1;
  if v_next > 9 then
    raise exception 'Este partido ya tiene el máximo de tramos';
  end if;

  insert into public.appearances (match_id, player_id, segment, team, goals)
  select a.match_id, a.player_id, v_next, a.team, 0
    from public.appearances a
   where a.match_id = p_match and a.segment = v_last
  on conflict (match_id, player_id, segment) do nothing;

  return v_next;
end;
$$;

revoke all on function public.admin_split_match(text, uuid) from public, anon;
grant execute on function public.admin_split_match(text, uuid) to authenticated;

-- Deshacer el último cambio de equipo (útil si se marca por error).
drop function if exists public.admin_remove_segment(text, uuid, integer);

create or replace function public.admin_remove_segment(
  p_pw text,
  p_match uuid,
  p_segment integer default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last integer;
  v_segment integer;
begin
  perform private.assert_admin(p_pw);

  select coalesce(max(a.segment), 1) into v_last
    from public.appearances a
   where a.match_id = p_match;

  v_segment := coalesce(p_segment, v_last);

  if v_last <= 1 then
    raise exception 'Este partido no tiene cambios de equipo';
  end if;

  if v_segment <> v_last then
    raise exception 'Solo se puede deshacer el último tramo';
  end if;

  delete from public.appearances
   where match_id = p_match and segment = v_segment;
end;
$$;

revoke all on function public.admin_remove_segment(text, uuid, integer) from public, anon;
grant execute on function public.admin_remove_segment(text, uuid, integer) to authenticated;

commit;
