import { useMemo } from 'react';
import { STAGES, STAGE_LABEL } from '../engine.js';
import { fmtDate } from '../labels.js';

const FIRST_BALL = '2027-10-02';
const NODES = [
  { stage: 'SUPER_SERIES', x: 210, sub: 'Windhoek · 3 games' },
  { stage: 'GROUP', x: 400, sub: '2 groups of 6 · 30 games' },
  { stage: 'SUPER_7', x: 600, sub: '7 teams · 21 games' },
  { stage: 'SEMI_FINAL', x: 800, sub: 'Cape Town · Tshwane' },
  { stage: 'FINAL', x: 985, sub: 'Johannesburg · 21 Nov' },
];

export default function PitchHero({ data, picks, onGo }) {
  const days = useMemo(() => Math.ceil((new Date(`${FIRST_BALL}T00:00:00Z`) - new Date()) / 86400000), []);
  const counts = useMemo(() => {
    const c = {};
    for (const s of STAGES) c[s] = { total: data.matches.filter((m) => m.stage === s).length, picked: 0 };
    for (const m of data.matches) if (picks[m.matchNo]) c[m.stage].picked++;
    return c;
  }, [data, picks]);
  const total = data.matches.length;
  const picked = Object.keys(picks).length;

  return (
    <section className="hero">
      <div className="hero-copy">
        <p className="eyebrow">ICC Men’s Cricket World Cup · South Africa · Zimbabwe · Namibia</p>
        <h1>Read the <em>crease</em>.<br />Call every match<br />of World Cup 2027.</h1>
        <p className="lede">
          57 matches, 14 teams, one road to Johannesburg. Pick winners, watch the group tables and the new
          <strong> Super 7 </strong> build themselves from your calls, then see who the numbers back.
        </p>
        <div className="hero-actions">
          <button className="btn btn-lime" onClick={() => onGo('fixtures')}>Start predicting</button>
          <button className="btn btn-ghost" onClick={() => onGo('path')}>See my path to the final</button>
        </div>
      </div>

      <div className="scoreboard" aria-label="Tournament countdown">
        <div className="sb-label">{days > 0 ? 'First ball in' : 'World Cup 2027'}</div>
        <div className="sb-digits">{days > 0 ? String(days).padStart(3, '0') : 'LIVE'}</div>
        <div className="sb-unit">{days > 0 ? 'days · 2 Oct 2027' : ''}</div>
        <div className="sb-over" title={`${picked} of ${total} matches predicted`}>
          {Array.from({ length: 6 }, (_, i) => <i key={i} className={i < Math.round((picked / total) * 6) ? 'on' : ''} />)}
          <span>{picked}/{total} called</span>
        </div>
      </div>

      <div className="pitch-wrap">
        <svg className="pitch" viewBox="0 0 1200 300" role="img" aria-label="A cricket pitch with the five stages of the tournament marked along it">
          <defs>
            <linearGradient id="strip" x1="0" x2="1"><stop offset="0" stopColor="#d8c58f" /><stop offset=".5" stopColor="#e6d6a3" /><stop offset="1" stopColor="#d8c58f" /></linearGradient>
          </defs>
          <rect x="70" y="100" width="1060" height="110" rx="6" fill="url(#strip)" opacity=".95" />
          {/* creases */}
          <g stroke="#f7f3e3" strokeWidth="3" opacity=".95">
            <line x1="125" y1="92" x2="125" y2="218" /><line x1="1075" y1="92" x2="1075" y2="218" />
            <line x1="70" y1="155" x2="125" y2="155" /><line x1="1075" y1="155" x2="1130" y2="155" />
            <line x1="70" y1="108" x2="125" y2="108" /><line x1="70" y1="202" x2="125" y2="202" />
            <line x1="1075" y1="108" x2="1130" y2="108" /><line x1="1075" y1="202" x2="1130" y2="202" />
          </g>
          {/* stumps */}
          {[100, 1100].map((cx) => [-9, 0, 9].map((d) => <rect key={cx + d} x={cx + d - 2} y="143" width="4" height="24" rx="1.5" fill="#7a5a2a" />))}
          {/* route */}
          <path d="M125 155 H1075" stroke="#0d2118" strokeWidth="2" strokeDasharray="3 8" opacity=".55" />
          {NODES.map((n) => {
            const c = counts[n.stage];
            const done = c.picked === c.total;
            return (
              <g key={n.stage} className="node" transform={`translate(${n.x} 155)`} onClick={() => onGo(n.stage === 'FINAL' || n.stage === 'SEMI_FINAL' ? 'path' : 'fixtures')} tabIndex="0" role="button">
                <circle r="21" fill={done ? '#c8f169' : '#0d2118'} stroke="#f7f3e3" strokeWidth="3" />
                <text y="6" textAnchor="middle" className="node-num" fill={done ? '#0d2118' : '#c8f169'}>{c.total}</text>
                <text y="-62" textAnchor="middle" className="node-title">{STAGE_LABEL[n.stage]}</text>
                <text y="64" textAnchor="middle" className="node-sub">{n.sub}</text>
                <text y="102" textAnchor="middle" className="node-pick">{c.picked}/{c.total} called</text>
              </g>
            );
          })}
          {/* the ball */}
          <g>
            <circle cy="155" r="9" fill="#c2272d" stroke="#7d1418" strokeWidth="1.5">
              <animate attributeName="cx" values="125;1075;125" dur="12s" repeatCount="indefinite" calcMode="spline" keySplines=".4 0 .6 1;.4 0 .6 1" keyTimes="0;.5;1" />
            </circle>
          </g>
        </svg>
        <p className="pitch-note">Tournament window: {fmtDate('2027-10-02')} – {fmtDate('2027-11-21')} 2027 · Final: Wanderers, Johannesburg</p>
      </div>
    </section>
  );
}
