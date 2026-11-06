// The tournament brain: group tables, Super 7 seeding, bracket resolution and a Monte Carlo simulator.
// Pure functions, no React, so it is easy to test.

export const STAGES = ['SUPER_SERIES', 'GROUP', 'SUPER_7', 'SEMI_FINAL', 'FINAL'];
export const STAGE_LABEL = {
  SUPER_SERIES: 'Super Series', GROUP: 'Group Stage', SUPER_7: 'Super 7', SEMI_FINAL: 'Semi-finals', FINAL: 'Final',
};

// cricket overs "49.3" = 49 overs + 3 balls
export const oversToBalls = (o) => {
  const whole = Math.floor(o);
  return whole * 6 + Math.round((o - whole) * 10);
};

const blankRow = (code) => ({ code, p: 0, w: 0, l: 0, nr: 0, pts: 0, runsFor: 0, ballsFor: 0, runsAgainst: 0, ballsAgainst: 0, nrr: 0 });

/**
 * Standings for a set of team codes from a list of played matches.
 * played: [{ team1, team2, winner (code | null), result? (real result row with runs/overs) }]
 * Win = 2 points, tie / no result = 1 each. Order: points, wins, net run rate, then rating (only matters for projections).
 */
export function buildTable(codes, played, ratingOf = () => 0) {
  const rows = new Map(codes.map((c) => [c, blankRow(c)]));
  for (const m of played) {
    const a = rows.get(m.team1), b = rows.get(m.team2);
    if (!a || !b) continue;
    a.p++; b.p++;
    if (m.winner === m.team1) { a.w++; b.l++; a.pts += 2; }
    else if (m.winner === m.team2) { b.w++; a.l++; b.pts += 2; }
    else { a.nr++; b.nr++; a.pts++; b.pts++; }
    const r = m.result;
    if (r && r.team1Runs != null && r.team1Overs != null && r.team2Runs != null && r.team2Overs != null) {
      const b1 = oversToBalls(r.team1Overs), b2 = oversToBalls(r.team2Overs);
      a.runsFor += r.team1Runs; a.ballsFor += b1; a.runsAgainst += r.team2Runs; a.ballsAgainst += b2;
      b.runsFor += r.team2Runs; b.ballsFor += b2; b.runsAgainst += r.team1Runs; b.ballsAgainst += b1;
    }
  }
  for (const r of rows.values()) {
    const f = r.ballsFor ? (r.runsFor / r.ballsFor) * 6 : 0;
    const a = r.ballsAgainst ? (r.runsAgainst / r.ballsAgainst) * 6 : 0;
    r.nrr = r.ballsFor && r.ballsAgainst ? f - a : 0;
  }
  return [...rows.values()].sort((x, y) =>
    y.pts - x.pts || y.w - x.w || y.nrr - x.nrr || ratingOf(y.code) - ratingOf(x.code) || x.code.localeCompare(y.code));
}

const better = (x, y, ratingOf) =>
  (y.pts - x.pts || y.w - x.w || y.nrr - x.nrr || ratingOf(y.code) - ratingOf(x.code)) <= 0 ? x : y;

/**
 * Builds everything derived from an "outcome" function.
 * outcome(match) -> { winner, result? } | null   (null = not decided / not picked)
 * The same code powers the real view (outcome = results only) and the "My Path" view (results, else your pick).
 */
export function resolveTournament(data, outcome) {
  const teamBy = Object.fromEntries(data.teams.map((t) => [t.code, t]));
  const ratingOf = (c) => teamBy[c]?.rating ?? 0;
  const ms = data.matches;
  const decided = (m) => outcome(m);
  const played = (m) => {
    const o = outcome(m);
    return o ? { team1: m.team1, team2: m.team2, winner: o.winner ?? null, result: o.result } : null;
  };

  const groups = {};
  for (const g of ['A', 'B']) {
    const codes = data.teams.filter((t) => t.group === g).map((t) => t.code);
    const gm = ms.filter((m) => m.stage === 'GROUP' && m.group === g);
    const rows = buildTable(codes, gm.map(played).filter(Boolean), ratingOf);
    groups[g] = { rows, complete: gm.every(decided), played: gm.filter(decided).length, total: gm.length };
  }

  const seeds = {}; // A1.. B3, AB4
  let fourth = null;
  if (groups.A.complete) ['A1', 'A2', 'A3'].forEach((s, i) => { seeds[s] = groups.A.rows[i].code; });
  if (groups.B.complete) ['B1', 'B2', 'B3'].forEach((s, i) => { seeds[s] = groups.B.rows[i].code; });
  if (groups.A.complete && groups.B.complete) {
    fourth = better(groups.A.rows[3], groups.B.rows[3], ratingOf);
    seeds.AB4 = fourth.code;
  }

  const refTeam = (ref, winners, ranks) => {
    if (teamBy[ref]) return ref;
    if (seeds[ref]) return seeds[ref];
    if (/^S7-\d$/.test(ref)) return ranks[Number(ref[3]) - 1] ?? null;
    if (/^W\d+$/.test(ref)) return winners[ref.slice(1)] ?? null;
    return null;
  };

  // Super 7 table (no points carried forward)
  const s7m = ms.filter((m) => m.stage === 'SUPER_7');
  const s7Codes = Object.values(seeds).length === 7 ? Object.values(seeds) : [];
  const s7Played = s7m.map((m) => {
    const t1 = refTeam(m.team1), t2 = refTeam(m.team2), o = outcome(m);
    return t1 && t2 && o ? { team1: t1, team2: t2, winner: o.winner ?? null, result: o.result } : null;
  }).filter(Boolean);
  const super7 = {
    rows: s7Codes.length ? buildTable(s7Codes, s7Played, ratingOf) : [],
    complete: s7Codes.length === 7 && s7m.every(decided),
    played: s7m.filter(decided).length, total: s7m.length,
  };
  const ranks = super7.complete ? super7.rows.map((r) => r.code) : [];

  // Resolve the teams of every match, in match order (so finals can use semi-final winners)
  const winners = {};
  const fixtures = ms.map((m) => {
    const t1 = refTeam(m.team1, winners, ranks), t2 = refTeam(m.team2, winners, ranks);
    const o = outcome(m);
    if (o?.winner) winners[m.matchNo] = o.winner;
    return { ...m, t1, t2, outcome: o };
  });
  const finalMatch = fixtures.find((f) => f.stage === 'FINAL');
  const champion = finalMatch?.outcome?.winner ?? null;

  return { groups, seeds, fourth, super7, fixtures, champion, teamBy };
}

/**
 * Drops picks that no longer make sense after you change something earlier in the tournament
 * (e.g. you picked India to win a Super 7 match, then changed your groups so India is no longer in it).
 * Group / Super Series picks are always kept; later stages must name one of the two resolved teams.
 */
export function consistentPicks(data, results, picks) {
  const real = new Set(results.map((r) => r.matchNo));
  const cur = { ...picks };
  for (let i = 0; i < 6; i++) {
    const state = resolveTournament(data, (m) => {
      const r = results.find((x) => x.matchNo === m.matchNo);
      if (r) return { winner: r.winner, result: r };
      return cur[m.matchNo] ? { winner: cur[m.matchNo].winner } : null;
    });
    let changed = false;
    for (const f of state.fixtures) {
      const p = cur[f.matchNo];
      if (!p || real.has(f.matchNo) || f.stage === 'GROUP' || f.stage === 'SUPER_SERIES') continue;
      if (!f.t1 || !f.t2 || (p.winner !== f.t1 && p.winner !== f.t2)) { delete cur[f.matchNo]; changed = true; }
    }
    if (!changed) break;
  }
  return cur;
}

// ---------- Monte Carlo ----------
export const winProb = (ra, rb) => 1 / (1 + Math.exp(-(ra - rb) / 20));

export function simulate(data, runs = 4000, rng = Math.random) {
  const teamBy = Object.fromEntries(data.teams.map((t) => [t.code, t]));
  const real = Object.fromEntries(data.results.map((r) => [r.matchNo, r]));
  const tally = {};
  for (const t of data.teams) if (t.group) tally[t.code] = { code: t.code, super7: 0, semi: 0, final: 0, title: 0 };

  for (let i = 0; i < runs; i++) {
    const won = {};
    const outcome = (m) => {
      if (real[m.matchNo]) return { winner: real[m.matchNo].winner, result: real[m.matchNo] };
      return won[m.matchNo] ?? null;
    };
    // decide matches stage by stage, only when both teams are known
    const decide = (stage) => {
      const state = resolveTournament(data, outcome);
      for (const f of state.fixtures) {
        if (f.stage !== stage || outcome(f)) continue;
        if (!f.t1 || !f.t2) continue;
        const a = teamBy[f.t1].rating, b = teamBy[f.t2].rating;
        won[f.matchNo] = { winner: rng() < winProb(a, b) ? f.t1 : f.t2 };
      }
    };
    for (const m of data.matches) {
      if (m.stage === 'GROUP' && !outcome(m)) {
        const a = teamBy[m.team1].rating, b = teamBy[m.team2].rating;
        won[m.matchNo] = { winner: rng() < winProb(a, b) ? m.team1 : m.team2 };
      }
    }
    decide('SUPER_7');
    decide('SEMI_FINAL');
    decide('FINAL');
    const s = resolveTournament(data, outcome);
    Object.values(s.seeds).forEach((c) => tally[c] && tally[c].super7++);
    s.super7.rows.slice(0, 4).forEach((r) => tally[r.code] && tally[r.code].semi++);
    const fin = s.fixtures.find((f) => f.stage === 'FINAL');
    [fin?.t1, fin?.t2].forEach((c) => c && tally[c] && tally[c].final++);
    if (s.champion && tally[s.champion]) tally[s.champion].title++;
  }
  return Object.values(tally)
    .map((t) => ({ ...t, super7: t.super7 / runs, semi: t.semi / runs, final: t.final / runs, title: t.title / runs }))
    .sort((a, b) => b.title - a.title || b.final - a.final);
}
