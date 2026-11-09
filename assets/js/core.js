import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { getConfig, KEYS } from './config.js';
import { kickoffDate, voteOpensDate, votesOpen, VOTE_DELAY_MS } from './rules.js';

/* Reglas puras, reexportadas para que las vistas no importen de dos sitios. */
export { kickoffDate, voteOpensDate, votesOpen, VOTE_DELAY_MS };
import { msUntilVotesOpen } from './rules.js';
export { msUntilVotesOpen };

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

/* ------------------------------------------------------------------ */
/* Estado en memoria                                                   */
/* ------------------------------------------------------------------ */

export const state = {
  me: null, // jugador de este dispositivo
  players: [],
  stats: [],
  matches: [],
  email: '',
  allowSelfVote: false,
  wildcardsPickable: false, // los comodines salen en «¿Quién eres?»
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
/* Equipos                                                             */
/* En la base siguen siendo 'A' y 'B'; aquí se les pone nombre de peto. */
/* ------------------------------------------------------------------ */

export const TEAMS = {
  A: { name: 'Oscuros', tone: 'dark' },
  B: { name: 'Claros', tone: 'light' },
};

export function teamName(code) {
  return TEAMS[code]?.name || '';
}

export function teamTag(code, extra = '') {
  const t = TEAMS[code];
  if (!t) return '';
  return `<span class="team-tag team-tag--${t.tone} ${extra}">${t.name}</span>`;
}

/** Texto de resultado: "Ganan los Oscuros", "Ganan los Claros" o "Empate". */
export function outcomeText(goalsA, goalsB) {
  const a = Number(goalsA ?? 0);
  const b = Number(goalsB ?? 0);
  if (a > b) return 'Ganan los Oscuros';
  if (b > a) return 'Ganan los Claros';
  return 'Empate';
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

export function plural(n, one, many) {
  return `${n} ${Number(n) === 1 ? one : many}`;
}

/** Nota con un decimal (insignias y listas). */
export function rating(value) {
  if (value === null || value === undefined) return '–';
  return Number(value).toFixed(1).replace('.', ',');
}

/** Nota con dos decimales (detalle). */
export function rating2(value) {
  if (value === null || value === undefined) return '–';
  return Number(value).toFixed(2).replace('.', ',');
}

export function ratingTone(value) {
  if (value === null || value === undefined) return 'none';
  const v = Number(value);
  if (v >= 8) return 'hi';
  if (v >= 6) return 'mid';
  return 'lo';
}

/** Insignia de nota: el color depende del valor. */
export function rateBadge(value, extra = '') {
  return `<span class="rate rate--${ratingTone(value)} ${extra}">${rating(value)}</span>`;
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

export function dateParts(iso) {
  if (!iso) return { day: '–', month: '', weekday: '' };
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return { day: '–', month: '', weekday: '' };
  return { day: String(d.getDate()), month: MONTHS[d.getMonth()], weekday: WEEKDAYS[d.getDay()] };
}

export function longDate(iso) {
  if (!iso) return 'Sin fecha';
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return 'Sin fecha';
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function shortDate(iso) {
  const p = dateParts(iso);
  return `${p.weekday} ${p.day} ${p.month}`.trim();
}

/** Fecha de hoy en hora local (toISOString usaría UTC y de madrugada da el día anterior). */
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/* ------------------------------------------------------------------ */
/* Horas                                                               */
/* ------------------------------------------------------------------ */

/** "21:05" a partir de un Date o de una marca ISO. */
export function timeLabel(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (!d || Number.isNaN(d.getTime())) return '';
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** "sáb 8 nov, 21:05". */
export function dateTimeLabel(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (!d || Number.isNaN(d.getTime())) return '';
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}, ${timeLabel(d)}`;
}

/** Valor para <input type="datetime-local"> en hora local. */
export function localInputValue(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (!d || Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Convierte el valor de un datetime-local (hora local) en ISO UTC. */
export function localInputToISO(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** "Abre el sáb 8 nov, 22:00": cuándo empieza a poderse votar. */
export function voteOpensLabel(match) {
  const opens = voteOpensDate(match);
  return opens ? dateTimeLabel(opens) : '';
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
 * Bloque de imagen de un jugador. Rellena a su contenedor (que pone tamaño y esquinas).
 * Sin foto muestra las iniciales sobre un fondo liso.
 */
export function photoBlock(p, extra = '') {
  const label = esc(p?.name || 'Jugador');
  const url = p?.photo || photoURL(p?.avatar_path);
  if (url) {
    return `<div class="ph ${extra}">
      <img class="ph__img" src="${esc(url)}" alt="${label}" loading="lazy" decoding="async">
    </div>`;
  }
  return `<div class="ph ph--empty ${extra}" role="img" aria-label="${label}">
    <span class="ph__init">${esc(initials(p?.name))}</span>
  </div>`;
}

/** Avatar cuadrado con esquinas suaves; `size` en píxeles. */
export function avatar(p, size = 44) {
  return `<span class="av" style="--s:${size}px">${photoBlock(p)}</span>`;
}

/* ------------------------------------------------------------------ */
/* Feedback                                                            */
/* ------------------------------------------------------------------ */

let toastHost = null;

function ensureToastHost() {
  if (!toastHost || !toastHost.isConnected) {
    toastHost = document.createElement('div');
    toastHost.className = 'toasts';
    document.body.appendChild(toastHost);
  }
  return toastHost;
}

/** Aviso breve y apilable: se ven como mucho los tres últimos. */
export function toast(message, kind = 'info') {
  const host = ensureToastHost();
  while (host.children.length >= 3) host.firstElementChild?.remove();

  const node = document.createElement('div');
  node.className = 'toast';
  node.dataset.kind = kind;
  node.setAttribute('role', 'status');
  node.textContent = message;
  host.appendChild(node);
  requestAnimationFrame(() => node.classList.add('is-on'));

  setTimeout(() => {
    node.classList.remove('is-on');
    let gone = false;
    const remove = () => {
      if (gone) return;
      gone = true;
      node.remove();
    };
    node.addEventListener('transitionend', remove, { once: true });
    setTimeout(remove, 320);
  }, 3600);
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
/* Hoja inferior                                                       */
/* ------------------------------------------------------------------ */

let closeSheet = null;

/**
 * Hoja que sube desde abajo.
 * `actions`: [{ id?, label, variant?, disabled?, onClick(wrap) }]. Devuelve { el, close, action(id) }.
 */
export function sheet({ title, subtitle = '', body = '', actions = [] }) {
  closeSheet?.();
  const previousFocus = document.activeElement;
  const wrap = document.createElement('div');
  wrap.className = 'sheet';
  wrap.innerHTML = `
    <div class="sheet__scrim" data-close></div>
    <div class="sheet__panel" role="dialog" aria-modal="true" aria-label="${esc(title)}" tabindex="-1">
      <header class="sheet__head">
        <span class="sheet__grab" aria-hidden="true"></span>
        <h2 class="sheet__title">${esc(title)}</h2>
        ${subtitle ? `<p class="sheet__sub">${esc(subtitle)}</p>` : ''}
        <button class="sheet__x" type="button" data-close aria-label="Cerrar"><span aria-hidden="true"></span></button>
      </header>
      <div class="sheet__body">${body}</div>
      ${actions.length ? '<footer class="sheet__foot"></footer>' : ''}
    </div>`;
  stagger(wrap);
  const panel = wrap.querySelector('.sheet__panel');
  const foot = wrap.querySelector('.sheet__foot');
  actions.forEach((a) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn ${a.variant || 'btn--ghost'}`;
    btn.textContent = a.label;
    btn.disabled = Boolean(a.disabled);
    if (a.id) btn.dataset.action = a.id;
    btn.addEventListener('click', () => a.onClick?.(wrap));
    foot.appendChild(btn);
  });
  document.body.appendChild(wrap);
  document.body.classList.add('is-locked');

  const focusables = () =>
    [
      ...panel.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ),
    ].filter((el) => el.getClientRects().length > 0);

  let closing = false;
  const close = () => {
    if (closing || !wrap.isConnected) return;
    closing = true;
    wrap.classList.remove('is-on');
    document.removeEventListener('keydown', onKey);
    closeSheet = null;

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      wrap.remove();
      if (!document.querySelector('.sheet.is-on')) {
        document.body.classList.remove('is-locked');
        if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      }
    };
    panel.addEventListener('transitionend', (ev) => {
      if (ev.target === panel && (ev.propertyName === 'transform' || ev.propertyName === 'opacity')) finish();
    });
    setTimeout(finish, 380);
  };

  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== 'Tab') return;
    const list = focusables();
    if (!list.length) {
      e.preventDefault();
      panel.focus({ preventScroll: true });
      return;
    }
    const first = list[0];
    const last = list[list.length - 1];
    const active = document.activeElement;
    if (active === panel || !panel.contains(active)) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
      return;
    }
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  closeSheet = close;
  wrap.querySelectorAll('[data-close]').forEach((n) => n.addEventListener('click', close));
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => {
    wrap.classList.add('is-on');
    panel.focus({ preventScroll: true });
  });
  return { el: wrap, close, action: (id) => wrap.querySelector(`[data-action="${id}"]`) };
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

/* ------------------------------------------------------------------ */
/* Movimiento                                                          */
/* ------------------------------------------------------------------ */

/** Marca una cifra para que `animateCounts` la cuente al entrar. */
export function count(value) {
  return Number.isFinite(value) ? ' data-count="' + value + '"' : '';
}

/** Contenedores cuyos hijos entran en cascada (ver motion.css). */
const STAGGER_TARGETS = [
  '.view > *',
  '.sheet__body > *',
  '.plist > li',
  '.mlist > li',
  '.hlist > li',
  '.squad > *',
  '.teams > .team',
  '.cuts > .cut',
  '.adminlist > .adminrow',
  '.voters > .voters__row',
  '.lineupEdit > .lineupEdit__row',
  '.scale > .scale__btn',
  '.seg > .seg__btn',
  '.stats > .stat',
  '.sheet__foot > .btn',
];

/**
 * Reparte `--i` (0–7) por los hijos de listas y bloques para que
 * motion.css los anime en cascada. Sin llamada, entran todos a la vez.
 */
export function stagger(root = document) {
  STAGGER_TARGETS.forEach((selector) => {
    root.querySelectorAll(selector).forEach((el, index) => {
      if (!el.style.getPropertyValue('--i')) el.style.setProperty('--i', String(Math.min(index, 7)));
    });
  });
}

/** Cuenta una cifra de 0 al valor final en ~0,6 s. */
export function animateCounts(root = document) {
  const nodes = root.querySelectorAll('[data-count]');
  if (!nodes.length) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  nodes.forEach((el) => {
    const target = Number(el.dataset.count);
    if (!Number.isFinite(target)) return;
    // Ya se ha contado este mismo valor: no volver a empezar desde cero.
    if (el.dataset.counted === String(target)) return;
    el.dataset.counted = String(target);
    if (document.hidden) {
      el.textContent = String(target);
      return;
    }
    const duration = 620;
    const started = performance.now();
    if (el._countFrame) cancelAnimationFrame(el._countFrame);
    clearTimeout(el._countTimer);
    const step = (now) => {
      const t = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = String(Math.round(target * eased));
      if (t < 1) el._countFrame = requestAnimationFrame(step);
    };
    el.textContent = '0';
    el._countFrame = requestAnimationFrame(step);
    // Red de seguridad: si la pestaña se oculta, el número no se queda a medias.
    el._countTimer = setTimeout(() => {
      el.textContent = String(target);
    }, duration + 400);
  });
}
