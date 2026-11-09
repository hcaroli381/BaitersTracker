-- ============================================================
-- BaitersTracker · 08 · Resultado por tramo
--
-- Un partido con cambios de equipo tiene varias PARTES. Cada parte
-- tiene su propio marcador y cuenta como UN resultado (victoria,
-- empate o derrota) para quien jugó esa parte. La nota y el MVP
-- siguen siendo del partido: hay una sola nota por jugador y un
-- único MVP, aunque el partido se divida.
--
-- `player_match` añade:
--   wins, draws, losses  → resultados del jugador sumando sus tramos
--   conceded             → media de goles encajados por tramo
--   segment_results      → [{segment, team, gf, ga, outcome}]
--
-- `player_stats` suma esos resultados por tramo. `played` sigue
-- contando partidos distintos: un partido es un partido.
--
-- Idempotente. Ejecutar DESPUÉS de la migración 07.
-- ============================================================

begin;

drop view if exists public.player_stats;
drop view if exists public.player_match;

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
         a.segment,
         a.team,
         coalesce(sum(a.goals), 0)::int as gf
    from public.appearances a
   group by a.match_id, a.segment, a.team
),
segment_totals as (
  select a.match_id,
         a.segment,
         coalesce(sum(a.goals), 0)::int as total
    from public.appearances a
   group by a.match_id, a.segment
),
-- Marcador de cada jugador en cada tramo que jugó.
stints as (
  select a.match_id,
         a.player_id,
         a.segment,
         a.team,
         coalesce(tg.gf, 0)::int as gf,
         greatest(coalesce(st.total, 0) - coalesce(tg.gf, 0), 0)::int as ga
    from public.appearances a
    left join team_goals tg
      on tg.match_id = a.match_id
     and tg.segment = a.segment
     and tg.team = a.team
    left join segment_totals st
      on st.match_id = a.match_id
     and st.segment = a.segment
),
per_match as (
  select s.match_id,
         s.player_id,
         count(*) filter (where s.gf > s.ga)::int as wins,
         count(*) filter (where s.gf = s.ga)::int as draws,
         count(*) filter (where s.gf < s.ga)::int as losses,
         avg(s.ga) as conceded,
         jsonb_agg(
           jsonb_build_object(
             'segment', s.segment,
             'team', s.team,
             'gf', s.gf,
             'ga', s.ga,
             'outcome', case
                          when s.gf > s.ga then 'V'
                          when s.gf = s.ga then 'E'
                          else 'D'
                        end
           )
           order by s.segment
         ) as segment_results
    from stints s
   group by s.match_id, s.player_id
)
select pm.match_id,
       pm.player_id,
       -- 'A', 'B' o 'AB' si cambió de equipo
       case when array_length(pm.teams, 1) = 1 then pm.teams[1] else 'AB' end as team,
       pm.goals,
       m.status,
       -- A favor / en contra del partido entero. Si cambió de equipo no hay
       -- un resultado único: el detalle va en `segment_results`.
       case
         when array_length(pm.teams, 1) = 1 then
           coalesce((select sum(s.gf) from stints s
                      where s.match_id = pm.match_id and s.player_id = pm.player_id), 0)
         else null
       end::int as gf,
       case
         when array_length(pm.teams, 1) = 1 then
           coalesce((select sum(s.ga) from stints s
                      where s.match_id = pm.match_id and s.player_id = pm.player_id), 0)
         else null
       end::int as ga,
       (select round(avg(v.score)::numeric, 2) from public.votes v
         where v.match_id = pm.match_id and v.target_id = pm.player_id) as avg_score,
       (select count(*) from public.votes v
         where v.match_id = pm.match_id and v.target_id = pm.player_id)::int as votes,
       pm.teams,
       pm.stints,
       -- Resultado por tramo: victoria, empate o derrota en cada parte.
       coalesce(pm2.wins, 0)::int as wins,
       coalesce(pm2.draws, 0)::int as draws,
       coalesce(pm2.losses, 0)::int as losses,
       pm2.conceded,
       coalesce(pm2.segment_results, '[]'::jsonb) as segment_results
  from per_player pm
  join public.matches m on m.id = pm.match_id
  left join per_match pm2
    on pm2.match_id = pm.match_id
   and pm2.player_id = pm.player_id;

create view public.player_stats as
with agg as (
  select pm.player_id,
         count(distinct pm.match_id)::int as played,
         coalesce(sum(pm.wins) filter (where pm.status = 'closed'), 0)::int as wins,
         coalesce(sum(pm.draws) filter (where pm.status = 'closed'), 0)::int as draws,
         coalesce(sum(pm.losses) filter (where pm.status = 'closed'), 0)::int as losses,
         coalesce(sum(pm.goals), 0)::int as goals,
         avg(pm.avg_score) as rating,
         avg(pm.conceded) as conceded
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
       -- El MVP es uno por partido y sigue saliendo de `match_mvp` (desempate incluido).
       (select count(*)::int from public.match_mvp mm where mm.mvp_player_id = p.id) as mvps,
       round(agg.rating, 2) as avg_rating,
       round(agg.conceded, 2) as conceded_pm
  from public.players p
  left join agg on agg.player_id = p.id;

comment on column public.player_match.segment_results is
  'Marcador y resultado (V/E/D) de cada tramo que jugó el jugador.';

alter view public.player_match set (security_invoker = true);
alter view public.player_stats set (security_invoker = true);

revoke all on public.player_match from anon;
revoke all on public.player_stats from anon;
grant select on public.player_match to authenticated;
grant select on public.player_stats to authenticated;

commit;
