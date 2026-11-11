import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { config } from './config.js';

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
  // serverless functions open one pool per instance, so keep it small there (use your host's pooled connection string)
  max: Number(process.env.DB_POOL_MAX) || (process.env.VERCEL ? 3 : 10),
});

export const query = (text, params) => pool.query(text, params);

export const schemaSql = () => readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
