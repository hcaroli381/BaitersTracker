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
