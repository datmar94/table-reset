import { getData, update, uid } from '../store.js';
import { ui, go, maps, openSheet, closeSheet, toast, refresh } from '../app.js';
import { addDays, dayKey, fmtAmount, fmtInt, fromBase, macroSplit, parseDay, recipeNutrition, scale, shortCount, stockNeeds, weekStart } from '../nutrition.js';
import { html, icon, pressed, splitBar, stepper, memberChips, seg, SLOTS, servingsText } from '../ui.js';

const FILTERS = [['all', 'All'], ['ready', 'Can make now'], ['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['dinner', 'Dinner'], ['snack', 'Snack']];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function recipeStatus(r, ingById) {
  const needs = stockNeeds(r, 1, ingById).filter((x) => x.short);
  if (!needs.length) return { ready: true, text: 'All on hand' };
  if (needs.length === 1) return { ready: false, text: `Missing: ${needs[0].ing ? needs[0].ing.name.toLowerCase() : 'an ingredient'}` };
  return { ready: false, text: `Missing ${needs.length} items` };
}

function listCard(r, m, selected) {
  const n = recipeNutrition(r, m.ingById).perServing;
  const st = recipeStatus(r, m.ingById);
  return html`<a href="#/recipes/${r.id}" class="card" style="text-decoration:none;color:inherit;${selected ? 'border:2px solid var(--accent);' : ''}"${selected ? html` aria-current="true"` : ''}>
<div class="spread" style="align-items:flex-start"><div style="min-width:0"><h2 style="font-size:16px">${r.name}</h2><span class="small muted">${servingsText(r.servings)} · ${r.minutes || '—'} min${r.meals.length ? ' · ' + r.meals.map(cap).join(', ') : ''}</span></div>
<div style="text-align:right;flex-shrink:0"><strong class="num" style="font-size:20px;display:block">${fmtInt(n.kcal)}</strong><span class="tiny muted">kcal</span></div></div>
${splitBar(n)}
<div class="spread wrap" style="flex-wrap:wrap"><span class="small num" style="font-weight:600">P ${fmtInt(n.p)} g · C ${fmtInt(n.c)} g · F ${fmtInt(n.f)} g</span><span class="badge ${st.ready ? 'ok' : 'warn'}">${st.text}</span></div></a>`;
}

function donut(n) {
  const s = macroSplit(n), C = 2 * Math.PI * 40;
  const pl = (s.p / 100) * C, cl = (s.c / 100) * C, fl = (s.f / 100) * C;
  return html`<div class="ring" style="width:112px;height:112px"><svg width="112" height="112" viewBox="0 0 100 100" role="img" aria-label="Calories from protein ${s.p}%, carbs ${s.c}%, fat ${s.f}%">
<circle cx="50" cy="50" r="40" fill="none" stroke-width="13" style="stroke:var(--track)"></circle>
<circle cx="50" cy="50" r="40" fill="none" stroke-width="13" style="stroke:var(--protein)" stroke-dasharray="${pl.toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 50 50)"></circle>
<circle cx="50" cy="50" r="40" fill="none" stroke-width="13" style="stroke:var(--carbs)" stroke-dasharray="${cl.toFixed(1)} ${C.toFixed(1)}" stroke-dashoffset="${(-pl).toFixed(1)}" transform="rotate(-90 50 50)"></circle>
<circle cx="50" cy="50" r="40" fill="none" stroke-width="13" style="stroke:var(--fat)" stroke-dasharray="${fl.toFixed(1)} ${C.toFixed(1)}" stroke-dashoffset="${(-(pl + cl)).toFixed(1)}" transform="rotate(-90 50 50)"></circle></svg>
<div class="center" aria-hidden="true"><strong class="num" style="font-size:22px">${fmtInt(n.kcal)}</strong><span>kcal / serving</span></div></div>`;
}

function detail(r, m) {
  const { perServing, missing } = recipeNutrition(r, m.ingById);
  const cook = (ui.cookServings || {})[r.id] || r.servings;
  const needs = stockNeeds(r, cook, m.ingById);
  const shorts = needs.filter((x) => x.short).length;
  const split = macroSplit(perServing);
  return html`<article class="stack">
<div class="spread" style="align-items:flex-start"><div><h2 style="font-size:24px;font-weight:800;letter-spacing:-0.02em">${r.name}</h2>
<p class="small muted">${r.minutes || '—'} min${r.meals.length ? ' · ' + r.meals.map(cap).join(', ') : ''} · recipe makes ${servingsText(r.servings)}</p></div>
<a class="icon-btn" href="#/recipes/${r.id}/edit" aria-label="Edit ${r.name}">${icon('edit', 20)}</a></div>
${missing.length ? html`<p class="notice warn">${missing.length} ingredient${missing.length === 1 ? ' is' : 's are'} missing from your list, so the numbers leave ${missing.length === 1 ? 'it' : 'them'} out. Edit the recipe to fix this.</p>` : ''}
<div class="cols" style="gap:16px">
<section class="card col-main" style="flex-direction:row;align-items:center;gap:18px" aria-label="Nutrition per serving">${donut(perServing)}
<div class="stack" style="flex:1;gap:8px;font-size:14px">
<div class="spread"><span class="row" style="gap:8px"><span class="dot fill-protein"></span>Protein</span><span><strong class="num">${fmtInt(perServing.p)} g</strong> <span class="muted small">${split.p}%</span></span></div>
<div class="spread"><span class="row" style="gap:8px"><span class="dot fill-carbs"></span>Carbs</span><span><strong class="num">${fmtInt(perServing.c)} g</strong> <span class="muted small">${split.c}%</span></span></div>
<div class="spread"><span class="row" style="gap:8px"><span class="dot fill-fat"></span>Fat</span><span><strong class="num">${fmtInt(perServing.f)} g</strong> <span class="muted small">${split.f}%</span></span></div></div></section>
<section class="card col-side tight"><span class="bold">Cook</span>${stepper(servingsText(cook), 'cook-less', 'cook-more', ` data-id="${r.id}"`, ['Fewer servings', 'More servings'])}
<span class="tiny muted">${shorts ? `${shorts} item${shorts === 1 ? ' is' : 's are'} short for this many servings.` : 'You have everything for this many servings.'}</span></section></div>
<section class="card"><div class="spread"><h2>Ingredients for ${servingsText(cook)}</h2><span class="small muted">Cooking takes these out of stock</span></div>
<div class="table-wrap"><table class="table"><thead><tr><th scope="col">Ingredient</th><th scope="col">Uses</th><th scope="col">kcal</th><th scope="col" style="text-align:right">In stock → after</th></tr></thead><tbody>
${needs.map((x) => {
    const unit = x.ing ? x.ing.stockUnit : x.item.unit;
    const k = cook / r.servings;
    const kcal = x.ing ? recipeNutrition({ servings: 1, items: [x.item] }, m.ingById).total.kcal * k : 0;
    return html`<tr><th scope="row" style="font-weight:600">${x.ing ? x.ing.name : 'Deleted ingredient'}</th><td>${fmtAmount(x.item.qty * k, x.item.unit)}</td><td class="num">${fmtInt(kcal)}</td>
<td style="text-align:right">${!x.ing ? html`<span class="badge warn">Not in your list</span>` : x.short ? html`<span class="badge warn">${x.have > 0 ? `Short by ${fmtAmount(fromBase(x.need - x.have, unit), unit)}` : 'Out of stock'}</span>` : html`<span class="num">${fmtAmount(fromBase(x.have, unit), unit)} → <strong>${fmtAmount(fromBase(x.after, unit), unit)}</strong></span>`}</td></tr>`;
  })}</tbody></table></div></section>
${r.steps && r.steps.length ? html`<section class="card"><h2>Steps</h2><ol style="margin:0;padding-left:20px;display:flex;flex-direction:column;gap:8px;line-height:1.5">${r.steps.map((s) => html`<li>${s}</li>`)}</ol></section>` : ''}
<div class="row wrap"><button type="button" class="btn primary lg" style="flex:1" data-action="cook" data-id="${r.id}">Cook ${servingsText(cook)} & update stock</button>
<button type="button" class="btn outline lg" style="flex:1" data-action="log-recipe" data-id="${r.id}">Log a serving for…</button>
<button type="button" class="btn plain lg" style="flex:1" data-action="plan-recipe" data-id="${r.id}">Add to meal plan</button></div>
<button type="button" class="btn danger" data-action="recipe-delete" data-id="${r.id}" style="align-self:flex-start">${icon('trash', 18)}Delete recipe</button>
</article>`;
}

function render(params) {
  const d = getData();
  const m = maps();
  const id = params.id || null;
  const r = id ? m.recipeById[id] : null;
  const q = (ui.recipeQuery || '').trim().toLowerCase();
  const filter = ui.recipeFilter || 'all';
  const shown = d.recipes
    .filter((x) => filter === 'all' || (filter === 'ready' ? shortCount(x, 1, m.ingById) === 0 : x.meals.includes(filter)))
    .filter((x) => !q || x.name.toLowerCase().includes(q) || x.items.some((it) => (m.ingById[it.ingredientId] || { name: '' }).name.toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name));
  const list = html`<div class="split-list stack">
<header class="page-head"><div><h1>Recipes</h1><p class="sub">Macros shown per serving</p></div>
<button type="button" class="btn primary" data-action="add-recipe" aria-haspopup="dialog">${icon('plus', 18, 2.2)}Add recipe</button></header>
<label class="search">${icon('search')}<span class="sr-only">Search recipes</span><input type="search" placeholder="Search recipes or ingredients" data-field="recipe-query" data-key="recipe-query" value="${ui.recipeQuery || ''}"></label>
<div class="chips" role="group" aria-label="Filter recipes">${FILTERS.map(([fid, label]) => html`<button type="button" class="chip" data-action="recipe-filter" data-value="${fid}"${pressed(filter === fid)}>${label}</button>`)}</div>
${!d.recipes.length ? html`<p class="empty">No recipes yet. Tap “Add recipe” to type one in or paste one from a website.</p>` : !shown.length ? html`<p class="empty">No saved recipes match.</p>` : shown.map((x) => listCard(x, m, x.id === id))}
</div>`;
  return html`<main class="main" id="main"><div class="split${r ? ' has-detail' : ''}">${list}
<div class="split-detail">${r ? html`<a class="btn ghost only-narrow" href="#/recipes" style="align-self:flex-start;margin:-8px 0 4px -10px">${icon('back', 20)}All recipes</a>${detail(r, m)}`
    : id ? html`<p class="empty">That recipe was deleted.</p>` : html`<p class="empty only-wide">Pick a recipe to see its nutrition and what cooking it uses.</p>`}</div></div></main>`;
}

function addSheet() {
  return html`<h2 id="sheet-title">Add a recipe</h2>
<a class="choice" href="#/recipes/import" data-action="close-sheet-nav"><span class="ic">${icon('link', 22)}</span><span class="tx"><strong>Import from a website</strong><span>Paste a recipe’s ingredient list and the app matches it to your food</span></span></a>
<a class="choice" href="#/recipes/new" data-action="close-sheet-nav"><span class="ic">${icon('edit', 22)}</span><span class="tx"><strong>Type it in yourself</strong><span>Pick ingredients from your list. Macros add up as you go</span></span></a>
<button type="button" class="btn ghost lg" data-action="close-sheet">Cancel</button>`;
}

function weekDays() {
  const start = weekStart(dayKey());
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

function logSheet(sheet) {
  const d = getData();
  const r = d.recipes.find((x) => x.id === sheet.recipeId);
  if (!r) return '';
  const plan = sheet.type === 'plan-recipe';
  const n = recipeNutrition(r, maps().ingById).perServing;
  return html`<h2 id="sheet-title">${plan ? 'Add to meal plan' : 'Log as eaten'}: ${r.name}</h2>
${d.members.length ? memberChips(d.members, sheet.memberId, 'sheet-member') : html`<p class="notice warn">Add a member first.</p>`}
${plan ? html`<div class="field"><span>Day</span><div class="chips">${weekDays().map((day) => html`<button type="button" class="chip" data-action="sheet-day" data-value="${day}"${pressed(day === sheet.date)}>${parseDay(day).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}</button>`)}</div></div>` : ''}
<div class="field"><span>Meal</span>${seg(SLOTS, sheet.slot, 'sheet-slot')}</div>
<div class="spread"><span class="bold">Servings</span>${stepper(servingsText(sheet.servings), 'sheet-less', 'sheet-more', '', ['Fewer servings', 'More servings'])}</div>
<p class="small muted num">${fmtInt(n.kcal * sheet.servings)} kcal · P ${fmtInt(n.p * sheet.servings)} · C ${fmtInt(n.c * sheet.servings)} · F ${fmtInt(n.f * sheet.servings)}</p>
<div class="row"><button type="button" class="btn plain lg" data-action="close-sheet" style="flex:1">Cancel</button><button type="button" class="btn primary lg" data-action="sheet-save-entry" style="flex:1"${sheet.memberId ? '' : html` disabled`}>${plan ? 'Add to plan' : 'Log it'}</button></div>`;
}

function deleteSheet(sheet) {
  const r = getData().recipes.find((x) => x.id === sheet.id);
  if (!r) return '';
  return html`<h2 id="sheet-title">Delete ${r.name}?</h2><p>Meals already logged keep their numbers. Planned meals with this recipe are removed.</p>
<div class="row"><button type="button" class="btn plain lg" data-action="close-sheet" style="flex:1">Keep</button><button type="button" class="btn primary lg" data-action="recipe-delete-confirm" data-id="${r.id}" style="flex:1">Delete</button></div>`;
}

function guessSlot(r) {
  const h = new Date().getHours();
  const byTime = h < 11 ? 'breakfast' : h < 15 ? 'lunch' : h < 21 ? 'dinner' : 'snack';
  return r.meals.includes(byTime) || !r.meals.length ? byTime : r.meals[0];
}

export const recipesView = {
  routes: { recipes: render },
  actions: {
    'recipe-filter': ({ ds }) => { ui.recipeFilter = ds.value; refresh(); },
    'add-recipe': () => openSheet({ type: 'add-recipe' }),
    'close-sheet-nav': () => { ui.sheet = null; },
    'cook-less': ({ ds }) => { const r = maps().recipeById[ds.id]; ui.cookServings = { ...(ui.cookServings || {}), [ds.id]: Math.max(1, ((ui.cookServings || {})[ds.id] || r.servings) - 1) }; refresh(); },
    'cook-more': ({ ds }) => { const r = maps().recipeById[ds.id]; ui.cookServings = { ...(ui.cookServings || {}), [ds.id]: ((ui.cookServings || {})[ds.id] || r.servings) + 1 }; refresh(); },
    cook: ({ ds }) => {
      const m = maps();
      const r = m.recipeById[ds.id];
      const servings = (ui.cookServings || {})[r.id] || r.servings;
      const before = {};
      update((d) => {
        for (const x of stockNeeds(r, servings, m.ingById)) {
          if (!x.ing) continue;
          const ing = d.ingredients.find((i) => i.id === x.ing.id);
          if (!(ing.id in before)) before[ing.id] = ing.stock;
          ing.stock = Math.max(0, ing.stock - x.need);
        }
      });
      toast(`Cooked ${servingsText(servings)} of ${r.name}. Stock updated.`, () => update((d) => {
        for (const [iid, stock] of Object.entries(before)) { const ing = d.ingredients.find((i) => i.id === iid); if (ing) ing.stock = stock; }
      }));
    },
    'log-recipe': ({ ds }) => {
      const r = maps().recipeById[ds.id];
      openSheet({ type: 'log-recipe', recipeId: ds.id, memberId: ui.memberId || (getData().members[0] || {}).id, slot: guessSlot(r), servings: 1, date: dayKey() });
    },
    'plan-recipe': ({ ds }) => {
      const r = maps().recipeById[ds.id];
      openSheet({ type: 'plan-recipe', recipeId: ds.id, memberId: ui.memberId || (getData().members[0] || {}).id, slot: r.meals[0] || 'dinner', servings: 1, date: ui.planDay || dayKey() });
    },
    'sheet-member': ({ ds }) => { ui.sheet.memberId = ds.id; refresh(); },
    'sheet-day': ({ ds }) => { ui.sheet.date = ds.value; refresh(); },
    'sheet-slot': ({ ds }) => { ui.sheet.slot = ds.value; refresh(); },
    'sheet-less': () => { ui.sheet.servings = Math.max(0.5, ui.sheet.servings - 0.5); refresh(); },
    'sheet-more': () => { ui.sheet.servings += 0.5; refresh(); },
    'sheet-save-entry': () => {
      const s = ui.sheet;
      const m = maps();
      const r = m.recipeById[s.recipeId];
      const eaten = s.type === 'log-recipe';
      const entry = { id: uid(), date: s.date, memberId: s.memberId, slot: s.slot, kind: 'recipe', recipeId: r.id, servings: s.servings, eaten };
      if (eaten) entry.snap = scale(recipeNutrition(r, m.ingById).perServing, s.servings);
      update((d) => d.entries.push(entry));
      ui.memberId = s.memberId;
      closeSheet();
      const who = m.memberById[s.memberId].name;
      toast(eaten ? `Logged ${servingsText(s.servings)} for ${who}.` : `Added to ${who}’s plan.`, () => update((d) => { d.entries = d.entries.filter((e) => e.id !== entry.id); }));
    },
    'recipe-delete': ({ ds }) => openSheet({ type: 'recipe-delete', id: ds.id }),
    'recipe-delete-confirm': ({ ds }) => {
      const m = maps();
      const r = m.recipeById[ds.id];
      update((d) => {
        // Logged meals keep their numbers; plans that never happened are dropped.
        d.entries = d.entries
          .filter((e) => !(e.recipeId === r.id && !e.eaten))
          .map((e) => (e.recipeId === r.id && !e.snap ? { ...e, snap: scale(recipeNutrition(r, m.ingById).perServing, e.servings), label: r.name } : e));
        d.recipes = d.recipes.filter((x) => x.id !== r.id);
      });
      closeSheet();
      toast(`Deleted ${r.name}.`);
      go('#/recipes');
    },
  },
  fields: {
    'recipe-query': (v) => { ui.recipeQuery = v; return true; },
  },
  sheets: { 'add-recipe': addSheet, 'log-recipe': logSheet, 'plan-recipe': logSheet, 'recipe-delete': deleteSheet },
};
