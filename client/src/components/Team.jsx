import { refLabel } from '../labels.js';

/** A team shown as a "kit": two vertical stripes in its colours + its name. Unresolved slots show their rule. */
export default function Team({ code, teamBy, slot, size = 'md', align = 'left' }) {
  const t = code ? teamBy[code] : null;
  return (
    <span className={`team team-${size} ${align === 'right' ? 'team-right' : ''} ${t ? '' : 'team-tbd'}`}>
      <span className="kit" style={t ? { '--k1': t.color1, '--k2': t.color2 } : undefined} aria-hidden />
      <span className="team-text">
        <span className="team-name">{t ? t.name : refLabel(slot)}</span>
        {t && size !== 'sm' && <span className="team-code">{t.short}</span>}
      </span>
    </span>
  );
}
