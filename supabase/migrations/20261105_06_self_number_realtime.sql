-- ============================================================
-- BaitersTracker · 06 · Cambio de dorsal propio y tiempo real
--
-- 1. change_my_number: cada jugador puede cambiarse el dorsal a sí
--    mismo (el móvil se identifica por su token; nadie más).
--    La unicidad la garantiza la restricción de shirt_number.
-- 2. Publicación realtime: las tablas que cambian durante un partido
--    se envían a los móviles conectados (la RLS de SELECT sigue
--    aplicando a quien recibe los cambios).
--
-- Idempotente.
-- ============================================================

begin;

create or replace function public.change_my_number(p_token text, p_number integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player uuid;
begin
  if p_token is null or length(p_token) < 32 then
    raise exception 'Token de dispositivo no válido';
  end if;

  if p_number is null or p_number < 1 or p_number > 99 then
    raise exception 'El dorsal va del 1 al 99';
  end if;

  select p.id into v_player
    from public.players p
   where p.device_hash = md5(p_token)
   limit 1;

  if v_player is null then
    raise exception 'Elige quién eres antes de cambiar el dorsal';
  end if;

  update public.players set shirt_number = p_number where id = v_player;
exception
  when unique_violation then
    raise exception 'Ese dorsal ya lo tiene otro';
end
$$;

revoke all on function public.change_my_number(text, integer) from public, anon;
grant execute on function public.change_my_number(text, integer) to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['votes', 'mvp_tie_votes', 'matches', 'appearances'] loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;

commit;
