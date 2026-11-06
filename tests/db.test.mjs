/**
 * Pruebas de la base de datos con PGlite (PostgreSQL real en WASM).
 *
 * Monta una reconstrucción del esquema (tests/sql/base-schema.sql), aplica las
 * migraciones de `supabase/migrations/` y comprueba las reglas nuevas:
 *
 *   1. La votación abre una hora después del inicio programado.
 *   2. Los equipos se pueden poner antes, durante y después del partido.
 *   3. «¿Hubo cambio de equipo?» divide el partido en tramos sin romper
 *      el marcador ni las estadísticas.
 *   4. Un empate en la mejor nota se desempata con una votación de los
 *      jugadores del partido que tengan voto (los comodines no).
 *
 * No toca Supabase ni la web en producción.
 * Ejecutar: `cd tests && npm test`
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

const MIGRATIONS = [
  'supabase/migrations/20261105_01_vote_window.sql',
  'supabase/migrations/20261105_02_team_splits.sql',
  'supabase/migrations/20261105_03_mvp_tiebreak.sql',
  'supabase/migrations/20261105_04_pick_rules.sql',
  'supabase/migrations/20261106_07_device_hash_consistency.sql',
];

const ADMIN = 'admin';

/** Base de datos nueva, con el esquema y las migraciones aplicadas. */
async function freshDb() {
  const db = new PGlite();
  await db.exec(await readFile(join(HERE, 'sql/base-schema.sql'), 'utf8'));
  for (const file of MIGRATIONS) {
    await db.exec(await readFile(join(ROOT, file), 'utf8'));
  }
  await db.exec(`insert into private.admin (id, pw_hash) values (1, 'plain:${ADMIN}')`);
  return db;
}

/** Jugador con token de dispositivo ya vinculado. */
async function addPlayer(db, name, { token = `tok-${name}`, canVote = true } = {}) {
  const res = await db.query(
    `insert into public.players (name, device_hash, can_vote)
     values ($1, md5($2), $3) returning id`,
    [name, token, canVote]
  );
  return res.rows[0].id;
}

async function createMatch(db, { date = '2026-11-05', kickoff = null } = {}) {
  const res = await db.query(
    `select public.admin_create_match($1, $2::date, $3::timestamptz) as id`,
    [ADMIN, date, kickoff]
  );
  return res.rows[0].id;
}

async function rejects(promise, pattern) {
  await assert.rejects(promise, (err) => {
    const msg = String(err?.message || err);
    assert.match(msg, pattern, `mensaje inesperado: ${msg}`);
    return true;
  });
}

/* ------------------------------------------------------------------ */
/* 1. Ventana de votación                                              */
/* ------------------------------------------------------------------ */

test('cast_vote: no se vota hasta una hora después del inicio', async () => {
  const db = await freshDb();
  const a = await addPlayer(db, 'Ana');
  const b = await addPlayer(db, 'Bruno');

  // Inicio dentro de 2 h → voto bloqueado
  const future = await createMatch(db, { kickoff: new Date(Date.now() + 2 * 3600_000).toISOString() });
  await db.query(`select public.admin_set_lineup($1,$2,$3,'A')`, [ADMIN, future, a]);
  await db.query(`select public.admin_set_lineup($1,$2,$3,'B')`, [ADMIN, future, b]);

  await rejects(
    db.query(`select public.cast_vote($1,$2,$3,8::smallint)`, ['tok-Ana', future, b]),
    /una hora después del inicio/
  );

  // El error dice cuándo abre: DD/MM a las HH:MM
  await db.query(`select 1`).then(async () => {
    const opens = await db.query(`select private.vote_opens_at($1) as at`, [future]);
    const expected = await db.query(
      `select to_char($1::timestamptz at time zone 'Europe/Madrid', 'DD/MM a las HH24:MI') as label`,
      [opens.rows[0].at]
    );
    await assert.rejects(db.query(`select public.cast_vote($1,$2,$3,8::smallint)`, ['tok-Ana', future, b]), (err) =>
      String(err.message).includes(expected.rows[0].label)
    );
  });

  // Partido empezado hace 2 h → votación abierta
  const past = await createMatch(db, { kickoff: new Date(Date.now() - 2 * 3600_000).toISOString() });
  await db.query(`select public.admin_set_lineup($1,$2,$3,'A')`, [ADMIN, past, a]);
  await db.query(`select public.admin_set_lineup($1,$2,$3,'B')`, [ADMIN, past, b]);
  await db.query(`select public.cast_vote($1,$2,$3,8::smallint)`, ['tok-Ana', past, b]);

  const votes = await db.query(`select score from public.votes where match_id = $1`, [past]);
  assert.equal(votes.rows.length, 1);
  await db.close();
});

test('cast_vote: justo en el límite (inicio + 1 h) se permite', async () => {
  const db = await freshDb();
  const a = await addPlayer(db, 'Ana');
  const b = await addPlayer(db, 'Bruno');

  const match = await createMatch(db, { kickoff: new Date(Date.now() - 3600_000 - 5_000).toISOString() });
  await db.query(`select public.admin_set_lineup($1,$2,$3,'A')`, [ADMIN, match, a]);
  await db.query(`select public.admin_set_lineup($1,$2,$3,'B')`, [ADMIN, match, b]);

  const open = await db.query(`select private.votes_are_open($1) as ok`, [match]);
  assert.equal(open.rows[0].ok, true);
  await db.query(`select public.cast_vote($1,$2,$3,9::smallint)`, ['tok-Ana', match, b]);
  await db.close();
});

test('cast_vote conserva las demás reglas (comodín, autovoto, repetido, cerrado)', async () => {
  const db = await freshDb();
  const a = await addPlayer(db, 'Ana');
  const b = await addPlayer(db, 'Bruno');
  const wild = await addPlayer(db, 'Comodin', { canVote: false });

  const match = await createMatch(db, { kickoff: new Date(Date.now() - 3 * 3600_000).toISOString() });
  for (const [id, team] of [
    [a, 'A'],
    [b, 'B'],
    [wild, 'B'],
  ]) {
    await db.query(`select public.admin_set_lineup($1,$2,$3,$4)`, [ADMIN, match, id, team]);
  }

  await rejects(db.query(`select public.cast_vote($1,$2,$3,8::smallint)`, ['tok-Comodin', match, a]), /comodines no votan/);
  await rejects(db.query(`select public.cast_vote($1,$2,$3,8::smallint)`, ['tok-Ana', match, a]), /votarte a ti mismo/);
  await db.query(`select public.cast_vote($1,$2,$3,8::smallint)`, ['tok-Ana', match, b]);
  await rejects(db.query(`select public.cast_vote($1,$2,$3,7::smallint)`, ['tok-Ana', match, b]), /Ya has votado/);

  await db.query(`select public.admin_set_match_status($1,$2,'closed')`, [ADMIN, match]);
  await rejects(db.query(`select public.cast_vote($1,$2,$3,8::smallint)`, ['tok-Bruno', match, a]), /está cerrada/);
  await db.close();
});

test('admin_create_match guarda la hora y match_summary la publica', async () => {
  const db = await freshDb();
  const kickoff = '2026-11-08T21:30:00.000Z';
  const id = await createMatch(db, { date: '2026-11-08', kickoff });

  const row = await db.query(
    `select kickoff_at, votes_open_at, goals_a, goals_b, segments from public.match_summary where id = $1`,
    [id]
  );
  assert.equal(new Date(row.rows[0].kickoff_at).toISOString(), kickoff);
  assert.equal(new Date(row.rows[0].votes_open_at).toISOString(), '2026-11-08T22:30:00.000Z');
  assert.equal(row.rows[0].goals_a, 0);
  assert.equal(row.rows[0].segments, 1);
  await db.close();
});

test('admin_create_match sin hora usa las 21:00 del día del partido', async () => {
  const db = await freshDb();
  const id = await createMatch(db, { date: '2026-11-08' });
  const row = await db.query(
    `select to_char(kickoff_at at time zone 'Europe/Madrid', 'YYYY-MM-DD HH24:MI') as local
       from public.matches where id = $1`,
    [id]
  );
  assert.equal(row.rows[0].local, '2026-11-08 21:00');
  await db.close();
});

test('mover el día conserva la hora del partido', async () => {
  const db = await freshDb();
  const id = await createMatch(db, { date: '2026-11-08', kickoff: '2026-11-08T20:15:00.000Z' });

  await db.query(`select public.admin_set_match_date($1,$2,$3::date)`, [ADMIN, id, '2026-11-15']);
  const row = await db.query(
    `select to_char(played_on, 'YYYY-MM-DD') as played_on,
            to_char(kickoff_at at time zone 'Europe/Madrid', 'HH24:MI') as local
       from public.matches where id = $1`,
    [id]
  );
  assert.equal(row.rows[0].played_on, '2026-11-15');
  // 20:15 UTC en noviembre = 21:15 en Madrid
  assert.equal(row.rows[0].local, '21:15');
  await db.close();
});

/* ------------------------------------------------------------------ */
/* 2. Equipos cuando quiera                                            */
/* ------------------------------------------------------------------ */

test('los equipos se pueden poner antes, durante y después del partido', async () => {
  const db = await freshDb();
  const a = await addPlayer(db, 'Ana');
  const b = await addPlayer(db, 'Bruno');

  const future = await createMatch(db, { kickoff: new Date(Date.now() + 48 * 3600_000).toISOString() });
  await db.query(`select public.admin_set_lineup($1,$2,$3,'A')`, [ADMIN, future, a]);
  await db.query(`select public.admin_set_goals($1,$2,$3,2::smallint)`, [ADMIN, future, a]);

  const closed = await createMatch(db, { kickoff: new Date(Date.now() - 72 * 3600_000).toISOString() });
  await db.query(`select public.admin_set_match_status($1,$2,'closed')`, [ADMIN, closed]);
  await db.query(`select public.admin_set_lineup($1,$2,$3,'B')`, [ADMIN, closed, b]);
  await db.query(`select public.admin_set_goals($1,$2,$3,3::smallint)`, [ADMIN, closed, b]);

  const rows = await db.query(
    `select match_id, team, goals from public.appearances order by match_id`
  );
  assert.equal(rows.rows.length, 2);
  const futureRow = rows.rows.find((r) => r.match_id === future);
  assert.deepEqual({ team: futureRow.team, goals: futureRow.goals }, { team: 'A', goals: 2 });
  const closedRow = rows.rows.find((r) => r.match_id === closed);
  assert.deepEqual({ team: closedRow.team, goals: closedRow.goals }, { team: 'B', goals: 3 });
  await db.close();
});

test('sin equipo no se pueden poner goles y el admin es obligatorio', async () => {
  const db = await freshDb();
  const a = await addPlayer(db, 'Ana');
  const match = await createMatch(db);

  await rejects(db.query(`select public.admin_set_goals($1,$2,$3,1::smallint)`, [ADMIN, match, a]), /Asigna equipo/);
  await rejects(db.query(`select public.admin_set_lineup($1,$2,$3,'A')`, ['mala', match, a]), /Contraseña de admin/);
  await rejects(db.query(`select public.admin_set_lineup($1,$2,$3,'X')`, [ADMIN, match, a]), /Equipo no válido/);
  await db.close();
});

/* ------------------------------------------------------------------ */
/* 3. ¿Hubo cambio de equipo?                                          */
/* ------------------------------------------------------------------ */

/**
 * Escenario: 4 jugadores, 0-2 al descanso, cambio de equipo y 1-1 después.
 * Global: Oscuros 2 - 3 Claros.
 */
async function splitScenario() {
  const db = await freshDb();
  const players = {};
  for (const name of ['Ana', 'Bruno', 'Carla', 'Diego']) {
    players[name] = await addPlayer(db, name);
  }
  const match = await createMatch(db, { kickoff: new Date(Date.now() - 4 * 3600_000).toISOString() });

  // Tramo 1
  await db.query(`select public.admin_set_lineup($1,$2,$3,'A',1)`, [ADMIN, match, players.Ana]);
  await db.query(`select public.admin_set_lineup($1,$2,$3,'A',1)`, [ADMIN, match, players.Bruno]);
  await db.query(`select public.admin_set_lineup($1,$2,$3,'B',1)`, [ADMIN, match, players.Carla]);
  await db.query(`select public.admin_set_lineup($1,$2,$3,'B',1)`, [ADMIN, match, players.Diego]);

  await db.query(`select public.admin_set_goals($1,$2,$3,1,1)`, [ADMIN, match, players.Ana]);
  await db.query(`select public.admin_set_goals($1,$2,$3,2,1)`, [ADMIN, match, players.Carla]);

  return { db, match, players };
}

test('«hubo cambio de equipo» abre un tramo nuevo con los equipos actuales', async () => {
  const { db, match } = await splitScenario();

  const res = await db.query(`select public.admin_split_match($1,$2) as segment`, [ADMIN, match]);
  assert.equal(res.rows[0].segment, 2);

  const rows = await db.query(
    `select segment, team, coalesce(sum(goals), 0)::int as goals, count(*)::int as players
       from public.appearances where match_id = $1 group by segment, team order by segment, team`,
    [match]
  );
  assert.deepEqual(rows.rows, [
    { segment: 1, team: 'A', goals: 1, players: 2 },
    { segment: 1, team: 'B', goals: 2, players: 2 },
    { segment: 2, team: 'A', goals: 0, players: 2 },
    { segment: 2, team: 'B', goals: 0, players: 2 },
  ]);
  await db.close();
});

test('tras el cambio cada jugador se reasigna a su nuevo equipo y el marcador cuadra', async () => {
  const { db, match, players } = await splitScenario();
  await db.query(`select public.admin_split_match($1,$2)`, [ADMIN, match]);

  // Rebalanceo: Ana se va a Claros y Diego a Oscuros
  await db.query(`select public.admin_set_lineup($1,$2,$3,'B',2)`, [ADMIN, match, players.Ana]);
  await db.query(`select public.admin_set_lineup($1,$2,$3,'A',2)`, [ADMIN, match, players.Diego]);

  // Goles del tramo 2
  await db.query(`select public.admin_set_goals($1,$2,$3,1,2)`, [ADMIN, match, players.Ana]);
  await db.query(`select public.admin_set_goals($1,$2,$3,1,2)`, [ADMIN, match, players.Diego]);

  const summary = await db.query(
    `select goals_a, goals_b, segments from public.match_summary where id = $1`,
    [match]
  );
  // Oscuros: 1 (Ana, tramo 1) + 1 (Diego, tramo 2) = 2
  // Claros:  2 (Carla, tramo 1) + 1 (Ana, tramo 2) = 3
  assert.deepEqual(summary.rows[0], { goals_a: 2, goals_b: 3, segments: 2 });

  const ana = await db.query(
    `select team, goals, gf, ga, teams, stints from public.player_match
      where match_id = $1 and player_id = $2`,
    [match, players.Ana]
  );
  assert.equal(ana.rows.length, 1, 'un jugador = una fila por partido');
  assert.equal(ana.rows[0].team, 'AB');
  assert.equal(ana.rows[0].goals, 2, 'los goles de los dos tramos se suman');
  assert.equal(ana.rows[0].gf, null, 'sin resultado único no se inventa un marcador');
  assert.equal(ana.rows[0].ga, null);
  assert.deepEqual(ana.rows[0].teams, ['A', 'B']);
  assert.equal(ana.rows[0].stints, 2);

  const bruno = await db.query(
    `select team, goals, gf, ga from public.player_match where match_id = $1 and player_id = $2`,
    [match, players.Bruno]
  );
  assert.deepEqual(bruno.rows[0], { team: 'A', goals: 0, gf: 2, ga: 3 });
  await db.close();
});

test('un partido con tramos cuenta como UN partido en las estadísticas', async () => {
  const { db, match, players } = await splitScenario();
  await db.query(`select public.admin_split_match($1,$2)`, [ADMIN, match]);
  await db.query(`select public.admin_set_lineup($1,$2,$3,'B',2)`, [ADMIN, match, players.Ana]);
  await db.query(`select public.admin_set_goals($1,$2,$3,1,2)`, [ADMIN, match, players.Ana]);

  const stats = await db.query(
    `select played, goals, wins, draws, losses from public.player_stats where id = $1`,
    [players.Ana]
  );
  assert.deepEqual(stats.rows[0], { played: 1, goals: 2, wins: 0, draws: 0, losses: 0 });

  // Cerrado: nadie más ha jugado partidos, así que 0 victorias y 0 derrotas.
  await db.query(`select public.admin_set_match_status($1,$2,'closed')`, [ADMIN, match]);
  const afterClose = await db.query(
    `select played, wins, draws, losses from public.player_stats where id = $1`,
    [players.Ana]
  );
  assert.deepEqual(afterClose.rows[0], { played: 1, wins: 0, draws: 0, losses: 0 });

  const bruno = await db.query(
    `select played, wins, losses from public.player_stats where id = $1`,
    [players.Bruno]
  );
  assert.deepEqual(bruno.rows[0], { played: 1, wins: 0, losses: 1 }, '2-3 es derrota para el equipo A');
  await db.close();
});

test('quien solo jugó el segundo tramo también vota y también recibe notas', async () => {
  const { db, match, players } = await splitScenario();
  const tarde = await addPlayer(db, 'Tarde');

  await db.query(`select public.admin_split_match($1,$2)`, [ADMIN, match]);
  await db.query(`select public.admin_set_lineup($1,$2,$3,'A',2)`, [ADMIN, match, tarde]);

  // Ana le vota: Tarde jugó, aunque solo fuese el tramo 2.
  await db.query(`select public.cast_vote($1,$2,$3,7::smallint)`, ['tok-Ana', match, tarde]);

  const pm = await db.query(
    `select team, goals, avg_score, votes from public.player_match where match_id = $1 and player_id = $2`,
    [match, tarde]
  );
  // avg_score es numeric: Postgres lo devuelve como texto ('7.00').
  assert.equal(pm.rows[0].team, 'A');
  assert.equal(pm.rows[0].goals, 0);
  assert.equal(Number(pm.rows[0].avg_score), 7);
  assert.equal(pm.rows[0].votes, 1);

  // Y Tarde puede votar a los demás.
  await db.query(`select public.cast_vote($1,$2,$3,6::smallint)`, ['tok-Tarde', match, players.Carla]);
  await db.close();
});

test('deshacer el último cambio de equipo deja el partido como estaba', async () => {
  const { db, match } = await splitScenario();
  await db.query(`select public.admin_split_match($1,$2)`, [ADMIN, match]);
  await db.query(`select public.admin_set_goals($1,$2,$3,5,2)`, [ADMIN, match, (await db.query(
    `select player_id from public.appearances where match_id=$1 and segment=2 limit 1`, [match]
  )).rows[0].player_id]);

  await db.query(`select public.admin_remove_segment($1,$2)`, [ADMIN, match]);

  const summary = await db.query(`select goals_a, goals_b, segments from public.match_summary where id=$1`, [match]);
  assert.deepEqual(summary.rows[0], { goals_a: 1, goals_b: 2, segments: 1 });
  await rejects(db.query(`select public.admin_remove_segment($1,$2)`, [ADMIN, match]), /no tiene cambios de equipo/);
  await db.close();
});

test('no se puede dividir un partido sin alineación ni pasarse de tramos', async () => {
  const db = await freshDb();
  const a = await addPlayer(db, 'Ana');
  const match = await createMatch(db);

  await rejects(db.query(`select public.admin_split_match($1,$2)`, [ADMIN, match]), /Primero asigna la alineación/);

  await db.query(`select public.admin_set_lineup($1,$2,$3,'A')`, [ADMIN, match, a]);
  for (let i = 2; i <= 9; i += 1) {
    await db.query(`select public.admin_split_match($1,$2)`, [ADMIN, match]);
  }
  await rejects(db.query(`select public.admin_split_match($1,$2)`, [ADMIN, match]), /máximo de tramos/);
  await db.close();
});

test('las vistas siguen cerradas a anon (security_invoker)', async () => {
  const db = await freshDb();
  for (const view of ['match_summary', 'player_match', 'player_stats', 'mvp_matches', 'match_mvp']) {
    const res = await db.query(
      `select has_table_privilege('anon', $1, 'SELECT') as anon_select,
              coalesce((select option_value from pg_options_to_table(c.reloptions) where option_name = 'security_invoker'), 'false') as invoker
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = $1`,
      [view]
    );
    assert.equal(res.rows[0].anon_select, false, `${view} no debe ser legible por anon`);
    assert.equal(res.rows[0].invoker, 'true', `${view} debe ser security_invoker`);
  }
  await db.close();
});

test('las migraciones se pueden aplicar dos veces sin romper nada', async () => {
  const db = await freshDb();
  for (const file of MIGRATIONS) {
    await db.exec(await readFile(join(ROOT, file), 'utf8'));
  }
  const stats = await db.query(`select count(*)::int as n from public.player_stats`);
  assert.equal(stats.rows[0].n, 0);
  const views = await db.query(
    `select count(*)::int as n from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'v'
        and c.relname in ('match_summary','player_match','player_stats','mvp_matches','match_mvp')`
  );
  assert.equal(views.rows[0].n, 5);
  await db.close();
});

/* ------------------------------------------------------------------ */
/* 4. Desempate del MVP                                                */
/* ------------------------------------------------------------------ */

/**
 * Partido cerrado con empate en la mejor nota: Ana y Bruno acaban con 8,00.
 * Carla, Diego y Fran jugaron y pueden votar el desempate; Eva y el comodín no.
 */
async function tiedMatch() {
  const db = await freshDb();
  const players = {};
  for (const name of ['Ana', 'Bruno', 'Carla', 'Diego', 'Eva', 'Fran']) {
    players[name] = await addPlayer(db, name);
  }
  players.Comodin = await addPlayer(db, 'Comodin', { canVote: false });

  const match = await createMatch(db, { kickoff: new Date(Date.now() - 6 * 3600_000).toISOString() });

  for (const [name, team] of [
    ['Ana', 'A'],
    ['Carla', 'A'],
    ['Fran', 'A'],
    ['Bruno', 'B'],
    ['Diego', 'B'],
  ]) {
    await db.query(`select public.admin_set_lineup($1,$2,$3,$4)`, [ADMIN, match, players[name], team]);
  }

  // 8 a Ana y 8 a Bruno: empatados a 8,00 en la mejor nota.
  await db.query(`select public.cast_vote($1,$2,$3,8::smallint)`, ['tok-Carla', match, players.Ana]);
  await db.query(`select public.cast_vote($1,$2,$3,8::smallint)`, ['tok-Diego', match, players.Bruno]);

  await db.query(`select public.admin_set_match_status($1,$2,'closed')`, [ADMIN, match]);
  return { db, match, players };
}

async function mvpRow(db, match) {
  const res = await db.query(`select * from public.match_mvp where match_id = $1`, [match]);
  return res.rows[0] || null;
}

test('con dos jugadores empatados a nota no hay MVP: lo decide una votación', async () => {
  const { db, match, players } = await tiedMatch();
  const row = await mvpRow(db, match);

  assert.equal(row.tie, true);
  assert.equal(row.resolved, false);
  assert.equal(row.mvp_player_id, null);
  assert.equal(row.candidates, 2);
  assert.equal(Number(row.mvp_avg), 8);
  assert.equal(row.decided_by, null);
  assert.equal(row.tie_votes, 0);
  assert.equal(row.eligible, 5);
  assert.equal(row.candidate_key.split(',').length, 2);

  const stats = await db.query(`select mvps from public.player_stats where id = $1`, [players.Ana]);
  assert.equal(stats.rows[0].mvps, 0, 'un empate sin desempatar no regala el MVP');
  await db.close();
});

test('el desempate solo lo votan los que jugaron y tienen voto', async () => {
  const { db, match, players } = await tiedMatch();

  // Comodín y quien no jugó: fuera. Tampoco vale votar a quien no empata ni a uno mismo.
  await rejects(
    db.query(`select public.cast_mvp_tie_vote($1,$2,$3)`, ['tok-Comodin', match, players.Ana]),
    /comodines no votan/
  );
  await rejects(
    db.query(`select public.cast_mvp_tie_vote($1,$2,$3)`, ['tok-Eva', match, players.Ana]),
    /Solo votan quienes jugaron/
  );
  await rejects(
    db.query(`select public.cast_mvp_tie_vote($1,$2,$3)`, ['tok-Carla', match, players.Carla]),
    /no está en el desempate/
  );
  await rejects(
    db.query(`select public.cast_mvp_tie_vote($1,$2,$3)`, ['tok-Ana', match, players.Ana]),
    /votarte a ti mismo/
  );

  // Voto válido y bloqueo de repetir.
  await db.query(`select public.cast_mvp_tie_vote($1,$2,$3)`, ['tok-Carla', match, players.Ana]);
  await rejects(
    db.query(`select public.cast_mvp_tie_vote($1,$2,$3)`, ['tok-Carla', match, players.Bruno]),
    /Ya has votado/
  );

  // Un solo voto no decide: hacen falta 3 de los 5 que pueden votar.
  await db.query(`select public.cast_mvp_tie_vote($1,$2,$3)`, ['tok-Diego', match, players.Bruno]);
  await db.query(`select public.cast_mvp_tie_vote($1,$2,$3)`, ['tok-Fran', match, players.Ana]);
  let row = await mvpRow(db, match);
  assert.equal(row.resolved, false, '2-1 con 5 votantes todavía no es mayoría');
  assert.equal(row.mvp_player_id, null);
  assert.equal(row.tie_votes, 3);

  // 2-2 sigue sin mayoría...
  await db.query(`select public.cast_mvp_tie_vote($1,$2,$3)`, ['tok-Ana', match, players.Bruno]);
  row = await mvpRow(db, match);
  assert.equal(row.resolved, false);
  assert.equal(row.tie_votes, 4);

  // ...y el quinto voto (3-2) decide el MVP de Ana. Después ya no se puede votar.
  await db.query(`select public.cast_mvp_tie_vote($1,$2,$3)`, ['tok-Bruno', match, players.Ana]);
  row = await mvpRow(db, match);
  assert.equal(row.resolved, true);
  assert.equal(row.decided_by, 'desempate');
  assert.equal(row.mvp_player_id, players.Ana);
  assert.equal(row.mvp_tie_votes, 3);
  assert.equal(row.tie_votes, 5);
  assert.equal(row.eligible, 5);

  await rejects(
    db.query(`select public.cast_mvp_tie_vote($1,$2,$3)`, ['tok-Bruno', match, players.Ana]),
    /ya está decidido/
  );

  const stats = await db.query(`select mvps from public.player_stats where id = $1`, [players.Ana]);
  assert.equal(stats.rows[0].mvps, 1);
  const bruno = await db.query(`select mvps from public.player_stats where id = $1`, [players.Bruno]);
  assert.equal(bruno.rows[0].mvps, 0);
  const winners = await db.query(`select player_id from public.mvp_matches where match_id = $1`, [match]);
  assert.equal(winners.rows[0].player_id, players.Ana);
  await db.close();
});

test('sin empate gana la mejor nota y el desempate no se puede votar', async () => {
  const db = await freshDb();
  const ana = await addPlayer(db, 'Ana');
  const bruno = await addPlayer(db, 'Bruno');
  const carla = await addPlayer(db, 'Carla');
  const match = await createMatch(db, { kickoff: new Date(Date.now() - 5 * 3600_000).toISOString() });

  for (const [id, team] of [
    [ana, 'A'],
    [bruno, 'B'],
    [carla, 'A'],
  ]) {
    await db.query(`select public.admin_set_lineup($1,$2,$3,$4)`, [ADMIN, match, id, team]);
  }
  await db.query(`select public.cast_vote($1,$2,$3,9::smallint)`, ['tok-Carla', match, ana]);
  await db.query(`select public.cast_vote($1,$2,$3,8::smallint)`, ['tok-Ana', match, bruno]);
  await db.query(`select public.admin_set_match_status($1,$2,'closed')`, [ADMIN, match]);

  const row = await mvpRow(db, match);
  assert.equal(row.tie, false);
  assert.equal(row.resolved, true);
  assert.equal(row.decided_by, 'notas');
  assert.equal(row.mvp_player_id, ana);
  assert.equal(row.mvp_tie_votes, null);

  await rejects(
    db.query(`select public.cast_mvp_tie_vote($1,$2,$3)`, ['tok-Carla', match, ana]),
    /no tiene empate por el MVP/
  );
  await db.close();
});

test('el desempate solo se vota con el partido cerrado', async () => {
  const { db, match, players } = await tiedMatch();
  await db.query(`select public.admin_set_match_status($1,$2,'open')`, [ADMIN, match]);

  await rejects(
    db.query(`select public.cast_mvp_tie_vote($1,$2,$3)`, ['tok-Carla', match, players.Ana]),
    /partido cerrado/
  );
  await db.close();
});

test('si el empate cambia, los votos del desempate anterior no cuentan', async () => {
  const { db, match, players } = await tiedMatch();

  // Carla, Fran y Diego desempatan a favor de Ana (3 de 5).
  await db.query(`select public.cast_mvp_tie_vote($1,$2,$3)`, ['tok-Carla', match, players.Ana]);
  await db.query(`select public.cast_mvp_tie_vote($1,$2,$3)`, ['tok-Fran', match, players.Ana]);
  await db.query(`select public.cast_mvp_tie_vote($1,$2,$3)`, ['tok-Diego', match, players.Ana]);
  let row = await mvpRow(db, match);
  assert.equal(row.mvp_player_id, players.Ana);

  // Se reabre para corregir el partido: ahora Carla también acaba con 8,00.
  await db.query(`select public.admin_set_allow_self_vote($1,true)`, [ADMIN]);
  await db.query(`select public.admin_set_match_status($1,$2,'open')`, [ADMIN, match]);
  await db.query(`select public.cast_vote($1,$2,$3,8::smallint)`, ['tok-Carla', match, players.Carla]);
  await db.query(`select public.admin_set_match_status($1,$2,'closed')`, [ADMIN, match]);

  row = await mvpRow(db, match);
  assert.equal(row.candidates, 3);
  assert.equal(row.resolved, false);
  assert.equal(row.mvp_player_id, null);
  assert.equal(row.tie_votes, 0, 'los votos del empate viejo no cuentan');

  // Carla ya votó en la ronda anterior, pero esta es otra votación: puede votar otra vez.
  await db.query(`select public.cast_mvp_tie_vote($1,$2,$3)`, ['tok-Carla', match, players.Bruno]);
  await db.query(`select public.cast_mvp_tie_vote($1,$2,$3)`, ['tok-Fran', match, players.Bruno]);
  row = await mvpRow(db, match);
  assert.equal(row.resolved, false, '2 de 5 no es mayoría');

  await db.query(`select public.cast_mvp_tie_vote($1,$2,$3)`, ['tok-Diego', match, players.Bruno]);
  row = await mvpRow(db, match);
  assert.equal(row.mvp_player_id, players.Bruno);
  assert.equal(row.decided_by, 'desempate');
  await db.close();
});

/* ------------------------------------------------------------------ */
/* 5. Elección de jugador: un jugador, un móvil y comodines ocultos    */
/* ------------------------------------------------------------------ */

const TOK_A = 'a'.repeat(64);
const TOK_B = 'b'.repeat(64);
const TOK_C = 'c'.repeat(64);

async function addFreePlayer(db, name) {
  const res = await db.query(`insert into public.players (name) values ($1) returning id`, [name]);
  return res.rows[0].id;
}

test('claim_player: un jugador cogido no se vuelve a coger', async () => {
  const db = await freshDb();
  const ana = await addFreePlayer(db, 'Ana');
  const bruno = await addFreePlayer(db, 'Bruno');

  await db.query(`select public.claim_player($1,$2,7)`, [TOK_A, ana]);

  // Otro móvil no puede cogerlo, ni siquiera con otro dorsal.
  await rejects(db.query(`select public.claim_player($1,$2,8)`, [TOK_B, ana]), /ya lo ha cogido otro m\u00f3vil/);

  // Un móvil ya vinculado no puede coger además a otro jugador.
  await rejects(db.query(`select public.claim_player($1,$2,9)`, [TOK_A, bruno]), /ya est\u00e1 vinculado a otro jugador/);

  // El mismo móvil puede corregir su propio dorsal.
  await db.query(`select public.claim_player($1,$2,10)`, [TOK_A, ana]);
  const row = await db.query(`select shirt_number, device_hash from public.players where id = $1`, [ana]);
  assert.equal(row.rows[0].shirt_number, 10);

  // Token inválido: fuera.
  await rejects(db.query(`select public.claim_player($1,$2,null)`, ['corto', bruno]), /Token de dispositivo/);

  await db.close();
});

test('claim_player: el admin puede desactivar el bloqueo y liberar', async () => {
  const db = await freshDb();
  const ana = await addFreePlayer(db, 'Ana');

  await db.query(`select public.claim_player($1,$2,7)`, [TOK_A, ana]);
  await db.query(`select public.admin_set_lock_claimed($1,false)`, [ADMIN]);

  // Sin bloqueo, otro móvil puede volver a cogerlo (como antes).
  await db.query(`select public.claim_player($1,$2,8)`, [TOK_B, ana]);
  const row = await db.query(`select device_hash from public.players where id = $1`, [ana]);
  const expected = await db.query(`select encode(sha256(convert_to($1, 'UTF8')), 'hex') as h`, [TOK_B]);
  assert.equal(row.rows[0].device_hash, expected.rows[0].h);

  await db.close();
});

test('ajustes de elección: por defecto bloqueado y comodines ocultos', async () => {
  const db = await freshDb();

  let res = await db.query(`select lock_claimed, wildcards_pickable from public.settings where id = 1`);
  assert.equal(res.rows[0].lock_claimed, true);
  assert.equal(res.rows[0].wildcards_pickable, false);

  await rejects(db.query(`select public.admin_set_lock_claimed($1,false)`, ['mala']), /Contrase\u00f1a de admin/);
  await rejects(db.query(`select public.admin_set_wildcards_pickable($1,true)`, ['mala']), /Contrase\u00f1a de admin/);

  await db.query(`select public.admin_set_lock_claimed($1,false)`, [ADMIN]);
  await db.query(`select public.admin_set_wildcards_pickable($1,true)`, [ADMIN]);

  res = await db.query(`select lock_claimed, wildcards_pickable from public.settings where id = 1`);
  assert.equal(res.rows[0].lock_claimed, false);
  assert.equal(res.rows[0].wildcards_pickable, true);

  await db.close();
});

test('me reconoce al móvil con la huella nueva y con la antigua', async () => {
  const db = await freshDb();
  const ana = await addFreePlayer(db, 'Ana');
  const bruno = await addFreePlayer(db, 'Bruno');
  const carla = await addFreePlayer(db, 'Carla');

  // Móvil vinculado antes de la 04: huella sha256 (la que usaba private.hash_token).
  await db.query(
    `update public.players set device_hash = encode(sha256(convert_to($1, 'UTF8')), 'hex') where id = $2`,
    [TOK_A, ana]
  );
  // Móvil vinculado con la 04: huella md5, la que dejó a los jugadores sin reconocer.
  await db.query(`update public.players set device_hash = md5($1) where id = $2`, [TOK_C, carla]);
  // Alta nueva con claim_player: debe guardar la huella canónica (sha256).
  await db.query(`select public.claim_player($1,$2,9)`, [TOK_B, bruno]);

  const ids = await db.query(
    `select public.me($1) as sha, public.me($2) as md5, public.me($3) as nadie`,
    [TOK_A, TOK_C, 'd'.repeat(64)]
  );
  assert.deepEqual(ids.rows[0], { sha: ana, md5: carla, nadie: null });

  const stored = await db.query(`select device_hash from public.players where id = $1`, [bruno]);
  assert.equal(stored.rows[0].device_hash.length, 64, 'las altas nuevas guardan sha256');

  // El mismo móvil puede corregir su dorsal aunque su huella sea la antigua.
  await db.query(`select public.claim_player($1,$2,10)`, [TOK_C, carla]);

  // Y vota: cast_vote resuelve la identidad con public.me.
  const match = await createMatch(db, { kickoff: new Date(Date.now() - 2 * 3600_000).toISOString() });
  await db.query(`select public.admin_set_lineup($1,$2,$3,'A')`, [ADMIN, match, carla]);
  await db.query(`select public.admin_set_lineup($1,$2,$3,'B')`, [ADMIN, match, bruno]);
  await db.query(`select public.cast_vote($1,$2,$3,8::smallint)`, [TOK_B, match, carla]);

  const voter = await db.query(`select voter_id from public.votes where match_id = $1`, [match]);
  assert.equal(voter.rows[0].voter_id, bruno);
  await db.close();
});
