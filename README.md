# Matchday Atlas Crease

**ICC Men's Cricket World Cup 2027 predictor** — South Africa, Zimbabwe & Namibia, 2 Oct – 21 Nov 2027.
Part of the Matchday Atlas family (sister apps: *Cup* for football, *Grid* for F1). Unofficial fan project, not affiliated with the ICC.

**Stack (PERN):** PostgreSQL · Express · React (Vite) · Node.js

## What it does

* All **57 matches** of the real format: Super Series → 2 groups of 6 → **Super 7** (no points carried forward) → semi-finals → final.
* **Predict the winner** of each match (+ optional margin band for bonus points). Works as a **guest** (saved in the browser); signing in moves guest picks into your account.
* **Tables that build themselves**: group tables, the best-4th-place rule, the Super 7 table, and the semi-final / final line-ups, all derived from real results first and your picks for the rest.
* **My Path**: your projected road to the final, champion card, copy-to-share text.
* **Odds**: Monte Carlo simulation of the whole tournament (optionally locking in your picks).
* **Leaderboard** with server-side scoring (10 / 12 / 15 / 20 points by stage, +3 for the margin band).
* Datasets are **CSV files** in [`/data`](data/README.md): teams, venues, fixtures, results and qualifier slots.

## Run it locally

```bash
# 1. PostgreSQL (or use any Postgres 13+ and set DATABASE_URL)
docker compose up -d db

# 2. API  (creates the tables and loads /data automatically)
cd server && cp .env.example .env && npm install && npm start      # http://localhost:5000

# 3. Web app (in another terminal)
cd client && npm install && npm run dev                            # http://localhost:5173
```

Tests: `npm test --prefix client` (tournament engine) and
`TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/crease_test npm test --prefix server`
(API against a throwaway database; **it drops the `public` schema**, so never point it at real data).

## Keeping it up to date

* **Four teams are still to qualify** (Qualifier: 22 Feb – 23 Mar 2027). Until then *Qualifier A/B* and *Super Series 1–3* are placeholders; fill them in `data/slot_assignments.csv`.
* During the tournament add rows to `data/results.csv`, then run `npm run seed` (or `POST /api/admin/reseed` with the `X-Admin-Key` header if you set `ADMIN_KEY`). Tables, brackets, points and the leaderboard update.
* Atlas ratings in `teams.csv` are starting estimates for the simulator, not official rankings. Adjust them freely.

## Deploying on Vercel (web app + API in one project)

The repo is set up so **one Vercel project serves both**: `vercel.json` builds the React app and runs the Express API as a serverless function at `/api/*` (`api/index.js`). Same domain, so no CORS and no `VITE_API_URL`.

1. **Create a PostgreSQL database** (Neon, Supabase or Vercel's Postgres marketplace) and copy its **pooled** connection string.
2. **Vercel project settings → General → Root Directory: leave it as the repository root** (not `client`). Framework preset: *Other* (the commands come from `vercel.json`).
3. **Environment variables** (Settings → Environment Variables):
   * `DATABASE_URL` = your connection string
   * `DATABASE_SSL` = `true` (needed by most hosted Postgres)
   * `ADMIN_KEY` = a long random string (optional; lets you reload CSVs with `POST /api/admin/reseed`)
4. **Redeploy.** Open `https://your-app.vercel.app/api/health`: you should see `{"ok":true,...}`. The first request creates the tables and loads the CSV data.

Troubleshooting: **404 on `/api/...`** means the project was deployed from `client/` or without the `api/` folder, so fix the Root Directory. **503 "database is not reachable"**: check `DATABASE_URL` / `DATABASE_SSL`. After editing a CSV in `/data`, redeploy: the changed files are detected and reloaded automatically.
Rate limits are kept in memory per function instance, which is fine at this scale.

Other hosts: run `server/` anywhere that runs Node (Render, Railway, Fly…) with `DATABASE_URL`, `CORS_ORIGIN=https://your-frontend`, and build `client/` with `VITE_API_URL=https://your-api.example.com/api`.

## Security notes

Passwords are hashed with scrypt; sessions are random 256-bit tokens of which only the SHA-256 is stored (revocable, 14-day expiry); only *failed* sign-ins count toward the rate limit; accounts lock for 10 minutes after 8 wrong passwords; all SQL is parameterised.

## Layout

```
data/      CSV datasets (see data/README.md)
server/    Express API, db/schema.sql, seed.js (CSV -> Postgres), tests
client/    React app: engine.js (tables, bracket, simulator), components, styles
```
