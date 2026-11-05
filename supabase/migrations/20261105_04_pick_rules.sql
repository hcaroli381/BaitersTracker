-- ============================================================
-- BaitersTracker · 04 · Reglas de elección de jugador
--
-- Dos interruptores en Admin → Ajustes:
--
--   · settings.lock_claimed (true por defecto): un jugador ya
--     cogido NO se puede volver a coger desde otro móvil. La
--     regla vive en `claim_player`, no solo en la pantalla.
--     El admin lo libera con «Liberar».
--
--   · settings.wildcards_pickable (false por defecto): los
--     comodines no salen en «¿Quién eres?». Solo juegan cuando
--     el admin los pone en la alineación.
--
-- Idempotente: se puede ejecutar más de una vez sin daño.
-- Ejecutar en Supabase → SQL Editor (o `supabase db push`).
-- ============================================================

begin;

-- 1. Ajustes -------------------------------------------------------
alter table public.settings
  add column if not exists lock_claimed boolean not null default true,
  add column if not exists wildcards_pickable boolean not null default false;

comment on column public.settings.lock_claimed is
  'true: un jugador ya cogido no se puede volver a coger desde otro móvil.';
comment on column public.settings.wildcards_pickable is
  'true: los comodines aparecen en la lista «¿Quién eres?».';

-- 2. claim_player: un jugador, un móvil ----------------------------
-- Se conserva la firma de producción: (text, uuid, integer).
create or replace function public.claim_player(p_token text, p_player uuid, p_number integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device text;
  v_lock boolean;
begin
  if p_token is null or length(p_token) < 32 then
    raise exception 'Token de dispositivo no válido';
  end if;

  if p_number is not null and (p_number < 1 or p_number > 99) then
    raise exception 'El dorsal va del 1 al 99';
  end if;

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
    if v_device is not null and v_device <> md5(p_token) then
      raise exception 'Ese jugador ya lo ha cogido otro móvil';
    end if;

    if exists (
      select 1 from public.players p
       where p.device_hash = md5(p_token)
         and p.id <> p_player
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

  update public.players
     set device_hash = md5(p_token),
         claimed = true,
         shirt_number = coalesce(p_number, shirt_number)
   where id = p_player;
end;
$$;

comment on function public.claim_player(text, uuid, integer) is
  'Vincula el móvil al jugador y reserva su dorsal. Con lock_claimed, un jugador solo se coge una vez.';

revoke all on function public.claim_player(text, uuid, integer) from public, anon;
grant execute on function public.claim_player(text, uuid, integer) to authenticated;

-- 3. Interruptores de admin ---------------------------------------
create or replace function public.admin_set_lock_claimed(p_pw text, p_value boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_admin(p_pw);
  update public.settings
     set lock_claimed = coalesce(p_value, true)
   where id = 1;
end;
$$;

comment on function public.admin_set_lock_claimed(text, boolean) is
  'Activa o desactiva que un jugador ya cogido no se pueda volver a coger.';

revoke all on function public.admin_set_lock_claimed(text, boolean) from public, anon;
grant execute on function public.admin_set_lock_claimed(text, boolean) to authenticated;

create or replace function public.admin_set_wildcards_pickable(p_pw text, p_value boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_admin(p_pw);
  update public.settings
     set wildcards_pickable = coalesce(p_value, false)
   where id = 1;
end;
$$;

comment on function public.admin_set_wildcards_pickable(text, boolean) is
  'Muestra u oculta los comodines en la lista «¿Quién eres?».';

revoke all on function public.admin_set_wildcards_pickable(text, boolean) from public, anon;
grant execute on function public.admin_set_wildcards_pickable(text, boolean) to authenticated;

-- 4. Comprobación --------------------------------------------------
do $$
declare
  v_ok boolean;
begin
  select exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'settings'
       and column_name = 'lock_claimed'
  ) and exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'settings'
       and column_name = 'wildcards_pickable'
  ) into v_ok;

  if not v_ok then
    raise exception 'No se pudieron crear los ajustes de elección de jugador';
  end if;

  raise notice 'Elección de jugador: un jugador, un móvil y comodines ocultos por defecto.';
end $$;

commit;
