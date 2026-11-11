import { config } from './config.js';
import { pool } from './db.js';
import { seed } from './seed.js';
import { createApp } from './app.js';

try {
  const s = await seed(); // creates tables and loads the CSV datasets (safe to repeat)
  console.log(s.skipped ? 'Datasets already up to date' : `Datasets loaded: ${s.matches} matches, ${s.teams} teams, ${s.results} results`);
} catch (e) {
  console.error('Could not set up the database:', e.message);
  console.error('Check DATABASE_URL and that PostgreSQL is running.');
  process.exit(1);
}
const server = createApp().listen(config.port, () => console.log(`Crease Atlas API on :${config.port}`));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => pool.end().then(() => process.exit(0))));
