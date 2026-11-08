import { isConfigured, getConfig } from './config.js';
import { state, esc, pad2, photoBlock, avatar, toast, errorMessage, parseRoute, href, stagger, animateCounts } from './core.js';
import { signIn, signOut, session, loadCore, whoAmI, claimPlayer, takenNumbers, playerById, subscribeLive } from './data.js';
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
  window.scrollTo(0, 0);
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

/**
 * Jugadores que salen en «¿Quién eres?»: los libres, y los comodines solo si el
 * admin lo permite. Con el bloqueo activo, quien ya está cogido no aparece.
 */
function pickCandidates() {
  const lock = state.claimLocked !== false;
  return state.players.filter(
    (p) =>
      p.active !== false &&
      (p.can_vote !== false || state.wildcardsPickable === true) &&
      (!lock || !p.device_hash)
  );
}

function renderPick() {
  window.scrollTo(0, 0);
  const players = pickCandidates();
  const wildcards = state.players.filter((p) => p.active !== false && p.can_vote === false).length;

  app.innerHTML = `<div class="pick">
    <header class="pick__head">
      ${WORDMARK}
      <h1 class="title">¿Quién eres?</h1>
      <p class="lede">Toca tu nombre y elige dorsal. Este móvil quedará vinculado a ti para votar; si te equivocas, el admin puede liberarlo.</p>
      ${
        wildcards && state.wildcardsPickable !== true
          ? `<p class="hint">${wildcards === 1 ? 'Hay un comodín' : `Hay ${wildcards} comodines`} en la plantilla: juegan cuando falta gente, no votan y no salen en esta lista.</p>`
          : ''
      }
    </header>
    ${
      players.length
        ? `<div class="squad">
            ${players
              .map(
                (p) => `<button class="scard" type="button" data-pick="${esc(p.id)}">
                  <span class="scard__photo">${photoBlock(p)}${p.shirt_number ? `<span class="scard__num">${pad2(p.shirt_number)}</span>` : ''}</span>
                  <b class="scard__name">${esc(p.name)}</b>
                  <span class="scard__stat">${p.device_hash ? 'Cogido · se puede cambiar' : 'Libre'}</span>
                </button>`
              )
              .join('')}
          </div>`
        : `<p class="hint">${
            state.players.some((p) => p.active !== false && p.device_hash)
              ? 'Todos los jugadores ya están cogidos. Pide al admin que libere el tuyo.'
              : 'No hay jugadores todavía. Pide al admin que los añada.'
          }</p>`
    }
    <footer class="pick__foot">
      <button class="btn btn--ghost" type="button" id="pickSkip">Solo ver y administrar</button>
      <button class="btn btn--ghost" type="button" id="pickOut">Salir</button>
    </footer>
  </div>`;

  app.querySelectorAll('[data-pick]').forEach((btn) => {
    btn.addEventListener('click', () => {
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
  window.scrollTo(0, 0);
  const taken = takenNumbers(player.id);
  const takenList = [...taken].sort((a, b) => a - b).map((n) => pad2(n)).join(', ');

  app.innerHTML = `<div class="pick pick--num">
    <header class="pick__head">
      ${WORDMARK}
      <h1 class="title">Tu dorsal</h1>
      <div class="pickstep">
        ${avatar(player, 52)}
        <span class="pickstep__txt">
          <b>${esc(player.name)}</b>
          <span class="hint">Escribe un número del 1 al 99. Quedará a tu nombre.</span>
        </span>
      </div>
    </header>
    <form id="numForm" class="numform" novalidate>
      <label class="field">
        <span class="field__label">Dorsal</span>
        <input class="input input--num" id="numInput" name="num" type="text" inputmode="numeric"
          autocomplete="off" maxlength="2" placeholder="00">
      </label>
      <p class="formerr" id="numErr" hidden></p>
      <p class="hint">${takenList ? `Ya están cogidos: ${esc(takenList)}` : 'Todos los dorsales están libres.'}</p>
      <div class="pick__bar">
        <button class="btn btn--ghost" type="button" id="numBack">Cambiar jugador</button>
        <button class="btn btn--acid" type="submit" id="numGo">Confirmar dorsal</button>
      </div>
    </form>
  </div>`;

  const form = app.querySelector('#numForm');
  const input = app.querySelector('#numInput');
  const err = app.querySelector('#numErr');
  const go = app.querySelector('#numGo');
  const back = app.querySelector('#numBack');

  input.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '').slice(0, 2);
    err.hidden = true;
  });

  back.addEventListener('click', () => renderPick());

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const raw = input.value.trim();
    const n = Number(raw);
    const fail = (msg) => {
      err.hidden = false;
      err.textContent = msg;
      input.focus();
    };
    if (!/^\d{1,2}$/.test(raw) || n < 1 || n > 99) return fail('Escribe un número entre 1 y 99.');
    if (taken.has(n)) return fail(`El ${pad2(n)} ya lo tiene otro. Elige otro.`);

    go.disabled = true;
    back.disabled = true;
    go.textContent = 'Guardando…';
    try {
      await claimPlayer(player.id, n);
    } catch (e) {
      go.disabled = false;
      back.disabled = false;
      go.textContent = 'Confirmar dorsal';
      await loadCore().catch(() => {});
      return fail(errorMessage(e));
    }
    localStorage.removeItem(NO_PLAYER);
    try {
      await loadCore();
    } catch {
      /* el shell vuelve a cargar al entrar */
    }
    state.me = player.id;
    toast(`El ${pad2(n)} es tu dorsal. Ya puedes votar.`);
    shellReady = false;
    renderShell();
  });

  input.focus({ preventScroll: true });
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

  // Enlace directo de vinculación: #/vincular/<id>. Se limpia la dirección para que no quede
  // en la barra ni llegue a la navegación normal.
  const link = parseRoute();
  const linkedPlayer =
    link.name === 'vincular' ? state.players.find((p) => p.id === link.id) || null : null;
  if (link.name === 'vincular') {
    history.replaceState(null, '', location.pathname + location.search);
  }

  if (!state.me && linkedPlayer && linkedPlayer.active !== false && !linkedPlayer.device_hash) {
    return renderNumberStep(linkedPlayer);
  }

  if (!state.me) {
    if (localStorage.getItem(NO_PLAYER) === '1') {
      renderShell();
      return;
    }
    // Sin nadie a quien elegir (plantilla vacía o todos cogidos) se entra directo.
    if (!pickCandidates().length) {
      renderShell();
      return;
    }
    return renderPick();
  }

  renderShell();
  startLive();
}

/**
 * Los votos y partidos llegan en directo. Si hay una hoja abierta (p. ej. el admin
 * editando un voto) no se repinta la pantalla para no cerrarla a mitad de la acción.
 */
function startLive() {
  subscribeLive(() => refreshRoute());
}

/** Refresco por cambios de otros: sin subir al principio ni repetir la entrada. */
async function refreshRoute() {
  if (document.querySelector('.sheet')) return;
  // No pisar un formulario a medio rellenar (p. ej. en Admin).
  const active = document.activeElement;
  if (active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) return;
  renderRoute({ animate: false, scroll: false });
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
  window.scrollTo(0, 0);
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
      if (shellReady) renderRoute({ transition: true });
    });
  }

  renderRoute();
}

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */

function reduceMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

async function renderRoute({ animate = true, scroll = true, transition = false } = {}) {
  const route = parseRoute();
  const host = document.getElementById('view');
  if (!host) return;

  const useTransition =
    transition && animate && typeof document.startViewTransition === 'function' && !reduceMotion();

  document.querySelectorAll('[data-nav]').forEach((a) => {
    const active =
      a.dataset.nav === route.name ||
      (route.name === 'jugador' && a.dataset.nav === 'plantilla') ||
      (route.name === 'inicio' && a.dataset.nav === 'inicio');
    a.classList.toggle('is-on', active);
    if (active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  if (animate && !useTransition) host.innerHTML = '<div class="loading"><span></span></div>';

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

  const paint = () => {
    // Con View Transition la vista nueva debe estar ya asentada para la captura.
    host.classList.toggle('is-quiet', !animate || useTransition);
    host.innerHTML = view.html;
    try {
      view.mount?.(host);
    } catch (err) {
      console.error(err);
    }
    if (animate && !useTransition) {
      stagger(host);
      animateCounts(host);
    }
    if (scroll) window.scrollTo(0, 0);
  };

  if (useTransition) {
    let painted = false;
    const run = () => {
      painted = true;
      paint();
    };
    try {
      await document.startViewTransition(run).updateCallbackDone;
    } catch {
      // Si el navegador cancela la transición, el cambio ya se ha hecho.
      if (!painted) paint();
    }
  } else {
    paint();
  }
}

/* ------------------------------------------------------------------ */
/* Error fatal                                                         */
/* ------------------------------------------------------------------ */

function renderFatal(err) {
  window.scrollTo(0, 0);
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
