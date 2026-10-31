import { getData, update, replaceData } from '../store.js';
import { ui, maps, dayTotals, openSheet, closeSheet, toast, refresh } from '../app.js';
import { addDays, currentWeightKg, dayKey, fmtInt, fmtWeight, LB_PER_KG, parseDay, targets } from '../nutrition.js';
import { html, icon, avatar, ring, macroBars, sparkline, seg } from '../ui.js';
import { sampleData } from '../seed.js';

export function welcome() {
  return html`<section class="card" style="max-width:640px">
<h1 style="font-size:26px;font-weight:800">Welcome to Table Reset</h1>
<p>Add the people you cook for, the food you keep at home and your recipes. The app works out everyone’s calorie and macro targets and keeps track of what you eat.</p>
<a class="btn primary lg" href="#/members/new">${icon('plus', 18, 2.2)}Add the first member</a>
<button type="button" class="btn plain lg" data-action="load-sample">Explore with a sample household</button>
<p class="small muted">You can clear the sample data any time in Settings.</p>
</section>`;
}

function weekStats(member, m) {
  const t = targets(member);
  const today = dayKey();
  let logged = 0, kcal = 0, proteinDays = 0;
  for (let i = 0; i < 7; i++) {
    const { eaten, count } = dayTotals(member.id, addDays(today, -i), m);
    if (count === 0 || eaten.kcal === 0) continue;
    logged++;
    kcal += eaten.kcal;
    if (t && eaten.p >= t.p * 0.9) proteinDays++;
  }
  const weights = [...(member.weights || [])].sort((a, b) => (a.date < b.date ? -1 : 1));
  const weekAgo = addDays(today, -7);
  const before = [...weights].reverse().find((w) => w.date <= weekAgo) || weights[0];
  const now = weights[weights.length - 1];
  let change = '—';
  if (before && now && before !== now) {
    const d = now.kg - before.kg;
    const v = member.units === 'metric' ? d : d * LB_PER_KG;
    change = `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(1)} ${member.units === 'metric' ? 'kg' : 'lb'}`;
  }
  return { avg: logged ? kcal / logged : 0, logged, proteinDays, change, target: t ? t.kcal : 0 };
}

function trendText(member) {
  const w = [...(member.weights || [])].sort((a, b) => (a.date < b.date ? -1 : 1));
  if (w.length < 2) return 'No trend yet';
  const d = w[w.length - 1].kg - w[0].kg;
  const v = member.units === 'metric' ? d : d * LB_PER_KG;
  const weeks = Math.max(1, Math.round((parseDay(w[w.length - 1].date) - parseDay(w[0].date)) / 6048e5));
  return `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(1)} ${member.units === 'metric' ? 'kg' : 'lb'} in ${weeks} wk${weeks === 1 ? '' : 's'}`;
}

function memberCard(member, m) {
  const t = targets(member);
  const { eaten } = dayTotals(member.id, dayKey(), m);
  const weights = [...(member.weights || [])].sort((a, b) => (a.date < b.date ? -1 : 1)).map((w) => w.kg);
  const goalText = member.goal === 'maintain' ? 'Maintain' : `${member.goal === 'lose' ? 'Lose' : 'Gain'} ${member.units === 'metric' ? `${+(member.paceKg).toFixed(2)} kg` : `${+(member.paceKg * LB_PER_KG).toFixed(1)} lb`}/week`;
  return html`<article class="card">
<div class="row">${avatar(member, 40)}<div style="flex:1;min-width:0"><h2>${member.name}</h2><span class="small muted">${goalText}</span></div>
<a class="icon-btn bare" href="#/members/${member.id}" aria-label="Open ${member.name}’s profile and targets">${icon('chevron')}</a></div>
<div class="row" style="gap:16px">${ring(t ? eaten.kcal / t.kcal : 0, { label: `${fmtInt(eaten.kcal)} of ${t ? fmtInt(t.kcal) : '—'} calories eaten today`, big: fmtInt(eaten.kcal), small: `of ${t ? fmtInt(t.kcal) : '—'}` })}
<div class="stack" style="flex:1;min-width:0;gap:8px">${macroBars(eaten, t, true)}</div></div>
<div class="row" style="padding-top:12px;border-top:1px solid var(--line-soft)">
<div style="display:flex;flex-direction:column;min-width:92px"><span class="bold num">${weights.length ? fmtWeight(currentWeightKg(member), member.units) : '—'}</span><span class="tiny muted">${trendText(member)}</span></div>
${sparkline(weights, `${member.name} weight trend: ${trendText(member)}`)}
<button type="button" class="btn plain" data-action="log-weight" data-id="${member.id}">Log weight</button></div>
</article>`;
}

function render() {
  const d = getData();
  if (!d.members.length) return html`<main class="main" id="main">${welcome()}</main>`;
  const m = maps();
  const range = ui.progressRange || 'today';
  const today = parseDay(dayKey()).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return html`<main class="main" id="main">
<header class="page-head"><div><h1>Progress</h1><p class="sub">${today} · ${d.members.length} member${d.members.length === 1 ? '' : 's'}</p></div>
<div class="head-actions">${seg([['today', 'Today'], ['week', 'This week']], range, 'progress-range', ' aria-label="Time range" style="min-width:220px"')}
<a class="icon-btn" href="#/settings" aria-label="Settings">${icon('gear', 22, 1.9)}</a>
<a class="btn primary" href="#/members/new">${icon('plus', 18, 2.2)}Add member</a></div></header>
${range === 'today'
    ? html`<div class="cards four">${d.members.map((x) => memberCard(x, m))}</div>`
    : html`<section class="card"><div class="spread"><h2>Last 7 days</h2><span class="small muted">${parseDay(addDays(dayKey(), -6)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – today</span></div>
<div class="table-wrap"><table class="table"><thead><tr><th scope="col">Member</th><th scope="col">Avg calories / target</th><th scope="col">Hit protein</th><th scope="col">Days logged</th><th scope="col" style="text-align:right">Weight change</th></tr></thead>
<tbody>${d.members.map((x) => {
        const s = weekStats(x, m);
        return html`<tr><th scope="row">${x.name}</th><td>${s.logged ? fmtInt(s.avg) : '—'} / ${s.target ? fmtInt(s.target) : '—'}</td><td>${s.proteinDays} of 7 days</td><td>${s.logged} of 7</td><td style="text-align:right;font-weight:700">${s.change}</td></tr>`;
      })}</tbody></table></div></section>
<div class="cards four">${d.members.map((x) => memberCard(x, m))}</div>`}
</main>`;
}

function weightSheet(sheet) {
  const member = getData().members.find((x) => x.id === sheet.id);
  if (!member) return '';
  const unit = member.units === 'metric' ? 'kg' : 'lb';
  return html`<h2 id="sheet-title">Log ${member.name}’s weight</h2>
<label class="field">Weight today (${unit})<input class="input" type="text" inputmode="decimal" autocomplete="off" data-field="weight-value" data-key="weight-value" value="${sheet.value}" autofocus></label>
${sheet.error ? html`<p class="notice warn" role="alert">${sheet.error}</p>` : ''}
<div class="row"><button type="button" class="btn plain lg" data-action="close-sheet" style="flex:1">Cancel</button><button type="button" class="btn primary lg" data-action="save-weight" style="flex:1">Save</button></div>`;
}

export const progressView = {
  routes: { progress: render },
  actions: {
    'progress-range': ({ ds }) => { ui.progressRange = ds.value; refresh(); },
    'load-sample': () => { replaceData(sampleData()); ui.memberId = null; toast('Sample household loaded. Clear it any time in Settings.'); },
    'log-weight': ({ ds }) => {
      const member = getData().members.find((x) => x.id === ds.id);
      const kg = currentWeightKg(member);
      const v = kg ? (member.units === 'metric' ? kg : kg * LB_PER_KG) : '';
      openSheet({ type: 'weight', id: ds.id, value: v ? (Math.round(v * 10) / 10).toString() : '' });
    },
    'save-weight': () => {
      const s = ui.sheet;
      const v = parseFloat(s.value);
      const member = getData().members.find((x) => x.id === s.id);
      if (!(v > 0)) { s.error = 'Enter a weight above zero.'; refresh(); return; }
      const kg = member.units === 'metric' ? v : v / LB_PER_KG;
      const date = dayKey();
      update((data) => {
        const mm = data.members.find((x) => x.id === s.id);
        mm.weights = (mm.weights || []).filter((w) => w.date !== date).concat([{ date, kg: Math.round(kg * 100) / 100 }]);
      });
      closeSheet();
      toast(`Saved ${member.name}’s weight.`);
    },
  },
  fields: {
    'weight-value': (value) => { ui.sheet.value = value; ui.sheet.error = null; },
  },
  sheets: { weight: weightSheet },
};
