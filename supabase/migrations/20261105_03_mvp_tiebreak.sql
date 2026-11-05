-- ============================================================
-- BaitersTracker · 03 · Desempate del MVP
--
-- Regla: el MVP de un partido cerrado es la mejor nota media.
-- Si dos o más jugadores acaban con la MISMA nota (dos decimales),
-- el MVP lo decide una votación de desempate entre ellos.
--
-- Quién vota el desempate:
--   · solo jugadores con `can_vote` (los comodines NO votan);
--   · y que hayan jugado ese partido (misma regla que las notas);
--   · sin autovoto salvo que `settings.allow_self_vote` esté activo.
-- La regla vive aquí, en `cast_mvp_tie_vote`: la interfaz solo la explica.
--
-- Cada voto se guarda con la «clave» del empate (los ids de los
-- empatados ordenados). Si después se corrige una nota y el empate
-- cambia, los votos viejos dejan de contar: nadie puede decidir el
-- MVP de un empate que ya no existe.
--
-- Gana el empatado que consigue la mayoría absoluta de los jugadores
-- del partido con voto (más de la mitad). Así nadie decide el MVP con
-- el primer voto, y no se queda esperando a quien nunca vota: si
-- queda 1-1 o 2-2 el desempate sigue abierto y no hay MVP todavía.
--
-- Idempotente. Ejecutar DESPUÉS de la migración 02.
-- ============================================================

begin;

-- 1. Votos del desempate ------------------------------------------
-- Una fila por votante y empate: el voto no se puede cambiar.
create table if not exists public.mvp_tie_votes (
  match_id uuid not null references public.matches (id) on delete cascade,
  voter_id uuid not null references public.players (id) on delete cascade,
  target_id uuid not null references public.players (id) on delete cascade,
  candidate_key text not null,
  created_at timestamptz not null default now(),
  primary key (match_id, voter_id, candidate_key)
);

create index if not exists mvp_tie_votes_match_idx
  on public.mvp_tie_votes (match_id);

comment on table public.mvp_tie_votes is
  'Votos del desempate del MVP. Solo cuentan los de la clave del empate vigente.';

alter table public.mvp_tie_votes enable row level security;

drop policy if exists mvp_tie_votes_read on public.mvp_tie_votes;
create policy mvp_tie_votes_read on public.mvp_tie_votes
  for select to authenticated
  using (true);

revoke all on public.mvp_tie_votes from anon;
grant select on public.mvp_tie_votes to authenticated;

-- 2. Vista del MVP de cada partido cerrado -------------------------
-- `tie` = hay empate en la nota; `resolved` = ya hay MVP.
-- `candidate_key` identifica el empate concreto; `mvp_tie_votes`
-- son los votos que han decidido el desempate.
drop view if exists public.mvp_matches;

create or replace view public.match_mvp as
with notes as (
  select v.match_id,
         v.target_id,
         round(avg(v.score)::numeric, 2) as avg_score
    from public.votes v
   group by v.match_id, v.target_id
),
tied as (
  select n.match_id, n.target_id, n.avg_score
    from notes n
   where n.avg_score = (select max(x.avg_score) from notes x where x.match_id = n.match_id)
),
candidates as (
  select t.match_id,
         count(*)::int as candidates,
         min(t.avg_score) as avg_score,
         string_agg(t.target_id::text, ',' order by t.target_id) as candidate_key
    from tied t
   group by t.match_id
),
tally as (
  select v.match_id, v.target_id, count(*)::int as votes
    from public.mvp_tie_votes v
    join candidates c
      on c.match_id = v.match_id
     and c.candidate_key = v.candidate_key
   group by v.match_id, v.target_id
),
leaders as (
  select t.match_id, t.target_id, t.votes
    from tally t
   where t.votes = (select max(x.votes) from tally x where x.match_id = t.match_id)
),
-- Quiénes pueden votar el desempate: jugadores del partido con voto.
eligible as (
  select m.id as match_id, count(distinct a.player_id)::int as voters
    from public.matches m
    join public.appearances a on a.match_id = m.id
    join public.players p on p.id = a.player_id and p.can_vote
   group by m.id
),
decided as (
  select c.match_id,
         c.candidates,
         c.avg_score,
         c.candidate_key,
         coalesce(
           -- Sin empate, la mejor nota gana sola.
           case when c.candidates = 1
                then (select t.target_id from tied t where t.match_id = c.match_id)
           end,
           -- Con empate, gana quien tenga la mayoría absoluta de los que pueden
           -- votar. Con un solo voto (1-0) no se decide nada todavía.
           case when (select count(*) from leaders l where l.match_id = c.match_id) = 1
                 and (select l.votes from leaders l where l.match_id = c.match_id) * 2
                     > coalesce(e.voters, 0)
                then (select l.target_id from leaders l where l.match_id = c.match_id)
           end
         ) as mvp_player_id,
         case
           when c.candidates = 1 then 'notas'
           when (select count(*) from leaders l where l.match_id = c.match_id) = 1
                and (select l.votes from leaders l where l.match_id = c.match_id) * 2
                    > coalesce(e.voters, 0)
                then 'desempate'
         end as decided_by,
         coalesce(e.voters, 0) as eligible,
         coalesce((select sum(t.votes) from tally t where t.match_id = c.match_id), 0)::int as tie_votes
    from candidates c
    left join eligible e on e.match_id = c.match_id
)
select d.match_id,
       d.mvp_player_id,
       p.name as mvp_name,
       d.avg_score as mvp_avg,
       d.decided_by,
       (d.candidates > 1) as tie,
       (d.mvp_player_id is not null) as resolved,
       d.candidates,
       d.candidate_key,
       d.eligible,
       d.tie_votes,
       (select l.votes from leaders l
         where l.match_id = d.match_id
           and l.target_id = d.mvp_player_id) as mvp_tie_votes
  from decided d
  join public.matches m on m.id = d.match_id and m.status = 'closed'
  left join public.players p on p.id = d.mvp_player_id;

comment on view public.match_mvp is
  'MVP por partido cerrado: mejor media y, si hay empate, ganador de la votación de desempate por mayoría absoluta.';

-- `mvp_matches` mantiene su forma de siempre, pero ahora respeta el desempate.
create view public.mvp_matches as
select mm.match_id,
       mm.mvp_player_id as player_id,
       mm.mvp_name as name,
       mm.mvp_avg as avg_score
  from public.match_mvp mm
 where mm.mvp_player_id is not null;

alter view public.match_mvp set (security_invoker = true);
alter view public.mvp_matches set (security_invoker = true);

revoke all on public.match_mvp from anon;
revoke all on public.mvp_matches from anon;
grant select on public.match_mvp to authenticated;
grant select on public.mvp_matches to authenticated;

-- 3. `player_stats`: los MVP cuentan solo si están decididos --------
-- Antes el empate se rompía por orden de id y regalaba un MVP. Ahora
-- se cuenta el de `match_mvp`, que respeta la votación de desempate.
create or replace view public.player_stats as
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
       (select count(*)::int from public.match_mvp mm where mm.mvp_player_id = p.id) as mvps,
       round(agg.rating, 2) as avg_rating,
       round(agg.conceded, 2) as conceded_pm
  from public.players p
  left join agg on agg.player_id = p.id;

alter view public.player_stats set (security_invoker = true);
revoke all on public.player_stats from anon;
grant select on public.player_stats to authenticated;

-- 4. Votar el desempate -------------------------------------------
drop function if exists public.cast_mvp_tie_vote(text, uuid, uuid);

create or replace function public.cast_mvp_tie_vote(
  p_token text,
  p_match uuid,
  p_target uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_voter uuid;
  v_key text;
  v_candidates integer;
  v_resolved boolean;
begin
  v_voter := public.me(p_token);
  if v_voter is null then
    raise exception 'Elige quién eres para votar el desempate';
  end if;

  -- Los comodines juegan y reciben nota, pero no votan (ni el desempate).
  if not exists (select 1 from public.players p where p.id = v_voter and p.can_vote) then
    raise exception 'Los comodines no votan, solo juegan';
  end if;

  if not exists (
    select 1 from public.matches m where m.id = p_match and m.status = 'closed'
  ) then
    raise exception 'El desempate del MVP se vota con el partido cerrado';
  end if;

  -- Solo votan quienes jugaron ese partido.
  if not exists (
    select 1 from public.appearances a
     where a.match_id = p_match and a.player_id = v_voter
  ) then
    raise exception 'Solo votan quienes jugaron este partido';
  end if;

  select mm.candidate_key, mm.candidates, mm.resolved
    into v_key, v_candidates, v_resolved
    from public.match_mvp mm
   where mm.match_id = p_match;

  if v_key is null or coalesce(v_candidates, 0) < 2 then
    raise exception 'Este partido no tiene empate por el MVP';
  end if;

  if coalesce(v_resolved, false) then
    raise exception 'El desempate ya está decidido';
  end if;

  -- El objetivo tiene que ser uno de los empatados de este empate.
  if not (p_target::text = any (string_to_array(v_key, ','))) then
    raise exception 'Ese jugador no está en el desempate';
  end if;

  if v_voter = p_target
     and not coalesce((select s.allow_self_vote from public.settings s where s.id = 1), false) then
    raise exception 'No puedes votarte a ti mismo';
  end if;

  if exists (
    select 1 from public.mvp_tie_votes v
     where v.match_id = p_match
       and v.voter_id = v_voter
       and v.candidate_key = v_key
  ) then
    raise exception 'Ya has votado en el desempate';
  end if;

  insert into public.mvp_tie_votes (match_id, voter_id, target_id, candidate_key)
  values (p_match, v_voter, p_target, v_key);
end;
$$;

comment on function public.cast_mvp_tie_vote(text, uuid, uuid) is
  'Voto del desempate del MVP: solo jugadores del partido con voto (comodines no).';

revoke all on function public.cast_mvp_tie_vote(text, uuid, uuid) from public, anon;
grant execute on function public.cast_mvp_tie_vote(text, uuid, uuid) to authenticated;

-- 5. Comprobación --------------------------------------------------
do $$
declare
  v_ok boolean;
begin
  select exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'mvp_tie_votes'
  ) into v_ok;

  if not v_ok then
    raise exception 'No se pudo crear mvp_tie_votes';
  end if;

  raise notice 'Desempate del MVP listo: gana la votación de los jugadores con voto.';
end $$;

commit;
