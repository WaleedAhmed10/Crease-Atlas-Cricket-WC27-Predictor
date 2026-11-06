export const refLabel = (ref) => {
  if (/^A[1-3]$/.test(ref)) return `Group A · ${ref[1]}${['st', 'nd', 'rd'][ref[1] - 1]}`;
  if (/^B[1-3]$/.test(ref)) return `Group B · ${ref[1]}${['st', 'nd', 'rd'][ref[1] - 1]}`;
  if (ref === 'AB4') return 'Best 4th-placed';
  if (/^S7-\d$/.test(ref)) return `Super 7 · ${ref[3]}${['st', 'nd', 'rd', 'th'][ref[3] - 1]}`;
  if (/^W\d+$/.test(ref)) return `Winner of match ${ref.slice(1)}`;
  return ref;
};
export const fmtDate = (iso, opts = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });
export const pct = (x) => (x < 0.001 ? '<0.1%' : `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`);
