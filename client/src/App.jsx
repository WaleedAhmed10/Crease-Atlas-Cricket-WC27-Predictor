import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { api, getToken, setToken } from './api.js';
import { readGuest, writeGuest } from './guest.js';
import { resolveTournament, consistentPicks, STAGE_LABEL } from './engine.js';
import { fmtDate } from './labels.js';
import PitchHero from './components/PitchHero.jsx';
import MatchCard from './components/MatchCard.jsx';
import { StandingsTable } from './components/Tables.jsx';
import PathView from './components/PathView.jsx';
import Odds from './components/Odds.jsx';
import Leaderboard from './components/Leaderboard.jsx';
import AuthModal from './components/AuthModal.jsx';
import Format from './components/Format.jsx';

const TABS = [['pitch', 'Pitch'], ['fixtures', 'Fixtures'], ['tables', 'Tables'], ['path', 'My Path'], ['odds', 'Odds'], ['board', 'Leaderboard'], ['format', 'Format']];
const FILTERS = [['ALL', 'All'], ['SUPER_SERIES', 'Super Series'], ['A', 'Group A'], ['B', 'Group B'], ['SUPER_7', 'Super 7'], ['KO', 'Knockouts']];

export default function App() {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [user, setUser] = useState(null);
  const [serverPicks, setServerPicks] = useState({});
  const [guestPicks, setGuestPicks] = useState(readGuest);
  const [tab, setTab] = useState('pitch');
  const [filter, setFilter] = useState('ALL');
  const [openOnly, setOpenOnly] = useState(false);
  const [tableMode, setTableMode] = useState('mine');
  const [authOpen, setAuthOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef();

  const say = useCallback((text, kind = 'ok') => {
    setToast({ text, kind });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4500);
  }, []);

  const loadPicks = useCallback(async () => {
    const { predictions } = await api.predictions();
    setServerPicks(Object.fromEntries(predictions.map((p) => [p.matchNo, { winner: p.winner, margin: p.margin }])));
  }, []);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      setData(await api.tournament());
      if (getToken()) {
        try { setUser((await api.me()).user); await loadPicks(); } catch { setToken(null); }
      }
    } catch (e) { setLoadError(e.message); }
  }, [loadPicks]);
  useEffect(() => { load(); }, [load]);

  const rawPicks = user ? serverPicks : guestPicks;
  const results = data?.results;
  const resultBy = useMemo(() => Object.fromEntries((results || []).map((r) => [r.matchNo, r])), [results]);
  const picks = useMemo(() => (data ? consistentPicks(data, data.results, rawPicks) : {}), [data, rawPicks]);

  const realState = useMemo(() => data && resolveTournament(data, (m) => (resultBy[m.matchNo] ? { winner: resultBy[m.matchNo].winner, result: resultBy[m.matchNo] } : null)), [data, resultBy]);
  const pathState = useMemo(() => data && resolveTournament(data, (m) =>
    resultBy[m.matchNo] ? { winner: resultBy[m.matchNo].winner, result: resultBy[m.matchNo] } : picks[m.matchNo] ? { winner: picks[m.matchNo].winner } : null), [data, resultBy, picks]);
  const venues = useMemo(() => Object.fromEntries((data?.venues || []).map((v) => [v.id, v])), [data]);
  const teamBy = pathState?.teamBy;

  const onPick = useCallback(async (matchNo, winner, margin) => {
    const apply = (prev) => {
      const next = { ...prev };
      if (winner) next[matchNo] = { winner, margin: margin ?? null }; else delete next[matchNo];
      return next;
    };
    if (!user) {
      // functional update: several picks in quick succession must not overwrite each other
      setGuestPicks((prev) => { const next = apply(prev); writeGuest(next); return next; });
      return;
    }
    const previous = serverPicks[matchNo];
    setServerPicks(apply); // optimistic
    try { winner ? await api.savePick(matchNo, winner, margin ?? null) : await api.removePick(matchNo); }
    catch (e) {
      // put back only this match's previous pick
      setServerPicks((prev) => { const next = { ...prev }; if (previous) next[matchNo] = previous; else delete next[matchNo]; return next; });
      say(e.message, 'error');
      if (e.status === 401) setUser(null);
    }
  }, [user, serverPicks, say]);

  const handleAuth = async (signUp, username, password) => {
    const res = signUp ? await api.signup(username, password, username) : await api.signin(username, password);
    setToken(res.token);
    setUser(res.user);
    setAuthOpen(false);
    const guest = Object.entries(readGuest()).map(([matchNo, p]) => ({ matchNo: Number(matchNo), winner: p.winner, margin: p.margin }));
    let moved = 0;
    if (guest.length) {
      try { moved = (await api.importPicks(guest)).saved; writeGuest({}); setGuestPicks({}); } catch { /* keep guest picks for next time */ }
    }
    try { await loadPicks(); } catch { /* shown empty until next refresh */ }
    say(moved ? `Welcome ${res.user.displayName}! ${moved} guest pick${moved > 1 ? 's' : ''} moved into your account.` : `Welcome ${res.user.displayName}!`);
  };

  const signOut = async () => {
    try { await api.signout(); } catch { /* token may already be invalid */ }
    setToken(null); setUser(null); setServerPicks({});
    say('Signed out');
  };

  const reset = async () => {
    if (!window.confirm(user ? 'Remove all your open predictions? (matches already underway keep theirs)' : 'Clear your guest predictions from this device?')) return;
    if (user) { try { await api.resetPicks(); await loadPicks(); } catch (e) { say(e.message, 'error'); return; } }
    else { setGuestPicks({}); writeGuest({}); }
    say('Predictions cleared');
  };

  const exportPicks = () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), predictions: picks }, null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'crease-atlas-predictions.json' });
    a.click(); URL.revokeObjectURL(a.href);
  };

  if (loadError) return (
    <div className="boot"><div className="panel boot-card">
      <Wordmark /><h2>Can’t reach the API</h2><p className="muted">{loadError}</p>
      <p className="muted small">Running locally? Start PostgreSQL and the server first. On Vercel, check the DATABASE_URL setting (see README). Then retry.</p>
      <button className="btn btn-lime" onClick={load}>Try again</button>
    </div></div>
  );
  if (!data) return <div className="boot"><div className="boot-card"><Wordmark /><p className="muted">Loading the fixtures…</p></div></div>;

  const today = data.serverDate;
  const cardProps = (f) => ({
    pick: picks[f.matchNo], result: resultBy[f.matchNo], teamBy, venues, rules: data.rules,
    locked: f.date <= today, onPick,
  });

  const shown = pathState.fixtures.filter((f) => {
    const okFilter = filter === 'ALL' || (filter === 'A' || filter === 'B' ? f.group === filter : filter === 'KO' ? ['SEMI_FINAL', 'FINAL'].includes(f.stage) : f.stage === filter);
    return okFilter && (!openOnly || (!resultBy[f.matchNo] && f.date > today));
  });
  const byDate = shown.reduce((acc, f) => { (acc[f.date] ||= []).push(f); return acc; }, {});
  const tableState = tableMode === 'real' ? realState : pathState;
  const pickCount = Object.keys(picks).length;

  return (
    <div className="app">
      <header className="top">
        <Wordmark />
        <nav className="tabs" aria-label="Sections">
          {TABS.map(([k, label]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>)}
        </nav>
        <div className="who">
          {user ? (<><span className="who-name">{user.displayName}</span><button className="btn btn-ghost btn-sm" onClick={signOut}>Sign out</button></>)
            : (<><span className="guest-pill">Guest</span><button className="btn btn-lime btn-sm" onClick={() => setAuthOpen(true)}>Sign in</button></>)}
        </div>
      </header>

      <main>
        {tab === 'pitch' && <PitchHero data={data} picks={picks} onGo={setTab} />}

        {tab === 'fixtures' && (
          <>
            {!user && <p className="notice">Playing as a guest: picks stay on this device. <button className="link" onClick={() => setAuthOpen(true)}>Sign in</button> to score points and join the leaderboard.</p>}
            <div className="toolbar">
              <div className="chips" role="tablist">{FILTERS.map(([k, l]) => <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>)}</div>
              <label className="check"><input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} /> Open only</label>
            </div>
            {Object.entries(byDate).map(([date, list]) => (
              <section key={date} className="day">
                <h3 className="day-head"><span>{fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}</span><em>{STAGE_LABEL[list[0].stage]}</em></h3>
                <div className="cards">{list.map((f) => <MatchCard key={f.matchNo} f={f} {...cardProps(f)} />)}</div>
              </section>
            ))}
            {shown.length === 0 && <p className="muted center pad">Nothing to show with these filters.</p>}
            {pickCount > 0 && (
              <div className="toolbar end">
                <span className="muted small">{pickCount} prediction{pickCount > 1 ? 's' : ''}</span>
                <button className="btn btn-ghost btn-sm" onClick={exportPicks}>Export</button>
                <button className="btn btn-ghost btn-sm danger" onClick={reset}>Reset</button>
              </div>
            )}
          </>
        )}

        {tab === 'tables' && (
          <>
            <div className="toolbar">
              <div className="chips">
                <button className={tableMode === 'mine' ? 'on' : ''} onClick={() => setTableMode('mine')}>With my picks</button>
                <button className={tableMode === 'real' ? 'on' : ''} onClick={() => setTableMode('real')}>Official results only</button>
              </div>
              <span className="muted small">{tableMode === 'mine' ? 'Real results first, your picks fill the gaps.' : 'Updates as results are added to the dataset.'}</span>
            </div>
            <div className="tables">
              {['A', 'B'].map((g) => (
                <StandingsTable key={g} title={`Group ${g}`} rows={tableState.groups[g].rows} qualify={3} wildcard wildcardCode={tableState.fourth?.code} teamBy={teamBy}
                  complete={tableState.groups[g].complete} played={tableState.groups[g].played} total={tableState.groups[g].total}
                  note="Top 3 go to the Super 7. The better of the two 4th-placed teams joins them (gold marker)." />
              ))}
              <StandingsTable title="Super 7" rows={tableState.super7.rows} qualify={4} teamBy={teamBy}
                complete={tableState.super7.complete} played={tableState.super7.played} total={tableState.super7.total}
                note="Top 4 reach the semi-finals. No points carried forward." />
            </div>
          </>
        )}

        {tab === 'path' && <PathView state={pathState} cardProps={cardProps} teamBy={teamBy} picks={picks} />}
        {tab === 'odds' && <Odds data={data} picks={picks} teamBy={teamBy} />}
        {tab === 'board' && <Leaderboard user={user} onSignIn={() => setAuthOpen(true)} />}
        {tab === 'format' && <Format data={data} />}
      </main>

      <footer className="foot">
        <Wordmark small />
        <p>Unofficial fan project. Not affiliated with the ICC or any cricket board. A Matchday Atlas project · sister apps: Cup (football) and Grid (F1).</p>
      </footer>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onSubmit={handleAuth} />
      {toast && <div className={`toast ${toast.kind}`} role="status">{toast.text}</div>}
    </div>
  );
}

function Wordmark({ small }) {
  return (
    <div className={`wordmark ${small ? 'small' : ''}`}>
      <svg viewBox="0 0 28 32" aria-hidden className="stumps"><g fill="#c8f169"><rect x="3" y="4" width="4" height="26" rx="1.5" /><rect x="12" y="4" width="4" height="26" rx="1.5" /><rect x="21" y="4" width="4" height="26" rx="1.5" /></g><g fill="#d9b779"><rect x="4" y="1" width="10" height="3" rx="1.5" /><rect x="14" y="1" width="10" height="3" rx="1.5" /></g></svg>
      <span><b>Matchday Atlas</b><i>CREASE</i></span>
    </div>
  );
}
