import {
  state,
  esc,
  pad2,
  num,
  plural,
  rating,
  rating2,
  ratingTone,
  rateBadge,
  dateParts,
  longDate,
  shortDate,
  photoBlock,
  avatar,
  teamName,
  teamTag,
  outcomeText,
  sheet,
  toast,
  errorMessage,
  href,
} from './core.js';
import {
  sortedBy,
  rawValue,
  lastClosedMatch,
  nextMatch,
  matchDetail,
  playerHistory,
  playerById,
  castVote,
  loadCore,
} from './data.js';

/* ------------------------------------------------------------------ */
/* Piezas compartidas                                                  */
/* ------------------------------------------------------------------ */

function pageTitle(title, lede = '') {
  return `<header class="pagehead">
    <h1 class="title">${title}</h1>
    ${lede ? `<p class="lede">${esc(lede)}</p>` : ''}
  </header>`;
}

function section(title, extra = '') {
  return `<div class="sec"><h2 class="sec__title">${esc(title)}</h2>${extra}</div>`;
}

function empty(title, text) {
  return `<section class="void">
    <h2 class="void__title">${esc(title)}</h2>
    <p class="void__text">${esc(text)}</p>
  </section>`;
}

function voteBadge(score, extra = '') {
  return `<span class="rate rate--${ratingTone(score)} ${extra}">${score}</span>`;
}

function dorsal(p) {
  return p?.shirt_number ? `#${pad2(p.shirt_number)}` : '';
}

function pill(text, tone = '') {
  return `<span class="pill ${tone ? `pill--${tone}` : ''}">${esc(text)}</span>`;
}

/* ------------------------------------------------------------------ */
/* Votación: reglas que se ven en pantalla (la base de datos las impone) */
/* ------------------------------------------------------------------ */

function voteStatus(detail, targetId) {
  const { summary, lineup, myVotes } = detail;
  const me = state.me;
  const mine = myVotes.get(targetId) ?? null;
  if (summary.status !== 'open') return { can: false, reason: 'closed', mine };
  if (!me) return { can: false, reason: 'nologin', mine };
  const meP = playerById(me);
  if (meP?.can_vote === false) return { can: false, reason: 'wildcard', mine };
  if (!lineup.some((l) => l.player_id === me)) return { can: false, reason: 'notplayed', mine };
  if (me === targetId && !state.allowSelfVote) return { can: false, reason: 'self', mine };
  if (mine != null) return { can: false, reason: 'done', mine };
  return { can: true, reason: 'ok', mine };
}

const REASONS = {
  nologin: 'Elige quién eres para poder votar.',
  wildcard: 'Los comodines juegan, pero no votan.',
  notplayed: 'Solo votan quienes jugaron este partido.',
  self: 'No puedes votarte a ti mismo.',
  done: 'Ya has votado a este jugador. Solo el admin puede corregir una nota.',
};

/** Cuántos jugadores puede votar quien mira y cuántos lleva. null si no puede votar en este partido. */
function voteProgress(detail) {
  const { summary, lineup, myVotes } = detail;
  const me = state.me;
  if (summary.status !== 'open' || !me) return null;
  const meP = playerById(me);
  if (meP?.can_vote === false || !lineup.some((l) => l.player_id === me)) return null;
  const targets = lineup.filter((l) => l.player_id !== me || state.allowSelfVote);
  const done = targets.filter((l) => myVotes.has(l.player_id)).length;
  return { total: targets.length, done };
}

/* ------------------------------------------------------------------ */
/* Inicio                                                              */
/* ------------------------------------------------------------------ */

export async function home() {
  const last = lastClosedMatch();
  const next = nextMatch();
  const recent = state.matches.filter((m) => m.status === 'closed').slice(0, 4);

  const [lastDetail, nextDetail] = await Promise.all([
    last ? matchDetail(last.id).catch(() => null) : null,
    next && state.me ? matchDetail(next.id).catch(() => null) : null,
  ]);

  const progress = nextDetail ? voteProgress(nextDetail) : null;
  const best = sortedBy('rating').filter((p) => (p.stats?.played || 0) > 0 && p.stats.avg_rating != null).slice(0, 5);

  let todo = '';
  if (next && progress && progress.done < progress.total) {
    const left = progress.total - progress.done;
    todo = `<a class="todo" href="${href('partidos', next.id)}">
      <span class="todo__text">
        <b>${left === 1 ? 'Te falta 1 nota' : `Te faltan ${left} notas`}</b>
        <span>Partido del ${esc(shortDate(next.played_on))}</span>
      </span>
      <span class="btn btn--acid btn--sm">Votar</span>
    </a>`;
  } else if (next) {
    todo = `<a class="todo todo--quiet" href="${href('partidos', next.id)}">
      <span class="todo__text">
        <b>Partido abierto</b>
        <span>${esc(shortDate(next.played_on))}${progress ? ', ya has votado a todos' : ''}</span>
      </span>
      <span class="btn btn--ghost btn--sm">Ver</span>
    </a>`;
  }

  const scorecard = last
    ? `<a class="score" href="${href('partidos', last.id)}">
        <div class="score__top">
          <span class="score__date">${esc(longDate(last.played_on))}</span>
          ${pill('Último partido')}
        </div>
        <div class="score__board">
          <span class="score__n">${num(last.goals_a, 0)}</span>
          <span class="score__sep" aria-hidden="true"></span>
          <span class="score__n">${num(last.goals_b, 0)}</span>
          <span class="score__who">${teamTag('A')}</span>
          <span></span>
          <span class="score__who">${teamTag('B')}</span>
        </div>
        ${
          lastDetail?.mvp
            ? `<div class="mvp">
                ${avatar(lastDetail.mvp.player, 48)}
                <span class="mvp__text"><b>${esc(lastDetail.mvp.player.name)}</b><span>MVP del partido</span></span>
                ${rateBadge(lastDetail.mvp.score, 'rate--ink')}
              </div>`
            : `<p class="score__foot">${esc(outcomeText(last.goals_a, last.goals_b))}</p>`
        }
      </a>`
    : empty('Aún no hay partidos', 'Cuando el admin cierre el primero, aquí saldrá el resultado y el MVP.');

  const html = `<div class="view">
    ${pageTitle('Vestuario')}
    ${todo}
    ${scorecard}

    ${
      best.length
        ? `${section('Mejores notas', `<a class="more" href="${href('ranking')}">Ver tabla</a>`)}
           <ol class="plist">
             ${best
               .map(
                 (p, i) => `<li><a class="prow" href="${href('jugador', p.id)}">
                   <span class="prow__rank">${i + 1}</span>
                   ${avatar(p, 44)}
                   <span class="prow__who"><b class="prow__name">${esc(p.name)}</b>
                     <span class="prow__sub">${esc(plural(p.stats.played, 'partido', 'partidos'))}</span></span>
                   ${rateBadge(p.stats.avg_rating)}
                 </a></li>`
               )
               .join('')}
           </ol>`
        : ''
    }

    ${
      recent.length
        ? `${section('Últimos resultados', `<a class="more" href="${href('partidos')}">Todos</a>`)}
           <ol class="mlist">${recent.map(matchRow).join('')}</ol>`
        : ''
    }
  </div>`;

  return { html, mount() {} };
}

/* ------------------------------------------------------------------ */
/* Ranking                                                             */
/* ------------------------------------------------------------------ */

const SORTS = [
  { key: 'goals', label: 'Goles', unit: 'goles', dir: 'desc' },
  { key: 'mvps', label: 'MVP', unit: 'MVP', dir: 'desc' },
  { key: 'wins', label: 'Victorias', unit: 'victorias', dir: 'desc' },
  { key: 'rating', label: 'Nota media', unit: 'de media', dir: 'desc' },
  { key: 'conceded', label: 'Menos encajados', unit: 'por partido', dir: 'asc' },
];

function sortText(player, key) {
  const v = rawValue(player, key);
  if (v == null) return '–';
  if (key === 'rating' || key === 'conceded') return v.toFixed(2).replace('.', ',');
  return String(v);
}

function boardHTML(key, dir) {
  const needsData = key === 'rating' || key === 'conceded';
  const rows = sortedBy(key, dir).filter((p) => (needsData ? (p.stats?.played || 0) > 0 : true));
  if (!rows.length) {
    return empty(
      needsData ? 'Todavía no hay datos' : 'Sin jugadores',
      needsData ? 'Aparecerá cuando haya partidos con resultado.' : 'El admin puede añadir jugadores desde Admin.'
    );
  }

  const unit = SORTS.find((s) => s.key === key)?.unit || '';
  const ranks = [];
  rows.forEach((p, i) => {
    const v = rawValue(p, key);
    ranks.push(i > 0 && v === rawValue(rows[i - 1], key) ? ranks[i - 1] : i + 1);
  });

  const first = rows[0];
  const showChamp = needsData ? rawValue(first, key) != null : rawValue(first, key) > 0;
  const rest = showChamp ? rows.slice(1) : rows;
  const restRanks = showChamp ? ranks.slice(1) : ranks;

  const champ = showChamp
    ? `<a class="champ" href="${href('jugador', first.id)}">
        ${avatar(first, 76)}
        <span class="champ__who">
          <span class="champ__tag">Líder</span>
          <b class="champ__name">${esc(first.name)}</b>
        </span>
        <span class="champ__val">${esc(sortText(first, key))}<small>${esc(unit)}</small></span>
      </a>`
    : '';

  return `${champ}
    <ol class="plist">
      ${rest
        .map(
          (p, i) => `<li><a class="prow" href="${href('jugador', p.id)}">
            <span class="prow__rank">${restRanks[i]}</span>
            ${avatar(p, 44)}
            <span class="prow__who"><b class="prow__name">${esc(p.name)}</b>
              <span class="prow__sub">${esc(plural(p.stats?.played ?? 0, 'partido', 'partidos'))}, ${esc(plural(p.stats?.wins ?? 0, 'victoria', 'victorias'))}</span></span>
            <span class="prow__val">${esc(sortText(p, key))}<small>${esc(unit)}</small></span>
          </a></li>`
        )
        .join('')}
    </ol>`;
}

export async function ranking() {
  const first = SORTS[0];

  const html = `<div class="view">
    ${pageTitle('Tabla', 'Todo el histórico del vestuario.')}
    <div class="seg" role="tablist" aria-label="Ordenar la tabla">
      ${SORTS.map(
        (s, i) => `<button class="seg__btn${i === 0 ? ' is-on' : ''}" type="button" role="tab"
          aria-selected="${i === 0}" data-sort="${s.key}" data-dir="${s.dir}">${esc(s.label)}</button>`
      ).join('')}
    </div>
    <div id="boardSlot">${boardHTML(first.key, first.dir)}</div>
  </div>`;

  return {
    html,
    mount(root) {
      const slot = root.querySelector('#boardSlot');
      const buttons = [...root.querySelectorAll('.seg__btn')];
      buttons.forEach((btn) => {
        btn.addEventListener('click', () => {
          buttons.forEach((b) => {
            b.classList.toggle('is-on', b === btn);
            b.setAttribute('aria-selected', String(b === btn));
          });
          slot.innerHTML = boardHTML(btn.dataset.sort, btn.dataset.dir);
        });
      });
    },
  };
}

/* ------------------------------------------------------------------ */
/* Partidos                                                            */
/* ------------------------------------------------------------------ */

function matchRow(m) {
  const d = dateParts(m.played_on);
  const isOpen = m.status === 'open';
  return `<li>
    <a class="mrow" href="${href('partidos', m.id)}">
      <span class="mrow__date"><b>${esc(d.day)}</b><span>${esc(d.month)}</span></span>
      <span class="mrow__main">
        <span class="mrow__score">${num(m.goals_a, 0)}<i aria-hidden="true"></i>${num(m.goals_b, 0)}</span>
        <span class="mrow__sub">${esc(isOpen ? 'Votación en marcha' : outcomeText(m.goals_a, m.goals_b))}</span>
      </span>
      ${pill(isOpen ? 'Abierto' : 'Cerrado', isOpen ? 'acid' : '')}
    </a>
  </li>`;
}

export async function matches() {
  const open = state.matches.filter((m) => m.status === 'open');
  const closed = state.matches.filter((m) => m.status === 'closed');

  const html = `<div class="view">
    ${pageTitle('Partidos', state.matches.length ? plural(state.matches.length, 'partido registrado', 'partidos registrados') : '')}
    ${open.length ? `${section('Votación abierta')}<ol class="mlist">${open.map(matchRow).join('')}</ol>` : ''}
    ${closed.length ? `${section('Cerrados')}<ol class="mlist">${closed.map(matchRow).join('')}</ol>` : ''}
    ${!open.length && !closed.length ? empty('Todavía no hay partidos', 'El admin los crea desde la pestaña Admin.') : ''}
  </div>`;

  return { html, mount() {} };
}

/* ------------------------------------------------------------------ */
/* Detalle de partido                                                  */
/* ------------------------------------------------------------------ */

function teamBlock(code, rows, goals, detail) {
  const items = rows.length
    ? rows
        .map((row) => {
          const p = row.player;
          const st = voteStatus(detail, p.id);
          const votes = detail.votesByTarget.get(p.id) || [];
          return `<li><button class="lrow" type="button" data-player="${esc(p.id)}">
            ${avatar(p, 44)}
            <span class="lrow__who">
              <b class="lrow__name">${esc(p.name)}</b>
              <span class="lrow__sub">${esc(plural(row.goals ?? 0, 'gol', 'goles'))}</span>
              ${st.can ? '<span class="pill pill--acid">Falta tu nota</span>' : st.mine != null ? `<span class="pill">Tu nota: ${st.mine}</span>` : ''}
            </span>
            <span class="lrow__end">
              ${rateBadge(row.avg_score)}
              <span class="lrow__n">${esc(votes.length ? plural(votes.length, 'nota', 'notas') : 'sin notas')}</span>
            </span>
          </button></li>`;
        })
        .join('')
    : '<li class="lrow__empty">Sin jugadores</li>';

  return `<div class="team">
    <div class="team__head">${teamTag(code)}<span class="team__goals">${esc(plural(goals ?? 0, 'gol', 'goles'))}</span></div>
    <ul class="lineup">${items}</ul>
  </div>`;
}

export async function matchView(id) {
  const detail = await matchDetail(id);

  if (!detail) {
    return {
      html: `<div class="view">
        <a class="back" href="${href('partidos')}">Partidos</a>
        ${empty('Partido no encontrado', 'Puede que se haya borrado.')}</div>`,
      mount() {},
    };
  }

  const { summary, lineup, mvp } = detail;
  const open = summary.status === 'open';
  const prog = voteProgress(detail);
  const pct = prog && prog.total ? Math.round((prog.done / prog.total) * 100) : 0;

  const html = `<div class="view">
    <a class="back" href="${href('partidos')}">Partidos</a>

    <section class="score score--static">
      <div class="score__top">
        <span class="score__date">${esc(longDate(summary.played_on))}</span>
        ${pill(open ? 'Votación abierta' : 'Cerrado', open ? 'acid' : '')}
      </div>
      <div class="score__board">
        <span class="score__n">${num(summary.goals_a, 0)}</span>
        <span class="score__sep" aria-hidden="true"></span>
        <span class="score__n">${num(summary.goals_b, 0)}</span>
        <span class="score__who">${teamTag('A')}</span>
        <span></span>
        <span class="score__who">${teamTag('B')}</span>
      </div>
      ${
        mvp
          ? `<a class="mvp" href="${href('jugador', mvp.player.id)}">
              ${avatar(mvp.player, 48)}
              <span class="mvp__text"><b>${esc(mvp.player.name)}</b><span>MVP del partido</span></span>
              ${rateBadge(mvp.score, 'rate--ink')}
            </a>`
          : ''
      }
    </section>

    ${
      prog
        ? `<section class="prog" aria-label="Tus votos">
            <div class="prog__row">
              <b>${prog.done === prog.total ? 'Ya has votado a todos' : `Has votado a ${prog.done} de ${prog.total}`}</b>
              <span>${pct}%</span>
            </div>
            <div class="prog__bar"><i style="width:${pct}%"></i></div>
          </section>`
        : ''
    }

    ${
      lineup.length
        ? `<p class="hint hint--tap">Toca a un jugador para ${open ? 'votarle y ' : ''}ver qué nota le ha puesto cada uno.</p>
           <div class="teams">
             ${teamBlock('A', lineup.filter((l) => l.team === 'A'), summary.goals_a, detail)}
             ${teamBlock('B', lineup.filter((l) => l.team === 'B'), summary.goals_b, detail)}
           </div>`
        : empty('Sin alineación', 'El admin todavía no ha publicado quién juega este partido.')
    }
  </div>`;

  return {
    html,
    mount(root) {
      const refresh = async () => {
        try {
          await loadCore();
          const next = await matchView(id);
          root.innerHTML = next.html;
          next.mount(root);
        } catch (err) {
          toast(errorMessage(err), 'error');
        }
      };

      root.querySelectorAll('[data-player]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const row = lineup.find((l) => l.player_id === btn.dataset.player);
          if (row) openPlayerSheet(detail, row, refresh);
        });
      });
    },
  };
}

/** Hoja de un jugador en un partido: nota para poner (si toca) y todas las notas recibidas. */
function openPlayerSheet(detail, row, refresh) {
  const p = row.player;
  const st = voteStatus(detail, p.id);
  const votes = detail.votesByTarget.get(p.id) || [];
  const me = state.me;

  const summary = votes.length
    ? `<div class="vs__sum">
        <span class="vs__avg">${rating2(row.avg_score)}</span>
        <span class="vs__txt">de media con ${esc(plural(votes.length, 'nota', 'notas'))}</span>
      </div>`
    : '<p class="hint">Todavía nadie ha votado a este jugador.</p>';

  const voteBlock = st.can
    ? `<div class="vs__block">
        <h3 class="vs__label">Tu nota para ${esc(p.name)}</h3>
        <div class="scale" role="radiogroup" aria-label="Nota del 1 al 10">
          ${Array.from({ length: 10 }, (_, i) => i + 1)
            .map((n) => `<button class="scale__btn" type="button" role="radio" aria-checked="false" data-score="${n}">${n}</button>`)
            .join('')}
        </div>
        <p class="hint">No se puede cambiar después. Si te equivocas, solo el admin puede corregirla.</p>
      </div>`
    : REASONS[st.reason]
    ? `<p class="vs__note">${esc(REASONS[st.reason])}</p>`
    : '';

  const voters = votes.length
    ? `<h3 class="vs__label">Quién le ha puesto qué</h3>
       <ul class="voters">
         ${votes
           .map((v) => {
             const who = playerById(v.voter);
             const mine = v.voter === me;
             return `<li class="voters__row">
               ${avatar(who, 36)}
               <span class="voters__name">${esc(who?.name || 'Jugador')}${mine ? ' <i>(tú)</i>' : ''}</span>
               ${voteBadge(v.score)}
             </li>`;
           })
           .join('')}
       </ul>`
    : '';

  let chosen = null;
  const s = sheet({
    title: p.name,
    subtitle: `${teamName(row.team)}, ${plural(row.goals ?? 0, 'gol', 'goles')}`,
    body: `<div class="vs">${summary}${voteBlock}${voters}</div>`,
    actions: st.can
      ? [
          { id: 'cancel', label: 'Cancelar', variant: 'btn--ghost', onClick: () => s.close() },
          {
            id: 'confirm',
            label: 'Elige una nota',
            variant: 'btn--acid',
            disabled: true,
            onClick: async () => {
              if (!chosen) return;
              const btn = s.action('confirm');
              btn.disabled = true;
              btn.textContent = 'Guardando…';
              try {
                await castVote(detail.summary.id, p.id, chosen);
                s.close();
                toast('Nota guardada');
                refresh();
              } catch (err) {
                toast(errorMessage(err), 'error');
                btn.disabled = false;
                btn.textContent = `Confirmar un ${chosen}`;
              }
            },
          },
        ]
      : [{ id: 'close', label: 'Cerrar', variant: 'btn--ghost', onClick: () => s.close() }],
  });

  s.el.querySelector('.scale')?.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-score]');
    if (!btn) return;
    chosen = Number(btn.dataset.score);
    s.el.querySelectorAll('.scale__btn').forEach((b) => {
      const on = b === btn;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-checked', String(on));
    });
    const confirm = s.action('confirm');
    confirm.disabled = false;
    confirm.textContent = `Confirmar un ${chosen}`;
  });
}

/* ------------------------------------------------------------------ */
/* Perfil de jugador                                                   */
/* ------------------------------------------------------------------ */

function chartSVG(points) {
  const w = 600;
  const h = 200;
  const padX = 12;
  const padY = 16;
  const xs = (i) => padX + (i * (w - padX * 2)) / Math.max(points.length - 1, 1);
  const ys = (v) => h - padY - ((Math.min(10, Math.max(1, v)) - 1) / 9) * (h - padY * 2);

  const coords = points.map((v, i) => [xs(i), ys(v)]);
  const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${xs(points.length - 1).toFixed(1)},${h - padY} L${padX},${h - padY} Z`;
  const grid = [4, 6, 8].map((v) => `<line x1="${padX}" x2="${w - padX}" y1="${ys(v)}" y2="${ys(v)}" class="chart__grid"/>`).join('');

  return `<svg class="chart__svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="Evolución de la nota partido a partido">
    ${grid}
    <path class="chart__area" d="${area}"/>
    <path class="chart__line" d="${line}"/>
    ${coords.map(([x, y]) => `<circle class="chart__dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5"/>`).join('')}
  </svg>`;
}

export async function playerView(id) {
  const p = playerById(id);

  if (!p) {
    return {
      html: `<div class="view">
        <a class="back" href="${href('plantilla')}">Plantilla</a>
        ${empty('Jugador no encontrado', 'Puede que se haya eliminado de la plantilla.')}</div>`,
      mount() {},
    };
  }

  const s = p.stats || {};
  const history = await playerHistory(p.id);
  const rated = history.filter((h) => h.avg_score != null).slice(0, 10).reverse();

  const stat = (value, label) => `<div class="stat"><span class="stat__v">${value}</span><span class="stat__l">${esc(label)}</span></div>`;

  const html = `<div class="view">
    <a class="back" href="${href('plantilla')}">Plantilla</a>

    <header class="phero">
      <div class="phero__photo">${photoBlock(p)}</div>
      <div class="phero__id">
        <h1 class="phero__name">${esc(p.name)}</h1>
        <div class="phero__tags">
          ${p.shirt_number ? pill(`Dorsal ${pad2(p.shirt_number)}`) : ''}
          ${p.can_vote === false ? pill('Comodín') : ''}
        </div>
      </div>
    </header>

    <div class="stats">
      ${stat(num(s.played, 0), 'Partidos')}
      ${stat(num(s.wins, 0), 'Victorias')}
      ${stat(num(s.goals, 0), 'Goles')}
      ${stat(num(s.mvps, 0), 'MVP')}
      ${stat(rating2(s.avg_rating), 'Nota media')}
      ${stat(s.conceded_pm == null ? '–' : Number(s.conceded_pm).toFixed(2).replace('.', ','), 'Encajados por partido')}
    </div>

    ${section('Evolución de la nota')}
    ${
      rated.length >= 2
        ? `<div class="chart">
            ${chartSVG(rated.map((r) => Number(r.avg_score)))}
            <div class="chart__axis"><span>${esc(shortDate(rated[0].played_on))}</span><span>${esc(shortDate(rated[rated.length - 1].played_on))}</span></div>
          </div>`
        : '<p class="hint">Hacen falta al menos dos partidos con notas para dibujar la evolución.</p>'
    }

    ${section('Últimos partidos')}
    ${
      history.length
        ? `<ol class="hlist">
            ${history
              .slice(0, 12)
              .map((h) => {
                const gf = h.gf ?? 0;
                const ga = h.ga ?? 0;
                const outcome = gf > ga ? 'V' : gf === ga ? 'E' : 'D';
                return `<li><a class="hrow" href="${href('partidos', h.match_id)}">
                  <span class="hrow__res hrow__res--${outcome.toLowerCase()}" aria-label="${outcome === 'V' ? 'Victoria' : outcome === 'E' ? 'Empate' : 'Derrota'}">${outcome}</span>
                  <span class="hrow__main">
                    <b class="hrow__score">${num(gf, 0)}<i aria-hidden="true"></i>${num(ga, 0)}</b>
                    <span class="hrow__sub">${esc(shortDate(h.played_on))}, con los ${esc(teamName(h.team))}, ${esc(plural(h.goals ?? 0, 'gol', 'goles'))}</span>
                  </span>
                  ${rateBadge(h.avg_score)}
                </a></li>`;
              })
              .join('')}
          </ol>`
        : '<p class="hint">Todavía no ha jugado ningún partido.</p>'
    }
  </div>`;

  return { html, mount() {} };
}

/* ------------------------------------------------------------------ */
/* Plantilla                                                           */
/* ------------------------------------------------------------------ */

export async function squad() {
  const players = [...state.players].filter((p) => p.active !== false);
  const inactive = state.players.filter((p) => p.active === false);

  const card = (p) => `<a class="scard" href="${href('jugador', p.id)}">
      <span class="scard__photo">${photoBlock(p)}${p.shirt_number ? `<span class="scard__num">${pad2(p.shirt_number)}</span>` : ''}</span>
      <b class="scard__name">${esc(p.name)}</b>
      <span class="scard__stat">${esc(plural(p.stats?.goals ?? 0, 'gol', 'goles'))}${p.stats?.avg_rating != null ? `, nota ${esc(rating(p.stats.avg_rating))}` : ''}</span>
    </a>`;

  const html = `<div class="view">
    ${pageTitle('Plantilla', plural(players.length, 'jugador', 'jugadores'))}
    ${players.length ? `<div class="squad">${players.map(card).join('')}</div>` : empty('Plantilla vacía', 'El admin añade a los jugadores desde Admin.')}
    ${
      inactive.length
        ? `${section('Fuera de la plantilla')}<div class="squad squad--dim">${inactive.map(card).join('')}</div>`
        : ''
    }
  </div>`;

  return { html, mount() {} };
}
