import { useState } from 'react';
import { simulate } from '../engine.js';
import Team from './Team.jsx';
import { pct } from '../labels.js';

export default function Odds({ data, picks, teamBy }) {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [useMine, setUseMine] = useState(false);
  const [runs, setRuns] = useState(5000);

  const run = () => {
    setBusy(true);
    setTimeout(() => { // let the button repaint first
      const fixed = useMine
        ? [...data.results, ...Object.entries(picks).filter(([no]) => !data.results.some((r) => r.matchNo === Number(no))).map(([no, p]) => ({ matchNo: Number(no), winner: p.winner }))]
        : data.results;
      setRows(simulate({ ...data, results: fixed }, runs));
      setBusy(false);
    }, 30);
  };
  const max = rows ? Math.max(...rows.map((r) => r.title), 0.01) : 1;

  return (
    <div className="odds">
      <section className="panel">
        <header className="panel-head"><h2>Title odds</h2><span className="badge">Monte Carlo</span></header>
        <p className="muted pad">
          The whole tournament is played {runs.toLocaleString()} times by the engine, using each team’s <b>Atlas rating</b> (an
          editable starting estimate in <code>teams.csv</code>, not an official ICC number). Results already in <code>results.csv</code> are
          treated as fixed.
        </p>
        <div className="odds-controls">
          <label className="check"><input type="checkbox" checked={useMine} onChange={(e) => setUseMine(e.target.checked)} /> Lock in my picks as if they happened</label>
          <select value={runs} onChange={(e) => setRuns(Number(e.target.value))} aria-label="Number of simulations">
            {[1000, 5000, 20000].map((n) => <option key={n} value={n}>{n.toLocaleString()} runs</option>)}
          </select>
          <button className="btn btn-lime" onClick={run} disabled={busy}>{busy ? 'Simulating…' : rows ? 'Run again' : 'Simulate the tournament'}</button>
        </div>
      </section>

      {rows && (
        <section className="panel">
          <table className="odds-table">
            <thead><tr><th>Team</th><th className="bar-col">Win the World Cup</th><th>Final</th><th>Semis</th><th>Super 7</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.code}>
                  <td><Team code={r.code} teamBy={teamBy} size="sm" /></td>
                  <td className="bar-col"><span className="bar"><i style={{ width: `${(r.title / max) * 100}%`, background: teamBy[r.code].color1 }} /></span><b className="mono">{pct(r.title)}</b></td>
                  <td className="mono">{pct(r.final)}</td><td className="mono">{pct(r.semi)}</td><td className="mono">{pct(r.super7)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="table-note">Qualifier A and B are placeholders (rating 52) until the four Qualifier places are decided.</p>
        </section>
      )}
    </div>
  );
}
