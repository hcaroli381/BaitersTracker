-- ============================================================
-- BaitersTracker · 09 · Todos eligen, el último móvil gana
--
-- Se acaba con el estado «cogido»:
--   · Todos los jugadores salen siempre en «¿Quién eres?».
--   · Cualquier móvil puede elegir a cualquier jugador, ya esté
--     vinculado a otro o no. El vínculo se mueve al último móvil.
--   · El móvil anterior deja de reconocerlo (me() devuelve null),
--     así que al volver a la app se le pide elegir de nuevo.
--   · Un móvil sigue vinculado a un solo jugador: al elegir a otro,
--     suelta el anterior.
--
-- `settings.lock_claimed` se queda por compatibilidad con pestañas
-- abiertas con el JS antiguo, pero ya no lo lee claim_player.
--
-- Idempotente. Ejecutar en Supabase → SQL Editor.
-- ============================================================

begin;

-- 1. El vínculo se mueve, no se bloquea ----------------------------
create or replace function public.claim_player(p_token text, p_player uuid, p_number integer default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
begin
  if p_token is null or length(p_token) < 32 then
    raise exception 'Token de dispositivo no válido';
  end if;

  if p_number is not null and (p_number < 1 or p_number > 99) then
    raise exception 'El dorsal va del 1 al 99';
  end if;

  if not exists (select 1 from public.players p where p.id = p_player) then
    raise exception 'Ese jugador no existe';
  end if;

  -- Huella canónica: la misma que busca me().
  v_hash := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');

  if p_number is not null and exists (
    select 1 from public.players p
     where p.shirt_number = p_number
       and p.id <> p_player
  ) then
    raise exception 'Ese dorsal lo acaba de coger otro';
  end if;

  -- Un móvil, un jugador: si este móvil ya entraba como otro, lo suelta.
  update public.players p
     set device_hash = null
   where p.id <> p_player
     and p.device_hash in (md5(p_token), v_hash);

  -- El último móvil que elige se queda con el jugador (y saca al anterior).
  update public.players
     set device_hash = v_hash,
         shirt_number = coalesce(p_number, shirt_number)
   where id = p_player;
end;
$$;

comment on function public.claim_player(text, uuid, integer) is
  'Vincula el móvil al jugador. El último móvil gana; el anterior queda desvinculado.';

revoke all on function public.claim_player(text, uuid, integer) from public, anon;
grant execute on function public.claim_player(text, uuid, integer) to authenticated;

-- 2. Compatibilidad con pestañas que aún tienen el JS viejo ---------
-- El JS antiguo esconde a los vinculados si lock_claimed está activo;
-- con false los muestra todos aunque no se recargue.
update public.settings
   set lock_claimed = false
 where id = 1;

comment on column public.settings.lock_claimed is
  'Obsoleto: se mantiene en false por compatibilidad. claim_player ya no lo usa.';

-- El interruptor viejo ya no puede volver a esconder jugadores: aunque una
-- pestaña con el JS anterior lo active, se queda en false.
create or replace function public.admin_set_lock_claimed(p_pw text, p_value boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_admin(p_pw);
  update public.settings set lock_claimed = false where id = 1;
end;
$$;

comment on function public.admin_set_lock_claimed(text, boolean) is
  'Obsoleto: mantiene lock_claimed en false para pestañas con el JS anterior.';

-- 3. Comprobación ---------------------------------------------------
do $$
begin
  if position('lock_claimed' in pg_get_functiondef('public.claim_player(text,uuid,integer)'::regprocedure)) > 0 then
    raise exception 'claim_player todavía depende de lock_claimed';
  end if;
end $$;

commit;
