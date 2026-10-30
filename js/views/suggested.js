import { getData, update, uid } from '../store.js';
import { ui, maps, currentMember, remaining, toast, refresh } from '../app.js';
import { dayKey, fmtInt, proteinShare, recipeNutrition, stockNeeds } from '../nutrition.js';
import { html, icon, pressed, memberChips } from '../ui.js';
import { welcome } from './progress.js';

const FILTERS = [['fits', 'Fits what’s left'], ['protein', 'High protein'], ['quick', 'Under 20 min'], ['dinner', 'Dinner']];

function slotForNow(r) {
  const h = new Date().getHours();
  const byTime = h < 11 ? 'breakfast' : h < 15 ? 'lunch' : h < 21 ? 'dinner' : 'snack';
  return r.meals.includes(byTime) || !r.meals.length ? byTime : r.meals[0];
}

function card(s, left, member) {
  const fits = !left || s.n.kcal <= left.kcal;
  return html`<article class="card tight">
<div class="spread" style="align-items:flex-start"><div style="min-width:0"><h3 style="font-size:15.5px;font-weight:700">${s.r.name}</h3>
<span class="small muted num">${fmtInt(s.n.kcal)} kcal · P ${fmtInt(s.n.p)} · C ${fmtInt(s.n.c)} · F ${fmtInt(s.n.f)} · ${s.r.minutes || '—'} min</span></div>
${fits ? html`<span class="badge ok">Fits</span>` : html`<span class="badge warn">Over by ${fmtInt(s.n.kcal - left.kcal)} kcal</span>`}</div>
${s.missing ? html`<div class="notice warn row" style="gap:8px">${icon('swap', 16, 2.2)}<span>Out of ${s.missing.toLowerCase()}. Leave it out or swap in something you have.</span></div>` : ''}
<span class="small muted">Uses: ${s.uses}</span>
<div class="row"><a class="btn plain" href="#/recipes/${s.r.id}">View</a>
<button type="button" class="btn primary" style="flex:1" data-action="suggest-add" data-id="${s.r.id}">Add to ${member.name}’s day</button></div>
</article>`;
}

function render() {
  const d = getData();
  if (!d.members.length) return html`<main class="main" id="main">${welcome()}</main>`;
  const m = maps();
  const member = currentMember();
  const left = remaining(member, dayKey());
  const on = ui.suggestFilters || (ui.suggestFilters = { fits: true });
  const all = d.recipes.map((r) => {
    const needs = stockNeeds(r, 1, m.ingById);
    const short = needs.filter((x) => x.short);
    return {
      r, n: recipeNutrition(r, m.ingById).perServing, shortCount: short.length,
      missing: short.length === 1 ? (short[0].ing ? short[0].ing.name : 'an ingredient') : '',
      uses: needs.filter((x) => !x.short && x.ing).map((x) => x.ing.name.toLowerCase()).join(', ') || '—',
    };
  }).filter((s) => s.shortCount <= 1);
  const shown = all.filter((s) =>
    (!on.fits || !left || s.n.kcal <= left.kcal) &&
    (!on.protein || proteinShare(s.n) >= 0.3) &&
    (!on.quick || (s.r.minutes > 0 && s.r.minutes <= 20)) &&
    (!on.dinner || s.r.meals.includes('dinner')));
  const groups = [
    ['Make now', 'Everything is on hand', shown.filter((s) => s.shortCount === 0)],
    ['Almost there', 'Missing 1 ingredient', shown.filter((s) => s.shortCount === 1)],
  ];
  return html`<main class="main" id="main">
<header class="page-head"><div><h1>Suggested</h1><p class="sub">Your saved recipes, matched to what’s on hand</p></div>${memberChips(d.members, member.id, 'pick-member')}</header>
<div class="cols"><aside class="col-side stack">
<section class="hero" aria-label="Left today"><span class="label">Left for ${member.name} today</span>
<span class="big num">${left ? fmtInt(Math.max(0, left.kcal)) : '—'} kcal</span>
${left ? html`<div class="chips"><span>Protein ${fmtInt(Math.max(0, left.p))} g</span><span>Carbs ${fmtInt(Math.max(0, left.c))} g</span><span>Fat ${fmtInt(Math.max(0, left.f))} g</span></div>` : html`<span class="small">Finish ${member.name}’s profile to see targets.</span>`}</section>
<div class="field"><span>Filters (tap to combine)</span><div class="chips" role="group" aria-label="Filter suggestions">${FILTERS.map(([id, label]) => html`<button type="button" class="chip" data-action="suggest-filter" data-value="${id}"${pressed(!!on[id])}>${on[id] ? icon('check', 16, 2.6) : ''}${label}</button>`)}</div></div>
<p class="small muted">Showing ${shown.length} of ${d.recipes.length} saved recipes</p>
</aside>
<div class="col-main stack">${groups.map(([title, sub, list]) => html`<section class="stack" style="gap:8px">
<div class="row" style="align-items:baseline"><h2 style="font-size:18px;font-weight:700">${title}</h2><span class="small muted">${sub}</span></div>
${list.length ? html`<div class="cards two">${list.map((s) => card(s, left, member))}</div>` : html`<p class="empty">Nothing here matches these filters.</p>`}</section>`)}
</div></div></main>`;
}

export const suggestedView = {
  routes: { suggested: render },
  actions: {
    'suggest-filter': ({ ds }) => { ui.suggestFilters[ds.value] = !ui.suggestFilters[ds.value]; refresh(); },
    'suggest-add': ({ ds }) => {
      const member = currentMember();
      const r = maps().recipeById[ds.id];
      const entry = { id: uid(), date: dayKey(), memberId: member.id, slot: slotForNow(r), kind: 'recipe', recipeId: r.id, servings: 1, eaten: false };
      update((d) => d.entries.push(entry));
      toast(`Added ${r.name} to ${member.name}’s ${entry.slot} today.`, () => update((d) => { d.entries = d.entries.filter((e) => e.id !== entry.id); }));
    },
  },
  fields: {},
  sheets: {},
};
