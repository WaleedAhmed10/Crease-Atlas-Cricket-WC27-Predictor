# Datasets

Plain CSV files, loaded into PostgreSQL by `npm run seed` (also runs automatically when the server starts).
Edit a file, run the seed again, done. Users, sessions and predictions are never touched.

| File | What it holds |
|---|---|
| `teams.csv` | The 14 tournament teams (`status=qualified`), the placeholder slots still to be filled (`placeholder`) and teams still fighting for a Qualifier place (`contender`). `rating` is an editable **Atlas rating** used only by the odds simulator. It is not an ICC figure. |
| `venues.csv` | The 12 host stadiums in South Africa, Zimbabwe and Namibia. |
| `fixtures.csv` | All 57 matches in the ICC schedule: Super Series (3), Group stage (30), Super 7 (21), semi-finals (2), final (1). Later-stage fixtures use **slot references**: `A1`..`A3`, `B1`..`B3`, `AB4` (better 4th-placed team), `S7-1`..`S7-4` (Super 7 finishing position), `W55`/`W56` (winner of that match). |
| `results.csv` | Empty until the tournament starts. One row per finished match (see below). This file drives the official tables, the scoring and the leaderboard. |
| `slot_assignments.csv` | Fill the placeholders once the Qualifier is over, e.g. `QA,IRE` and `QB,SCO`. The slot then shows that team's name, colours and rating everywhere. |

## Adding results

`results.csv` columns: `match_no, winner, result_type, margin_type, margin_value, team1_runs, team1_overs, team2_runs, team2_overs`

```
4,IND,normal,runs,90,310,50,220,45.2
5,AFG,normal,wickets,5,240,50,241,46.1
31,,no_result,,,,,,
```

* `winner` is the team code (blank for `tie` / `no_result`; set `result_type` accordingly).
* `margin_type` is `runs` or `wickets`; it decides the margin band (nail-biter / comfortable / thrashing) used for the bonus points.
* Runs and overs (cricket notation, `45.2` = 45 overs 2 balls) feed net run rate. If a side was bowled out, enter its full quota of overs.
* Rows are validated on load: unknown matches or a winner who is not playing are rejected with a clear message.

Source for the format, groups, venues and fixtures: the ICC announcement of the 2027 schedule. Kick-off times were not included, so predictions lock at 00:00 UTC on match day.
