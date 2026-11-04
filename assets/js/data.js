import { sb, state, deviceToken, photoURL } from './core.js';
import { getConfig } from './config.js';
import { demoStore } from './demo.js';

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
  if (state.demo) {
    const d = demoStore();
    state.players = d.players.map((p) => ({ ...p, photo: '' }));
    state.stats = d.players.map((p) => p.stats);
    state.matches = d.matches
      .map((m) => ({ ...m }))
      .sort((a, b) => (a.played_on < b.played_on ? 1 : -1));
    state.allowSelfVote = false;
    return;
  }

  const [players, stats, matches, settings] = await Promise.all([
    sb().from('players').select('*').order('name'),
    sb().from('player_stats').select('*'),
    sb().from('match_summary').select('*').order('played_on', { ascending: false }),
    sb().from('settings').select('*').eq('id', 1).maybeSingle(),
  ]);

  state.allowSelfVote = settings?.data?.allow_self_vote === true;

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

export function sortedBy(key, dir = 'desc') {
  const rows = [...state.players].filter((p) => p.active !== false);
  const val = (p) => {
    const s = p.stats || {};
    switch (key) {
      case 'goals':
        return s.goals ?? 0;
      case 'mvps':
        return s.mvps ?? 0;
      case 'wins':
        return s.wins ?? 0;
      case 'rating':
        return s.avg_rating ?? -1;
      case 'conceded':
        return s.conceded_pm ?? 999;
      case 'played':
        return s.played ?? 0;
      default:
        return 0;
    }
  };
  rows.sort((a, b) => {
    const diff = dir === 'asc' ? val(a) - val(b) : val(b) - val(a);
    if (diff !== 0) return diff;
    return (val(b) - val(a)) || a.name.localeCompare(b.name);
  });
  return rows;
}

export function lastClosedMatch() {
  return state.matches.find((m) => m.status === 'closed') || null;
}

export function nextMatch() {
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = state.matches
    .filter((m) => m.status === 'open' && m.played_on >= today)
    .sort((a, b) => (a.played_on > b.played_on ? 1 : -1));
  return upcoming[0] || state.matches.find((m) => m.status === 'open') || null;
}

export async function matchDetail(id) {
  if (state.demo) {
    const d = demoStore();
    const summary = d.matches.find((m) => m.id === id);
    if (!summary) return null;
    const lineup = d.lineups
      .filter((l) => l.match_id === id)
      .map((l) => ({ ...l, player: d.players.find((p) => p.id === l.player_id) }))
      .sort((a, b) =>
        a.team === b.team
          ? a.player.name.localeCompare(b.player.name)
          : a.team < b.team
          ? -1
          : 1
      );
    const scored = lineup.filter((l) => l.avg_score != null).sort((a, b) => b.avg_score - a.avg_score);
    return {
      summary,
      lineup,
      myVotes: new Map(),
      votes: [],
      mvp: summary.status === 'closed' && scored.length ? scored[0].player : null,
    };
  }

  const [summary, lineup, votes] = await Promise.all([
    sb().from('match_summary').select('*').eq('id', id).maybeSingle(),
    sb().from('player_match').select('*').eq('match_id', id),
    sb().from('votes').select('voter_id, target_id, score').eq('match_id', id),
  ]);
  if (summary.error) throw summary.error;
  if (lineup.error) throw lineup.error;
  if (votes.error) throw votes.error;
  if (!summary.data) return null;

  const myVotes = new Map();
  const me = state.me;
  (votes.data || []).forEach((v) => {
    if (me && v.voter_id === me) myVotes.set(v.target_id, v.score);
  });

  const rows = (lineup.data || [])
    .map((l) => ({ ...l, player: playerById(l.player_id) }))
    .filter((l) => l.player)
    .sort((a, b) => {
      if (a.team !== b.team) return a.team < b.team ? -1 : 1;
      return a.player.name.localeCompare(b.player.name);
    });

  const scored = rows.filter((l) => l.avg_score != null).sort((a, b) => b.avg_score - a.avg_score);
  return {
    summary: summary.data,
    lineup: rows,
    myVotes,
    votes: votes.data || [],
    mvp: summary.data.status === 'closed' && scored.length ? scored[0].player : null,
  };
}

export async function playerHistory(playerId) {
  if (state.demo) {
    const d = demoStore();
    return d.lineups
      .filter((l) => l.player_id === playerId)
      .map((l) => {
        const match = d.matches.find((m) => m.id === l.match_id);
        return { ...l, played_on: match?.played_on || null };
      })
      .sort((a, b) => (a.played_on < b.played_on ? 1 : -1));
  }

  const { data, error } = await sb()
    .from('player_match')
    .select('match_id, player_id, team, goals, status, gf, ga, avg_score, votes')
    .eq('player_id', playerId);
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
  if (state.demo) return null;
  const { data, error } = await sb().rpc('me', { p_token: deviceToken() });
  if (error) throw error;
  return data || null;
}

export async function claimPlayer(playerId, shirtNumber = null) {
  if (state.demo) return playerId;
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
  if (state.demo) throw new Error('Modo demo: las votaciones no se guardan');
  const { error } = await sb().rpc('cast_vote', {
    p_token: deviceToken(),
    p_match: matchId,
    p_target: targetId,
    p_score: score,
  });
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* Administración                                                      */
/* ------------------------------------------------------------------ */

export async function adminRpc(name, args) {
  if (state.demo) throw new Error('Modo demo: la administración está desactivada');
  const { data, error } = await sb().rpc(name, args);
  if (error) throw error;
  return data;
}

export async function checkAdmin(pw) {
  if (state.demo) return true;
  const { data, error } = await sb().rpc('admin_check', { p_pw: pw });
  if (error) throw error;
  return Boolean(data);
}

export async function uploadPlayerPhoto(playerId, file, pw) {
  if (state.demo) throw new Error('Modo demo: la subida está desactivada');
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

  await adminRpc('admin_set_avatar', { p_pw: pw, p_player: playerId, p_path: path });
  return path;
}

export async function clearPlayerPhoto(playerId, pw) {
  await adminRpc('admin_set_avatar', { p_pw: pw, p_player: playerId, p_path: null });
}
