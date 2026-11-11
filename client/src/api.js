const TOKEN_KEY = 'crease_token';
const base = import.meta.env.VITE_API_URL || '/api';

export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
export const setToken = (t) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* storage blocked */ } };

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

async function call(path, { method = 'GET', body, timeout = 30000 } = {}) {
  const ctrl = new AbortController();
  // free hosts can take a minute to wake up, so signing in gets a longer timeout
  const timer = setTimeout(() => ctrl.abort(), path.startsWith('/auth/') ? 75000 : timeout);
  try {
    const token = getToken();
    const res = await fetch(base + path, {
      method, signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { /* not JSON, e.g. an HTML page from a wrong API address */ }
    if (!res.ok) {
      if (res.status === 401 && !path.startsWith('/auth/signin') && !path.startsWith('/auth/signup')) setToken(null);
      const hint = res.status === 404 || res.status === 405
        ? `The API was not found (${res.status}). If this is a Vercel deployment, the project needs the API function: set the Root Directory to the repository root and add DATABASE_URL (see README).`
        : `Request failed (${res.status})`;
      throw new ApiError(data.error || hint, res.status);
    }
    if (text && !Object.keys(data).length && !text.trim().startsWith('{')) {
      throw new ApiError('The API address looks wrong: got a web page instead of data. Set VITE_API_URL when building the client.', 0);
    }
    return data;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (e.name === 'AbortError') throw new ApiError('The server is taking too long (it may be waking up). Please try again in a moment.', 0);
    throw new ApiError('Cannot reach the server. Check your connection and try again.', 0);
  } finally { clearTimeout(timer); }
}

export const api = {
  tournament: () => call('/tournament'),
  signup: (username, password, displayName) => call('/auth/signup', { method: 'POST', body: { username, password, displayName } }),
  signin: (username, password) => call('/auth/signin', { method: 'POST', body: { username, password } }),
  me: () => call('/auth/me'),
  signout: (everywhere = false) => call('/auth/signout', { method: 'POST', body: { everywhere } }),
  predictions: () => call('/predictions'),
  savePick: (matchNo, winner, margin) => call(`/predictions/${matchNo}`, { method: 'PUT', body: { winner, margin } }),
  removePick: (matchNo) => call(`/predictions/${matchNo}`, { method: 'DELETE' }),
  importPicks: (predictions) => call('/predictions/import', { method: 'POST', body: { predictions } }),
  resetPicks: () => call('/predictions', { method: 'DELETE' }),
  leaderboard: () => call('/leaderboard'),
};
