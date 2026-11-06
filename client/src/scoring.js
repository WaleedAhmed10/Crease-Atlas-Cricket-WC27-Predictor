// Same rules as the server (see server/src/config.js); used to show points for any pick that has a result.
export function pointsFor(match, result, pick, rules) {
  if (!result || !result.winner || !pick) return null;
  if (pick.winner !== result.winner) return 0;
  return rules.stagePoints[match.stage] + (pick.margin && pick.margin === result.marginBand ? rules.marginBonus : 0);
}
