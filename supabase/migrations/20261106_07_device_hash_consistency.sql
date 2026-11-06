-- ============================================================
-- BaitersTracker · 07 · El móvil se reconoce con una sola huella
--
-- Bug: `public.me()` compara `device_hash` con `private.hash_token()`
-- (sha256, 64 caracteres), pero `claim_player` (migración 04) guardaba
-- `md5()` (32 caracteres). Al recargar, el móvil recién vinculado no se
-- reconocía, la app volvía a pedir «¿Quién eres?» y su jugador —ya
-- cogido— no salía en la lista: no había forma de volver a entrar.
--
-- El token no se guarda, solo su huella, así que los hashes md5 ya
-- escritos no se pueden recalcular. Aquí la identidad acepta las dos:
--   · md5    — móviles vinculados con la migración 04.
--   · sha256 — móviles vinculados antes (private.hash_token) y los
--              nuevos, que ya se guardan siempre en sha256.
--
-- Idempotente. Ejecutar en Supabase → SQL Editor.
-- ============================================================

begin;

-- 1. Resolver el jugador de un móvil -------------------------------
create or replace function private.player_for_token(p_token text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
    from public.players p
   where p.device_hash in (
     md5(p_token),
     encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
   )
   order by p.created_at, p.id
   limit 1
$$;

comment on function private.player_for_token(text) is
  'Jugador de este móvil, aceptando la huella antigua (md5) y la canónica (sha256).';

revoke all on function private.player_for_token(text) from public, anon, authenticated;

-- 2. me(): misma respuesta para las dos huellas ---------------------
create or replace function public.me(p_token text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select private.player_for_token(p_token)
$$;

comment on function public.me(text) is
  'Jugador vinculado a este móvil (acepta md5 y sha256).';

revoke all on function public.me(text) from public, anon;
grant execute on function public.me(text) to authenticated;

-- 3. claim_player: guarda sha256 y compara con las dos -------------
-- Se rehace con DROP porque la versión de producción declara `p_number`
-- con DEFAULT y CREATE OR REPLACE no permite añadir ni quitar valores
-- por defecto. Ningún objeto de la base depende de esta función.
drop function if exists public.claim_player(text, uuid, integer);

create function public.claim_player(p_token text, p_player uuid, p_number integer default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device text;
  v_hash text;
  v_lock boolean;
begin
  if p_token is null or length(p_token) < 32 then
    raise exception 'Token de dispositivo no válido';
  end if;

  if p_number is not null and (p_number < 1 or p_number > 99) then
    raise exception 'El dorsal va del 1 al 99';
  end if;

  -- Huella canónica: la misma que busca me().
  v_hash := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');

  select p.device_hash into v_device
    from public.players p
   where p.id = p_player;

  if not found then
    raise exception 'Ese jugador no existe';
  end if;

  select coalesce(s.lock_claimed, true) into v_lock
    from public.settings s
   where s.id = 1;

  -- Con el bloqueo activo, ni el jugador es de otro móvil ni el móvil
  -- puede acabar vinculado a dos jugadores (me() devolvería cualquiera).
  if coalesce(v_lock, true) then
    if v_device is not null and v_device not in (md5(p_token), v_hash) then
      raise exception 'Ese jugador ya lo ha cogido otro móvil';
    end if;

    if exists (
      select 1 from public.players p
       where p.id <> p_player
         and p.device_hash in (md5(p_token), v_hash)
    ) then
      raise exception 'Este móvil ya está vinculado a otro jugador';
    end if;
  end if;

  if p_number is not null and exists (
    select 1 from public.players p
     where p.shirt_number = p_number
       and p.id <> p_player
  ) then
    raise exception 'Ese dorsal lo acaba de coger otro';
  end if;

  -- `claimed` es una columna generada (device_hash is not null): no se toca.
  update public.players
     set device_hash = v_hash,
         shirt_number = coalesce(p_number, shirt_number)
   where id = p_player;
end;
$$;

comment on function public.claim_player(text, uuid, integer) is
  'Vincula el móvil al jugador y reserva su dorsal. Guarda sha256 y acepta también md5.';

revoke all on function public.claim_player(text, uuid, integer) from public, anon;
grant execute on function public.claim_player(text, uuid, integer) to authenticated;

-- 4. Comprobación ---------------------------------------------------
do $$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'me';

  if v_def is null or position('player_for_token' in v_def) = 0 then
    raise exception 'me() no está resolviendo el móvil con player_for_token';
  end if;

  raise notice 'Identidad del móvil: md5 y sha256 aceptados, altas nuevas en sha256.';
end $$;

commit;
