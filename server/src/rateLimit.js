import { HttpError } from './errors.js';

// Tiny in-memory limiter (one server process). Fine for this app; use Redis if you scale out.
const buckets = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.until < now) buckets.delete(k);
}, 60_000).unref();

const hits = (key, windowMs) => {
  const now = Date.now();
  const b = buckets.get(key) || { times: [], until: 0 };
  b.times = b.times.filter((t) => t > now - windowMs);
  b.until = now + windowMs;
  buckets.set(key, b);
  return b;
};

/** General limiter: every request counts. */
export const apiLimit = (max = 240, windowMs = 60_000) => (req, _res, next) => {
  const b = hits(`api:${req.ip}`, windowMs);
  if (b.times.length >= max) return next(new HttpError(429, 'Too many requests, slow down a little'));
  b.times.push(Date.now());
  next();
};

/** Auth limiter: only FAILED attempts count, so a successful sign-in never uses up the allowance. */
export const failedAuthLimit = (max = 10, windowMs = 5 * 60_000) => (req, res, next) => {
  const key = `auth:${req.ip}`;
  if (hits(key, windowMs).times.length >= max) return next(new HttpError(429, 'Too many failed attempts. Please wait a few minutes.'));
  res.on('finish', () => { if (res.statusCode >= 400) hits(key, windowMs).times.push(Date.now()); });
  next();
};
