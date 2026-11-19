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
  msUntilVotesOpen,
  localInputValue,
  localInputToISO,
} from './core.js';
import { KEYS } from './config.js';
import {
  adminRpc,
  checkAdmin,
  uploadPlayerPhoto,
  clearPlayerPhoto,
  loadCore,
  playerById,
  loadMatchVotes,
  loadMatchPlayerIds,
} from './data.js';

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
          <h2 class="subhead" id="adminPasswordLabel">Contraseña de administrador</h2>
          <p class="hint">Es distinta de la del grupo. Se guarda solo en esta pestaña.</p>
          <input class="input" type="password" name="pw" autocomplete="current-password" aria-labelledby="adminPasswordLabel" required>
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
      await uploadPlayerPhoto(target, file, adminPassword(), playerById(target)?.avatar_path ?? null);
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
              <span class="adminrow__name">${msUntilVotesOpen(m) ? 'Marcador pendiente' : `Oscuros ${num(m.goals_a, 0)}, Claros ${num(m.goals_b, 0)}`}</span>
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
              <button class="iconbtn" type="button" data-mact="votes">Votos</button>
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
      case 'votes':
        openVotes(match);
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

/**
 * Gestión de votos de un partido: ver, cambiar o quitar notas.
 * Usa las RPC admin_set_vote y admin_delete_vote (las mismas reglas de la base).
 */
async function openVotes(match) {
  const s = sheet({
    title: 'Votos',
    subtitle: longDate(match.played_on),
    body: '<p class="hint">Cargando votos…</p>',
    actions: [{ label: 'Cerrar', variant: 'btn--ghost', onClick: () => s.close() }],
  });

  let votes;
  let playerIds;
  try {
    [votes, playerIds] = await Promise.all([loadMatchVotes(match.id), loadMatchPlayerIds(match.id)]);
  } catch (e) {
    s.el.querySelector('.sheet__body').innerHTML = `<p class="formerr">${esc(errorMessage(e))}</p>`;
    return;
  }

  const name = (id) => playerById(id)?.name ?? 'Jugador';
  const ordered = [...playerIds].sort((a, b) => name(a).localeCompare(name(b), 'es'));
  const options = (selected = null) =>
    ordered.map((id) => `<option value="${esc(id)}" ${id === selected ? 'selected' : ''}>${esc(name(id))}</option>`).join('');

  const rows = votes
    .slice()
    .sort((a, b) => name(a.voter_id).localeCompare(name(b.voter_id), 'es') || name(a.target_id).localeCompare(name(b.target_id), 'es'))
    .map(
      (v) => `<li class="adminrow" data-vote="${esc(v.id)}">
        <div class="adminrow__who">
          <span class="adminrow__name">${esc(name(v.voter_id))} → ${esc(name(v.target_id))}</span>
          <span class="adminrow__meta"><span class="chip chip--acid">${esc(String(v.score))}</span></span>
        </div>
        <div class="adminrow__actions">
          <button class="iconbtn iconbtn--danger" type="button" data-vact="delete">Quitar</button>
        </div>
      </li>`
    )
    .join('');

  const body = `
    <ul class="adminlist">${rows || '<li class="hint">Aún no hay votos en este partido.</li>'}</ul>
    <form class="adminform" id="voteForm">
      <h2 class="subhead">Poner o cambiar un voto</h2>
      <label class="field"><span class="field__label">Quién vota</span>
        <select class="input" name="voter" required>${options()}</select></label>
      <label class="field"><span class="field__label">A quién</span>
        <select class="input" name="target" required>${options()}</select></label>
      <label class="field"><span class="field__label">Nota (1 a 10)</span>
        <input class="input" name="score" type="number" min="1" max="10" step="1" value="7" required></label>
      <p class="hint">Si ya existe ese voto, se cambia la nota. Los dos jugadores deben estar en la alineación.</p>
      <button class="btn btn--acid" type="submit">Guardar voto</button>
    </form>`;
  s.el.querySelector('.sheet__body').innerHTML = body;

  const reopen = () => {
    s.close();
    openVotes(match);
  };

  s.el.querySelector('.sheet__body').addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-vact]');
    if (!btn) return;
    const id = btn.closest('[data-vote]')?.dataset.vote;
    if (!id) return;
    try {
      await adminRpc('admin_delete_vote', { p_pw: adminPassword(), p_vote: id });
      toast('Voto quitado');
      reopen();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  });

  s.el.querySelector('#voteForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const form = ev.target;
    const voter = form.voter.value;
    const target = form.target.value;
    const score = Number(form.score.value);
    if (voter === target) {
      toast('Un jugador no puede votarse a sí mismo desde aquí', 'error');
      return;
    }
    try {
      await adminRpc('admin_set_vote', {
        p_pw: adminPassword(),
        p_match: match.id,
        p_voter: voter,
        p_target: target,
        p_score: score,
      });
      toast('Voto guardado');
      reopen();
    } catch (e) {
      toast(errorMessage(e), 'error');
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
  let selectedTeam = 'A';
  let playerSearch = '';
  const goalDrafts = new Map();
  let savingGoal = false;
  let goalRefreshFailed = false;
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
          if (savingGoal || goalRefreshFailed) return;
          if (goalDrafts.size) {
            toast('Guarda los goles pendientes antes de cerrar', 'error');
            return;
          }
          s.close();
          toast('Alineación guardada');
          rerenderAdmin();
        },
      },
    ],
  });

  const sheetBody = s.el.querySelector('.sheet__body');
  const saveButton = s.el.querySelector('.sheet__foot .btn--acid');
  const players = state.players.filter((p) => p.active !== false);

  const normalizeName = (value) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const playerNames = new Map(players.map((player) => [player.id, normalizeName(player.name)]));

  const filterPlayers = () => {
    const query = normalizeName(playerSearch.trim());
    let hasMatches = false;
    for (const row of sheetBody.querySelectorAll('.lineupEdit__row')) {
      const matches = playerNames.get(row.dataset.player).includes(query);
      row.style.display = matches ? '' : 'none';
      hasMatches ||= matches;
    }
    sheetBody.querySelector('[data-player-search-empty]').hidden = hasMatches;
  };

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

  const askBlock = () => {
    const current = detail?.segmentCount || 1;
    // El selector elige en cuántas partes queda el partido (máximo 9).
    const choices = Array.from({ length: 8 }, (_, i) => i + 2).filter((n) => n > current);
    const options = choices.map((n) => `<option value="${n}">${n}</option>`).join('');
    return `<div class="askcut">
      <b class="askcut__q">¿Se ha cambiado de equipo?</b>
      <p class="hint">Divide el partido en partes con su propio marcador. Cada parte cuenta como un resultado (victoria, empate o derrota) para quien la jugó, pero la nota y el MVP son <b>uno solo</b> por partido. Se copian los equipos actuales como punto de partida.</p>
      <div class="askcut__row">
        <button class="btn btn--ghost btn--sm" type="button" data-ask="no">No hubo</button>
        ${
          choices.length
            ? `<label class="askcut__parts"><span>Partes</span>
                 <select class="input" data-parts>${options}</select>
               </label>
               <button class="btn btn--acid btn--sm" type="button" data-ask="yes">Dividir</button>`
            : `<span class="meta">Ya tiene el máximo de 9 partes</span>`
        }
      </div>
    </div>`;
  };

  const render = () => {
    if (!detail) return;
    const idx = stintIndex();
    const total = detail.segmentCount || 1;
    const onPitch = players.filter((p) => idx.has(`${p.id}:${current}`)).length;
    const summary = detail.summary;
    const canEditGoals = msUntilVotesOpen(summary) === 0;

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
              <button class="iconbtn${st?.team === selectedTeam ? ' is-on' : ''}" type="button"
                data-team="${st?.team === selectedTeam ? '' : selectedTeam}"
                aria-label="${esc(st?.team === selectedTeam ? `Quitar a ${p.name} de ${teamName(selectedTeam)}` : `Añadir a ${p.name} a ${teamName(selectedTeam)}`)}">
                <span class="lineupEdit__team-symbol" aria-hidden="true">${st?.team === selectedTeam ? '−' : '+'}</span>
              </button>
              ${st ? `<span class="meta">${teamName(st.team)}</span>` : ''}
              ${canEditGoals && st?.team === selectedTeam ? `<form class="lineupEdit__goals" data-goal-form>
                <input class="input" type="number" inputmode="numeric" min="0" max="2147483647" step="1" required
                  aria-label="${esc(`Goles de ${p.name}`)}" value="${esc(goalDrafts.get(`${p.id}:${current}`) ?? st.goals)}">
                <button class="iconbtn" type="submit">Guardar goles</button>
              </form>` : ''}
              ${canEditGoals && total > 1 && sum > (st?.goals ?? 0) ? `<span class="lineupEdit__sum">total ${sum}</span>` : ''}
            </span>
          </li>`;
      })
      .join('');

    sheetBody.innerHTML = `
      ${tabs}
      ${askSplit ? askBlock() : ''}
      <div class="lineupTools">
        <span class="meta">${total > 1 ? `Tramo ${current} de ${total}` : 'Sin cambios de equipo'}, ${plural(onPitch, 'jugador', 'jugadores')}${canEditGoals ? ` · Oscuros ${num(summary.goals_a, 0)}–${num(summary.goals_b, 0)} Claros` : ''}</span>
        ${askSplit ? '' : `<button class="iconbtn" type="button" data-split>${total > 1 ? '¿Hubo otro cambio?' : '¿Hubo cambio de equipo?'}</button>`}
        ${total > 1 && !askSplit ? '<button class="iconbtn iconbtn--danger" type="button" data-undo title="Deshacer el último cambio de equipo">Deshacer cambio</button>' : ''}
      </div>
      <div class="seg" role="group" aria-label="Equipo que estás editando">
        ${['A', 'B'].map((team) => `<button class="seg__btn${selectedTeam === team ? ' is-on' : ''}" type="button"
          aria-pressed="${selectedTeam === team}" data-select-team="${team}">${teamName(team)}</button>`).join('')}
      </div>
      <p class="hint">${canEditGoals ? 'Escribe los goles de cada jugador. El marcador suma los goles de ambos equipos.'
        : `Podrás anotar los goles el ${esc(voteOpensLabel(summary))}.`}</p>
      <label class="field">
        <span class="field__label">Buscar jugador por nombre</span>
        <input class="input" type="search" data-player-search value="${esc(playerSearch)}" aria-controls="lineupPlayers">
      </label>
      <p class="hint" data-player-search-empty role="status" hidden>No se encontraron jugadores.</p>
      <ul class="lineupEdit" id="lineupPlayers">${rows}</ul>`;
    filterPlayers();
  };

  const reload = async (segment) => {
    detail = await matchDetail(match.id);
    if (!detail) throw new Error('El partido ya no está disponible');
    const total = detail.segmentCount || 1;
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
    if (savingGoal) return;
    if (goalRefreshFailed) {
      if (!ev.target.closest('[data-reload-lineup]')) return;
      savingGoal = true;
      try {
        await reload();
        goalRefreshFailed = false;
        saveButton.disabled = false;
      } catch (e) {
        toast(errorMessage(e), 'error');
      } finally {
        savingGoal = false;
      }
      return;
    }

    const ask = ev.target.closest('[data-ask]');
    if (ask) {
      if (ask.dataset.ask === 'no') {
        askSplit = false;
        render();
        return;
      }
      const target = Number(sheetBody.querySelector('[data-parts]')?.value) || 2;
      try {
        let segment = detail?.segmentCount || 1;
        while (segment < target) {
          segment = await adminRpc('admin_split_match', { p_pw: pw, p_match: match.id });
        }
        askSplit = false;
        await reload(segment);
        toast(
          segment > 2
            ? `Partido dividido en ${segment} partes: rebalancea los equipos`
            : 'Partido dividido: rebalancea los equipos'
        );
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

    const teamTab = ev.target.closest('[data-select-team]');
    if (teamTab) {
      selectedTeam = teamTab.dataset.selectTeam;
      render();
      return;
    }

    const teamBtn = ev.target.closest('[data-team]');
    if (!teamBtn) return;
    const playerId = teamBtn.closest('.lineupEdit__row').dataset.player;
    await saveLineupChange('admin_set_lineup', playerId, { p_team: teamBtn.dataset.team || null });
  });

  sheetBody.addEventListener('input', (ev) => {
    if (ev.target.matches('[data-player-search]')) {
      playerSearch = ev.target.value;
      filterPlayers();
      return;
    }

    const row = ev.target.closest('[data-goal-form]')?.closest('.lineupEdit__row');
    if (row) goalDrafts.set(`${row.dataset.player}:${current}`, ev.target.value);
  });

  sheetBody.addEventListener('submit', async (ev) => {
    const form = ev.target.closest('[data-goal-form]');
    if (!form) return;
    ev.preventDefault();
    if (savingGoal || goalRefreshFailed || msUntilVotesOpen(detail.summary)) return;
    const input = form.querySelector('input');
    if (!input.reportValidity()) return;
    const playerId = form.closest('.lineupEdit__row').dataset.player;
    await saveLineupChange('admin_set_goals', playerId, { p_goals: input.valueAsNumber });
  });

  async function saveLineupChange(rpc, playerId, params) {
    savingGoal = true;
    let saved = false;
    const controls = sheetBody.querySelectorAll('button:enabled, input:enabled');
    saveButton.disabled = true;
    controls.forEach((control) => { control.disabled = true; });
    try {
      await adminRpc(rpc, { p_pw: pw, p_match: match.id, p_player: playerId, p_segment: current, ...params });
      saved = true;
      goalDrafts.delete(`${playerId}:${current}`);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      try {
        await reload();
        if (saved && params.p_team) {
          const row = sheetBody.querySelector(`.lineupEdit__row[data-player="${CSS.escape(playerId)}"]`);
          row?.querySelector('.is-on[data-team] .lineupEdit__team-symbol')?.classList.add('lineupEdit__team-symbol--added');
        }
      } catch {
        goalRefreshFailed = true;
        sheetBody.innerHTML = `<p class="formerr" role="status">No se pudo confirmar la alineación. Actualízala antes de seguir editando.</p>
          <button class="btn btn--ghost btn--sm" type="button" data-reload-lineup>Actualizar alineación</button>`;
      } finally {
        savingGoal = false;
        saveButton.disabled = goalRefreshFailed;
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Ajustes                                                             */
/* ------------------------------------------------------------------ */

function settingsTab() {
  return `<div class="adminform">
      <h2 class="subhead">Elección de jugador</h2>
      <p class="hint">Todos los jugadores salen siempre en «¿Quién eres?» con su dorsal. Si alguien elige a uno que ya estaba en otro móvil, el vínculo se mueve y el anterior queda fuera.</p>
      <div class="switchrow">
        <div>
          <b>Los comodines aparecen para elegir</b>
          <p class="hint">Si está desactivado, los comodines no salen en «¿Quién eres?»: solo juegan cuando los pone el admin.</p>
        </div>
        <button class="switch ${state.wildcardsPickable ? 'is-on' : ''}" type="button" id="wildcardsPickable"
          role="switch" aria-checked="${state.wildcardsPickable ? 'true' : 'false'}"><span></span></button>
      </div>
      <p class="hint">Si la plantilla está vacía, la web entra directamente sin preguntar.</p>
    </div>

    <div class="adminform">
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
  root.querySelector('#wildcardsPickable')?.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    const next = !(state.wildcardsPickable === true);
    try {
      await adminRpc('admin_set_wildcards_pickable', { p_pw: adminPassword(), p_value: next });
      state.wildcardsPickable = next;
      btn.classList.toggle('is-on', next);
      btn.setAttribute('aria-checked', String(next));
      toast(next ? 'Los comodines salen en la lista' : 'Los comodines no salen en la lista');
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  });

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
