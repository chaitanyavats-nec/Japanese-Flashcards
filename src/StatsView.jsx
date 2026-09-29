import React, { useMemo, useState } from 'react';
import { dayKey, shiftDay, startOfDay, DAY } from './lib/storage';
import { dueAt, wordState } from './lib/srs';
import { levelInfo, retention, goalDaysMet, totalReviews } from './lib/activity';
import { BADGES } from './lib/badges';
import { IconMedal } from './icons';

// Chart colours are CSS tokens (--chart-*, --status-*, --heat-*): single-hue
// ramps, stepped separately for light and dark and checked for contrast
// against each surface.
const STATES = [
  { key: 'new', label: 'New' },
  { key: 'learning', label: 'Learning' },
  { key: 'learnt', label: 'Learnt' },
  { key: 'mastered', label: 'Mastered' }
];
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Reviews due on each of the next 7 days (today includes anything overdue).
function forecast(cards, progress, now) {
  const today = startOfDay(now);
  const days = Array.from({ length: 7 }, (_, i) => ({ key: dayKey(shiftDay(now, i)), count: 0, offset: i }));
  cards.forEach(c => {
    const due = dueAt(progress[c.id]);
    if (due === null) return;
    const offset = Math.max(0, Math.floor((startOfDay(due) - today) / DAY + 0.5));
    if (offset < 7) days[offset].count++;
  });
  return days;
}

const dayLabel = (offset, key) => {
  if (offset === 0) return 'Today';
  const d = new Date(`${key}T12:00:00`);
  return WEEKDAY[d.getDay()];
};

// Columns with the value on each cap (seven columns, so every value is
// labelled and no y-axis is needed).
const ForecastChart = ({ days }) => {
  const [active, setActive] = useState(null);
  const max = Math.max(1, ...days.map(d => d.count));
  const W = 320, H = 150, top = 22, base = 118, bar = 22;
  const band = W / days.length;
  return (
    <figure class="chart">
      <svg viewBox={`0 0 ${W} ${H}`} class="chart-svg" role="img" aria-label="Reviews due over the next 7 days">
        <line x1="0" x2={W} y1={base + 0.5} y2={base + 0.5} class="chart-axis" />
        {days.map((d, i) => {
          const h = d.count === 0 ? 0 : Math.max(4, ((base - top) * d.count) / max);
          const x = i * band + (band - bar) / 2;
          const y = base - h;
          const r = Math.min(4, h);
          return (
            <g key={d.key} onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)} onClick={() => setActive(a => (a === i ? null : i))}>
              <rect x={i * band} y={top - 20} width={band} height={base - top + 44} fill="transparent" />
              {h > 0 && (
                <path
                  class={`chart-bar ${active === i ? 'is-active' : ''}`}
                  d={`M${x},${base} V${y + r} Q${x},${y} ${x + r},${y} H${x + bar - r} Q${x + bar},${y} ${x + bar},${y + r} V${base} Z`}
                />
              )}
              <text x={x + bar / 2} y={y - 6} class="chart-value" textAnchor="middle">{d.count}</text>
              <text x={x + bar / 2} y={base + 18} class={`chart-tick ${i === 0 ? 'is-today' : ''}`} textAnchor="middle">{dayLabel(i, d.key)}</text>
              <title>{`${dayLabel(i, d.key)}: ${d.count} review${d.count === 1 ? '' : 's'} due`}</title>
            </g>
          );
        })}
      </svg>
      <table class="sr-only">
        <caption>Reviews due over the next 7 days</caption>
        <tbody>{days.map((d, i) => <tr key={d.key}><th scope="row">{dayLabel(i, d.key)}</th><td>{d.count}</td></tr>)}</tbody>
      </table>
    </figure>
  );
};

// A part-to-whole bar of word states, 2px surface gaps between segments.
const StateBar = ({ counts, total, height = 12 }) => {
  if (total === 0) return null;
  const parts = STATES.filter(s => counts[s.key] > 0);
  return (
    <div class="state-bar" style={{ height }} role="img" aria-label={parts.map(s => `${counts[s.key]} ${s.label.toLowerCase()}`).join(', ')}>
      {parts.map(s => (
        <span key={s.key} class={`state-seg state-${s.key}`} style={{ flexGrow: counts[s.key] }} title={`${s.label}: ${counts[s.key]}`} />
      ))}
    </div>
  );
};

// 12 weeks of study, one cell per day, oldest top-left. Five steps: none,
// then four bins relative to the daily goal.
const Heatmap = ({ activity, goal, now }) => {
  const weeks = 12;
  const todayDow = new Date(now).getDay();
  const cells = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const col = [];
    for (let d = 0; d < 7; d++) {
      const offset = -(w * 7 + (todayDow - d));
      if (offset > 0) { col.push(null); continue; }
      const key = dayKey(shiftDay(now, offset));
      const reviews = activity.days[key]?.reviews || 0;
      const level = reviews === 0 ? 0 : reviews < goal * 0.25 ? 1 : reviews < goal * 0.75 ? 2 : reviews < goal * 1.25 ? 3 : 4;
      col.push({ key, reviews, level });
    }
    cells.push(col);
  }
  return (
    <figure class="chart heatmap-figure">
      <div class="heatmap" role="img" aria-label={`Study activity over the last ${weeks} weeks`}>
        {cells.map((col, i) => (
          <div class="heatmap-col" key={i}>
            {col.map((cell, j) => cell
              ? <span key={cell.key} class={`heat-cell heat-${cell.level}`} title={`${new Date(`${cell.key}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}: ${cell.reviews} review${cell.reviews === 1 ? '' : 's'}`} />
              : <span key={`empty-${j}`} class="heat-cell heat-future" aria-hidden="true" />)}
          </div>
        ))}
      </div>
      <figcaption class="heatmap-legend">
        <span>Less</span>
        {[0, 1, 2, 3, 4].map(l => <span key={l} class={`heat-cell heat-${l}`} aria-hidden="true" />)}
        <span>More</span>
      </figcaption>
    </figure>
  );
};

export default function StatsView({ cards, levels, progress, activity, settings, streak, now, onOpenSettings }) {
  const days = useMemo(() => forecast(cards, progress, now), [cards, progress, now]);
  const stateCounts = useMemo(() => {
    const tally = (list) => {
      const out = { new: 0, learning: 0, learnt: 0, mastered: 0 };
      list.forEach(c => { out[wordState(progress[c.id])]++; });
      return out;
    };
    return { all: tally(cards), levels: levels.map(l => ({ ...l, counts: tally(l.cards) })) };
  }, [cards, levels, progress]);
  const ret = retention(activity, now);
  const level = levelInfo(activity.xp);
  const reviews = totalReviews(activity);
  const goalDays = goalDaysMet(activity, settings.dailyGoal);
  const earned = BADGES.filter(b => activity.badges?.[b.id]);
  const weekTotal = days.reduce((s, d) => s + d.count, 0);

  return (
    <div class="stats-view">
      <section class="stats-tiles" aria-label="Summary">
        <div class="stat-tile">
          <span class="stat-label">Retention, last 30 days</span>
          <span class="stat-value">{ret.rate === null ? 'No data' : `${Math.round(ret.rate * 100)}%`}</span>
          <span class="stat-sub">{ret.reviews > 0 ? `${ret.correct} of ${ret.reviews} answers recalled` : 'Answer a few reviews to see this'}</span>
        </div>
        <div class="stat-tile">
          <span class="stat-label">Streak</span>
          <span class="stat-value">{streak.current} day{streak.current === 1 ? '' : 's'}</span>
          <span class="stat-sub">Best {streak.best}</span>
        </div>
        <div class="stat-tile stat-tile-wide">
          <span class="stat-label">Level {level.level}</span>
          <span class="stat-value">{(activity.xp || 0).toLocaleString()} XP</span>
          <div class="xp-meter" role="progressbar" aria-valuemin={0} aria-valuemax={level.xpForLevel} aria-valuenow={level.xpIntoLevel} aria-label={`Progress to level ${level.level + 1}`}>
            <span class="xp-meter-fill" style={{ width: `${Math.round(level.progress * 100)}%` }} />
          </div>
          <span class="stat-sub">{level.xpForLevel - level.xpIntoLevel} XP to level {level.level + 1}. {reviews.toLocaleString()} reviews so far, daily goal met on {goalDays} day{goalDays === 1 ? '' : 's'}.</span>
        </div>
      </section>

      <section class="stats-section">
        <h3 class="collections-section-label">Next 7 days</h3>
        {weekTotal === 0 ? (
          <p class="stats-empty">Nothing scheduled yet. Learn a few words and their reviews show up here.</p>
        ) : <ForecastChart days={days} />}
      </section>

      <section class="stats-section">
        <h3 class="collections-section-label">Your words</h3>
        <StateBar counts={stateCounts.all} total={cards.length} height={14} />
        <ul class="state-legend">
          {STATES.map(s => (
            <li key={s.key}>
              <span class={`state-swatch state-${s.key}`} aria-hidden="true" />
              <span class="state-legend-label">{s.label}</span>
              <span class="state-legend-count">{stateCounts.all[s.key]}</span>
            </li>
          ))}
        </ul>
        <p class="stats-note">Learning: seen but not yet remembered for a day. Mastered: next review three weeks or more away.</p>
        <div class="state-levels">
          {stateCounts.levels.map(l => {
            const total = l.cards.length;
            const known = l.counts.learnt + l.counts.mastered;
            return (
              <div class="state-level" key={l.key}>
                <div class="state-level-head">
                  <span class="state-level-name">{l.title}</span>
                  <span class="state-level-count">{known} / {total}</span>
                </div>
                <StateBar counts={l.counts} total={total} height={8} />
              </div>
            );
          })}
        </div>
      </section>

      <section class="stats-section">
        <h3 class="collections-section-label">Last 12 weeks</h3>
        <Heatmap activity={activity} goal={settings.dailyGoal} now={now} />
      </section>

      <section class="stats-section">
        <h3 class="collections-section-label">Badges</h3>
        <p class="stats-note">{earned.length} of {BADGES.length} earned</p>
        <ul class="badge-grid">
          {BADGES.map(b => {
            const when = activity.badges?.[b.id];
            return (
              <li key={b.id} class={`badge ${when ? 'is-earned' : ''}`}>
                <span class="badge-icon" aria-hidden="true"><IconMedal size={22} /></span>
                <span class="badge-title">{b.title}</span>
                <span class="badge-desc">{b.description}</span>
                <span class="sr-only">{when ? 'Earned' : 'Not earned yet'}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <button class="settings-action stats-settings-link" onClick={onOpenSettings}>Study settings</button>
    </div>
  );
}
