import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config.js';
import { query } from './db.js';
import { HttpError } from './errors.js';
import { apiLimit, failedAuthLimit } from './rateLimit.js';
import { authenticate, requireAuth, signup, signin, startSession, endSession, endAllSessions, publicUser } from './auth.js';
import { seed } from './seed.js';

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const BANDS = ['close', 'comfortable', 'dominant'];

export function createApp() {
  const app = express();

  // Behind a proxy (Render, Railway, Fly, nginx...) the limiter must see the real client IP.
  const trust = process.env.TRUST_PROXY ?? (config.isProd ? '1' : '');
  if (trust && !['0', 'false'].includes(trust.toLowerCase())) app.set('trust proxy', Number(trust) || trust);

  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin, allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Key'] }));
  app.use(express.json({ limit: '100kb' }));
  app.use('/api', apiLimit());
  app.use('/api', authenticate);

  app.get('/api/health', wrap(async (_req, res) => {
    await query('SELECT 1');
    res.json({ ok: true, service: 'Matchday Atlas Crease', time: new Date().toISOString() });
  }));

  // ---------- tournament data (teams, venues, fixtures, results) ----------
  app.get('/api/tournament', wrap(async (_req, res) => {
    const [teams, venues, matches, results] = await Promise.all([
      query(`SELECT code,name,short,group_code AS "group",seed,status,color1,color2,wc_titles AS "wcTitles",rating,assigned_code AS "assignedCode" FROM teams ORDER BY group_code, seed DESC, code`),
      query(`SELECT venue_id AS id,stadium,city,country,capacity FROM venues ORDER BY country DESC, city`),
      query(`SELECT match_no AS "matchNo",stage,group_code AS "group",to_char(match_date,'YYYY-MM-DD') AS date,team1,team2,venue_id AS "venueId",to_char(reserve_date,'YYYY-MM-DD') AS "reserveDate",label FROM matches ORDER BY match_no`),
      query(`SELECT match_no AS "matchNo",winner,result_type AS "resultType",margin_type AS "marginType",margin_value AS "marginValue",margin_band AS "marginBand",team1_runs AS "team1Runs",team1_overs::float AS "team1Overs",team2_runs AS "team2Runs",team2_overs::float AS "team2Overs" FROM results ORDER BY match_no`),
    ]);
    res.json({
      teams: teams.rows.filter((t) => t.status !== 'contender'),
      contenders: teams.rows.filter((t) => t.status === 'contender').map((t) => ({ code: t.code, name: t.name })),
      venues: venues.rows, matches: matches.rows, results: results.rows,
      rules: { stagePoints: config.stagePoints, marginBonus: config.marginBonus },
      serverDate: new Date().toISOString().slice(0, 10),
    });
  }));

  // ---------- auth ----------
  const authSuccess = async (res, user, status = 200) =>
    res.status(status).json({ token: await startSession(user.id), user: publicUser(user) });

  app.post('/api/auth/signup', failedAuthLimit(), wrap(async (req, res) => {
    const user = await signup(req.body?.username, req.body?.password, req.body?.displayName);
    await authSuccess(res, user, 201);
  }));
  app.post('/api/auth/signin', failedAuthLimit(), wrap(async (req, res) => {
    const user = await signin(req.body?.username, req.body?.password);
    await authSuccess(res, user);
  }));
  app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));
  app.post('/api/auth/signout', requireAuth, wrap(async (req, res) => {
    if (req.body?.everywhere) await endAllSessions(req.user.id); else await endSession(req.token);
    res.json({ ok: true });
  }));

  // ---------- predictions ----------
  const isLocked = (date) => date <= new Date().toISOString().slice(0, 10); // locks at 00:00 UTC on match day

  async function validatePick(matchNo, winner, band) {
    const { rows } = await query('SELECT match_no, stage, team1, team2, to_char(match_date,\'YYYY-MM-DD\') AS date FROM matches WHERE match_no=$1', [matchNo]);
    const m = rows[0];
    if (!m) throw new HttpError(404, `Match ${matchNo} does not exist`);
    if (isLocked(m.date)) throw new HttpError(409, `Match ${matchNo} is locked (predictions close when match day starts)`);
    const team = (await query("SELECT 1 FROM teams WHERE code=$1 AND status <> 'contender'", [winner])).rowCount;
    if (!team) throw new HttpError(400, 'Unknown team');
    if (['GROUP', 'SUPER_SERIES'].includes(m.stage) && ![m.team1, m.team2].includes(winner))
      throw new HttpError(400, `Winner must be ${m.team1} or ${m.team2}`);
    if (band != null && !BANDS.includes(band)) throw new HttpError(400, 'Invalid margin band');
  }

  const upsertPick = (userId, matchNo, winner, band) => query(
    `INSERT INTO predictions (user_id,match_no,winner,margin_band) VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id,match_no) DO UPDATE SET winner=EXCLUDED.winner, margin_band=EXCLUDED.margin_band, updated_at=now()`,
    [userId, matchNo, winner, band ?? null]);

  const pointsExpr = `CASE WHEN r.winner IS NOT NULL AND r.winner = p.winner THEN
      (CASE m.stage WHEN 'SUPER_SERIES' THEN $1::int WHEN 'GROUP' THEN $2::int WHEN 'SUPER_7' THEN $3::int WHEN 'SEMI_FINAL' THEN $4::int ELSE $5::int END)
      + (CASE WHEN p.margin_band IS NOT NULL AND p.margin_band = r.margin_band THEN $6::int ELSE 0 END)
    ELSE 0 END`;
  const pointsParams = () => { const s = config.stagePoints; return [s.SUPER_SERIES, s.GROUP, s.SUPER_7, s.SEMI_FINAL, s.FINAL, config.marginBonus]; };

  app.get('/api/predictions', requireAuth, wrap(async (req, res) => {
    const { rows } = await query(
      `SELECT p.match_no AS "matchNo", p.winner, p.margin_band AS margin, (r.match_no IS NOT NULL) AS decided, ${pointsExpr} AS points
       FROM predictions p JOIN matches m ON m.match_no=p.match_no LEFT JOIN results r ON r.match_no=p.match_no
       WHERE p.user_id=$7 ORDER BY p.match_no`, [...pointsParams(), req.user.id]);
    res.json({ predictions: rows });
  }));

  app.put('/api/predictions/:matchNo', requireAuth, wrap(async (req, res) => {
    const matchNo = Number(req.params.matchNo);
    const { winner, margin } = req.body || {};
    if (!Number.isInteger(matchNo) || typeof winner !== 'string') throw new HttpError(400, 'matchNo and winner are required');
    await validatePick(matchNo, winner, margin);
    await upsertPick(req.user.id, matchNo, winner, margin);
    res.json({ ok: true });
  }));

  app.delete('/api/predictions/:matchNo', requireAuth, wrap(async (req, res) => {
    const matchNo = Number(req.params.matchNo);
    const m = (await query("SELECT to_char(match_date,'YYYY-MM-DD') AS date FROM matches WHERE match_no=$1", [matchNo])).rows[0];
    if (m && isLocked(m.date)) throw new HttpError(409, 'That match is locked');
    await query('DELETE FROM predictions WHERE user_id=$1 AND match_no=$2', [req.user.id, matchNo]);
    res.json({ ok: true });
  }));

  // Used when a guest signs in: moves their browser-saved picks into the account (skips locked / invalid ones)
  app.post('/api/predictions/import', requireAuth, wrap(async (req, res) => {
    const picks = Array.isArray(req.body?.predictions) ? req.body.predictions.slice(0, 80) : [];
    const have = new Set((await query('SELECT match_no FROM predictions WHERE user_id=$1', [req.user.id])).rows.map((r) => r.match_no));
    let saved = 0, skipped = 0;
    for (const p of picks) {
      try {
        const matchNo = Number(p.matchNo);
        if (have.has(matchNo)) { skipped++; continue; } // never overwrite picks already saved in the account
        await validatePick(matchNo, p.winner, p.margin);
        await upsertPick(req.user.id, matchNo, p.winner, p.margin);
        saved++;
      } catch { skipped++; }
    }
    res.json({ saved, skipped });
  }));

  app.delete('/api/predictions', requireAuth, wrap(async (req, res) => {
    const r = await query(
      "DELETE FROM predictions WHERE user_id=$1 AND match_no IN (SELECT match_no FROM matches WHERE match_date > (now() AT TIME ZONE 'UTC')::date)",
      [req.user.id]);
    res.json({ removed: r.rowCount });
  }));

  // ---------- leaderboard ----------
  app.get('/api/leaderboard', wrap(async (_req, res) => {
    const { rows } = await query(
      `SELECT u.id, u.username, u.display_name AS "displayName",
              COALESCE(SUM(${pointsExpr}),0)::int AS points,
              COUNT(*) FILTER (WHERE r.winner IS NOT NULL AND r.winner = p.winner)::int AS correct,
              COUNT(*) FILTER (WHERE r.match_no IS NOT NULL)::int AS decided,
              COUNT(p.match_no)::int AS picks
       FROM users u JOIN predictions p ON p.user_id=u.id
       JOIN matches m ON m.match_no=p.match_no LEFT JOIN results r ON r.match_no=p.match_no
       GROUP BY u.id ORDER BY points DESC, correct DESC, picks DESC, u.username LIMIT 50`, pointsParams());
    res.json({ leaderboard: rows });
  }));

  // ---------- admin: reload the CSV datasets after editing them ----------
  app.post('/api/admin/reseed', wrap(async (req, res) => {
    const key = req.get('x-admin-key') || '';
    const ok = config.adminKey && key.length === config.adminKey.length &&
      crypto.timingSafeEqual(Buffer.from(key), Buffer.from(config.adminKey));
    if (!ok) throw new HttpError(403, 'Forbidden');
    res.json({ ok: true, ...(await seed({ force: true })) });
  }));

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    if (err.retryAfter) res.set('Retry-After', err.retryAfter);
    res.status(status).json({ error: status >= 500 ? 'Something went wrong on the server' : err.message });
  });
  return app;
}
