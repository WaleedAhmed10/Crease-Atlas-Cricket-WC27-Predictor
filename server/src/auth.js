import crypto from 'node:crypto';
import { query } from './db.js';
import { config } from './config.js';
import { HttpError } from './errors.js';

const SESSION_MS = config.sessionDays * 24 * 60 * 60 * 1000;
const MAX_SESSIONS = 10;
const hash = (token) => crypto.createHash('sha256').update(token).digest('hex');

// ---- passwords (scrypt, per-user salt) ----
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `scrypt$${salt}$${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}
export function verifyPassword(password, stored) {
  const [alg, salt, key] = String(stored).split('$');
  if (alg !== 'scrypt' || !salt || !key) return false;
  const a = crypto.scryptSync(password, salt, 64);
  const b = Buffer.from(key, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const DUMMY = hashPassword('dummy-password-for-timing');

// ---- sessions: random 256-bit tokens, only their hash is stored ----
export async function startSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  await query(
    'INSERT INTO sessions (token_hash,user_id,expires_at) VALUES ($1,$2,$3)',
    [hash(token), userId, new Date(Date.now() + SESSION_MS)]
  );
  // keep the newest MAX_SESSIONS per user, drop expired ones
  await query('DELETE FROM sessions WHERE user_id=$1 AND (expires_at < now() OR token_hash NOT IN (SELECT token_hash FROM sessions WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2))', [userId, MAX_SESSIONS]);
  return token;
}
export const endSession = (token) => query('DELETE FROM sessions WHERE token_hash=$1', [hash(token)]);
export const endAllSessions = (userId) => query('DELETE FROM sessions WHERE user_id=$1', [userId]);

export const publicUser = (u) => ({ id: u.id, username: u.username, displayName: u.display_name });

/** Express middleware: attaches req.user / req.token when a valid session is sent. */
export async function authenticate(req, _res, next) {
  try {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (token) {
      const { rows } = await query(
        `SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at > now()`,
        [hash(token)]
      );
      if (rows[0]) { req.user = rows[0]; req.token = token; }
    }
    next();
  } catch (e) { next(e); }
}
export const requireAuth = (req, _res, next) =>
  req.user ? next() : next(new HttpError(401, 'Please sign in'));

// ---- account actions ----
const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

export async function signup(username, password, displayName) {
  if (typeof username !== 'string' || !USERNAME_RE.test(username.trim()))
    throw new HttpError(400, 'Username must be 3-20 characters: letters, numbers, underscore');
  if (typeof password !== 'string' || password.length < 6 || password.length > 128)
    throw new HttpError(400, 'Password must be 6-128 characters');
  const name = (typeof displayName === 'string' && displayName.trim() ? displayName.trim() : username.trim()).slice(0, 30);
  try {
    const { rows } = await query(
      'INSERT INTO users (username,display_name,password_hash) VALUES ($1,$2,$3) RETURNING *',
      [username.trim(), name, hashPassword(password)]
    );
    return rows[0];
  } catch (e) {
    if (e.code === '23505') throw new HttpError(409, 'That username is taken');
    throw e;
  }
}

export async function signin(username, password) {
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password)
    throw new HttpError(400, 'Username and password are required');
  const { rows } = await query('SELECT * FROM users WHERE lower(username)=lower($1)', [username.trim()]);
  const user = rows[0];
  if (!user) { verifyPassword(password, DUMMY); throw new HttpError(401, 'Invalid username or password'); } // same timing
  if (user.locked_until && user.locked_until > new Date())
    throw new HttpError(423, 'Too many wrong passwords. This account is locked for a few minutes; try again later.');
  if (!verifyPassword(password, user.password_hash)) {
    const failed = user.failed_attempts + 1;
    if (failed >= 8) await query("UPDATE users SET failed_attempts=0, locked_until=now()+interval '10 minutes' WHERE id=$1", [user.id]);
    else await query('UPDATE users SET failed_attempts=$2 WHERE id=$1', [user.id, failed]);
    throw new HttpError(401, 'Invalid username or password');
  }
  if (user.failed_attempts || user.locked_until) await query('UPDATE users SET failed_attempts=0, locked_until=NULL WHERE id=$1', [user.id]);
  return user;
}
