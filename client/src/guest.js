// Guest mode: picks live in this browser only. Shape: { "<matchNo>": { winner, margin } }
const KEY = 'crease_guest_picks';
export function readGuest() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch { return {}; }
}
export function writeGuest(picks) {
  try { Object.keys(picks).length ? localStorage.setItem(KEY, JSON.stringify(picks)) : localStorage.removeItem(KEY); } catch { /* storage blocked */ }
}
