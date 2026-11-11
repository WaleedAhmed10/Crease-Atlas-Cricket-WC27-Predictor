// Loads the CSV datasets in /data into PostgreSQL. Idempotent: run it again any time you edit a CSV
// (users, sessions and predictions are never touched).
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { config } from './config.js';
import { pool, schemaSql } from './db.js';

const read = async (name) =>
  parse(await readFile(`${config.dataDir}${name}`, 'utf8'), { columns: true, skip_empty_lines: true, trim: true });

const num = (v) => (v === '' || v === undefined ? null : Number(v));

export function marginBand(type, value) {
  if (!type || value == null) return null;
  if (type === 'runs') return value < 25 ? 'close' : value < 75 ? 'comfortable' : 'dominant';
  if (type === 'wickets') return value <= 3 ? 'close' : value <= 6 ? 'comfortable' : 'dominant';
  return null;
}

const FILES = ['teams.csv', 'venues.csv', 'fixtures.csv', 'results.csv', 'slot_assignments.csv'];
const LOCK_ID = 727001; // pg advisory lock so several server instances never seed at the same moment

/**
 * Creates the tables and loads the CSV datasets.
 * Unless `force` is set it does nothing when the CSV files are unchanged since the last load,
 * so it is cheap to call on every (serverless) cold start.
 */
export async function seed({ force = false } = {}) {
  const lock = await pool.connect();
  try {
    await lock.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
    await lock.query(await schemaSql());
    const raw = await Promise.all(FILES.map((f) => readFile(`${config.dataDir}${f}`, 'utf8')));
    const hash = crypto.createHash('sha256').update(raw.join('\u0000')).digest('hex');
    if (!force) {
      const { rows } = await lock.query("SELECT value FROM meta WHERE key='data_hash'");
      if (rows[0]?.value === hash) return { skipped: true, reason: 'datasets unchanged' };
    }
    const summary = await load(lock);
    await lock.query("INSERT INTO meta (key,value) VALUES ('data_hash',$1) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value", [hash]);
    return summary;
  } finally {
    await lock.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {});
    lock.release();
  }
}

async function load(client) { // runs on the connection that holds the lock
  const [teams, venues, matches, results, slots] = await Promise.all([
    read('teams.csv'), read('venues.csv'), read('fixtures.csv'), read('results.csv'), read('slot_assignments.csv'),
  ]);

  const byCode = new Map(teams.map((t) => [t.code, t]));
  const slotMap = new Map();
  for (const s of slots) {
    const slot = byCode.get(s.slot);
    const team = byCode.get(s.team);
    if (!slot || slot.status !== 'placeholder') throw new Error(`slot_assignments.csv: "${s.slot}" is not a placeholder team`);
    if (!team || team.status === 'placeholder') throw new Error(`slot_assignments.csv: "${s.team}" is not a real team in teams.csv`);
    slotMap.set(s.slot, team);
  }

  const matchByNo = new Map(matches.map((m) => [Number(m.match_no), m]));
  const venueIds = new Set(venues.map((v) => v.venue_id));
  for (const m of matches) {
    if (!venueIds.has(m.venue_id)) throw new Error(`fixtures.csv: match ${m.match_no} has unknown venue ${m.venue_id}`);
  }

  try {
    await client.query('BEGIN');

    for (const t of teams) {
      const filled = slotMap.get(t.code); // a placeholder slot takes the identity of the team assigned to it
      const src = filled || t;
      await client.query(
        `INSERT INTO teams (code,name,short,group_code,seed,status,color1,color2,wc_titles,rating,assigned_code)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, short=EXCLUDED.short, group_code=EXCLUDED.group_code,
           seed=EXCLUDED.seed, status=EXCLUDED.status, color1=EXCLUDED.color1, color2=EXCLUDED.color2,
           wc_titles=EXCLUDED.wc_titles, rating=EXCLUDED.rating, assigned_code=EXCLUDED.assigned_code`,
        [t.code, src.name, filled ? filled.short : t.short, t.group_code, t.seed, filled ? 'qualified' : t.status,
          src.color1, src.color2, num(src.wc_titles) ?? 0, num(src.rating) ?? 50, filled ? filled.code : null]
      );
    }
    for (const v of venues) {
      await client.query(
        `INSERT INTO venues (venue_id,stadium,city,country,capacity) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (venue_id) DO UPDATE SET stadium=EXCLUDED.stadium, city=EXCLUDED.city, country=EXCLUDED.country, capacity=EXCLUDED.capacity`,
        [v.venue_id, v.stadium, v.city, v.country, num(v.capacity)]
      );
    }
    for (const m of matches) {
      await client.query(
        `INSERT INTO matches (match_no,stage,group_code,match_date,team1,team2,venue_id,reserve_date,label)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (match_no) DO UPDATE SET stage=EXCLUDED.stage, group_code=EXCLUDED.group_code, match_date=EXCLUDED.match_date,
           team1=EXCLUDED.team1, team2=EXCLUDED.team2, venue_id=EXCLUDED.venue_id, reserve_date=EXCLUDED.reserve_date, label=EXCLUDED.label`,
        [m.match_no, m.stage, m.group_code, m.match_date, m.team1, m.team2, m.venue_id, m.reserve_date || null, m.label]
      );
    }

    // results.csv is the source of truth: replace the table with its contents
    await client.query('DELETE FROM results');
    for (const r of results) {
      const no = Number(r.match_no);
      const m = matchByNo.get(no);
      if (!m) throw new Error(`results.csv: unknown match_no ${r.match_no}`);
      const type = r.result_type || 'normal';
      const winner = type === 'normal' ? r.winner : null;
      if (type === 'normal' && !winner) throw new Error(`results.csv: match ${no} needs a winner`);
      // Group / Super Series fixtures name their teams, so the winner must be one of them
      // (later stages depend on who qualified, so any known team code is accepted there).
      if (winner && ['GROUP', 'SUPER_SERIES'].includes(m.stage) && ![m.team1, m.team2].includes(winner)) {
        throw new Error(`results.csv: match ${no} winner "${winner}" is not ${m.team1} or ${m.team2}`);
      }
      if (winner && !byCode.has(winner)) throw new Error(`results.csv: match ${no} winner "${winner}" is not a team code`);
      await client.query(
        `INSERT INTO results (match_no,winner,result_type,margin_type,margin_value,margin_band,team1_runs,team1_overs,team2_runs,team2_overs)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [no, winner, type, r.margin_type || null, num(r.margin_value), marginBand(r.margin_type, num(r.margin_value)),
          num(r.team1_runs), num(r.team1_overs), num(r.team2_runs), num(r.team2_overs)]
      );
    }

    await client.query('COMMIT');
    return { teams: teams.length, venues: venues.length, matches: matches.length, results: results.length, slots: slots.length };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

// `npm run seed`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seed({ force: true })
    .then((s) => { console.log('Seeded:', s); return pool.end(); })
    .catch((e) => { console.error('Seed failed:', e.message); process.exit(1); });
}
