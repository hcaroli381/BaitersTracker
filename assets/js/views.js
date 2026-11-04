import {
  state,
  esc,
  pad2,
  num,
  rating,
  dateParts,
  longDate,
  photoBlock,
  initials,
  toast,
  errorMessage,
  href,
} from './core.js';
import {
  sortedBy,
  lastClosedMatch,
  nextMatch,
  matchDetail,
  playerHistory,
  playerById,
  castVote,
} from './data.js';

/* ------------------------------------------------------------------ */
/* Piezas compartidas                                                  */
/* ------------------------------------------------------------------ */

function head(kicker, title, meta = '') {
  return `<header class="page-head">
    <div class="page-head__meta">
      <span class="kicker">${esc(kicker)}</span>
      ${meta ? `<span class="mono mono--dim">${esc(meta)}</span>` : ''}
    </div>
    <h1 class="page-title">${title}</h1>
  </header>`;
}

function sectionHead(kicker, title, extra = '') {
  return `<div class="section-head">
    <h2 class="section-title"><span class="kicker">${esc(kicker)}</span>${esc(title)}</h2>
    ${extra}
  </div>`;
}

function voidBlock(title, text) {
  return `<section class="void">
    <span class="void__num" aria-hidden="true">00</span>
    <h2 class="void__title">${esc(title)}</h2>
    <p class="void__text">${esc(text)}</p>
  </section>`;
}

function seasonLabel() {
  return 'Temporada 2026/27';
}

function jersey(p) {
  return p?.shirt_number ? pad2(p.shirt_number) : initials(p?.name);
}

/* ------------------------------------------------------------------ */
/* Inicio                                                              */
/* ------------------------------------------------------------------ */

export async function home() {
  const last = lastClosedMatch();
  const next = nextMatch();
  const recent = state.matches.filter((m) => m.status === 'closed').slice(0, 5);

  const featured = sortedBy('rating')
    .filter((p) => (p.stats?.played || 0) > 0)
    .slice(0, 8);

  const topRated = sortedBy('rating')[0];

  const html = `<div class="view">
    ${head('BaitersTracker', 'EL <span class="outline">VESTUARIO</span>', seasonLabel())}

    ${
      last
        ? `<article class="scorecard">
            <div class="scorecard__top">
              <span class="kicker">Último partido</span>
              <span class="mono mono--dim">${esc(longDate(last.played_on))}</span>
            </div>
            <div class="scorecard__row">
              <div class="scorecard__side">
                <span class="tag">A</span>
                <span class="scorecard__team">Equipo A</span>
              </div>
              <div class="scorecard__nums">
                <span>${num(last.goals_a, 0)}</span>
                <span class="scorecard__dash">—</span>
                <span>${num(last.goals_b, 0)}</span>
              </div>
              <div class="scorecard__side scorecard__side--r">
                <span class="scorecard__team">Equipo B</span>
                <span class="tag">B</span>
              </div>
            </div>
            <a class="scorecard__link" href="${href('partidos', last.id)}">
              Alineaciones y notas <span aria-hidden="true">→</span>
            </a>
          </article>`
        : voidBlock('Aún no hay resultados', 'Crea el primer partido desde administración para empezar a registrar notas.')
    }

    ${
      topRated && (topRated.stats?.played || 0) > 0
        ? `<article class="spotlight">
            <a class="spotlight__media" href="${href('jugador', topRated.id)}">
              ${photoBlock(topRated, 'ph--tall')}
              <span class="spotlight__badge">MVP</span>
            </a>
            <div class="spotlight__body">
              <span class="kicker kicker--acid">Mejor media del vestuario</span>
              <h2 class="spotlight__name">${esc(topRated.name)}</h2>
              <div class="figures figures--inline">
                <div class="figure"><span class="figure__value figure__value--acid">${rating(topRated.stats.avg_rating)}</span><span class="figure__label">Nota</span></div>
                <div class="figure"><span class="figure__value">${num(topRated.stats.goals, 0)}</span><span class="figure__label">Goles</span></div>
                <div class="figure"><span class="figure__value">${num(topRated.stats.mvps, 0)}</span><span class="figure__label">MVP</span></div>
              </div>
              <a class="link" href="${href('jugador', topRated.id)}">Perfil completo <span aria-hidden="true">→</span></a>
            </div>
            <span class="spotlight__ghost" aria-hidden="true">${esc(jersey(topRated))}</span>
          </article>`
        : ''
    }

    ${
      next
        ? `<a class="next" href="${href('partidos', next.id)}">
            <span class="next__day">${dateParts(next.played_on).day}</span>
            <span class="next__meta">
              <span class="kicker">Próximo partido</span>
              <span class="next__label">${esc(longDate(next.played_on))} · Equipo A — Equipo B</span>
            </span>
            <span class="next__arrow" aria-hidden="true">→</span>
          </a>`
        : ''
    }

    ${
      featured.length
        ? `<section class="block">
            ${sectionHead('Plantilla', 'Destacados', `<a class="link link--mini" href="${href('ranking')}">Ranking →</a>`)}
            <div class="rail-scroll">
              ${featured
                .map(
                  (p) => `<a class="pcard" href="${href('jugador', p.id)}">
                    <div class="pcard__media">${photoBlock(p, 'ph--card')}</div>
                    <div class="pcard__plate">
                      <span class="pcard__num">${esc(jersey(p))}</span>
                      <span class="pcard__name">${esc(p.name)}</span>
                      <span class="pcard__stat">${rating(p.stats.avg_rating)} · ${num(p.stats.goals, 0)} goles</span>
                    </div>
                  </a>`
                )
                .join('')}
            </div>
          </section>`
        : ''
    }

    ${
      recent.length
        ? `<section class="block">
            ${sectionHead('Historial', 'Últimos resultados', `<a class="link link--mini" href="${href('partidos')}">Todos →</a>`)}
            <ol class="results">
              ${recent
                .map(
                  (m) => `<li>
                    <a class="results__row" href="${href('partidos', m.id)}">
                      <span class="results__date"><b>${dateParts(m.played_on).day}</b>${dateParts(m.played_on).month}</span>
                      <span class="results__score">${num(m.goals_a, 0)}<i>—</i>${num(m.goals_b, 0)}</span>
                      <span class="results__meta">A · B</span>
                      <span class="results__arrow" aria-hidden="true">→</span>
                    </a>
                  </li>`
                )
                .join('')}
            </ol>
          </section>`
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
  { key: 'mvps', label: 'MVP', unit: 'mvp', dir: 'desc' },
  { key: 'wins', label: 'Victorias', unit: 'victorias', dir: 'desc' },
  { key: 'rating', label: 'Nota media', unit: 'nota', dir: 'desc' },
  { key: 'conceded', label: 'Encajados', unit: 'por partido', dir: 'asc' },
];

function sortValue(player, key) {
  const s = player.stats || {};
  switch (key) {
    case 'goals':
      return num(s.goals, 0);
    case 'mvps':
      return num(s.mvps, 0);
    case 'wins':
      return num(s.wins, 0);
    case 'rating':
      return rating(s.avg_rating);
    case 'conceded':
      return s.conceded_pm == null ? '—' : Number(s.conceded_pm).toFixed(2).replace('.', ',');
    default:
      return '—';
  }
}

function boardHTML(key, dir) {
  const rows = sortedBy(key, dir).filter((p) => p.active !== false);
  if (!rows.length) return voidBlock('Sin jugadores', 'Añade jugadores desde administración.');

  const leader = rows[0];
  const rest = rows.slice(1);
  const unit = SORTS.find((s) => s.key === key)?.unit || '';

  return `<div class="leader">
      <div class="leader__media">${photoBlock(leader, 'ph--leader')}</div>
      <div class="leader__body">
        <span class="kicker kicker--acid">Líder · ${esc(unit)}</span>
        <h2 class="leader__name">${esc(leader.name)}</h2>
        <p class="leader__value">${esc(sortValue(leader, key))}</p>
        <a class="link" href="${href('jugador', leader.id)}">Ver perfil <span aria-hidden="true">→</span></a>
      </div>
      <span class="leader__rank" aria-hidden="true">01</span>
    </div>
    <ol class="board">
      ${rest
        .map(
          (p, i) => `<li class="board__row">
            <span class="board__rank">${pad2(i + 2)}</span>
            <a class="board__pic" href="${href('jugador', p.id)}">${photoBlock(p, 'ph--thumb')}</a>
            <span class="board__who">
              <a class="board__name" href="${href('jugador', p.id)}">${esc(p.name)}</a>
              <span class="board__sub">${num(p.stats?.played, 0)} PJ · ${num(p.stats?.wins, 0)} V</span>
            </span>
            <span class="board__stat">${esc(sortValue(p, key))}<span class="board__unit">${esc(unit)}</span></span>
          </li>`
        )
        .join('')}
    </ol>`;
}

export async function ranking() {
  const first = SORTS[0];

  const html = `<div class="view">
    ${head('Clasificación', 'LA <span class="outline">TABLA</span>', 'Histórico completo')}
    <div class="seg" role="tablist" aria-label="Ordenar ranking">
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

export async function matches() {
  const open = state.matches.filter((m) => m.status === 'open');
  const closed = state.matches.filter((m) => m.status === 'closed');

  const row = (m) => `<li>
    <a class="mrow" href="${href('partidos', m.id)}">
      <span class="mrow__date"><b>${dateParts(m.played_on).day}</b>${dateParts(m.played_on).month}</span>
      <span class="mrow__main">
        <span class="mrow__score">${num(m.goals_a, 0)}<i>—</i>${num(m.goals_b, 0)}</span>
        <span class="mrow__sub">${esc(dateParts(m.played_on).weekday)} · Equipo A / Equipo B</span>
      </span>
      <span class="chip ${m.status === 'open' ? 'chip--acid' : 'chip--dim'}">${m.status === 'open' ? 'Abierto' : 'Cerrado'}</span>
    </a>
  </li>`;

  const html = `<div class="view">
    ${head('Calendario', 'PARTIDOS', `${state.matches.length} registrados`)}

    ${
      open.length
        ? `<section class="block">
            ${sectionHead('En juego', 'Convocatorias abiertas')}
            <ol class="mlist">${open.map(row).join('')}</ol>
          </section>`
        : ''
    }

    ${
      closed.length
        ? `<section class="block">
            ${sectionHead('Resultados', 'Partidos cerrados')}
            <ol class="mlist">${closed.map(row).join('')}</ol>
          </section>`
        : ''
    }

    ${
      !open.length && !closed.length
        ? voidBlock('Calendario vacío', 'El admin puede crear partidos desde la zona de administración.')
        : ''
    }
  </div>`;

  return { html, mount() {} };
}

/* ------------------------------------------------------------------ */
/* Detalle de partido                                                  */
/* ------------------------------------------------------------------ */

export async function matchView(id) {
  const detail = await matchDetail(id);

  if (!detail) {
    return {
      html: `<div class="view">${head('Partido', 'NO <span class="outline">EXISTE</span>')}
        ${voidBlock('Partido no encontrado', 'Puede que se haya borrado.')}</div>`,
      mount() {},
    };
  }

  const { summary, lineup, mvp, myVotes } = detail;
  const open = summary.status === 'open';
  const isClosed = summary.status === 'closed';
  const teamA = lineup.filter((l) => l.team === 'A');
  const teamB = lineup.filter((l) => l.team === 'B');
  const me = state.me;

  const lineRow = (row) => {
    const p = row.player;
    return `<li class="lineup__row">
      <a class="lineup__pic" href="${href('jugador', p.id)}">${photoBlock(p, 'ph--thumb')}</a>
      <span class="lineup__who">
        <a class="lineup__name" href="${href('jugador', p.id)}">${esc(p.name)}</a>
        <span class="lineup__meta">${esc(jersey(p))} · ${num(row.goals, 0)} goles</span>
      </span>
      <span class="lineup__rating ${row.avg_score == null ? 'is-void' : ''}">${rating(row.avg_score)}</span>
    </li>`;
  };

  const voteRow = (row) => {
    const p = row.player;
    const mine = myVotes?.get?.(p.id);
    const blocked = !me || (me === p.id && !state.allowSelfVote);
    return `<li class="vote" data-target="${esc(p.id)}">
      <div class="vote__who">
        <span class="vote__name">${esc(p.name)}</span>
        <span class="vote__meta">${mine ? `Tu nota: ${mine}` : 'Sin nota'}</span>
      </div>
      <div class="vote__scale" role="group" aria-label="Nota para ${esc(p.name)}">
        ${Array.from({ length: 10 }, (_, i) => i + 1)
          .map(
            (n) =>
              `<button class="vote__btn${mine === n ? ' is-on' : ''}" type="button" data-score="${n}"
                ${blocked || mine ? 'disabled' : ''} aria-label="${n}">${n}</button>`
          )
          .join('')}
      </div>
    </li>`;
  };

  const html = `<div class="view">
    <header class="mhead">
      <a class="back" href="${href('partidos')}"><span aria-hidden="true">←</span> Partidos</a>
      <div class="mhead__meta">
        <span class="kicker">${esc(longDate(summary.played_on))}</span>
        <span class="chip ${open ? 'chip--acid' : 'chip--dim'}">${open ? 'Votación abierta' : 'Cerrado'}</span>
      </div>
      <div class="mhead__score">
        <span class="mhead__side">A</span>
        <span class="mhead__nums">${num(summary.goals_a, 0)}<i>—</i>${num(summary.goals_b, 0)}</span>
        <span class="mhead__side">B</span>
      </div>
      ${
        mvp
          ? `<a class="mhead__mvp" href="${href('jugador', mvp.id)}">
              <span class="kicker kicker--acid">MVP del partido</span>
              <span class="mhead__mvpname">${esc(mvp.name)}</span>
              <span class="mhead__mvpnote">${rating(mvp.stats?.avg_rating)}</span>
            </a>`
          : ''
      }
    </header>

    ${
      lineup.length
        ? `<section class="block">
            ${sectionHead('Alineaciones', 'Quién jugó')}
            <div class="teams">
              <div class="team">
                <h3 class="team__title"><span class="tag">A</span> Equipo A</h3>
                <ol class="lineup">${teamA.length ? teamA.map(lineRow).join('') : '<li class="lineup__empty">Sin jugadores</li>'}</ol>
              </div>
              <div class="team">
                <h3 class="team__title"><span class="tag">B</span> Equipo B</h3>
                <ol class="lineup">${teamB.length ? teamB.map(lineRow).join('') : '<li class="lineup__empty">Sin jugadores</li>'}</ol>
              </div>
            </div>
          </section>`
        : voidBlock('Sin alineación', 'El admin todavía no ha publicado quién juega este partido.')
    }

    ${
      isClosed
        ? `<section class="block">
            ${sectionHead('Votaciones', 'Notas del partido')}
            <ol class="ratingList">
              ${lineup
                .filter((l) => l.avg_score != null)
                .sort((a, b) => b.avg_score - a.avg_score)
                .map(
                  (l) => `<li class="ratingRow">
                    <span class="ratingRow__name">${esc(l.player.name)}</span>
                    <span class="ratingRow__bar"><i style="width:${Math.max(4, (l.avg_score / 10) * 100)}%"></i></span>
                    <span class="ratingRow__value">${rating(l.avg_score)}</span>
                    <span class="ratingRow__votes">${num(l.votes, 0)} votos</span>
                  </li>`
                )
                .join('') || '<li class="lineup__empty">Sin notas registradas</li>'}
            </ol>
          </section>`
        : ''
    }

    ${
      open
        ? `<section class="block">
            ${sectionHead('Votar', 'Pon la nota', me ? '' : '<span class="chip chip--warn">Elige jugador primero</span>')}
            ${
              me
                ? `<p class="hint">Estás votando como <b>${esc(playerById(me)?.name || 'tu jugador')}</b>. Una nota por jugador y partido.</p>`
                : `<p class="hint">Entra y elige quién eres para poder votar.</p>`
            }
            <ol class="votes">${lineup.map(voteRow).join('') || '<li class="lineup__empty">Sin alineación publicada</li>'}</ol>
          </section>`
        : ''
    }
  </div>`;

  return {
    html,
    mount(root) {
      root.querySelectorAll('.vote').forEach((row) => {
        row.addEventListener('click', async (ev) => {
          const btn = ev.target.closest('.vote__btn');
          if (!btn || btn.disabled) return;
          const score = Number(btn.dataset.score);
          const target = row.dataset.target;
          btn.disabled = true;
          try {
            await castVote(summary.id, target, score);
            row.querySelectorAll('.vote__btn').forEach((b) => {
              b.classList.toggle('is-on', b === btn);
              b.disabled = true;
            });
            const meta = row.querySelector('.vote__meta');
            if (meta) meta.textContent = `Tu nota: ${score}`;
            toast('Nota guardada');
          } catch (err) {
            btn.disabled = false;
            toast(errorMessage(err), 'error');
          }
        });
      });
    },
  };
}

/* ------------------------------------------------------------------ */
/* Perfil de jugador                                                   */
/* ------------------------------------------------------------------ */

function chartSVG(points) {
  const w = 720;
  const h = 220;
  const padX = 14;
  const padY = 18;
  const xs = (i) => padX + (i * (w - padX * 2)) / Math.max(points.length - 1, 1);
  const ys = (v) => h - padY - ((Math.min(10, Math.max(1, v)) - 1) / 9) * (h - padY * 2);

  const coords = points.map((v, i) => [xs(i), ys(v)]);
  const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${xs(points.length - 1).toFixed(1)},${h - padY} L${padX},${h - padY} Z`;
  const grid = [3, 5, 7, 9].map((v) => `<line x1="${padX}" x2="${w - padX}" y1="${ys(v)}" y2="${ys(v)}" class="chart__grid"/>`).join('');

  return `<svg class="chart__svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Evolución de la nota">
    ${grid}
    <path class="chart__area" d="${area}"/>
    <path class="chart__line" d="${line}" vector-effect="non-scaling-stroke"/>
    ${coords.map(([x, y]) => `<circle class="chart__dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" vector-effect="non-scaling-stroke"/>`).join('')}
  </svg>`;
}

export async function playerView(id) {
  const p = playerById(id);

  if (!p) {
    return {
      html: `<div class="view">${head('Jugador', 'NO <span class="outline">EXISTE</span>')}
        ${voidBlock('Jugador no encontrado', 'Puede que se haya eliminado de la plantilla.')}</div>`,
      mount() {},
    };
  }

  const s = p.stats || {};
  const history = await playerHistory(p.id);
  const rated = history.filter((h) => h.avg_score != null).slice(0, 10).reverse();

  const html = `<div class="view">
    <header class="phead">
      <div class="phead__media">${photoBlock(p, 'ph--hero')}</div>
      <span class="phead__ghost" aria-hidden="true">${esc(jersey(p))}</span>
      <div class="phead__id">
        <span class="kicker">Dorsal ${esc(p.shirt_number ? pad2(p.shirt_number) : '—')} · Plantilla</span>
        <h1 class="phead__name">${esc(p.name)}</h1>
        <p class="phead__sub">${num(s.played, 0)} partidos · ${num(s.wins, 0)} victorias · ${num(s.goals, 0)} goles</p>
      </div>
    </header>

    <div class="figures figures--grid">
      <div class="figure figure--cell"><span class="figure__value">${num(s.played, 0)}</span><span class="figure__label">Partidos</span></div>
      <div class="figure figure--cell"><span class="figure__value">${num(s.wins, 0)}</span><span class="figure__label">Victorias</span></div>
      <div class="figure figure--cell"><span class="figure__value">${num(s.goals, 0)}</span><span class="figure__label">Goles</span></div>
      <div class="figure figure--cell"><span class="figure__value figure__value--acid">${num(s.mvps, 0)}</span><span class="figure__label">MVP</span></div>
      <div class="figure figure--cell"><span class="figure__value">${rating(s.avg_rating)}</span><span class="figure__label">Nota media</span></div>
      <div class="figure figure--cell"><span class="figure__value">${s.conceded_pm == null ? '—' : Number(s.conceded_pm).toFixed(2).replace('.', ',')}</span><span class="figure__label">Encajados / partido</span></div>
    </div>

    <section class="block chart">
      ${sectionHead('Evolución', 'Nota partido a partido')}
      ${rated.length >= 2
        ? `${chartSVG(rated.map((r) => Number(r.avg_score)))}
           <div class="chart__axis">
             ${rated.map((r) => `<span>${dateParts(r.played_on).day} ${dateParts(r.played_on).month}</span>`).join('')}
           </div>`
        : '<p class="hint">Necesita al menos dos partidos con notas para dibujar la evolución.</p>'}
    </section>

    <section class="block">
      ${sectionHead('Historial', 'Últimos partidos')}
      ${
        history.length
          ? `<ol class="hlist">
              ${history
                .slice(0, 12)
                .map((h) => {
                  const gf = h.gf ?? 0;
                  const ga = h.ga ?? 0;
                  const outcome = gf > ga ? 'V' : gf === ga ? 'E' : 'D';
                  return `<li>
                    <a class="hrow" href="${href('partidos', h.match_id)}">
                      <span class="hrow__outcome hrow__outcome--${outcome.toLowerCase()}">${outcome}</span>
                      <span class="hrow__date"><b>${dateParts(h.played_on).day}</b>${dateParts(h.played_on).month}</span>
                      <span class="hrow__score">${num(gf, 0)}<i>—</i>${num(ga, 0)}</span>
                      <span class="hrow__goals">${num(h.goals, 0)} goles</span>
                      <span class="hrow__rating ${h.avg_score == null ? 'is-void' : ''}">${rating(h.avg_score)}</span>
                    </a>
                  </li>`;
                })
                .join('')}
            </ol>`
          : '<p class="hint">Todavía no hay partidos disputados.</p>'
      }
    </section>
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
      <div class="scard__media">${photoBlock(p, 'ph--squad')}</div>
      <span class="scard__num">${esc(jersey(p))}</span>
      <span class="scard__name">${esc(p.name)}</span>
      <span class="scard__stat">${rating(p.stats?.avg_rating)} · ${num(p.stats?.goals, 0)} G</span>
    </a>`;

  const html = `<div class="view">
    ${head('Plantilla', 'EL <span class="outline">EQUIPO</span>', `${players.length} jugadores`)}
    ${
      players.length
        ? `<div class="squad">${players.map(card).join('')}</div>`
        : voidBlock('Plantilla vacía', 'Añade al primer jugador desde administración.')
    }
    ${
      inactive.length
        ? `<section class="block">
            ${sectionHead('Fuera', 'Jugadores inactivos')}
            <div class="squad squad--dim">${inactive.map(card).join('')}</div>
          </section>`
        : ''
    }
  </div>`;

  return { html, mount() {} };
}
