import { useState } from 'react';
import MatchCard from './MatchCard.jsx';
import { StandingsTable } from './Tables.jsx';
import Team from './Team.jsx';

export default function PathView({ state, cardProps, teamBy, picks }) {
  const [copied, setCopied] = useState(false);
  const { groups, super7, fixtures, champion } = state;
  const semis = fixtures.filter((f) => f.stage === 'SEMI_FINAL');
  const final = fixtures.find((f) => f.stage === 'FINAL');
  const groupLeft = groups.A.total - groups.A.played + groups.B.total - groups.B.played;
  const s7Left = super7.total - super7.played;
  const name = (c) => teamBy[c]?.name ?? '?';

  const share = async () => {
    const text = champion
      ? `My Matchday Atlas Crease path: ${name(champion)} win the 2027 Cricket World Cup. Final: ${name(final.t1)} v ${name(final.t2)}. Semi-finals: ${semis.map((s) => `${name(s.t1)} v ${name(s.t2)}`).join(' | ')}.`
      : 'I am predicting the Cricket World Cup 2027 on Matchday Atlas Crease.';
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { window.prompt('Copy your path:', text); }
  };

  return (
    <div className="path">
      <div className="path-intro panel">
        <h2>Your road to Johannesburg</h2>
        <p>
          Everything here is built from your picks (and real results once they exist). Finish all
          30 group matches and the Super 7 seeds appear; finish the Super 7 and the semi-finals unlock.
        </p>
        <ul className="progress">
          <li className={groupLeft ? '' : 'done'}><b>{groupLeft ? `${groupLeft} group matches to go` : 'Groups complete'}</b><span>unlocks Super 7 seeds</span></li>
          <li className={super7.complete ? 'done' : ''}><b>{!groups.A.complete || !groups.B.complete ? 'Super 7 locked' : s7Left ? `${s7Left} Super 7 matches to go` : 'Super 7 complete'}</b><span>unlocks the semi-finals</span></li>
          <li className={champion ? 'done' : ''}><b>{champion ? `${name(champion)} are your champions` : 'Champion not picked'}</b><span>pick both semis and the final</span></li>
        </ul>
      </div>

      <div className="path-grid">
        <StandingsTable title="Super 7 · projected table" rows={super7.rows} qualify={4} teamBy={teamBy}
          complete={super7.complete} played={super7.played} total={super7.total}
          note="Top 4 reach the semi-finals. No points carry over from the group stage." />
        <div className="knockouts">
          <h3 className="kicker">Semi-finals</h3>
          {semis.map((f) => <MatchCard key={f.matchNo} f={f} {...cardProps(f)} />)}
          <h3 className="kicker">Final · Wanderers, Johannesburg</h3>
          {final && <MatchCard f={final} {...cardProps(final)} />}
        </div>
      </div>

      <div className={`champion ${champion ? 'has' : ''}`} style={champion ? { '--k1': teamBy[champion].color1, '--k2': teamBy[champion].color2 } : undefined}>
        <svg viewBox="0 0 64 64" className="trophy" aria-hidden>
          <path d="M20 8h24v14a12 12 0 0 1-24 0V8z" fill="currentColor" />
          <path d="M20 12H10c0 9 4 14 11 15M44 12h10c0 9-4 14-11 15" fill="none" stroke="currentColor" strokeWidth="3" />
          <rect x="29" y="34" width="6" height="12" fill="currentColor" /><rect x="21" y="46" width="22" height="7" rx="2" fill="currentColor" />
        </svg>
        <div>
          <p className="eyebrow">Your champion</p>
          <h2>{champion ? name(champion) : 'Not decided yet'}</h2>
          {champion && <Team code={champion} teamBy={teamBy} size="sm" />}
        </div>
        <button className="btn btn-lime" onClick={share} disabled={!champion}>{copied ? 'Copied!' : 'Copy my path'}</button>
      </div>
      <p className="muted small center">{Object.keys(picks).length} picks in total · group ties in projections are broken by Atlas rating because net run rate needs real scores.</p>
    </div>
  );
}
