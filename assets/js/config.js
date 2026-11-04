/**
 * BaitersTracker — configuración de conexión.
 *
 * SUPABASE_KEY es la clave pública (anon / publishable) del proyecto.
 * Es pública por diseño: la seguridad real vive en las políticas RLS y en
 * las funciones RPC (contraseña de admin + token de dispositivo).
 *
 * Puedes rellenarla aquí o dejarla vacía: en ese caso la app pide la clave
 * una vez y la guarda en el navegador (localStorage), que es lo recomendable
 * si el repositorio va a ser público en GitHub.
 */

const LS = {
  url: 'bt.supabase.url',
  key: 'bt.supabase.key',
  demo: 'bt.demo',
  token: 'bt.device.token',
  admin: 'bt.admin.pw',
};

export const KEYS = LS;

const DEFAULTS = {
  url: 'https://sarbskubgajtftfthanl.supabase.co',
  key: '',
  sharedEmail: 'vestuario@baiters.local',
  bucket: 'player-photos',
};

export function getConfig() {
  let overrides = {};
  try {
    overrides = JSON.parse(localStorage.getItem('bt.supabase') || '{}');
  } catch {
    overrides = {};
  }
  return {
    ...DEFAULTS,
    url: overrides.url || DEFAULTS.url,
    key: overrides.key || DEFAULTS.key,
  };
}

export function saveConfig(url, key) {
  localStorage.setItem(
    'bt.supabase',
    JSON.stringify({ url: String(url || '').trim().replace(/\/+$/, ''), key: String(key || '').trim() })
  );
}

export function clearConfig() {
  localStorage.removeItem('bt.supabase');
}

export function isConfigured() {
  const c = getConfig();
  return Boolean(c.url && c.key);
}
