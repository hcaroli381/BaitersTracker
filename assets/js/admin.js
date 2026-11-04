import {
  state,
  esc,
  pad2,
  num,
  rating,
  longDate,
  dateParts,
  todayISO,
  photoBlock,
  initials,
  sheet,
  toast,
  errorMessage,
  href,
} from './core.js';
import { KEYS } from './config.js';
import { adminRpc, checkAdmin, uploadPlayerPhoto, clearPlayerPhoto, loadCore, playerById } from './data.js';

let tab = 'jugadores';

export function adminPassword() {
  return sessionStorage.getItem(KEYS.admin) || '';
}

function setPassword(pw) {
  if (pw) sessionStorage.setItem(KEYS.admin, pw);
  else sessionStorage.removeItem(KEYS.admin);
}

/* ------------------------------------------------------------------ */
/* Entrada                                                             */
/* ------------------------------------------------------------------ */

export async function adminView() {
  const pw = adminPassword();

  if (!pw) {
    return {
      html: `<div class="view">
        <header class="page-head">
          <div class="page-head__meta"><span class="kicker">Solo administración</span></div>
          <h1 class="page-title">ZONA <span class="outline">ADMIN</span></h1>
        </header>
        <form class="gatebox" id="adminGate">
          <p class="kicker">Contraseña de administrador</p>
          <p class="hint">Independiente de la contraseña del grupo. Se guarda solo en esta pestaña.</p>
          <input class="input" type="password" name="pw" autocomplete="current-password" placeholder="Contraseña" required>
          <button class="btn btn--acid" type="submit">Desbloquear</button>
          <p class="formerr" id="gateErr" hidden></p>
        </form>
      </div>`,
      mount(root) {
        root.querySelector('#adminGate').addEventListener('submit', async (ev) => {
          ev.preventDefault();
          const value = ev.target.pw.value;
          const err = root.querySelector('#gateErr');
          try {
            await checkAdmin(value);
            setPassword(value);
            rerenderAdmin();
          } catch (e) {
            err.hidden = false;
            err.textContent = errorMessage(e);
          }
        });
      },
    };
  }

  return adminPanel();
}

function rerenderAdmin() {
  adminView().then((v) => {
    const host = document.querySelector('#view');
    if (!host) return;
    host.innerHTML = v.html;
    v.mount(host);
  });
}

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

async function adminPanel() {
  await loadCore().catch(() => {});
  const players = state.players;
  const matches = state.matches;

  const html = `<div class="view">
    <header class="page-head">
      <div class="page-head__meta">
        <span class="kicker">Administración</span>
        <button class="link link--mini" type="button" data-lock>Cerrar sesión admin</button>
      </div>
      <h1 class="page-title">ZONA <span class="outline">ADMIN</span></h1>
    </header>

    <div class="seg seg--admin" role="tablist">
      <button class="seg__btn${tab === 'jugadores' ? ' is-on' : ''}" data-tab="jugadores" type="button">Jugadores</button>
      <button class="seg__btn${tab === 'partidos' ? ' is-on' : ''}" data-tab="partidos" type="button">Partidos</button>
      <button class="seg__btn${tab === 'ajustes' ? ' is-on' : ''}" data-tab="ajustes" type="button">Ajustes</button>
    </div>

    <section class="admin" id="adminBody">
      ${
        tab === 'jugadores'
          ? playersTab(players)
          : tab === 'partidos'
          ? matchesTab(matches)
          : settingsTab()
      }
    </section>
  </div>`;

  return {
    html,
    mount(root) {
      root.querySelectorAll('[data-tab]').forEach((btn) =>
        btn.addEventListener('click', () => {
          tab = btn.dataset.tab;
          rerenderAdmin();
        })
      );

      root.querySelector('[data-lock]')?.addEventListener('click', () => {
        setPassword('');
        toast('Admin bloqueado');
        rerenderAdmin();
      });

      if (tab === 'jugadores') mountPlayers(root);
      if (tab === 'partidos') mountMatches(root);
      if (tab === 'ajustes') mountSettings(root);
    },
  };
}

/* ------------------------------------------------------------------ */
/* Jugadores                                                           */
/* ------------------------------------------------------------------ */

function playersTab(players) {
  return `<form class="adminform" id="newPlayer">
      <p class="kicker">Añadir jugador</p>
      <div class="adminform__row">
        <input class="input" name="name" placeholder="Nombre y apellido" required maxlength="60" autocomplete="off">
        <input class="input input--num" name="number" type="number" min="1" max="99" placeholder="Dorsal" inputmode="numeric">
        <button class="btn btn--acid" type="submit">Añadir</button>
      </div>
    </form>

    <ul class="adminlist">
      ${players
        .map(
          (p) => `<li class="adminrow" data-player="${esc(p.id)}">
            <div class="adminrow__pic">${photoBlock(p, 'ph--thumb')}</div>
            <div class="adminrow__who">
              <span class="adminrow__name">${esc(p.name)} <b>${p.shirt_number ? pad2(p.shirt_number) : '—'}</b></span>
              <span class="adminrow__meta">
                ${p.active === false ? '<span class="chip chip--warn">Inactivo</span>' : '<span class="chip chip--dim">Activo</span>'}
                ${p.device_hash ? '<span class="chip chip--acid">Con móvil</span>' : '<span class="chip chip--dim">Sin móvil</span>'}
                <span class="mono mono--dim">${rating(p.stats?.avg_rating)} · ${num(p.stats?.goals, 0)} G</span>
              </span>
            </div>
            <div class="adminrow__actions">
              <button class="iconbtn" type="button" data-act="photo" title="Cambiar foto">Foto</button>
              <button class="iconbtn" type="button" data-act="number" title="Cambiar dorsal">#</button>
              <button class="iconbtn" type="button" data-act="rename" title="Renombrar">Nombre</button>
              <button class="iconbtn" type="button" data-act="toggle" title="Activar o desactivar">${p.active === false ? 'Activar' : 'Ocultar'}</button>
              ${p.device_hash ? `<button class="iconbtn" type="button" data-act="release" title="Liberar dispositivo">Liberar</button>` : ''}
              <button class="iconbtn iconbtn--danger" type="button" data-act="delete" title="Eliminar">Borrar</button>
            </div>
          </li>`
        )
        .join('')}
    </ul>

    <input type="file" id="photoPicker" accept="image/jpeg,image/png,image/webp" hidden>`;
}

function mountPlayers(root) {
  const picker = root.querySelector('#photoPicker');
  let target = null;

  root.querySelector('#newPlayer')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const form = ev.target;
    const name = form.name.value.trim();
    const number = form.number.value ? Number(form.number.value) : null;
    if (!name) return;
    try {
      const id = await adminRpc('admin_add_player', { p_pw: adminPassword(), p_name: name });
      if (number) await adminRpc('admin_set_number', { p_pw: adminPassword(), p_player: id, p_number: number });
      toast('Jugador añadido');
      rerenderAdmin();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  });

  picker.addEventListener('change', async () => {
    const file = picker.files?.[0];
    picker.value = '';
    if (!file || !target) return;
    toast('Subiendo foto…');
    try {
      await uploadPlayerPhoto(target, file, adminPassword());
      toast('Foto actualizada');
      rerenderAdmin();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  });

  root.querySelector('#adminBody').addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-act]');
    if (!btn) return;
    const row = btn.closest('[data-player]');
    const id = row?.dataset.player;
    const player = playerById(id);
    if (!player) return;

    switch (btn.dataset.act) {
      case 'photo':
        target = id;
        picker.click();
        break;
      case 'number':
        askNumber(player);
        break;
      case 'rename':
        askRename(player);
        break;
      case 'toggle':
        guard('admin_set_player_active', {
          p_pw: adminPassword(),
          p_player: id,
          p_active: player.active === false,
        });
        break;
      case 'release':
        confirmAction('Liberar dispositivo', `¿Quitar el móvil asignado a ${player.name}? Podrá elegir jugador de nuevo.`, () =>
          guard('admin_release_player', { p_pw: adminPassword(), p_player: id })
        );
        break;
      case 'delete':
        confirmAction('Eliminar jugador', `Se borrarán ${player.name} y todas sus apariciones. Esta acción no se puede deshacer.`, () =>
          guard('admin_delete_player', { p_pw: adminPassword(), p_player: id })
        );
        break;
      default:
        break;
    }
  });
}

function askNumber(player) {
  const s = sheet({
    title: 'Dorsal',
    kicker: player.name,
    body: `<label class="field"><span class="kicker">Número (1–99)</span>
      <input class="input" type="number" min="1" max="99" value="${player.shirt_number ?? ''}" id="numInput" inputmode="numeric"></label>`,
    actions: [
      { label: 'Cancelar', variant: 'ghost', onClick: () => s.close() },
      {
        label: 'Guardar',
        variant: 'acid',
        onClick: async () => {
          const value = s.el.querySelector('#numInput').value;
          try {
            await adminRpc('admin_set_number', {
              p_pw: adminPassword(),
              p_player: player.id,
              p_number: value ? Number(value) : null,
            });
            s.close();
            toast('Dorsal actualizado');
            rerenderAdmin();
          } catch (e) {
            toast(errorMessage(e), 'error');
          }
        },
      },
    ],
  });
}

function askRename(player) {
  const s = sheet({
    title: 'Renombrar',
    kicker: player.name,
    body: `<label class="field"><span class="kicker">Nombre</span>
      <input class="input" type="text" value="${esc(player.name)}" id="renameInput" maxlength="60"></label>`,
    actions: [
      { label: 'Cancelar', variant: 'ghost', onClick: () => s.close() },
      {
        label: 'Guardar',
        variant: 'acid',
        onClick: async () => {
          const value = s.el.querySelector('#renameInput').value.trim();
          if (!value) return;
          try {
            await adminRpc('admin_rename_player', { p_pw: adminPassword(), p_player: player.id, p_name: value });
            s.close();
            toast('Nombre actualizado');
            rerenderAdmin();
          } catch (e) {
            toast(errorMessage(e), 'error');
          }
        },
      },
    ],
  });
}

/* ------------------------------------------------------------------ */
/* Partidos                                                            */
/* ------------------------------------------------------------------ */

function matchesTab(matches) {
  return `<form class="adminform" id="newMatch">
      <p class="kicker">Nuevo partido</p>
      <div class="adminform__row">
        <input class="input" type="date" name="date" value="${todayISO()}" required>
        <button class="btn btn--acid" type="submit">Crear</button>
      </div>
    </form>

    <ul class="adminlist">
      ${matches
        .map(
          (m) => `<li class="adminrow" data-match="${esc(m.id)}">
            <div class="adminrow__date"><b>${dateParts(m.played_on).day}</b>${dateParts(m.played_on).month}</div>
            <div class="adminrow__who">
              <span class="adminrow__name">${num(m.goals_a, 0)} — ${num(m.goals_b, 0)}</span>
              <span class="adminrow__meta">
                <span class="chip ${m.status === 'open' ? 'chip--acid' : 'chip--dim'}">${m.status === 'open' ? 'Abierto' : 'Cerrado'}</span>
                <span class="mono mono--dim">${esc(longDate(m.played_on))}</span>
              </span>
            </div>
            <div class="adminrow__actions">
              <button class="iconbtn" type="button" data-mact="lineup">Alineación</button>
              <button class="iconbtn" type="button" data-mact="status">${m.status === 'open' ? 'Cerrar' : 'Reabrir'}</button>
              <button class="iconbtn" type="button" data-mact="date">Fecha</button>
              <button class="iconbtn iconbtn--danger" type="button" data-mact="delete">Borrar</button>
            </div>
          </li>`
        )
        .join('')}
    </ul>`;
}

function mountMatches(root) {
  root.querySelector('#newMatch')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const date = ev.target.date.value;
    try {
      await adminRpc('admin_create_match', { p_pw: adminPassword(), p_date: date });
      toast('Partido creado');
      rerenderAdmin();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  });

  root.querySelector('#adminBody').addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-mact]');
    if (!btn) return;
    const row = btn.closest('[data-match]');
    const match = state.matches.find((m) => m.id === row?.dataset.match);
    if (!match) return;

    switch (btn.dataset.mact) {
      case 'lineup':
        openLineup(match);
        break;
      case 'status':
        guard('admin_set_match_status', {
          p_pw: adminPassword(),
          p_match: match.id,
          p_status: match.status === 'open' ? 'closed' : 'open',
        });
        break;
      case 'date':
        askDate(match);
        break;
      case 'delete':
        confirmAction('Eliminar partido', 'Se borrarán alineaciones, goles y votos de ese partido.', () =>
          guard('admin_delete_match', { p_pw: adminPassword(), p_match: match.id })
        );
        break;
      default:
        break;
    }
  });
}

function askDate(match) {
  const s = sheet({
    title: 'Fecha del partido',
    body: `<label class="field"><span class="kicker">Día</span>
      <input class="input" type="date" id="dateInput" value="${esc(match.played_on)}"></label>`,
    actions: [
      { label: 'Cancelar', variant: 'ghost', onClick: () => s.close() },
      {
        label: 'Guardar',
        variant: 'acid',
        onClick: async () => {
          const value = s.el.querySelector('#dateInput').value;
          if (!value) return;
          try {
            await adminRpc('admin_set_match_date', { p_pw: adminPassword(), p_match: match.id, p_date: value });
            s.close();
            toast('Fecha actualizada');
            rerenderAdmin();
          } catch (e) {
            toast(errorMessage(e), 'error');
          }
        },
      },
    ],
  });
}

async function openLineup(match) {
  const s = sheet({
    title: 'Alineación',
    kicker: longDate(match.played_on),
    body: '<p class="hint">Cargando…</p>',
    actions: [
      { label: 'Cerrar', variant: 'ghost', onClick: () => s.close() },
      {
        label: 'Guardar y cerrar',
        variant: 'acid',
        onClick: () => {
          s.close();
          toast('Alineación guardada');
          loadCore().then(() => rerenderAdmin());
        },
      },
    ],
  });

  const { matchDetail } = await import('./data.js');
  let detail;
  try {
    detail = await matchDetail(match.id);
  } catch (e) {
    s.el.querySelector('.sheet__body').innerHTML = `<p class="formerr">${esc(errorMessage(e))}</p>`;
    return;
  }

  const assigned = new Map((detail?.lineup || []).map((l) => [l.player_id, l]));
  const pw = adminPassword();
  const players = state.players.filter((p) => p.active !== false);

  const body = `<p class="hint">Marca equipo y goles. Se guarda al instante.</p>
    <ul class="lineupEdit">
      ${players
        .map((p) => {
          const row = assigned.get(p.id);
          return `<li class="lineupEdit__row" data-player="${esc(p.id)}">
            <span class="lineupEdit__name">${esc(p.name)}<b>${p.shirt_number ? pad2(p.shirt_number) : ''}</b></span>
            <span class="lineupEdit__teams">
              <button class="iconbtn${row?.team === 'A' ? ' is-on' : ''}" type="button" data-team="A">A</button>
              <button class="iconbtn${row?.team === 'B' ? ' is-on' : ''}" type="button" data-team="B">B</button>
              <button class="iconbtn${!row ? ' is-on' : ''}" type="button" data-team="">—</button>
            </span>
            <span class="stepper">
              <button class="iconbtn" type="button" data-goal="-1">−</button>
              <b data-goals>${row?.goals ?? 0}</b>
              <button class="iconbtn" type="button" data-goal="1">+</button>
            </span>
          </li>`;
        })
        .join('')}
    </ul>`;

  const sheetBody = s.el.querySelector('.sheet__body');
  sheetBody.innerHTML = body;

  const goals = new Map(players.map((p) => [p.id, assigned.get(p.id)?.goals ?? 0]));
  const teams = new Map(players.map((p) => [p.id, assigned.get(p.id)?.team ?? null]));

  sheetBody.addEventListener('click', async (ev) => {
    const row = ev.target.closest('.lineupEdit__row');
    if (!row) return;
    const playerId = row.dataset.player;

    const teamBtn = ev.target.closest('[data-team]');
    const goalBtn = ev.target.closest('[data-goal]');

    try {
      if (teamBtn) {
        const team = teamBtn.dataset.team;
        if (!team) {
          teams.delete(playerId);
        } else {
          teams.set(playerId, team);
        }
        row.querySelectorAll('[data-team]').forEach((b) => b.classList.toggle('is-on', b === teamBtn));
        await adminRpc('admin_set_lineup', {
          p_pw: pw,
          p_match: match.id,
          p_player: playerId,
          p_team: team || null,
        });
      }

      if (goalBtn) {
        if (!teams.get(playerId)) {
          toast('Asigna equipo antes de poner goles', 'error');
          return;
        }
        const next = Math.max(0, (goals.get(playerId) || 0) + Number(goalBtn.dataset.goal));
        goals.set(playerId, next);
        row.querySelector('[data-goals]').textContent = next;
        await adminRpc('admin_set_goals', {
          p_pw: pw,
          p_match: match.id,
          p_player: playerId,
          p_goals: next,
        });
      }
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  });
}

/* ------------------------------------------------------------------ */
/* Ajustes                                                             */
/* ------------------------------------------------------------------ */

function settingsTab() {
  return `<div class="adminform">
      <p class="kicker">Votaciones</p>
      <div class="switchrow">
        <div>
          <b>Permitir votarse a uno mismo</b>
          <p class="hint">Si está desactivado, cada jugador puntúa a los demás.</p>
        </div>
        <button class="switch ${state.allowSelfVote ? 'is-on' : ''}" type="button" id="selfVote"
          role="switch" aria-checked="${state.allowSelfVote ? 'true' : 'false'}"><span></span></button>
      </div>
    </div>

    <form class="adminform" id="pwForm">
      <p class="kicker">Contraseña de admin</p>
      <div class="adminform__row">
        <input class="input" type="password" name="current" placeholder="Actual" autocomplete="current-password" required>
        <input class="input" type="password" name="next" placeholder="Nueva" autocomplete="new-password" minlength="8" required>
        <button class="btn btn--acid" type="submit">Cambiar</button>
      </div>
      <p class="hint">Solo afecta a la administración. La contraseña del grupo se gestiona en Supabase.</p>
    </form>

    <div class="adminform">
      <p class="kicker">Foto de jugador</p>
      <p class="hint">Las imágenes se suben a Supabase Storage (bucket <code>player-photos</code>) y se quedan asociadas al jugador para todo el histórico.</p>
    </div>`;
}

function mountSettings(root) {
  root.querySelector('#selfVote')?.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    const next = !(state.allowSelfVote === true);
    try {
      await adminRpc('admin_set_allow_self_vote', { p_pw: adminPassword(), p_value: next });
      state.allowSelfVote = next;
      btn.classList.toggle('is-on', next);
      btn.setAttribute('aria-checked', String(next));
      toast(next ? 'Autovoto permitido' : 'Autovoto bloqueado');
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  });

  root.querySelector('#pwForm')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const form = ev.target;
    try {
      await adminRpc('admin_change_password', {
        p_pw: form.current.value,
        p_new: form.next.value,
      });
      setPassword(form.next.value);
      form.reset();
      toast('Contraseña de admin actualizada');
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  });
}

/* ------------------------------------------------------------------ */
/* Helpers de acción                                                   */
/* ------------------------------------------------------------------ */

async function guard(rpc, args) {
  try {
    await adminRpc(rpc, args);
    toast('Hecho');
    await loadCore();
    rerenderAdmin();
  } catch (e) {
    toast(errorMessage(e), 'error');
  }
}

function confirmAction(title, text, onYes) {
  const s = sheet({
    title,
    body: `<p class="hint">${esc(text)}</p>`,
    actions: [
      { label: 'Cancelar', variant: 'ghost', onClick: () => s.close() },
      {
        label: 'Confirmar',
        variant: 'danger',
        onClick: () => {
          s.close();
          onYes();
        },
      },
    ],
  });
}
