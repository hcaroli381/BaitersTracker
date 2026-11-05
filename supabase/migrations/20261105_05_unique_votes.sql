-- ============================================================
-- BaitersTracker · 05 · Un voto por jugador y partido
--
-- Evita votos duplicados aunque dos peticiones lleguen a la vez
-- (cast_vote comprueba y luego inserta; la restricción lo cubre a
-- nivel de base de datos).
--
-- Producción tenía 0 votos al escribir esto, así que la restricción
-- no puede fallar con datos existentes.
-- Idempotente.
-- ============================================================

begin;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.votes'::regclass
       and conname = 'votes_one_per_pair'
  ) then
    alter table public.votes
      add constraint votes_one_per_pair unique (match_id, voter_id, target_id);
  end if;
end
$$;

commit;
