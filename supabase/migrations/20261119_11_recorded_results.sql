begin;

alter table public.matches
  add column if not exists result_recorded boolean not null default false;

-- Los resultados históricos cerrados y los marcadores con goles ya introducidos
-- se conservan. Un 0–0 nuevo cuenta cuando el admin guarda los goles.
update public.matches m
   set result_recorded = true
 where not m.result_recorded
   and (m.status = 'closed' or exists (
     select 1 from public.appearances a where a.match_id = m.id and a.goals > 0
   ));

create or replace view public.match_summary with (security_invoker = true) as
select m.id,
       m.played_on,
       m.status,
       m.created_at,
       m.kickoff_at,
       (m.kickoff_at + interval '1 hour') as votes_open_at,
       coalesce(sum(a.goals) filter (where a.team = 'A'), 0)::int as goals_a,
       coalesce(sum(a.goals) filter (where a.team = 'B'), 0)::int as goals_b,
       coalesce(max(a.segment), 1) as segments,
       (select count(*) from public.votes v where v.match_id = m.id)::int as votes_count,
       m.result_recorded
  from public.matches m
  left join public.appearances a on a.match_id = m.id
 group by m.id;

create or replace view public.player_stats with (security_invoker = true) as
with agg as (
  select pm.player_id,
         count(*) filter (where m.result_recorded)::int as played,
         coalesce(sum(pm.wins) filter (where m.result_recorded and pm.status = 'closed'), 0)::int as wins,
         coalesce(sum(pm.draws) filter (where m.result_recorded and pm.status = 'closed'), 0)::int as draws,
         coalesce(sum(pm.losses) filter (where m.result_recorded and pm.status = 'closed'), 0)::int as losses,
         coalesce(sum(pm.goals) filter (where m.result_recorded), 0)::int as goals,
         avg(pm.avg_score) as rating,
         avg(pm.conceded) filter (where m.result_recorded) as conceded
    from public.player_match pm
    join public.matches m on m.id = pm.match_id
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

  if now() < private.vote_opens_at(p_match) then
    raise exception 'Podrás guardar goles una hora después del inicio del partido';
  end if;

  update public.appearances
     set goals = greatest(0, coalesce(p_goals, 0))
   where match_id = p_match
     and player_id = p_player
     and segment = v_segment;

  if not found then
    raise exception 'Asigna equipo antes de poner goles';
  end if;

  update public.matches
     set result_recorded = true
   where id = p_match and not result_recorded;
end;
$$;

commit;
