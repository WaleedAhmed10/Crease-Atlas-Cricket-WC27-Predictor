import Team from './Team.jsx';
import { fmtDate } from '../labels.js';
import { pointsFor } from '../scoring.js';

const BANDS = [['close', 'Nail-biter'], ['comfortable', 'Comfortable'], ['dominant', 'Thrashing']];

export default function MatchCard({ f, pick, result, teamBy, venues, rules, locked, onPick }) {
  const v = venues[f.venueId];
  const ready = f.t1 && f.t2;
  const pts = pointsFor(f, result, pick, rules);
  const canPick = ready && !locked && !result;
  const choose = (code) => canPick && onPick(f.matchNo, pick?.winner === code ? null : code, pick?.winner === code ? undefined : pick?.margin);

  const side = (code, slot, align) => {
    const sel = pick?.winner === code && code;
    const won = result?.winner && result.winner === code;
    return (
      <button type="button" disabled={!canPick || !code}
        className={`side ${sel ? 'is-picked' : ''} ${won ? 'is-winner' : ''} ${result?.winner && result.winner !== code && code ? 'is-loser' : ''}`}
        style={code && teamBy[code] ? { '--k1': teamBy[code].color1, '--k2': teamBy[code].color2 } : undefined}
        aria-pressed={!!sel} onClick={() => choose(code)}>
        <Team code={code} slot={slot} teamBy={teamBy} align={align} />
        {sel && <span className="tick">{won ? 'Called it' : 'Your pick'}</span>}
      </button>
    );
  };

  return (
    <article className={`ticket stage-${f.stage}`}>
      <div className="stub">
        <span className="stub-no">#{f.matchNo}</span>
        <span className="stub-date">{fmtDate(f.date)}</span>
        {f.label && <span className="stub-label">{f.label}</span>}
      </div>
      <div className="ticket-body">
        <div className="sides">
          {side(f.t1, f.team1, 'left')}
          <span className="vs">v</span>
          {side(f.t2, f.team2, 'right')}
        </div>
        <div className="ticket-foot">
          <span className="venue">{v ? `${v.stadium}, ${v.city}` : f.venueId}</span>
          {result ? (
            <span className="chip chip-result">
              {result.winner ? `${teamBy[result.winner]?.short ?? result.winner} won${result.marginValue ? ` by ${result.marginValue} ${result.marginType}` : ''}` : result.resultType.replace('_', ' ')}
              {pts != null && <b className={pts ? 'plus' : 'zero'}> {pts ? `+${pts}` : '0 pts'}</b>}
            </span>
          ) : locked ? (
            <span className="chip chip-lock">Locked</span>
          ) : !ready ? (
            <span className="chip chip-wait">Teams decided by earlier matches</span>
          ) : pick ? (
            <span className="bands" role="group" aria-label="Margin (optional bonus)">
              {BANDS.map(([k, label]) => (
                <button key={k} type="button" className={`band ${pick.margin === k ? 'on' : ''}`}
                  onClick={() => onPick(f.matchNo, pick.winner, pick.margin === k ? null : k)}>{label}</button>
              ))}
            </span>
          ) : (
            <span className="chip chip-hint">Tap a team to pick the winner</span>
          )}
        </div>
      </div>
    </article>
  );
}
