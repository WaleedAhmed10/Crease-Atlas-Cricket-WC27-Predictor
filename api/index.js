import { createApp } from '../server/src/app.js';
import { seed } from '../server/src/seed.js';

const app = createApp();
let ready; // runs once per warm instance: creates tables + loads the CSV data (skipped when unchanged)
const ensureReady = () => (ready ||= seed().catch((err) => { ready = null; throw err; }));

export default async function handler(req, res) {
  try {
    await ensureReady();
  } catch (err) {
    console.error('Database setup failed:', err.message);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'The database is not reachable. Check DATABASE_URL (and DATABASE_SSL) in the Vercel project settings.' }));
  }
  return app(req, res);
}
