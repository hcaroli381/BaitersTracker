import { sb, state, deviceToken, photoURL } from './core.js';
import { getConfig } from './config.js';
import {
  groupAppearances,
  segmentTeams,
  segmentCount,
  scoreFromAppearances,
  voteSummary,
} from './rules.js';

/* ------------------------------------------------------------------ */
/* Sesión                                                              */
/* ------------------------------------------------------------------ */

export async function signIn(email, password) {
  const { data, error } = await sb().auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  await sb().auth.signOut();
}

export async function session() {
  const { data } = await sb().auth.getSession();
  return data?.session || null;
}

/* ------------------------------------------------------------------ */
/* Carga base                                                          */
/* ------------------------------------------------------------------ */

function decorate(player, stats) {
  return {
    ...player,
    photo: photoURL(player.avatar_path),
    stats: stats || {
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goals: 0,
      mvps: 0,
      avg_rating: null,
      conceded_pm: null,
    },
  };
}

export async function loadCore() {
  const [players, stats, matches, settings] = await Promise.all([
    sb().from('players').select('*').order('name'),
    sb().from('player_stats').select('*'),
    sb().from('match_summary').select('*').order('played_on', { ascending: false }),
    sb().from('settings').select('*').eq('id', 1).maybeSingle(),
  ]);

  state.allowSelfVote = settings?.data?.allow_self_vote === true;
  state.wildcardsPickable = settings?.data?.wildcards_pickable === true;

  if (players.error) throw players.error;
  if (stats.error) throw stats.error;
  if (matches.error) throw matches.error;

  const statsById = new Map((stats.data || []).map((s) => [s.id, s]));
  state.stats = stats.data || [];
  state.matches = matches.data || [];
  state.players = (players.data || [])
    .map((p) => decorate(p, statsById.get(p.id)))
    .sort((a, b) => {
      const an = a.shirt_number ?? 999;
      const bn = b.shirt_number ?? 999;
      if (an !== bn) return an - bn;
      return a.name.localeCompare(b.name);
    });
}

/* ------------------------------------------------------------------ */
/* Consultas                                                           */
/* ------------------------------------------------------------------ */

export function playerById(id) {
  return state.players.find((p) => p.id === id) || null;
}

/** Valor numérico con el que se ordena cada ranking (null si no hay dato). */
export function rawValue(player, key) {
  const s = player.stats || {};
  switch (key) {
    case 'goals':
      return s.goals ?? 0;
    case 'mvps':
      return s.mvps ?? 0;
    case 'wins':
      return s.wins ?? 0;
    case 'rating':
      return s.avg_rating == null ? null : Number(s.avg_rating);
    case 'conceded':
      return s.conceded_pm == null ? null : Number(s.conceded_pm);
    default:
      return 0;
  }
}

export function sortedBy(key, dir = 'desc') {
  const rows = [...state.players].filter((p) => p.active !== false);
  rows.sort((a, b) => {
    const va = rawValue(a, key);
    const vb = rawValue(b, key);
    // sin dato: siempre al final
    if (va == null && vb == null) return a.name.localeCompare(b.name);
    if (va == null) return 1;
    if (vb == null) return -1;
    const diff = dir === 'asc' ? va - vb : vb - va;
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name);
  });
  return rows;
}

export function lastClosedMatch() {
  return state.matches.find((m) => m.status === 'closed') || null;
}

export function nextMatch() {
  const open = state.matches.filter((m) => m.status === 'open');
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const upcoming = open.filter((m) => m.played_on >= iso).sort((a, b) => (a.played_on > b.played_on ? 1 : -1));
  return upcoming[0] || open[0] || null;
}

/**
 * Detalle de un partido: alineación por tramos, notas medias y TODOS los votos (son visibles).
 *
 * La alineación se lee de `appearances` (una fila por jugador y tramo) porque un partido
 * puede tener cambios de equipo. `lineup` tiene una entrada por jugador con sus tramos;
 * `segments` tiene los equipos de cada tramo para poder enseñarlos.
 * `votesByTarget`: Map(jugador → [{ voter, score }]) ordenado de mayor a menor nota.
 */
export async function matchDetail(id) {
  const [summary, appearances, votes, mvpRow, tieVotes] = await Promise.all([
    sb().from('match_summary').select('*').eq('id', id).maybeSingle(),
    sb().from('appearances').select('player_id, segment, team, goals').eq('match_id', id),
    sb().from('votes').select('voter_id, target_id, score').eq('match_id', id),
    sb().from('match_mvp').select('*').eq('match_id', id).maybeSingle(),
    sb().from('mvp_tie_votes').select('voter_id, target_id, candidate_key').eq('match_id', id),
  ]);
  if (summary.error) throw summary.error;
  if (appearances.error) throw appearances.error;
  if (votes.error) throw votes.error;
  if (!summary.data) return null;

  const me = state.me;
  const myVotes = new Map();
  const votesByTarget = new Map();
  (votes.data || []).forEach((v) => {
    if (me && v.voter_id === me) myVotes.set(v.target_id, v.score);
    const list = votesByTarget.get(v.target_id) || [];
    list.push({ voter: v.voter_id, score: v.score });
    votesByTarget.set(v.target_id, list);
  });
  votesByTarget.forEach((list) => list.sort((a, b) => b.score - a.score));

  const scores = voteSummary(votes.data || []);
  const rows = [...groupAppearances(appearances.data || []).values()]
    .map((entry) => ({
      ...entry,
      player: playerById(entry.player_id),
      avg_score: scores.get(entry.player_id)?.avg ?? null,
    }))
    .filter((row) => row.player)
    .sort((a, b) => {
      const at = a.startTeam || '';
      const bt = b.startTeam || '';
      if (at !== bt) return at < bt ? -1 : 1;
      if ((b.goals ?? 0) !== (a.goals ?? 0)) return (b.goals ?? 0) - (a.goals ?? 0);
      return a.player.name.localeCompare(b.player.name);
    });

  const total = segmentCount(appearances.data || []);
  const segments = Array.from({ length: total }, (_, i) => {
    const teams = segmentTeams(appearances.data || [], i + 1);
    const describe = (list) =>
      list
        .map((r) => {
          const p = playerById(r.player_id);
          return p ? { id: p.id, name: p.name, goals: Number(r.goals ?? 0) || 0 } : null;
        })
        .filter(Boolean);
    return {
      segment: i + 1,
      A: describe(teams.A),
      B: describe(teams.B),
      goals: scoreFromAppearances([...teams.A, ...teams.B]),
    };
  });

  const scored = rows.filter((r) => r.avg_score != null).sort((a, b) => b.avg_score - a.avg_score);

  // MVP y desempate los decide la base (vista `match_mvp`). Si la migración 03
  // todavía no está aplicada, la ficha sigue funcionando con la mejor media.
  const mvpInfoRow = mvpRow.error ? null : mvpRow.data;
  const tieRows = tieVotes.error ? [] : tieVotes.data || [];
  const candidateKey = mvpInfoRow?.candidate_key || null;
  const candidateIds = candidateKey ? candidateKey.split(',') : [];
  const tieCounts = new Map();
  tieRows
    .filter((v) => candidateKey && v.candidate_key === candidateKey)
    .forEach((v) => tieCounts.set(v.target_id, (tieCounts.get(v.target_id) || 0) + 1));

  const tieCandidates = candidateIds
    .map((pid) => {
      const entry = scores.get(pid);
      const player = playerById(pid);
      if (!entry || !player) return null;
      return { player, avg: entry.avg, notes: entry.count, votes: tieCounts.get(pid) || 0 };
    })
    .filter(Boolean)
    .sort((a, b) => a.player.name.localeCompare(b.player.name));

  const winner = mvpInfoRow?.mvp_player_id ? playerById(mvpInfoRow.mvp_player_id) : null;
  const mvpInfo = winner
    ? {
        player: winner,
        score: mvpInfoRow.mvp_avg == null ? null : Number(mvpInfoRow.mvp_avg),
        decided_by: mvpInfoRow.decided_by || 'notas',
        tie_votes: Number(mvpInfoRow.mvp_tie_votes || 0),
      }
    : !mvpInfoRow && summary.data.status === 'closed' && scored.length
      ? { player: scored[0].player, score: scored[0].avg_score, decided_by: 'notas', tie_votes: 0 }
      : null;

  const mine = state.me
    ? tieRows.find((v) => v.voter_id === state.me && v.candidate_key === candidateKey)
    : null;

  const tie =
    mvpInfoRow?.tie && tieCandidates.length >= 2
      ? {
          candidate_key: candidateKey,
          candidates: tieCandidates,
          total: tieCandidates.reduce((n, c) => n + c.votes, 0),
          eligible: Number(mvpInfoRow.eligible || 0),
          my_vote: mine?.target_id || null,
          resolved: Boolean(mvpInfoRow.resolved),
          winner_id: mvpInfoRow.resolved ? mvpInfoRow.mvp_player_id : null,
        }
      : null;

  return {
    summary: summary.data,
    lineup: rows,
    segments,
    segmentCount: total,
    myVotes,
    votesByTarget,
    votes: votes.data || [],
    mvp: mvpInfo,
    tie,
  };
}

export async function playerHistory(playerId) {
  const base = 'match_id, player_id, team, goals, status, gf, ga, avg_score, votes, teams, stints';
  const withSegments = `${base}, wins, draws, losses, segment_results`;
  let { data, error } = await sb().from('player_match').select(withSegments).eq('player_id', playerId);
  // Antes de aplicar la migración 08 la vista aún no tiene estas columnas:
  // el perfil sigue funcionando con lo que ya había.
  if (error) {
    ({ data, error } = await sb().from('player_match').select(base).eq('player_id', playerId));
  }
  if (error) throw error;

  const dates = new Map(state.matches.map((m) => [m.id, m.played_on]));
  return (data || [])
    .map((row) => ({ ...row, played_on: dates.get(row.match_id) || null }))
    .sort((a, b) => (String(a.played_on) < String(b.played_on) ? 1 : -1));
}

/* ------------------------------------------------------------------ */
/* Identidad del dispositivo                                           */
/* ------------------------------------------------------------------ */

export async function whoAmI() {
  const { data, error } = await sb().rpc('me', { p_token: deviceToken() });
  if (error) throw error;
  return data || null;
}

export async function claimPlayer(playerId, shirtNumber = null) {
  const { error } = await sb().rpc('claim_player', {
    p_token: deviceToken(),
    p_player: playerId,
    p_number: shirtNumber,
  });
  if (error) throw error;
  return playerId;
}

/** Dorsales ya ocupados (para no ofrecerlos en la elección). */
export function takenNumbers(exceptId = null) {
  const taken = new Set();
  state.players.forEach((p) => {
    if (p.id !== exceptId && p.shirt_number) taken.add(Number(p.shirt_number));
  });
  return taken;
}

export async function castVote(matchId, targetId, score) {
  const { error } = await sb().rpc('cast_vote', {
    p_token: deviceToken(),
    p_match: matchId,
    p_target: targetId,
    p_score: score,
  });
  if (error) throw error;
}

/** Voto del desempate del MVP (solo jugadores del partido con voto). */
export async function castMvpTieVote(matchId, targetId) {
  const { error } = await sb().rpc('cast_mvp_tie_vote', {
    p_token: deviceToken(),
    p_match: matchId,
    p_target: targetId,
  });
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* Administración                                                      */
/* ------------------------------------------------------------------ */

export async function adminRpc(name, args) {
  const { data, error } = await sb().rpc(name, args);
  if (error) throw error;
  return data;
}

export async function checkAdmin(pw) {
  const { data, error } = await sb().rpc('admin_check', { p_pw: pw });
  if (error) throw error;
  return Boolean(data);
}

export async function uploadPlayerPhoto(playerId, file, pw, previousPath = null) {
  const cfg = getConfig();
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.type)) throw new Error('Formato no admitido: usa JPG, PNG o WebP');
  if (file.size > 5 * 1024 * 1024) throw new Error('La foto no puede pasar de 5 MB');

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${playerId}/${Date.now()}.${ext}`;

  const up = await sb().storage.from(cfg.bucket).upload(path, file, {
    contentType: file.type,
    cacheControl: '3600',
    upsert: false,
  });
  if (up.error) throw up.error;

  try {
    await adminRpc('admin_set_avatar', { p_pw: pw, p_player: playerId, p_path: path });
  } catch (err) {
    // La foto nueva no llegó a asignarse: no dejamos el archivo huérfano.
    await removePhotoFiles([path]);
    throw err;
  }
  // La foto anterior ya no se usa: se borra del bucket para no acumular archivos.
  await removePhotoFiles([previousPath]);
  return path;
}

export async function clearPlayerPhoto(playerId, pw, previousPath = null) {
  await adminRpc('admin_set_avatar', { p_pw: pw, p_player: playerId, p_path: null });
  await removePhotoFiles([previousPath]);
}

/** Borra archivos del bucket de fotos. Un fallo aquí no debe tumbar la acción principal. */
async function removePhotoFiles(paths) {
  const list = paths.filter((p) => p && !/^https?:\/\//i.test(p));
  if (!list.length) return;
  try {
    await sb().storage.from(getConfig().bucket).remove(list);
  } catch (err) {
    console.warn('No se pudo borrar la foto anterior', err);
  }
}

/* ------------------------------------------------------------------ */
/* Tiempo real                                                         */
/* ------------------------------------------------------------------ */

let liveChannel = null;

/**
 * Escucha los cambios de votos, desempates, partidos y alineaciones.
 * `onChange` se llama con un pequeño retardo para agrupar ráfagas de cambios.
 */
export function subscribeLive(onChange) {
  if (liveChannel) return;
  let timer = null;
  const ping = () => {
    clearTimeout(timer);
    timer = setTimeout(onChange, 400);
  };
  liveChannel = sb().channel('bt-live');
  ['votes', 'mvp_tie_votes', 'matches', 'appearances'].forEach((table) => {
    liveChannel.on('postgres_changes', { event: '*', schema: 'public', table }, ping);
  });
  liveChannel.subscribe();
}

/** Jugadores que jugaron un partido (ids únicos), para elegir votantes y votados. */
export async function loadMatchPlayerIds(matchId) {
  const { data, error } = await sb().from('appearances').select('player_id').eq('match_id', matchId);
  if (error) throw error;
  return [...new Set((data || []).map((r) => r.player_id))];
}

/** Votos de un partido, para la gestión de admin. */
export async function loadMatchVotes(matchId) {
  const { data, error } = await sb()
    .from('votes')
    .select('id, voter_id, target_id, score')
    .eq('match_id', matchId);
  if (error) throw error;
  return data || [];
}
