/**
 * BaitersTracker — configuración de conexión.
 *
 * SUPABASE_KEY es la clave PÚBLICA del proyecto: la «publishable»
 * (sb_publishable_…) o, en proyectos antiguos, la «anon» (eyJhbGciOi…).
 * Es pública por diseño: la seguridad real vive en las políticas RLS y en
 * las funciones RPC (contraseña de admin + token de dispositivo).
 *
 * Si la dejas vacía, cada navegador tendrá que pegarla una vez (la app la
 * guarda en localStorage). Si la pones aquí, todos los móviles del grupo
 * entran directamente: es cómodo y sigue siendo seguro con esta clave.
 *
 * NUNCA pongas aquí la clave secreta (sb_secret_…) ni la antigua
 * service_role: se saltan RLS por completo. La app las ignora.
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

/** Clave elevada: se salta RLS, así que nunca debe acabar en el navegador. */
export function isSecretKey(key) {
  return /^sb_secret_/i.test(String(key || '').trim());
}

export function getConfig() {
  let overrides = {};
  try {
    overrides = JSON.parse(localStorage.getItem('bt.supabase') || '{}');
  } catch {
    overrides = {};
  }
  const stored = isSecretKey(overrides.key) ? '' : overrides.key;
  return {
    ...DEFAULTS,
    url: overrides.url || DEFAULTS.url,
    key: stored || DEFAULTS.key,
  };
}

/** Guarda la conexión. Devuelve false si la clave era una secret key. */
export function saveConfig(url, key) {
  const value = String(key || '').trim();
  if (isSecretKey(value)) {
    console.warn(
      'BaitersTracker: esa es la clave secreta del proyecto. Usa la publishable (sb_publishable_…); no se ha guardado.'
    );
    return false;
  }
  localStorage.setItem(
    'bt.supabase',
    JSON.stringify({ url: String(url || '').trim().replace(/\/+$/, ''), key: value })
  );
  return true;
}

export function clearConfig() {
  localStorage.removeItem('bt.supabase');
}

export function isConfigured() {
  const c = getConfig();
  return Boolean(c.url && c.key);
}
