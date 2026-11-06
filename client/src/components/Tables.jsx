import Team from './Team.jsx';

export function StandingsTable({ title, rows, qualify = 3, wildcard, wildcardCode, teamBy, note, complete, played, total }) {
  return (
    <section className="panel table-panel">
      <header className="panel-head">
        <h3>{title}</h3>
        <span className="badge">{complete ? 'final' : `${played}/${total} matches`}</span>
      </header>
      {rows.length === 0 ? <p className="muted pad">Waiting for the group results.</p> : (
        <table className="standings">
          <thead><tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>L</th><th>NR</th><th>NRR</th><th>Pts</th></tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const isFourth = wildcardCode && r.code === wildcardCode && i >= qualify;
              const q = i < qualify || isFourth, wc = !isFourth && wildcard && i === qualify && !wildcardCode;
              return (
                <tr key={r.code} className={`${q ? 'q' : wc ? 'wc' : ''} ${isFourth ? 'wcq' : ''}`}>
                  <td className="pos">{i + 1}</td>
                  <td><Team code={r.code} teamBy={teamBy} size="sm" /></td>
                  <td>{r.p}</td><td>{r.w}</td><td>{r.l}</td><td>{r.nr}</td>
                  <td className="mono">{r.ballsFor ? (r.nrr >= 0 ? '+' : '') + r.nrr.toFixed(3) : '–'}</td>
                  <td><b className="pts">{r.pts}</b></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {note && <p className="table-note">{note}</p>}
    </section>
  );
}
