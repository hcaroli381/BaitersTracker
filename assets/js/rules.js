/**
 * BaitersTracker — reglas del juego en JavaScript puro.
 *
 * Aquí no se importa nada: lo usan la app y las pruebas (`tests/`).
 * La base de datos impone las mismas reglas en `cast_vote`, `admin_set_lineup`, etc.;
 * esto solo sirve para saber qué enseñar en pantalla.
 */

/** La votación abre una hora después del inicio programado. */
export const VOTE_DELAY_MS = 60 * 60 * 1000;

/** Hora por defecto si un partido antiguo no tiene hora guardada. */
export const DEFAULT_KICKOFF_TIME = '21:00';

/** Tramos máximos de un partido (la base lo comprueba igual). */
export const MAX_SEGMENTS = 9;

/* ------------------------------------------------------------------ */
/* Fechas y ventana de votación                                        */
/* ------------------------------------------------------------------ */

/**
 * Inicio programado del partido como Date.
 * Usa `kickoff_at`; si falta, cae a la fecha suelta a las 21:00 locales.
 */
export function kickoffDate(match) {
  if (!match) return null;
  if (match.kickoff_at) {
    const d = new Date(match.kickoff_at);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const day = String(match.played_on || '').slice(0, 10);
  if (!day) return null;
  const d = new Date(`${day}T${DEFAULT_KICKOFF_TIME}:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Momento exacto en que se abre la votación (inicio + 1 h). */
export function voteOpensDate(match) {
  const k = kickoffDate(match);
  return k ? new Date(k.getTime() + VOTE_DELAY_MS) : null;
}

/**
 * ¿Se puede votar ya? Solo importan el estado y la hora:
 * la alineación puede estar a medias, eso no bloquea.
 */
export function votesOpen(match, now = new Date()) {
  if (!match || match.status !== 'open') return false;
  const opens = voteOpensDate(match);
  if (!opens) return true;
  return now.getTime() >= opens.getTime();
}

/** Milisegundos que faltan para que abra la votación (0 si ya está abierta). */
export function msUntilVotesOpen(match, now = new Date()) {
  const opens = voteOpensDate(match);
  if (!opens) return 0;
  return Math.max(0, opens.getTime() - now.getTime());
}

/* ------------------------------------------------------------------ */
/* Tramos y equipos                                                    */
/* ------------------------------------------------------------------ */

/**
 * Convierte las filas de `appearances` en una entrada por jugador.
 * Cada jugador puede tener varios tramos (`stints`) si hubo cambio de equipo.
 *
 * @param {Array<{player_id:string, segment?:number, team?:string, goals?:number}>} rows
 * @returns {Map<string, {player_id:string, segment:number, stints:Array, teams:string[],
 *   startTeam:string|null, lastTeam:string|null, switched:boolean, goals:number}>}
 */
export function groupAppearances(rows) {
  const byPlayer = new Map();

  (rows || []).forEach((row) => {
    if (!row || !row.player_id) return;
    const segment = Number(row.segment ?? 1) || 1;
    const goals = Number(row.goals ?? 0) || 0;

    let entry = byPlayer.get(row.player_id);
    if (!entry) {
      entry = { player_id: row.player_id, segment, stints: [], goals: 0 };
      byPlayer.set(row.player_id, entry);
    }
    entry.stints.push({ segment, team: row.team || null, goals });
    entry.goals += goals;
  });

  byPlayer.forEach((entry) => {
    entry.stints.sort((a, b) => a.segment - b.segment);
    entry.segment = entry.stints[0]?.segment ?? 1;
    entry.teams = [...new Set(entry.stints.map((s) => s.team).filter(Boolean))];
    entry.startTeam = entry.stints.find((s) => s.team)?.team ?? null;
    entry.lastTeam = [...entry.stints].reverse().find((s) => s.team)?.team ?? null;
    entry.switched = entry.teams.length > 1;
  });

  return byPlayer;
}

/** Número de tramos que tiene un partido (1 si no hubo cambios). */
export function segmentCount(rows) {
  return (rows || []).reduce((max, row) => Math.max(max, Number(row?.segment ?? 1) || 1), 1);
}

/** Jugadores de un tramo, separados por equipo. */
export function segmentTeams(rows, segment = 1) {
  const out = { A: [], B: [] };
  (rows || []).forEach((row) => {
    if (!row || (Number(row.segment ?? 1) || 1) !== Number(segment)) return;
    if (row.team === 'A' || row.team === 'B') out[row.team].push(row);
  });
  return out;
}

/**
 * Marcador: goles a favor de cada equipo sumando todos los tramos.
 * Los goles se guardan en el tramo en el que se marcaron, así que un jugador
 * que cambió de equipo aporta a cada lado lo suyo.
 */
export function scoreFromAppearances(rows) {
  let a = 0;
  let b = 0;
  (rows || []).forEach((row) => {
    const goals = Number(row?.goals ?? 0) || 0;
    if (row?.team === 'A') a += goals;
    else if (row?.team === 'B') b += goals;
  });
  return { a, b };
}

/** Nombres de los jugadores que cambiaron de equipo en el partido. */
export function switchedPlayers(rows) {
  return [...groupAppearances(rows).values()].filter((e) => e.switched);
}

/* ------------------------------------------------------------------ */
/* Notas                                                               */
/* ------------------------------------------------------------------ */

/**
 * Media y número de notas por jugador, calculadas en el navegador.
 * Redondeo a dos decimales (lo que se enseña en el detalle).
 */
export function voteSummary(votes) {
  const acc = new Map();
  (votes || []).forEach((v) => {
    if (!v || !v.target_id) return;
    const score = Number(v.score);
    if (!Number.isFinite(score)) return;
    const entry = acc.get(v.target_id) || { total: 0, count: 0 };
    entry.total += score;
    entry.count += 1;
    acc.set(v.target_id, entry);
  });

  const out = new Map();
  acc.forEach((entry, id) => {
    out.set(id, { avg: Math.round((entry.total / entry.count) * 100) / 100, count: entry.count });
  });
  return out;
}
