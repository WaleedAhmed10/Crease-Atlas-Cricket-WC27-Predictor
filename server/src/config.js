import 'dotenv/config';
import { fileURLToPath } from 'node:url';

export const config = {
  port: Number(process.env.PORT) || 5000,
  databaseUrl: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/crease_atlas',
  ssl: process.env.DATABASE_SSL === 'true',
  sessionDays: Number(process.env.SESSION_DAYS) || 14,
  adminKey: process.env.ADMIN_KEY || '',
  corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim()),
  isProd: process.env.NODE_ENV === 'production',
  dataDir: process.env.DATA_DIR || fileURLToPath(new URL('../../data/', import.meta.url)),
  // Points per correct winner, by stage (+ MARGIN_BONUS when the margin band is also right)
  stagePoints: { SUPER_SERIES: 10, GROUP: 10, SUPER_7: 12, SEMI_FINAL: 15, FINAL: 20 },
  marginBonus: 3,
};
