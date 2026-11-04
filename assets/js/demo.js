/**
 * Datos de demostración — solo para revisar el diseño sin tocar Supabase.
 * Se generan de forma determinista para que las cifras cuadren entre pantallas.
 */

const PLAYERS = [
  { name: 'Iván Cortés', shirt_number: 1 },
  { name: 'Álex Roca', shirt_number: 2 },
  { name: 'Pablo Mena', shirt_number: 4 },
  { name: 'Rubén Lara', shirt_number: 5 },
  { name: 'Hugo Vidal', shirt_number: 6 },
  { name: 'Nico Braulio', shirt_number: 7 },
  { name: 'Marc Soler', shirt_number: 8 },
  { name: 'Diego Ferrán', shirt_number: 9 },
  { name: 'Sam Suamili', shirt_number: 10 },
  { name: 'Adrián Peña', shirt_number: 11 },
  { name: 'Jorge Amat', shirt_number: 14 },
  { name: 'Bruno Sanz', shirt_number: 21 },
];

const MATCHES = [
  { id: 'm1', played_on: '2026-10-05', status: 'closed', goals_a: 3, goals_b: 2 },
  { id: 'm2', played_on: '2026-10-12', status: 'closed', goals_a: 1, goals_b: 1 },
  { id: 'm3', played_on: '2026-10-19', status: 'closed', goals_a: 5, goals_b: 4 },
  { id: 'm4', played_on: '2026-10-26', status: 'closed', goals_a: 2, goals_b: 3 },
  { id: 'm5', played_on: '2026-11-02', status: 'closed', goals_a: 4, goals_b: 3 },
  { id: 'm6', played_on: '2026-11-09', status: 'open', goals_a: 0, goals_b: 0 },
  { id: 'm7', played_on: '2026-11-16', status: 'open', goals_a: 0, goals_b: 0 },
];

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

let cache = null;

export function demoStore() {
  if (cache) return cache;

  const players = PLAYERS.map((p, i) => ({
    id: `p${i + 1}`,
    name: p.name,
    shirt_number: p.shirt_number,
    avatar_path: null,
    photo: '',
    active: true,
    claimed: i === 0,
    device_hash: null,
    created_at: '2026-09-01T10:00:00Z',
    stats: {
      id: `p${i + 1}`,
      name: p.name,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goals: 0,
      mvps: 0,
      avg_rating: null,
      conceded_pm: null,
    },
  }));

  const lineups = [];
  let seed = 7;

  MATCHES.filter((m) => m.status === 'closed').forEach((match, mi) => {
    const rnd = rng(seed + mi * 97);
    const rotation = (mi * 3) % players.length;
    const pool = [...players].sort((a, b) => a.shirt_number - b.shirt_number);
    const order = pool.slice(rotation).concat(pool.slice(0, rotation)).slice(0, 10);

    order.forEach((player, idx) => {
      const team = idx < 5 ? 'A' : 'B';
      const gf = team === 'A' ? match.goals_a : match.goals_b;
      const ga = team === 'A' ? match.goals_b : match.goals_a;
      const score = Math.round((5.3 + rnd() * 4.1) * 10) / 10;
      lineups.push({
        match_id: match.id,
        player_id: player.id,
        team,
        goals: 0,
        status: 'closed',
        gf,
        ga,
        avg_score: score,
        votes: 3 + Math.floor(rnd() * 3),
      });
    });

    // Reparte los goles del partido entre los jugadores de cada equipo.
    ['A', 'B'].forEach((team) => {
      const total = team === 'A' ? match.goals_a : match.goals_b;
      const squad = lineups.filter((l) => l.match_id === match.id && l.team === team);
      for (let g = 0; g < total; g += 1) {
        squad[Math.floor(rnd() * squad.length)].goals += 1;
      }
    });
  });

  // MVP por partido = mejor nota.
  const mvpByMatch = {};
  MATCHES.filter((m) => m.status === 'closed').forEach((match) => {
    const rows = lineups.filter((l) => l.match_id === match.id);
    if (!rows.length) return;
    rows.sort((a, b) => b.avg_score - a.avg_score || b.goals - a.goals);
    mvpByMatch[match.id] = rows[0].player_id;
  });

  players.forEach((player) => {
    const mine = lineups.filter((l) => l.player_id === player.id);
    const rated = mine.filter((l) => l.avg_score != null);
    const wins = mine.filter((l) => l.gf > l.ga).length;
    const draws = mine.filter((l) => l.gf === l.ga).length;
    const losses = mine.filter((l) => l.gf < l.ga).length;
    player.stats = {
      id: player.id,
      name: player.name,
      played: mine.length,
      wins,
      draws,
      losses,
      goals: mine.reduce((acc, l) => acc + (l.goals || 0), 0),
      mvps: Object.values(mvpByMatch).filter((id) => id === player.id).length,
      avg_rating: rated.length
        ? Math.round((rated.reduce((acc, l) => acc + l.avg_score, 0) / rated.length) * 100) / 100
        : null,
      conceded_pm: mine.length
        ? Math.round((mine.reduce((acc, l) => acc + l.ga, 0) / mine.length) * 100) / 100
        : null,
    };
  });

  cache = {
    players,
    matches: MATCHES.map((m) => ({ ...m })),
    lineups,
    mvpByMatch,
  };
  return cache;
}
