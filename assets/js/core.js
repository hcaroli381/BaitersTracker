import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { getConfig, KEYS } from './config.js';

/* ------------------------------------------------------------------ */
/* Cliente                                                             */
/* ------------------------------------------------------------------ */

let _client = null;

export function sb() {
  if (!_client) {
    const cfg = getConfig();
    _client = createClient(cfg.url, cfg.key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
  }
  return _client;
}

export function resetClient() {
  _client = null;
}

/* ------------------------------------------------------------------ */
/* Estado en memoria                                                   */
/* ------------------------------------------------------------------ */

export const state = {
  demo: false,
  me: null, // jugador de este dispositivo
  players: [],
  stats: [],
  matches: [],
  email: '',
};

/* ------------------------------------------------------------------ */
/* Token de dispositivo                                                */
/* ------------------------------------------------------------------ */

export function deviceToken() {
  let t = localStorage.getItem(KEYS.token);
  if (!t || t.length < 32) {
    t = randomHex(32);
    localStorage.setItem(KEYS.token, t);
  }
  return t;
}

function randomHex(bytes) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

/* ------------------------------------------------------------------ */
/* Utilidades de formato                                               */
/* ------------------------------------------------------------------ */

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0] || '').join('').toUpperCase() || '?';
}

export function pad2(n) {
  return String(n ?? 0).padStart(2, '0');
}

export function num(value, fallback = '—') {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return fallback;
  return String(value);
}

export function rating(value) {
  if (value === null || value === undefined) return '—';
  return Number(value).toFixed(1).replace('.', ',');
}

const MONTHS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const WEEKDAYS = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];

export function dateParts(iso) {
  if (!iso) return { day: '--', month: '---', weekday: '---' };
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return { day: '--', month: '---', weekday: '---' };
  return { day: pad2(d.getDate()), month: MONTHS[d.getMonth()], weekday: WEEKDAYS[d.getDay()] };
}

export function longDate(iso) {
  if (!iso) return 'Sin fecha';
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return 'Sin fecha';
  return `${WEEKDAYS[d.getDay()]} ${pad2(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
/* Foto de jugador                                                     */
/* ------------------------------------------------------------------ */

export function photoURL(path) {
  const cfg = getConfig();
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const clean = String(path).replace(/^\/+/, '');
  return `${cfg.url}/storage/v1/object/public/${cfg.bucket}/${clean}`;
}

/**
 * Bloque de imagen de un jugador. `extra` permite añadir clases al contenedor.
 * Sin foto dibuja una placa de vestuario (dorsal + iniciales + camiseta).
 */
export function photoBlock(p, extra = '') {
  const label = esc(p?.name || 'Jugador');
  const shirt = p?.shirt_number ? pad2(p.shirt_number) : '';
  const url = p?.photo || photoURL(p?.avatar_path);
  if (url) {
    return `<div class="ph ${extra}">
      <img class="ph__img" src="${esc(url)}" alt="${label}" loading="lazy" decoding="async">
    </div>`;
  }
  return `<div class="ph ph--empty ${extra}" aria-label="${label}">
    <span class="ph__kit" aria-hidden="true"></span>
    ${shirt ? `<span class="ph__num">${shirt}</span>` : ''}
    <span class="ph__init">${esc(initials(p?.name))}</span>
  </div>`;
}

/* ------------------------------------------------------------------ */
/* Feedback                                                            */
/* ------------------------------------------------------------------ */

let toastTimer = null;

export function toast(message, kind = 'info') {
  let node = document.querySelector('.toast');
  if (!node) {
    node = document.createElement('div');
    node.className = 'toast';
    node.setAttribute('role', 'status');
    document.body.appendChild(node);
  }
  node.dataset.kind = kind;
  node.textContent = message;
  node.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('is-on'), 3600);
}

export function errorMessage(err) {
  if (!err) return 'Algo ha fallado';
  const raw = err.message || err.error_description || String(err);
  const map = {
    'Invalid login credentials': 'Contraseña incorrecta',
    'Email not confirmed': 'Ese correo aún no está confirmado',
    'Failed to fetch': 'No hay conexión con Supabase',
    'Contraseña de admin incorrecta': 'Contraseña de admin incorrecta',
  };
  return map[raw] || raw;
}

/* ------------------------------------------------------------------ */
/* Hoja modal                                                          */
/* ------------------------------------------------------------------ */

let closeSheet = null;

export function sheet({ title, kicker = '', body = '', actions = [] }) {
  closeSheet?.();
  const wrap = document.createElement('div');
  wrap.className = 'sheet';
  wrap.innerHTML = `
    <div class="sheet__scrim" data-close></div>
    <div class="sheet__panel" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <header class="sheet__head">
        ${kicker ? `<p class="kicker">${esc(kicker)}</p>` : ''}
        <h2 class="sheet__title">${esc(title)}</h2>
        <button class="sheet__x" type="button" data-close aria-label="Cerrar">✕</button>
      </header>
      <div class="sheet__body">${body}</div>
      <footer class="sheet__foot"></footer>
    </div>`;
  const foot = wrap.querySelector('.sheet__foot');
  actions.forEach((a) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn ${a.variant || 'ghost'}`;
    btn.textContent = a.label;
    btn.addEventListener('click', () => a.onClick?.(wrap));
    foot.appendChild(btn);
  });
  document.body.appendChild(wrap);
  document.body.classList.add('is-locked');
  requestAnimationFrame(() => wrap.classList.add('is-on'));

  const close = () => {
    wrap.classList.remove('is-on');
    document.body.classList.remove('is-locked');
    setTimeout(() => wrap.remove(), 220);
    document.removeEventListener('keydown', onKey);
    closeSheet = null;
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  closeSheet = close;
  wrap.querySelectorAll('[data-close]').forEach((n) => n.addEventListener('click', close));
  document.addEventListener('keydown', onKey);
  return { el: wrap, close };
}

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */

export function parseRoute() {
  const raw = location.hash.replace(/^#/, '');
  const parts = raw.split('/').filter(Boolean);
  if (!parts.length) return { name: 'inicio' };
  return { name: parts[0], id: parts[1] || null };
}

export function href(name, id) {
  return `#/${name}${id ? `/${id}` : ''}`;
}

export function navigate(name, id) {
  location.hash = href(name, id);
}
