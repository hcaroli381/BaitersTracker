/**
 * Pruebas de las reglas puras (JavaScript). No necesitan base de datos.
 * Ejecutar: `cd tests && npm test`
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  VOTE_DELAY_MS,
  kickoffDate,
  voteOpensDate,
  votesOpen,
  msUntilVotesOpen,
  groupAppearances,
  segmentCount,
  segmentTeams,
  scoreFromAppearances,
  switchedPlayers,
  voteSummary,
} from '../assets/js/rules.js';

/* ------------------------------------------------------------------ */
/* Ventana de votación                                                 */
/* ------------------------------------------------------------------ */

test('la votación abre exactamente una hora después del inicio', () => {
  const match = { id: 'm1', status: 'open', kickoff_at: '2026-11-05T20:00:00.000Z' };
  assert.equal(VOTE_DELAY_MS, 60 * 60 * 1000);
  assert.equal(voteOpensDate(match).toISOString(), '2026-11-05T21:00:00.000Z');

  const before = new Date('2026-11-05T20:59:59.000Z');
  const exactly = new Date('2026-11-05T21:00:00.000Z');
  assert.equal(votesOpen(match, before), false, 'un segundo antes no se vota');
  assert.equal(votesOpen(match, exactly), true, 'a la hora exacta sí');
  assert.equal(msUntilVotesOpen(match, before), 1000);
});

test('recién creado el partido no se puede votar', () => {
  const now = new Date('2026-11-05T18:00:00.000Z');
  const match = { status: 'open', kickoff_at: '2026-11-05T20:00:00.000Z' };
  assert.equal(votesOpen(match, now), false);
});

test('un partido cerrado no se vota aunque haya pasado la hora', () => {
  const match = { status: 'closed', kickoff_at: '2026-11-05T10:00:00.000Z' };
  assert.equal(votesOpen(match, new Date('2026-11-20T10:00:00.000Z')), false);
});

test('sin hora guardada se usa la fecha a las 21:00 locales', () => {
  const match = { status: 'open', played_on: '2026-11-07' };
  const kick = kickoffDate(match);
  assert.equal(kick.getFullYear(), 2026);
  assert.equal(kick.getDate(), 7);
  assert.equal(kick.getHours(), 21);
  assert.equal(kick.getMinutes(), 0);
});

test('sin fecha no se bloquea la votación', () => {
  assert.equal(votesOpen({ status: 'open' }, new Date()), true);
});

/* ------------------------------------------------------------------ */
/* Tramos y equipos                                                    */
/* ------------------------------------------------------------------ */

const SPLIT = [
  // Tramo 1: A = p1, p2 · B = p3, p4
  { player_id: 'p1', segment: 1, team: 'A', goals: 1 },
  { player_id: 'p2', segment: 1, team: 'A', goals: 0 },
  { player_id: 'p3', segment: 1, team: 'B', goals: 2 },
  { player_id: 'p4', segment: 1, team: 'B', goals: 0 },
  // Cambio de equipo: p1 se va a B y p4 a A
  { player_id: 'p1', segment: 2, team: 'B', goals: 1 },
  { player_id: 'p2', segment: 2, team: 'A', goals: 0 },
  { player_id: 'p3', segment: 2, team: 'B', goals: 0 },
  { player_id: 'p4', segment: 2, team: 'A', goals: 1 },
];

test('el marcador suma los goles de todos los tramos por equipo', () => {
  // A: 1 (p1 en tramo 1) + 1 (p4 en tramo 2) = 2
  // B: 2 (p3 en tramo 1) + 1 (p1 en tramo 2) = 3
  assert.deepEqual(scoreFromAppearances(SPLIT), { a: 2, b: 3 });
});

test('un jugador que cambia de equipo conserva sus goles y sus tramos', () => {
  const grouped = groupAppearances(SPLIT);
  const p1 = grouped.get('p1');
  assert.equal(p1.goals, 2);
  assert.equal(p1.stints.length, 2);
  assert.deepEqual(p1.teams, ['A', 'B']);
  assert.equal(p1.startTeam, 'A');
  assert.equal(p1.lastTeam, 'B');
  assert.equal(p1.switched, true);

  const p2 = grouped.get('p2');
  assert.equal(p2.switched, false);
  assert.equal(p2.goals, 0);
  assert.deepEqual(p2.teams, ['A']);
});

test('los tramos conservan quién jugaba en cada equipo', () => {
  assert.equal(segmentCount(SPLIT), 2);
  const first = segmentTeams(SPLIT, 1);
  assert.deepEqual(first.A.map((r) => r.player_id), ['p1', 'p2']);
  assert.deepEqual(first.B.map((r) => r.player_id), ['p3', 'p4']);

  const second = segmentTeams(SPLIT, 2);
  assert.deepEqual(second.A.map((r) => r.player_id), ['p2', 'p4']);
  assert.deepEqual(second.B.map((r) => r.player_id), ['p1', 'p3']);
});

test('sin cambios de equipo todo queda en un tramo', () => {
  const rows = [
    { player_id: 'p1', team: 'A', goals: 2 },
    { player_id: 'p2', team: 'B', goals: 1 },
  ];
  assert.equal(segmentCount(rows), 1);
  assert.equal(groupAppearances(rows).get('p1').switched, false);
  assert.deepEqual(scoreFromAppearances(rows), { a: 2, b: 1 });
});

test('lista solo a quien de verdad cambió de equipo', () => {
  // p1 (A→B) y p4 (B→A) cambiaron; p2 y p3 siguen en el suyo.
  assert.deepEqual(
    switchedPlayers(SPLIT).map((p) => p.player_id),
    ['p1', 'p4']
  );
});

/* ------------------------------------------------------------------ */
/* Notas                                                               */
/* ------------------------------------------------------------------ */

test('media de notas por jugador, redondeada a dos decimales', () => {
  const summary = voteSummary([
    { voter_id: 'a', target_id: 'p1', score: 8 },
    { voter_id: 'b', target_id: 'p1', score: 9 },
    { voter_id: 'c', target_id: 'p1', score: 7 },
    { voter_id: 'a', target_id: 'p2', score: 5 },
  ]);
  assert.deepEqual(summary.get('p1'), { avg: 8, count: 3 });
  assert.deepEqual(summary.get('p2'), { avg: 5, count: 1 });
  assert.equal(summary.get('p3'), undefined);
});

test('la media con decimales no se rompe', () => {
  const summary = voteSummary([
    { target_id: 'p1', score: 7 },
    { target_id: 'p1', score: 8 },
    { target_id: 'p1', score: 8 },
  ]);
  assert.equal(summary.get('p1').avg, 7.67);
});
