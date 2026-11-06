import { fmtDate } from '../labels.js';

export default function Format({ data }) {
  const { rules, venues } = data;
  const sp = rules.stagePoints;
  return (
    <div className="format">
      <section className="panel prose">
        <h2>The ICC format, simply</h2>
        <ol className="steps">
          <li><b>Super Series</b><span>Three Qualifier teams play each other in Windhoek (2, 4, 6 Oct). The winner takes the last place in the groups.</span></li>
          <li><b>Group stage · 30 matches</b><span>14 teams in two groups of six: India, Australia, Pakistan, Afghanistan, Zimbabwe and a qualifier in Group A; New Zealand, South Africa, Sri Lanka, England, Bangladesh and a qualifier in Group B. Everyone plays everyone in their group (7–24 Oct).</span></li>
          <li><b>Super 7 · 21 matches</b><span>The top three of each group plus the better of the two fourth-placed teams play a single round robin. <b>No points carry forward.</b> (25 Oct – 14 Nov)</span></li>
          <li><b>Semi-finals</b><span>1st v 4th (17 Nov, Cape Town) and 2nd v 3rd (18 Nov, Tshwane), each with a reserve day.</span></li>
          <li><b>Final</b><span>21 Nov at the Wanderers, Johannesburg (reserve day 22 Nov).</span></li>
        </ol>
        <p className="muted small">Win = 2 points, tie or no result = 1 each. Tables are ordered by points, wins, then net run rate. 57 matches in all. Kick-off times were not part of the data source, so predictions close at 00:00 UTC on match day.</p>
      </section>

      <section className="panel prose">
        <h2>How you score</h2>
        <div className="scoring">
          {[['Super Series & group match', sp.GROUP], ['Super 7 match', sp.SUPER_7], ['Semi-final', sp.SEMI_FINAL], ['Final', sp.FINAL]].map(([l, p]) => (
            <div key={l}><b>{p}</b><span>{l}</span></div>
          ))}
          <div className="bonus"><b>+{rules.marginBonus}</b><span>bonus when you also call the margin band (nail-biter, comfortable, thrashing)</span></div>
        </div>
        <p className="muted small">Margin bands: runs under 25 / 25–74 / 75+; wickets 1–3 / 4–6 / 7–10. In Super 7 and knockouts you score by picking the right <i>winner</i>, so your projected bracket can still pay off if the real fixtures differ.</p>
      </section>

      <section className="panel prose">
        <h2>Twelve venues, three countries</h2>
        <div className="venues">
          {venues.map((v) => (
            <div key={v.id}><b>{v.city}</b><span>{v.stadium}</span><em>{v.country}{v.capacity ? ` · ${v.capacity.toLocaleString()}` : ''}</em></div>
          ))}
        </div>
        <p className="muted small">Dataset: {data.matches.length} fixtures from {fmtDate(data.matches[0].date)} to {fmtDate(data.matches.at(-1).date)} 2027, loaded from the CSV files in <code>/data</code>. Four teams are still to qualify (Qualifier: 22 Feb – 23 Mar 2027), so Qualifier A/B and the Super Series teams are placeholders you can fill in from <code>slot_assignments.csv</code>.</p>
      </section>
    </div>
  );
}
