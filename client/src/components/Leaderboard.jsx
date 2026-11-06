import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';

export default function Leaderboard({ user, onSignIn }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => { setError(''); api.leaderboard().then((d) => setRows(d.leaderboard)).catch((e) => setError(e.message)); }, []);
  useEffect(load, [load]);

  return (
    <section className="panel">
      <header className="panel-head"><h2>Leaderboard</h2><button className="btn btn-ghost btn-sm" onClick={load}>Refresh</button></header>
      {!user && <p className="notice pad">Guests can predict, but only signed-in players appear here. <button className="link" onClick={onSignIn}>Sign in</button> and your guest picks come with you.</p>}
      {error && <p className="notice error pad">{error}</p>}
      {rows && rows.length === 0 && <p className="muted pad">No scores yet. Points appear once matches have results; until then you can already lock in your picks.</p>}
      {rows && rows.length > 0 && (
        <table className="standings board">
          <thead><tr><th>#</th><th>Player</th><th>Picks</th><th>Correct</th><th>Pts</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className={user?.id === r.id ? 'me' : ''}>
                <td className="pos">{i + 1}</td><td>{r.displayName}{user?.id === r.id ? ' (you)' : ''}</td>
                <td>{r.picks}</td><td>{r.correct}/{r.decided}</td><td><b className="pts">{r.points}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
