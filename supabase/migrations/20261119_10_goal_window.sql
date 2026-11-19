-- La edición de goles sigue la misma hora de apertura que la votación.
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
end;
$$;
