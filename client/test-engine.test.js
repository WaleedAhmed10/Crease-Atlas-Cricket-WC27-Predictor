import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildTable, resolveTournament, simulate, oversToBalls, consistentPicks } from './src/engine.js';

// Build the same data shape the API returns, straight from the CSVs
const csv = (f) => {
  const [h, ...rows] = readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8').trim().split(/\r?\n/);
  const keys = h.split(',');
  return rows.map((r) => Object.fromEntries(r.split(',').map((v, i) => [keys[i], v])));
};
const teams = csv('teams.csv').filter((t) => t.status !== 'contender').map((t) => ({ code: t.code, group: t.group_code, seed: t.seed, rating: Number(t.rating) }));
const matches = csv('fixtures.csv').map((m) => ({ matchNo: Number(m.match_no), stage: m.stage, group: m.group_code, team1: m.team1, team2: m.team2 }));
const data = { teams, matches, results: [] };

test('overs notation', () => { assert.equal(oversToBalls(49.3), 297); assert.equal(oversToBalls(50), 300); });

test('table: points, wins and net run rate', () => {
  const rows = buildTable(['X', 'Y'], [{ team1: 'X', team2: 'Y', winner: 'X', result: { team1Runs: 300, team1Overs: 50, team2Runs: 250, team2Overs: 50 } }]);
  assert.equal(rows[0].code, 'X'); assert.equal(rows[0].pts, 2); assert.ok(Math.abs(rows[0].nrr - 1) < 1e-9);
});

test('higher-rated team wins everything -> expected seeds, semis and champion', () => {
  const rating = Object.fromEntries(teams.map((t) => [t.code, t.rating]));
  const pick = (m, a, b) => (rating[a] >= rating[b] ? a : b);
  // outcome: favourite always wins; resolve stage by stage because later fixtures need earlier winners
  const won = {};
  const outcome = (m) => (won[m.matchNo] ? { winner: won[m.matchNo] } : null);
  for (const stage of ['GROUP', 'SUPER_7', 'SEMI_FINAL', 'FINAL']) {
    for (const f of resolveTournament(data, outcome).fixtures) {
      if (f.stage !== stage) continue;
      const [a, b] = stage === 'GROUP' ? [f.team1, f.team2] : [f.t1, f.t2];
      assert.ok(a && b, `match ${f.matchNo} should have both teams`);
      won[f.matchNo] = pick(f, a, b);
    }
  }
  const s = resolveTournament(data, outcome);
  assert.deepEqual([s.seeds.A1, s.seeds.A2, s.seeds.A3], ['IND', 'AUS', 'PAK']);
  assert.deepEqual([s.seeds.B1, s.seeds.B2, s.seeds.B3], ['RSA', 'ENG', 'NZL']);
  assert.equal(s.super7.rows.length, 7);
  assert.equal(s.champion, 'IND');
});

test('nothing is resolved until a group is complete', () => {
  const s = resolveTournament(data, () => null);
  assert.deepEqual(s.seeds, {});
  assert.equal(s.fixtures.find((f) => f.matchNo === 34).t1, null);
});

test('simulation probabilities are sane', () => {
  // seeded generator so the test is deterministic
  let a = 12345;
  const rng = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const sim = simulate(data, 2000, rng);
  const sum = sim.reduce((a, t) => a + t.title, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.equal(sim.reduce((a, t) => a + t.semi, 0).toFixed(2), '4.00');
  assert.equal(sim.reduce((a, t) => a + t.super7, 0).toFixed(2), '7.00');
  assert.ok(['IND', 'AUS'].includes(sim[0].code)); // the two highest-rated teams lead
});

test('stale knockout picks are dropped when the groups change', () => {
  const picks = {};
  for (const m of matches.filter((x) => x.stage === 'GROUP')) picks[m.matchNo] = { winner: m.team1 };
  const a2 = resolveTournament(data, (m) => (picks[m.matchNo] ? { winner: picks[m.matchNo].winner } : null)).fixtures.find((f) => f.matchNo === 34);
  const outsider = teams.find((t) => t.code !== a2.t1 && t.code !== a2.t2).code;
  const dropped = consistentPicks(data, [], { ...picks, 34: { winner: outsider } });
  assert.equal(dropped[34], undefined);
  assert.equal(Object.keys(dropped).length, 30); // group picks are always kept
  const kept = consistentPicks(data, [], { ...picks, 34: { winner: a2.t1 } });
  assert.equal(kept[34].winner, a2.t1);
  // a pick for a match whose teams are not known yet is dropped too
  assert.equal(consistentPicks(data, [], { 40: { winner: 'IND' } })[40], undefined);
});
