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
  teamName,
  plural,
  timeLabel,
  kickoffDate,
  voteOpensLabel,
  votesOpen,
  localInputValue,
  localInputToISO,
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
        <header class="pagehead">
          <h1 class="title">Admin</h1>
          <p class="lede">Solo para quien gestiona el grupo.</p>
        </header>
        <form class="gatebox" id="adminGate">
          <h2 class="subhead">Contraseña de administrador</h2>
          <p class="hint">Es distinta de la del grupo. Se guarda solo en esta pestaña.</p>
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
    <header class="pagehead">
      <h1 class="title">Admin</h1>
      <p class="lede"><button class="more" type="button" data-lock>Bloquear el panel</button></p>
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
  const wildcards = players.filter((p) => p.can_vote === false).length;

  return `<form class="adminform" id="newPlayer">
      <h2 class="subhead">Añadir jugador</h2>
      <div class="adminform__row">
        <input class="input" name="name" placeholder="Nombre y apellido" required maxlength="60" autocomplete="off">
        <select class="input" name="kind" aria-label="Tipo de jugador">
          <option value="player">Vota</option>
          <option value="wildcard">Comodín</option>
        </select>
        <button class="btn btn--acid" type="submit">Añadir</button>
      </div>
      <p class="hint">Solo el nombre. Cada jugador elige su dorsal al entrar. Los comodines juegan y reciben nota, pero no votan ni entran a elegir dorsal.</p>
    </form>

    <p class="meta">${plural(players.length, 'jugador', 'jugadores')}, ${plural(wildcards, 'comodín', 'comodines')}</p>

    <ul class="adminlist">
      ${players
        .map(
          (p) => `<li class="adminrow" data-player="${esc(p.id)}">
            <div class="adminrow__pic">${photoBlock(p, 'ph--thumb')}</div>
            <div class="adminrow__who">
              <span class="adminrow__name">${esc(p.name)} <b>${p.shirt_number ? pad2(p.shirt_number) : ''}</b></span>
              <span class="adminrow__meta">
                ${p.active === false ? '<span class="chip chip--warn">Inactivo</span>' : '<span class="chip chip--dim">Activo</span>'}
                ${p.can_vote === false ? '<span class="chip chip--warn">Comodín</span>' : '<span class="chip chip--dim">Vota</span>'}
                ${p.device_hash ? '<span class="chip chip--acid">Con móvil</span>' : '<span class="chip chip--dim">Sin móvil</span>'}
                <span class="meta">Nota ${rating(p.stats?.avg_rating)}, ${plural(num(p.stats?.goals, 0), 'gol', 'goles')}</span>
              </span>
            </div>
            <div class="adminrow__actions">
              <button class="iconbtn" type="button" data-act="photo" title="Cambiar foto">Foto</button>
              <button class="iconbtn" type="button" data-act="number" title="Cambiar dorsal">Dorsal</button>
              <button class="iconbtn" type="button" data-act="rename" title="Renombrar">Renombrar</button>
              <button class="iconbtn" type="button" data-act="wildcard" title="Cambiar tipo">${p.can_vote === false ? 'Hacer votante' : 'Hacer comodín'}</button>
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
    const wildcard = form.kind.value === 'wildcard';
    if (!name) return;
    try {
      await adminRpc('admin_add_player', {
        p_pw: adminPassword(),
        p_name: name,
        p_can_vote: !wildcard,
      });
      toast(wildcard ? 'Comodín añadido' : 'Añadido. Al entrar, elegirá su dorsal');
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
      case 'wildcard':
        guard('admin_set_can_vote', {
          p_pw: adminPassword(),
          p_player: id,
          p_can_vote: player.can_vote === false,
        });
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
    subtitle: player.name,
    body: `<label class="field"><span class="field__label">Número del 1 al 99</span>
      <input class="input" type="number" min="1" max="99" value="${player.shirt_number ?? ''}" id="numInput" inputmode="numeric"></label>`,
    actions: [
      { label: 'Cancelar', variant: 'btn--ghost', onClick: () => s.close() },
      {
        label: 'Guardar',
        variant: 'btn--acid',
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
    subtitle: player.name,
    body: `<label class="field"><span class="field__label">Nombre</span>
      <input class="input" type="text" value="${esc(player.name)}" id="renameInput" maxlength="60"></label>`,
    actions: [
      { label: 'Cancelar', variant: 'btn--ghost', onClick: () => s.close() },
      {
        label: 'Guardar',
        variant: 'btn--acid',
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
      <h2 class="subhead">Nuevo partido</h2>
      <div class="adminform__row">
        <input class="input" type="date" name="date" value="${todayISO()}" required>
        <input class="input" type="time" name="time" value="21:00" step="300" required aria-label="Hora de inicio">
        <button class="btn btn--acid" type="submit">Crear</button>
      </div>
      <p class="hint">La votación abre una hora después de la hora de inicio. Los equipos se pueden poner antes, durante o después del partido.</p>
    </form>

    <ul class="adminlist">
      ${matches
        .map((m) => {
          const kick = kickoffDate(m);
          const openVotes = votesOpen(m);
          return `<li class="adminrow" data-match="${esc(m.id)}">
            <div class="adminrow__date"><b>${dateParts(m.played_on).day}</b>${dateParts(m.played_on).month}</div>
            <div class="adminrow__who">
              <span class="adminrow__name">Oscuros ${num(m.goals_a, 0)}, Claros ${num(m.goals_b, 0)}</span>
              <span class="adminrow__meta">
                <span class="chip ${m.status === 'open' ? 'chip--acid' : 'chip--dim'}">${m.status === 'open' ? 'Abierto' : 'Cerrado'}</span>
                <span class="chip chip--dim">${esc(kick ? timeLabel(kick) : 'sin hora')}</span>
                ${m.segments > 1 ? `<span class="chip chip--warn">${m.segments} tramos</span>` : ''}
                <span class="chip ${openVotes ? 'chip--acid' : 'chip--warn'}">${openVotes ? 'Votación abierta' : `Vota ${esc(voteOpensLabel(m))}`}</span>
                <span class="meta">${esc(longDate(m.played_on))}</span>
              </span>
            </div>
            <div class="adminrow__actions">
              <button class="iconbtn" type="button" data-mact="lineup">Alineación</button>
              <button class="iconbtn" type="button" data-mact="cut">¿Cambio de equipo?</button>
              <button class="iconbtn" type="button" data-mact="status">${m.status === 'open' ? 'Cerrar' : 'Reabrir'}</button>
              <button class="iconbtn" type="button" data-mact="date">Fecha y hora</button>
              <button class="iconbtn iconbtn--danger" type="button" data-mact="delete">Borrar</button>
            </div>
          </li>`;
        })
        .join('')}
    </ul>`;
}

function mountMatches(root) {
  root.querySelector('#newMatch')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const date = ev.target.date.value;
    const time = ev.target.time.value || '21:00';
    const kickoff = localInputToISO(`${date}T${time}`);
    try {
      await adminRpc('admin_create_match', { p_pw: adminPassword(), p_date: date, p_kickoff: kickoff });
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
      case 'cut':
        openLineup(match, { askSplit: true });
        break;
      case 'status':
        guard('admin_set_match_status', {
          p_pw: adminPassword(),
          p_match: match.id,
          p_status: match.status === 'open' ? 'closed' : 'open',
        });
        break;
      case 'date':
        askSchedule(match);
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

function askSchedule(match) {
  const s = sheet({
    title: 'Fecha y hora',
    subtitle: 'La votación abre una hora después del inicio',
    body: `<label class="field"><span class="field__label">Inicio programado</span>
      <input class="input" type="datetime-local" id="kickoffInput"
        value="${esc(localInputValue(kickoffDate(match)))}"></label>`,
    actions: [
      { label: 'Cancelar', variant: 'btn--ghost', onClick: () => s.close() },
      {
        label: 'Guardar',
        variant: 'btn--acid',
        onClick: async () => {
          const iso = localInputToISO(s.el.querySelector('#kickoffInput').value);
          if (!iso) return;
          try {
            await adminRpc('admin_set_match_kickoff', {
              p_pw: adminPassword(),
              p_match: match.id,
              p_kickoff: iso,
            });
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

/**
 * Editor de alineación. Trabaja sobre un tramo: si el partido tuvo cambios de
 * equipo hay pestañas para cada tramo y cada uno guarda sus equipos y goles.
 * `opts.askSplit` abre la pregunta «¿Hubo cambio de equipo?» directamente.
 */
async function openLineup(match, opts = {}) {
  const pw = adminPassword();
  const { matchDetail } = await import('./data.js');
  let detail = null;
  let current = 1;
  let askSplit = Boolean(opts.askSplit);

  const s = sheet({
    title: 'Alineación',
    subtitle: longDate(match.played_on),
    body: '<p class="hint">Cargando…</p>',
    actions: [
      { label: 'Cerrar', variant: 'btn--ghost', onClick: () => s.close() },
      {
        label: 'Guardar y cerrar',
        variant: 'btn--acid',
        onClick: () => {
          s.close();
          toast('Alineación guardada');
          loadCore().then(() => rerenderAdmin());
        },
      },
    ],
  });

  const sheetBody = s.el.querySelector('.sheet__body');
  const players = state.players.filter((p) => p.active !== false);

  /** Equipo y goles de cada jugador en cada tramo. */
  const stintIndex = () => {
    const map = new Map();
    (detail?.lineup || []).forEach((row) => {
      row.stints.forEach((st) => map.set(`${row.player_id}:${st.segment}`, st));
    });
    return map;
  };

  const totalGoals = (playerId) =>
    detail?.lineup.find((row) => row.player_id === playerId)?.goals ?? 0;

  const askBlock = () => `<div class="askcut">
      <b class="askcut__q">¿Hubo cambio de equipo?</b>
      <p class="hint">El partido se divide en tramos. Se copian los equipos actuales como punto de partida y desde ahí rebalanceas a quien haga falta. Los goles de cada tramo cuentan para el equipo con el que se marcaron.</p>
      <div class="askcut__row">
        <button class="btn btn--ghost btn--sm" type="button" data-ask="no">No hubo</button>
        <button class="btn btn--acid btn--sm" type="button" data-ask="yes">Sí, dividir</button>
      </div>
    </div>`;

  const render = () => {
    if (!detail) return;
    const idx = stintIndex();
    const total = detail.segmentCount || 1;
    const onPitch = players.filter((p) => idx.has(`${p.id}:${current}`)).length;
    const summary = detail.summary;

    const tabs =
      total > 1
        ? `<div class="seg seg--segments" role="tablist" aria-label="Tramos del partido">
            ${Array.from({ length: total }, (_, i) => i + 1)
              .map(
                (n) => `<button class="seg__btn${n === current ? ' is-on' : ''}" type="button" role="tab"
                  aria-selected="${n === current}" data-seg="${n}">${n === 1 ? 'Antes' : `Tramo ${n}`}</button>`
              )
              .join('')}
          </div>`
        : '';

    const rows = players
      .map((p) => {
        const st = idx.get(`${p.id}:${current}`);
        const prev = current > 1 ? idx.get(`${p.id}:${current - 1}`) : null;
        const moved = st && prev && st.team !== prev.team;
        const sum = totalGoals(p.id);
        return `<li class="lineupEdit__row" data-player="${esc(p.id)}">
            <span class="lineupEdit__name">${esc(p.name)}<b>${p.shirt_number ? pad2(p.shirt_number) : ''}</b>${p.can_vote === false ? '<i class="lineupEdit__tag">comodín</i>' : ''}${moved ? `<i class="lineupEdit__tag lineupEdit__tag--move">ahora ${esc(teamName(st.team))}</i>` : ''}</span>
            <span class="lineupEdit__ctrl">
              <span class="lineupEdit__teams">
                <button class="iconbtn${st?.team === 'A' ? ' is-on' : ''}" type="button" data-team="A">${teamName('A')}</button>
                <button class="iconbtn${st?.team === 'B' ? ' is-on' : ''}" type="button" data-team="B">${teamName('B')}</button>
                <button class="iconbtn${!st ? ' is-on' : ''}" type="button" data-team="">Fuera</button>
              </span>
              <span class="stepper" aria-label="Goles">
                <button class="iconbtn" type="button" data-goal="-1" aria-label="Quitar un gol">−</button>
                <b data-goals>${st?.goals ?? 0}</b>
                <button class="iconbtn" type="button" data-goal="1" aria-label="Añadir un gol">+</button>
              </span>
              ${total > 1 && sum > (st?.goals ?? 0) ? `<span class="lineupEdit__sum">total ${sum}</span>` : ''}
            </span>
          </li>`;
      })
      .join('');

    sheetBody.innerHTML = `
      ${tabs}
      ${askSplit ? askBlock() : ''}
      <div class="lineupTools">
        <span class="meta">${total > 1 ? `Tramo ${current} de ${total}` : 'Sin cambios de equipo'}, ${plural(onPitch, 'jugador', 'jugadores')} · Oscuros ${num(summary.goals_a, 0)}–${num(summary.goals_b, 0)} Claros</span>
        ${askSplit ? '' : `<button class="iconbtn" type="button" data-split>${total > 1 ? '¿Hubo otro cambio?' : '¿Hubo cambio de equipo?'}</button>`}
        ${total > 1 && !askSplit ? '<button class="iconbtn iconbtn--danger" type="button" data-undo title="Deshacer el último cambio de equipo">Deshacer cambio</button>' : ''}
      </div>
      <p class="hint">Elige equipo y goles de cada uno. Se guarda al instante, también con el partido cerrado.</p>
      <ul class="lineupEdit">${rows}</ul>`;
  };

  const reload = async (segment) => {
    detail = await matchDetail(match.id);
    const total = detail?.segmentCount || 1;
    current = Math.min(Math.max(1, segment ?? current), total);
    render();
  };

  try {
    await reload(opts.segment);
    // Al abrir, el tramo que interesa es el último: es donde se rebalancea.
    current = Math.min(opts.segment || detail.segmentCount || 1, detail.segmentCount || 1);
    render();
  } catch (e) {
    sheetBody.innerHTML = `<p class="formerr">${esc(errorMessage(e))}</p>`;
    return;
  }

  sheetBody.addEventListener('click', async (ev) => {
    const ask = ev.target.closest('[data-ask]');
    if (ask) {
      if (ask.dataset.ask === 'no') {
        askSplit = false;
        render();
        return;
      }
      try {
        const segment = await adminRpc('admin_split_match', { p_pw: pw, p_match: match.id });
        askSplit = false;
        await reload(segment);
        toast('Partido dividido: rebalancea los equipos');
      } catch (e) {
        toast(errorMessage(e), 'error');
      }
      return;
    }

    if (ev.target.closest('[data-split]')) {
      askSplit = true;
      render();
      return;
    }

    if (ev.target.closest('[data-undo]')) {
      try {
        await adminRpc('admin_remove_segment', { p_pw: pw, p_match: match.id });
        await reload(Math.max(1, current - 1));
        toast('Último cambio deshecho');
      } catch (e) {
        toast(errorMessage(e), 'error');
      }
      return;
    }

    const tab = ev.target.closest('[data-seg]');
    if (tab) {
      current = Number(tab.dataset.seg);
      render();
      return;
    }

    const row = ev.target.closest('.lineupEdit__row');
    if (!row) return;
    const playerId = row.dataset.player;
    const teamBtn = ev.target.closest('[data-team]');
    const goalBtn = ev.target.closest('[data-goal]');

    try {
      if (teamBtn) {
        await adminRpc('admin_set_lineup', {
          p_pw: pw,
          p_match: match.id,
          p_player: playerId,
          p_team: teamBtn.dataset.team || null,
          p_segment: current,
        });
        await reload();
      }

      if (goalBtn) {
        const st = stintIndex().get(`${playerId}:${current}`);
        if (!st) {
          toast('Asigna equipo antes de poner goles', 'error');
          return;
        }
        const next = Math.max(0, (st.goals || 0) + Number(goalBtn.dataset.goal));
        await adminRpc('admin_set_goals', {
          p_pw: pw,
          p_match: match.id,
          p_player: playerId,
          p_goals: next,
          p_segment: current,
        });
        await reload();
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
      <h2 class="subhead">Votaciones</h2>
      <div class="switchrow">
        <div>
          <b>Permitir votarse a uno mismo</b>
          <p class="hint">Si está desactivado, cada jugador solo puntúa a los demás.</p>
        </div>
        <button class="switch ${state.allowSelfVote ? 'is-on' : ''}" type="button" id="selfVote"
          role="switch" aria-checked="${state.allowSelfVote ? 'true' : 'false'}"><span></span></button>
      </div>
    </div>

    <form class="adminform" id="pwForm">
      <h2 class="subhead">Contraseña de admin</h2>
      <div class="adminform__row">
        <input class="input" type="password" name="current" placeholder="Actual" autocomplete="current-password" required>
        <input class="input" type="password" name="next" placeholder="Nueva" autocomplete="new-password" minlength="8" required>
        <button class="btn btn--acid" type="submit">Cambiar</button>
      </div>
      <p class="hint">Solo afecta a la administración. La contraseña del grupo se gestiona en Supabase.</p>
    </form>

    <div class="adminform">
      <h2 class="subhead">Fotos de los jugadores</h2>
      <p class="hint">Se suben desde la pestaña Jugadores, con el botón Foto de cada fila.</p>
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
      { label: 'Cancelar', variant: 'btn--ghost', onClick: () => s.close() },
      {
        label: 'Confirmar',
        variant: 'btn--danger',
        onClick: () => {
          s.close();
          onYes();
        },
      },
    ],
  });
}
