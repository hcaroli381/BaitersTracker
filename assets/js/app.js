import { KEYS, isConfigured, getConfig, saveConfig } from './config.js';
import {
  state,
  esc,
  pad2,
  initials,
  photoBlock,
  toast,
  errorMessage,
  parseRoute,
  href,
} from './core.js';
import { signIn, signOut, session, loadCore, whoAmI, claimPlayer, takenNumbers, playerById } from './data.js';
import { home, ranking, matches, matchView, playerView, squad } from './views.js';
import { adminView } from './admin.js';

const app = document.getElementById('app');
let shellReady = false;

/* ------------------------------------------------------------------ */
/* Arranque                                                            */
/* ------------------------------------------------------------------ */

boot();

async function boot() {
  state.demo = sessionStorage.getItem(KEYS.demo) === '1';

  if (!state.demo && !isConfigured()) return renderSetup();
  if (state.demo) return start();

  try {
    const s = await session();
    if (!s) return renderLogin();
    state.email = s.user.email || '';
    return start();
  } catch (err) {
    return renderFatal(err);
  }
}

/* ------------------------------------------------------------------ */
/* Pantalla: configuración                                             */
/* ------------------------------------------------------------------ */

function renderSetup() {
  const cfg = getConfig();
  app.innerHTML = `<div class="gate">
    <div class="gate__art">
      <span class="gate__kicker">BaitersTracker · 2026/27</span>
      <h1 class="gate__title">EL<br>VESTUARIO<br><span class="outline">NO MIENTE</span></h1>
      <p class="gate__note">Notas, goles y MVP del grupo.</p>
      <span class="gate__ghost" aria-hidden="true">BT</span>
    </div>
    <div class="gate__panel">
      <p class="kicker">Primera conexión</p>
      <h2 class="gate__h2">Conectar Supabase</h2>
      <p class="hint">Pega la URL del proyecto y la clave pública (anon). Se guardan solo en este navegador.</p>
      <form id="setupForm" class="stack">
        <label class="field"><span class="kicker">Project URL</span>
          <input class="input" name="url" value="${esc(cfg.url)}" placeholder="https://xxxx.supabase.co" required></label>
        <label class="field"><span class="kicker">Anon / publishable key</span>
          <input class="input" name="key" placeholder="eyJhbGciOi..." required autocomplete="off" spellcheck="false"></label>
        <button class="btn btn--acid" type="submit">Guardar y continuar</button>
      </form>
      <p class="formerr" id="setupErr" hidden></p>
      <div class="gate__foot">
        <button class="link" type="button" id="demoBtn">Ver demo del diseño <span aria-hidden="true">→</span></button>
      </div>
    </div>
  </div>`;

  app.querySelector('#setupForm').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const f = ev.target;
    saveConfig(f.url.value, f.key.value);
    location.hash = '#/inicio';
    location.reload();
  });

  app.querySelector('#demoBtn').addEventListener('click', () => {
    sessionStorage.setItem(KEYS.demo, '1');
    location.hash = '#/inicio';
    location.reload();
  });
}

/* ------------------------------------------------------------------ */
/* Pantalla: acceso                                                    */
/* ------------------------------------------------------------------ */

function renderLogin() {
  const cfg = getConfig();
  app.innerHTML = `<div class="gate">
    <div class="gate__art">
      <span class="gate__kicker">BaitersTracker · Temporada 2026/27</span>
      <h1 class="gate__title">EL<br>VESTUARIO<br><span class="outline">NO MIENTE</span></h1>
      <p class="gate__note">Cada nota cuenta. Cada gol, también.</p>
      <span class="gate__ghost" aria-hidden="true">BT</span>
    </div>
    <div class="gate__panel">
      <p class="kicker">Acceso del grupo</p>
      <h2 class="gate__h2">Entrar</h2>
      <form id="loginForm" class="stack">
        <label class="field"><span class="kicker">Correo del grupo</span>
          <input class="input" name="email" type="email" value="${esc(cfg.sharedEmail)}" autocomplete="username" required></label>
        <label class="field"><span class="kicker">Contraseña</span>
          <input class="input" name="password" type="password" autocomplete="current-password" required></label>
        <button class="btn btn--acid" type="submit">Entrar</button>
      </form>
      <p class="formerr" id="loginErr" hidden></p>
      <div class="gate__foot">
        <button class="link" type="button" id="demoBtn">Ver demo del diseño <span aria-hidden="true">→</span></button>
        <button class="link link--mini" type="button" id="cfgBtn">Cambiar conexión</button>
      </div>
    </div>
  </div>`;

  const err = app.querySelector('#loginErr');

  app.querySelector('#loginForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const btn = f.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Entrando…';
    err.hidden = true;
    try {
      await signIn(f.email.value.trim(), f.password.value);
      await boot();
    } catch (e) {
      err.hidden = false;
      err.textContent = errorMessage(e);
      btn.disabled = false;
      btn.textContent = 'Entrar';
    }
  });

  app.querySelector('#demoBtn').addEventListener('click', () => {
    sessionStorage.setItem(KEYS.demo, '1');
    location.hash = '#/inicio';
    location.reload();
  });

  app.querySelector('#cfgBtn').addEventListener('click', () => {
    localStorage.removeItem('bt.supabase');
    location.reload();
  });
}

/* ------------------------------------------------------------------ */
/* Pantalla: elegir jugador                                            */
/* ------------------------------------------------------------------ */

function renderPick() {
  const players = state.players.filter((p) => p.active !== false);

  app.innerHTML = `<div class="pick">
    <header class="pick__head">
      <p class="kicker">Un dispositivo, un jugador</p>
      <h1 class="pick__title">¿QUIÉN<br><span class="outline">ERES?</span></h1>
      <p class="hint">Toca tu nombre y elige dorsal. Este móvil quedará vinculado a ti para votar; el admin puede liberarlo si te equivocas.</p>
    </header>
    ${
      players.length
        ? `<div class="pick__grid">
            ${players
              .map(
                (p) => `<button class="pickcard" type="button" data-pick="${esc(p.id)}">
                  <span class="pickcard__media">${photoBlock(p, 'ph--pick')}</span>
                  <span class="pickcard__num">${p.shirt_number ? pad2(p.shirt_number) : initials(p.name)}</span>
                  <span class="pickcard__name">${esc(p.name)}</span>
                  ${p.device_hash ? '<span class="pickcard__tag">Ocupado</span>' : '<span class="pickcard__tag pickcard__tag--free">Libre</span>'}
                </button>`
              )
              .join('')}
          </div>`
        : `<p class="hint">No hay jugadores todavía. Pide al admin que los añada.</p>`
    }
    <footer class="pick__foot">
      <button class="btn btn--ghost" type="button" id="pickOut">Salir</button>
    </footer>
  </div>`;

  app.querySelectorAll('[data-pick]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.querySelector('.pickcard__tag')?.textContent === 'Ocupado') {
        toast('Ese jugador ya está cogido en otro móvil', 'error');
        return;
      }
      const player = players.find((p) => p.id === btn.dataset.pick);
      if (player) renderNumberStep(player);
    });
  });

  app.querySelector('#pickOut').addEventListener('click', async () => {
    await signOut();
    location.reload();
  });
}

/* ------------------------------------------------------------------ */
/* Pantalla: elegir dorsal                                             */
/* ------------------------------------------------------------------ */

function renderNumberStep(player) {
  const taken = takenNumbers(player.id);
  const numbers = Array.from({ length: 99 }, (_, i) => i + 1);
  let chosen = null;

  app.innerHTML = `<div class="pick pick--num">
    <header class="pick__head">
      <p class="kicker">Paso 2 de 2 · tu dorsal</p>
      <h1 class="pick__title">TU<br><span class="outline">DORSAL</span></h1>
      <div class="pickstep">
        <span class="pickstep__pic">${photoBlock(player, 'ph--chip')}</span>
        <span class="pickstep__txt">
          <b>${esc(player.name)}</b>
          <span class="hint">Toca un número libre. Quedará a tu nombre y nadie más podrá cogerlo.</span>
        </span>
      </div>
    </header>
    <div class="numgrid" id="numGrid">
      ${numbers
        .map((n) =>
          taken.has(n)
            ? `<button class="numbtn" type="button" disabled aria-label="Dorsal ${n} ocupado"><s>${pad2(n)}</s></button>`
            : `<button class="numbtn" type="button" data-num="${n}">${pad2(n)}</button>`
        )
        .join('')}
    </div>
    <div class="pick__foot pick__foot--num">
      <button class="btn btn--ghost" type="button" id="numBack">Cambiar jugador</button>
      <button class="btn btn--acid" type="button" id="numGo" disabled>Elige un número</button>
    </div>
  </div>`;

  const go = app.querySelector('#numGo');
  const grid = app.querySelector('#numGrid');

  grid.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-num]');
    if (!btn) return;
    chosen = Number(btn.dataset.num);
    grid.querySelectorAll('.numbtn').forEach((b) => b.classList.toggle('is-on', b === btn));
    go.disabled = false;
    go.textContent = `Confirmar el ${pad2(chosen)}`;
  });

  app.querySelector('#numBack').addEventListener('click', () => renderPick());

  go.addEventListener('click', async () => {
    if (!chosen) return;
    const back = app.querySelector('#numBack');
    go.disabled = true;
    back.disabled = true;
    go.textContent = 'Guardando…';
    try {
      await claimPlayer(player.id, chosen);
    } catch (e) {
      toast(errorMessage(e), 'error');
      await loadCore().catch(() => {});
      return renderNumberStep(player);
    }
    try {
      await loadCore();
    } catch {
      /* el shell vuelve a cargar al entrar */
    }
    state.me = player.id;
    toast(`${pad2(chosen)} es tu dorsal. Ya puedes votar.`);
    shellReady = false;
    renderShell();
  });
}

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */

const NAV = [
  { key: 'inicio', num: '01', label: 'Inicio' },
  { key: 'ranking', num: '02', label: 'Ranking' },
  { key: 'partidos', num: '03', label: 'Partidos' },
  { key: 'plantilla', num: '04', label: 'Plantilla' },
  { key: 'admin', num: '05', label: 'Admin' },
];

async function start() {
  try {
    await loadCore();
  } catch (err) {
    return renderFatal(err);
  }

  if (!state.demo) {
    try {
      state.me = await whoAmI();
    } catch {
      state.me = null;
    }
    if (!state.me) return renderPick();
  }

  renderShell();
}

function meChip(compact = false) {
  if (!state.me) {
    return `<span class="chip chip--dim">Sin jugador</span>`;
  }
  const me = playerById(state.me);
  if (!me) return `<span class="chip chip--dim">Sin jugador</span>`;
  return `<a class="me ${compact ? 'me--compact' : ''}" href="${href('jugador', me.id)}">
    <span class="me__pic">${photoBlock(me, 'ph--chip')}</span>
    <span class="me__txt"><span class="kicker">${compact ? 'Tú' : 'Tu dispositivo'}</span><b>${esc(me.name)}</b></span>
  </a>`;
}

function renderShell() {
  shellReady = true;

  app.innerHTML = `<div class="shell">
    <aside class="rail">
      <a class="brand" href="${href('inicio')}">
        <span class="brand__mark" aria-hidden="true">BT</span>
        <span class="brand__word">Baiters<br>Tracker</span>
      </a>
      <nav class="railnav" aria-label="Secciones">
        ${NAV.map(
          (n) => `<a class="railnav__item" data-nav="${n.key}" href="${href(n.key)}">
            <span class="railnav__num">${n.num}</span>${n.label}
          </a>`
        ).join('')}
      </nav>
      <div class="rail__foot">
        ${meChip()}
        <button class="btn btn--ghost btn--sm" type="button" data-out>${state.demo ? 'Salir de la demo' : 'Salir'}</button>
      </div>
    </aside>

    <main class="stage">
      <header class="topbar">
        <a class="topbar__brand" href="${href('inicio')}">BAITERS<em>TRACKER</em></a>
        <span class="topbar__right">
          ${state.demo ? '<span class="chip chip--acid">Demo</span>' : ''}
          ${meChip(true)}
        </span>
      </header>
      <div id="view" class="viewHost"></div>
    </main>

    <nav class="dock" aria-label="Navegación">
      ${NAV.map(
        (n) => `<a class="dock__item" data-nav="${n.key}" href="${href(n.key)}">
          <span class="dock__dot" aria-hidden="true"></span>
          <span class="dock__label">${n.label}</span>
        </a>`
      ).join('')}
    </nav>
  </div>`;

  app.querySelector('[data-out]')?.addEventListener('click', async () => {
    if (state.demo) {
      sessionStorage.removeItem(KEYS.demo);
      location.hash = '#/inicio';
      location.reload();
      return;
    }
    await signOut();
    location.reload();
  });

  if (!window.__btRouter) {
    window.__btRouter = true;
    window.addEventListener('hashchange', () => {
      if (shellReady) renderRoute();
    });
  }

  renderRoute();
}

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */

async function renderRoute() {
  const route = parseRoute();
  const host = document.getElementById('view');
  if (!host) return;

  document.querySelectorAll('[data-nav]').forEach((a) => {
    const active = a.dataset.nav === route.name || (route.name === 'jugador' && a.dataset.nav === 'plantilla');
    a.classList.toggle('is-on', active);
    if (active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  host.innerHTML = '<div class="loading"><span></span></div>';

  let view;
  try {
    switch (route.name) {
      case 'ranking':
        view = await ranking();
        break;
      case 'partidos':
        view = route.id ? await matchView(route.id) : await matches();
        break;
      case 'jugador':
        view = route.id ? await playerView(route.id) : await squad();
        break;
      case 'plantilla':
        view = await squad();
        break;
      case 'admin':
        view = await adminView();
        break;
      case 'inicio':
      default:
        view = await home();
        break;
    }
  } catch (err) {
    view = {
      html: `<div class="view">
        <header class="page-head"><h1 class="page-title">UPS</h1></header>
        <p class="hint">${esc(errorMessage(err))}</p>
        <button class="btn btn--acid" type="button" onclick="location.reload()">Recargar</button>
      </div>`,
      mount() {},
    };
  }

  host.innerHTML = view.html;
  try {
    view.mount?.(host);
  } catch (err) {
    console.error(err);
  }
  window.scrollTo({ top: 0, behavior: 'instant' in document.documentElement.style ? 'instant' : 'auto' });
}

/* ------------------------------------------------------------------ */
/* Error fatal                                                         */
/* ------------------------------------------------------------------ */

function renderFatal(err) {
  app.innerHTML = `<div class="gate gate--fatal">
    <div class="gate__panel">
      <p class="kicker">No se pudo cargar</p>
      <h2 class="gate__h2">Supabase no responde</h2>
      <p class="hint">${esc(errorMessage(err))}</p>
      <div class="stack">
        <button class="btn btn--acid" type="button" id="retry">Reintentar</button>
        <button class="btn btn--ghost" type="button" id="back">Volver al acceso</button>
      </div>
    </div>
  </div>`;
  app.querySelector('#retry').addEventListener('click', () => location.reload());
  app.querySelector('#back').addEventListener('click', async () => {
    await signOut();
    location.reload();
  });
}
