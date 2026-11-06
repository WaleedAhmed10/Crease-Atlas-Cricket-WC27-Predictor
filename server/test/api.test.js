// Integration tests. Needs a throwaway PostgreSQL database:
//   TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/crease_test npm test
import test from 'node:test';
import assert from 'node:assert/strict';

const url = process.env.TEST_DATABASE_URL;
if (!url) { console.log('TEST_DATABASE_URL not set - skipping'); process.exit(0); }
process.env.DATABASE_URL = url;
process.env.ADMIN_KEY = 'test-admin-key';

const { seed } = await import('../src/seed.js');
const { createApp } = await import('../src/app.js');
const { pool, query } = await import('../src/db.js');

let base, server;
test.before(async () => {
  await query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await seed();
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}/api`;
});
test.after(async () => { server.close(); await pool.end(); });

const call = async (path, { method = 'GET', body, token, headers } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

test('tournament data matches the ICC format', async () => {
  const { body } = await call('/tournament');
  assert.equal(body.matches.length, 57);
  const count = (s) => body.matches.filter((m) => m.stage === s).length;
  assert.deepEqual([count('SUPER_SERIES'), count('GROUP'), count('SUPER_7'), count('SEMI_FINAL'), count('FINAL')], [3, 30, 21, 2, 1]);
  assert.equal(body.teams.filter((t) => t.group === 'A').length, 6);
  assert.equal(body.teams.filter((t) => t.group === 'B').length, 6);
  assert.equal(body.venues.length, 12);
});

let token;
test('signup, signin, wrong password, duplicate username', async () => {
  let r = await call('/auth/signup', { method: 'POST', body: { username: 'Max_V', password: 'secret1' } });
  assert.equal(r.status, 201); token = r.body.token; assert.ok(token);
  r = await call('/auth/signup', { method: 'POST', body: { username: 'max_v', password: 'secret1' } });
  assert.equal(r.status, 409);
  r = await call('/auth/signin', { method: 'POST', body: { username: 'MAX_V', password: 'nope' } });
  assert.equal(r.status, 401);
  r = await call('/auth/signin', { method: 'POST', body: { username: 'max_v', password: 'secret1' } });
  assert.equal(r.status, 200);
  r = await call('/auth/me', { token: r.body.token });
  assert.equal(r.body.user.username, 'Max_V');
});

test('predictions: validation and save', async () => {
  let r = await call('/predictions/1', { method: 'PUT', token, body: { winner: 'IND' } }); // match 1 is a Super Series game
  assert.equal(r.status, 400);
  r = await call('/predictions/4', { method: 'PUT', token, body: { winner: 'IND', margin: 'dominant' } }); // IND v AUS
  assert.equal(r.status, 200);
  r = await call('/predictions/4', { method: 'PUT', token, body: { winner: 'PAK' } });
  assert.equal(r.status, 400);
  r = await call('/predictions/4', { method: 'PUT', token: 'bad', body: { winner: 'IND' } });
  assert.equal(r.status, 401);
  r = await call('/predictions', { token });
  assert.equal(r.body.predictions.length, 1);
});

test('guest import skips invalid and existing picks', async () => {
  const r = await call('/predictions/import', { method: 'POST', token, body: { predictions: [
    { matchNo: 4, winner: 'AUS' },           // already saved -> skipped
    { matchNo: 5, winner: 'PAK' },           // ok (PAK v AFG)
    { matchNo: 6, winner: 'IND' },           // invalid team for that match
  ] } });
  assert.deepEqual(r.body, { saved: 1, skipped: 2 });
});

test('scoring and leaderboard use results', async () => {
  await query("INSERT INTO results (match_no,winner,margin_type,margin_value,margin_band) VALUES (4,'IND','runs',90,'dominant'), (5,'AFG','wickets',5,'comfortable')");
  let r = await call('/predictions', { token });
  const p4 = r.body.predictions.find((p) => p.matchNo === 4);
  assert.equal(p4.points, 13); // 10 for winner + 3 for margin band
  r = await call('/leaderboard');
  assert.equal(r.body.leaderboard[0].points, 13);
  assert.equal(r.body.leaderboard[0].correct, 1);
});

test('account locks after repeated wrong passwords', async () => {
  await call('/auth/signup', { method: 'POST', body: { username: 'locky', password: 'secret1' } });
  await query("UPDATE users SET failed_attempts=7 WHERE username='locky'");
  assert.equal((await call('/auth/signin', { method: 'POST', body: { username: 'locky', password: 'wrong' } })).status, 401);
  const r = await call('/auth/signin', { method: 'POST', body: { username: 'locky', password: 'secret1' } });
  assert.equal(r.status, 423); // even the right password is refused while locked
});

test('failed sign-ins are limited but successful ones are not', async () => {
  for (let i = 0; i < 12; i++) await call('/auth/signin', { method: 'POST', body: { username: 'max_v', password: 'secret1' } });
  const ok = await call('/auth/signin', { method: 'POST', body: { username: 'max_v', password: 'secret1' } });
  assert.equal(ok.status, 200);
  // ...but a stream of FAILED attempts from one address is eventually refused
  let last;
  for (let i = 0; i < 14; i++) last = await call('/auth/signin', { method: 'POST', body: { username: 'nobody', password: 'x' } });
  assert.equal(last.status, 429);
});

test('admin reseed needs the key', async () => {
  assert.equal((await call('/admin/reseed', { method: 'POST' })).status, 403);
  const r = await call('/admin/reseed', { method: 'POST', headers: { 'x-admin-key': 'test-admin-key' } });
  assert.equal(r.status, 200);
});
