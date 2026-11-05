import { isConfigured, getConfig } from './config.js';
import { state, esc, pad2, photoBlock, avatar, toast, errorMessage, parseRoute, href } from './core.js';
import { signIn, signOut, session, loadCore, whoAmI, claimPlayer, takenNumbers, playerById } from './data.js';
import { home, ranking, matches, matchView, playerView, squad } from './views.js';
import { adminView } from './admin.js';

const app = document.getElementById('app');
let shellReady = false;

/** Marcador: este navegador ha decidido no ser jugador (p. ej. el PC del admin). */
const NO_PLAYER = 'bt.no.player';

const WORDMARK = '<span class="wordmark">Baiters<span>Tracker</span></span>';

/* ------------------------------------------------------------------ */
/* Arranque                                                            */
/* ------------------------------------------------------------------ */

boot();

async function boot() {
  if (!isConfigured()) return renderNoConfig();

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
/* Pantalla: sin clave en config.js                                    */
/* ------------------------------------------------------------------ */

function renderNoConfig() {
  app.innerHTML = `<div class="gate">
    <div class="gate__head">${WORDMARK}</div>
    <div class="gate__panel">
      <h1 class="gate__h">Falta la clave de conexión</h1>
      <p class="hint">La clave pública del proyecto no está en <code>assets/js/config.js</code>. Pégala en el campo <code>key</code> y recarga la página.</p>
      <button class="btn btn--acid" type="button" id="retry">Reintentar</button>
    </div>
  </div>`;
  app.querySelector('#retry').addEventListener('click', () => location.reload());
}

/* ------------------------------------------------------------------ */
/* Pantalla: acceso                                                    */
/* ------------------------------------------------------------------ */

function renderLogin() {
  const cfg = getConfig();
  app.innerHTML = `<div class="gate">
    <div class="gate__head">
      <h1 class="gate__logo">Baiters<br><span>Tracker</span></h1>
      <p class="gate__note">No es suerte, es bait.</p>
    </div>
    <form id="loginForm" class="gate__panel">
      <label class="field"><span class="field__label">Contraseña del grupo</span>
        <input class="input" name="password" type="password" autocomplete="current-password" enterkeyhint="go" required></label>
      <button class="btn btn--acid" type="submit">Entrar</button>
      <p class="formerr" id="loginErr" hidden></p>
    </form>
  </div>`;

  const err = app.querySelector('#loginErr');
  const pass = app.querySelector('#loginForm input[name="password"]');
  if (pass) pass.focus({ preventScroll: true });

  app.querySelector('#loginForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const btn = f.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Entrando…';
    err.hidden = true;
    try {
      await signIn(cfg.sharedEmail, f.password.value);
      await boot();
    } catch (e) {
      err.hidden = false;
      err.textContent = errorMessage(e);
      btn.disabled = false;
      btn.textContent = 'Entrar';
      f.password.select?.();
    }
  });
}

/* ------------------------------------------------------------------ */
/* Pantalla: elegir jugador                                            */
/* ------------------------------------------------------------------ */

function renderPick() {
  const players = state.players.filter((p) => p.active !== false && p.can_vote !== false);
  const wildcards = state.players.filter((p) => p.active !== false && p.can_vote === false).length;

  app.innerHTML = `<div class="pick">
    <header class="pick__head">
      ${WORDMARK}
      <h1 class="title">¿Quién eres?</h1>
      <p class="lede">Toca tu nombre y elige dorsal. Este móvil quedará vinculado a ti para votar; si te equivocas, el admin puede liberarlo.</p>
      ${
        wildcards
          ? `<p class="hint">${wildcards === 1 ? 'Hay un comodín' : `Hay ${wildcards} comodines`} en la plantilla: juegan cuando falta gente, no votan y no salen en esta lista.</p>`
          : ''
      }
    </header>
    ${
      players.length
        ? `<div class="squad">
            ${players
              .map((p) => {
                const taken = Boolean(p.device_hash);
                return `<button class="scard${taken ? ' is-taken' : ''}" type="button" data-pick="${esc(p.id)}"${taken ? ' aria-disabled="true"' : ''}>
                  <span class="scard__photo">${photoBlock(p)}${p.shirt_number ? `<span class="scard__num">${pad2(p.shirt_number)}</span>` : ''}</span>
                  <b class="scard__name">${esc(p.name)}</b>
                  <span class="scard__stat">${taken ? 'Ya está cogido' : 'Libre'}</span>
                </button>`;
              })
              .join('')}
          </div>`
        : `<p class="hint">No hay jugadores todavía. Pide al admin que los añada.</p>`
    }
    <footer class="pick__foot">
      <button class="btn btn--ghost" type="button" id="pickSkip">Solo ver y administrar</button>
      <button class="btn btn--ghost" type="button" id="pickOut">Salir</button>
    </footer>
  </div>`;

  app.querySelectorAll('[data-pick]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('is-taken')) {
        toast('Ese jugador ya está cogido en otro móvil', 'error');
        return;
      }
      const player = players.find((p) => p.id === btn.dataset.pick);
      if (player) renderNumberStep(player);
    });
  });

  app.querySelector('#pickSkip').addEventListener('click', () => {
    localStorage.setItem(NO_PLAYER, '1');
    state.me = null;
    shellReady = false;
    renderShell();
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
      ${WORDMARK}
      <h1 class="title">Elige tu dorsal</h1>
      <div class="pickstep">
        ${avatar(player, 52)}
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
    <div class="pick__bar">
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
    localStorage.removeItem(NO_PLAYER);
    try {
      await loadCore();
    } catch {
      /* el shell vuelve a cargar al entrar */
    }
    state.me = player.id;
    toast(`El ${pad2(chosen)} es tu dorsal. Ya puedes votar.`);
    shellReady = false;
    renderShell();
  });
}

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */

const NAV = [
  { key: 'inicio', label: 'Inicio' },
  { key: 'ranking', label: 'Tabla' },
  { key: 'partidos', label: 'Partidos' },
  { key: 'plantilla', label: 'Plantilla' },
  { key: 'admin', label: 'Admin' },
];

async function start() {
  try {
    await loadCore();
  } catch (err) {
    return renderFatal(err);
  }

  try {
    state.me = await whoAmI();
  } catch {
    state.me = null;
  }

  if (!state.me) {
    if (localStorage.getItem(NO_PLAYER) === '1') {
      renderShell();
      return;
    }
    return renderPick();
  }

  renderShell();
}

function meChip() {
  if (!state.me) {
    return `<button class="bar__me bar__me--none" type="button" data-claim>Vincular este móvil</button>`;
  }
  const me = playerById(state.me);
  if (!me) return '';
  return `<a class="bar__me" href="${href('jugador', me.id)}" aria-label="Tu perfil">
    ${avatar(me, 36)}
    <span class="bar__name">${esc(me.name.split(' ')[0])}</span>
  </a>`;
}

function renderShell() {
  shellReady = true;

  app.innerHTML = `<div class="shell">
    <header class="bar">
      <a class="bar__brand" href="${href('inicio')}">${WORDMARK}</a>
      <nav class="topnav" aria-label="Secciones">
        ${NAV.map((n) => `<a class="topnav__item" data-nav="${n.key}" href="${href(n.key)}">${n.label}</a>`).join('')}
      </nav>
      ${meChip()}
      <button class="bar__out" type="button" data-out>Salir</button>
    </header>

    <main id="view" class="viewHost"></main>

    <nav class="dock" aria-label="Navegación">
      ${NAV.map((n) => `<a class="dock__item" data-nav="${n.key}" href="${href(n.key)}">${n.label}</a>`).join('')}
    </nav>
  </div>`;

  app.querySelector('[data-claim]')?.addEventListener('click', () => {
    localStorage.removeItem(NO_PLAYER);
    shellReady = false;
    renderPick();
  });

  app.querySelector('[data-out]')?.addEventListener('click', async () => {
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
    const active =
      a.dataset.nav === route.name ||
      (route.name === 'jugador' && a.dataset.nav === 'plantilla') ||
      (route.name === 'inicio' && a.dataset.nav === 'inicio');
    a.classList.toggle('is-on', active);
    if (active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  host.innerHTML = '<div class="loading"><span></span></div>';

  // Datos al día en cada pantalla: las notas de los demás cambian entre visitas.
  await loadCore().catch(() => {});

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
        <h1 class="title">Algo ha fallado</h1>
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
  app.innerHTML = `<div class="gate">
    <div class="gate__head">${WORDMARK}</div>
    <div class="gate__panel">
      <h1 class="gate__h">No se pudo cargar</h1>
      <p class="hint">${esc(errorMessage(err))}</p>
      <button class="btn btn--acid" type="button" id="retry">Reintentar</button>
      <button class="btn btn--ghost" type="button" id="back">Volver al acceso</button>
    </div>
  </div>`;
  app.querySelector('#retry').addEventListener('click', () => location.reload());
  app.querySelector('#back').addEventListener('click', async () => {
    await signOut();
    location.reload();
  });
}
