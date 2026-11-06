import { getData, update, uid } from '../store.js';
import { ui, go, maps, openSheet, closeSheet, toast, refresh } from '../app.js';
import { addDays, dayKey, fmtAmount, fmtInt, fromBase, macroSplit, parseDay, recipeNutrition, scale, shortCount, startAmount, stockNeeds, unitsFor, weekStart, withSwaps } from '../nutrition.js';
import { html, icon, pressed, splitBar, stepper, memberChips, seg, SLOTS, servingsText } from '../ui.js';
import { foodPicker, unitOptions } from './ingredients.js';

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
<div class="center" aria-hidden="true"><strong class="num" style="font-size:22px">${fmtInt(n.kcal)}</strong><span>kcal</span></div></div>`;
}

/** Swaps picked for this time on a recipe: { ingredientId: item, or null when left out }. */
const swapsFor = (id) => (ui.swaps || {})[id] || {};
/** The recipe as it will be cooked, with this time's swaps. */
const asCooked = (r) => withSwaps(r, swapsFor(r.id));
const swapCopy = (id) => (Object.keys(swapsFor(id)).length ? { ...swapsFor(id) } : undefined);

function ingLine(x, k, m, note = '', action = '') {
  const unit = x.ing ? x.ing.stockUnit : x.item.unit;
  const kcal = x.ing ? recipeNutrition({ servings: 1, items: [x.item] }, m.ingById).total.kcal * k : 0;
  return html`<div class="spread" style="align-items:flex-start"><span class="bold">${x.ing ? x.ing.name : 'Deleted ingredient'}</span><span class="num bold nw">${fmtAmount(x.item.qty * k, x.item.unit)}</span></div>
${note}
<div class="spread small"><span class="row" style="gap:10px"><span class="muted num">${fmtInt(kcal)} kcal</span>${action}</span>${!x.ing ? html`<span class="badge warn">Not in your list</span>` : !Number.isFinite(x.need) ? html`<span class="badge warn">Unit doesn’t match</span>` : x.short ? html`<span class="badge warn">${x.have > 0 ? `Short by ${fmtAmount(fromBase(x.need - x.have, unit), unit)}` : 'Out of stock'}</span>` : html`<span class="muted num">In stock ${fmtAmount(fromBase(x.have, unit), unit)} → <strong style="color:var(--ink)">${fmtAmount(fromBase(x.after, unit), unit)}</strong></span>`}</div>`;
}

/** One ingredient on the recipe page: as written, swapped for this time, or left out. */
function cookLine(r, it, cook, m) {
  const swaps = swapsFor(r.id);
  const k = cook / r.servings;
  const orig = m.ingById[it.ingredientId];
  const origName = orig ? orig.name : 'Deleted ingredient';
  const undo = html`<button type="button" class="link-btn" data-action="swap-undo" data-id="${r.id}" data-from="${it.ingredientId}">Undo</button>`;
  if (it.ingredientId in swaps && !swaps[it.ingredientId]) {
    return html`<li class="swapped"><div class="spread"><span class="bold" style="text-decoration:line-through;color:var(--muted)">${origName}</span>${undo}</div><span class="small muted">Left out this time</span></li>`;
  }
  const item = it.ingredientId in swaps ? swaps[it.ingredientId] : it;
  const x = stockNeeds({ servings: r.servings, items: [item] }, cook, m.ingById)[0];
  if (item !== it) return html`<li class="swapped">${ingLine(x, k, m, html`<div class="spread small"><span class="muted">Instead of ${origName.toLowerCase()}</span>${undo}</div>`)}</li>`;
  const alts = (it.alts || []).filter((a) => m.ingById[a.ingredientId]);
  const open = orig ? html`<button type="button" class="link-btn sm" data-action="swap-open" data-id="${r.id}" data-from="${it.ingredientId}" aria-label="Swap or leave out ${origName}">${icon('swap', 14)}${alts.length ? 'More' : 'Swap'}</button>` : '';
  return html`<li>${ingLine(x, k, m, '', open)}
${alts.length ? html`<div class="chips swap-chips"><span class="tiny muted" style="align-self:center">Or use</span>${alts.map((a, j) => html`<button type="button" class="chip sm" data-action="swap-use" data-id="${r.id}" data-from="${it.ingredientId}" data-alt="${j}" aria-label="Use ${m.ingById[a.ingredientId].name} instead of ${origName}">${m.ingById[a.ingredientId].name}</button>`)}</div>` : ''}</li>`;
}

function detail(base, m) {
  const r = asCooked(base);
  const changed = Object.keys(swapsFor(base.id)).length;
  const { perServing, missing } = recipeNutrition(r, m.ingById);
  const cook = (ui.cookServings || {})[r.id] || r.servings;
  const needs = stockNeeds(r, cook, m.ingById);
  const shorts = needs.filter((x) => x.short).length;
  const split = macroSplit(perServing);
  return html`<article class="stack">
<div class="spread" style="align-items:flex-start"><div><h2 style="font-size:24px;font-weight:800;letter-spacing:-0.02em">${r.name}</h2>
<p class="small muted">${r.minutes || '—'} min${r.meals.length ? ' · ' + r.meals.map(cap).join(', ') : ''} · recipe makes ${servingsText(r.servings)}</p></div>
<a class="icon-btn" href="#/recipes/${r.id}/edit" aria-label="Edit ${r.name}">${icon('edit', 20)}</a></div>
${r.items.some((it) => (m.ingById[it.ingredientId] || {}).needsNutrition) ? html`<p class="notice warn">Some new foods from the import don’t have nutrition yet (${r.items.map((it) => m.ingById[it.ingredientId]).filter((i) => i && i.needsNutrition).map((i) => i.name).join(', ')}), so the numbers leave them out. Open each one in Ingredients and tap Look up nutrition.</p>` : ''}
${missing.length ? html`<p class="notice warn">${missing.length} ingredient${missing.length === 1 ? ' is' : 's are'} missing from your list, so the numbers leave ${missing.length === 1 ? 'it' : 'them'} out. Edit the recipe to fix this.</p>` : ''}
<div class="cols" style="gap:16px">
<section class="card col-main" style="flex-direction:row;align-items:center;gap:18px" aria-label="Nutrition per serving">${donut(perServing)}
<div class="stack" style="flex:1;gap:8px;font-size:14px">
<div class="spread"><span class="row" style="gap:8px"><span class="dot fill-protein"></span>Protein</span><span><strong class="num">${fmtInt(perServing.p)} g</strong> <span class="muted small">${split.p}%</span></span></div>
<div class="spread"><span class="row" style="gap:8px"><span class="dot fill-carbs"></span>Carbs</span><span><strong class="num">${fmtInt(perServing.c)} g</strong> <span class="muted small">${split.c}%</span></span></div>
<div class="spread"><span class="row" style="gap:8px"><span class="dot fill-fat"></span>Fat</span><span><strong class="num">${fmtInt(perServing.f)} g</strong> <span class="muted small">${split.f}%</span></span></div></div></section>
<section class="card col-side tight"><span class="bold">Cook</span>${stepper(servingsText(cook), 'cook-less', 'cook-more', ` data-id="${r.id}"`, ['Fewer servings', 'More servings'])}
<span class="tiny muted">${shorts ? `${shorts} item${shorts === 1 ? ' is' : 's are'} short for this many servings.` : 'You have everything for this many servings.'}</span>
${shorts ? html`<button type="button" class="btn outline" data-action="shop-add-missing" data-id="${r.id}">${icon('list', 18)}Add missing to shopping list</button>` : ''}</section></div>
<section class="card"><div><h2>Ingredients for ${servingsText(cook)}</h2><span class="small muted">Cooking takes these out of stock. Tap Swap to change an ingredient this time.</span></div>
${changed ? html`<div class="notice ok spread" role="status"><span>${changed} change${changed === 1 ? '' : 's'} for this time. The numbers, cooking, logging and planning use ${changed === 1 ? 'it' : 'them'}.</span><button type="button" class="link-btn" data-action="swap-reset" data-id="${r.id}">Undo all</button></div>` : ''}
<ul class="ing-lines">${base.items.map((it) => cookLine(base, it, cook, m))}</ul></section>
${r.steps && r.steps.length ? html`<section class="card"><h2>Steps</h2><ol style="margin:0;padding-left:20px;display:flex;flex-direction:column;gap:8px;line-height:1.5">${r.steps.map((s) => html`<li>${s}</li>`)}</ol></section>` : ''}
<div class="action-bar"><button type="button" class="btn plain lg" data-action="plan-recipe" data-id="${r.id}">Add to plan</button>
<button type="button" class="btn outline lg" data-action="log-recipe" data-id="${r.id}">Log a serving</button>
<button type="button" class="btn primary lg" data-action="cook" data-id="${r.id}" aria-label="Cook ${servingsText(cook)} and take the ingredients out of stock">Cook ${cook}</button></div>
<button type="button" class="btn danger" data-action="recipe-delete" data-id="${r.id}" style="align-self:flex-start">${icon('trash', 18)}Delete recipe</button>
</article>`;
}

function render(params) {
  const d = getData();
  const m = maps();
  const id = params.id || null;
  const q = (ui.recipeQuery || '').trim().toLowerCase();
  const filter = ui.recipeFilter || 'all';
  const shown = d.recipes
    .filter((x) => filter === 'all' || (filter === 'ready' ? shortCount(x, 1, m.ingById) === 0 : x.meals.includes(filter)))
    .filter((x) => !q || x.name.toLowerCase().includes(q) || x.items.some((it) => (m.ingById[it.ingredientId] || { name: '' }).name.toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name));
  // On a tablet the first recipe opens beside the list instead of an empty panel.
  const wide = window.matchMedia('(min-width: 1000px)').matches;
  const r = id ? m.recipeById[id] : wide ? shown[0] || null : null;
  const list = html`<div class="split-list stack">
<header class="page-head"><div><h1>Recipes</h1><p class="sub">Macros shown per serving</p></div>
<button type="button" class="btn primary" data-action="add-recipe" aria-haspopup="dialog">${icon('plus', 18, 2.2)}Add recipe</button></header>
<label class="search">${icon('search')}<span class="sr-only">Search recipes</span><input type="search" placeholder="Search recipes or ingredients" data-field="recipe-query" data-key="recipe-query" value="${ui.recipeQuery || ''}"></label>
<div class="chips scroll" role="group" aria-label="Filter recipes">${FILTERS.map(([fid, label]) => html`<button type="button" class="chip" data-action="recipe-filter" data-value="${fid}"${pressed(filter === fid)}>${label}</button>`)}</div>
${!d.recipes.length ? html`<p class="empty">No recipes yet. Tap “Add recipe” to type one in or paste one from a website.</p>` : !shown.length ? html`<p class="empty">No saved recipes match.</p>` : shown.map((x) => listCard(x, m, !!r && x.id === r.id))}
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

function swapSheet(s) {
  const m = maps();
  const r = m.recipeById[s.recipeId];
  const it = r && r.items.find((x) => x.ingredientId === s.from);
  if (!it) return '';
  const name = (m.ingById[it.ingredientId] || { name: 'this ingredient' }).name;
  const alts = (it.alts || []).filter((a) => m.ingById[a.ingredientId]);
  if (s.pick) {
    const ing = m.ingById[s.pick.ingredientId];
    return html`<h2 id="sheet-title">Use ${ing.name} instead of ${name.toLowerCase()}</h2>
<p class="small muted">How much for the whole recipe (${servingsText(r.servings)})? The recipe uses ${fmtAmount(it.qty, it.unit)}${it.unit === 'each' ? '' : ' of'} ${name.toLowerCase()}.</p>
<div class="row"><label class="field" style="flex:1">Amount<input class="input" type="text" inputmode="decimal" autocomplete="off" data-field="swap-qty" data-key="swap-qty" value="${s.pick.qty}"></label>
<label class="field" style="width:150px">Unit<select class="select" data-field="swap-unit" data-key="swap-unit">${unitOptions(s.pick.unit, ing.sizes || [], unitsFor(ing))}</select></label></div>
<div class="spread"><span id="swap-save-l" style="font-weight:600">Save as a swap option in the recipe</span><button type="button" class="switch" role="switch" aria-labelledby="swap-save-l" aria-checked="${s.save ? 'true' : 'false'}" data-action="swap-save-toggle"></button></div>
<div class="row"><button type="button" class="btn plain lg" data-action="swap-back" style="flex:1">Back</button><button type="button" class="btn primary lg" data-action="swap-confirm" style="flex:1"${parseFloat(s.pick.qty) > 0 ? '' : html` disabled`}>Swap</button></div>`;
  }
  const used = new Set([it.ingredientId, ...alts.map((a) => a.ingredientId)]);
  const foods = getData().ingredients.filter((i) => !used.has(i.id));
  const list = foodPicker(foods, { query: s.query, action: 'swap-pick', prefix: 'swap' });
  return html`<h2 id="sheet-title">Swap ${name.toLowerCase()}</h2>
<p class="small muted">Just for this time. Cooking, logging and planning use the swap; the recipe stays as it is.</p>
${alts.length ? html`<div class="stack" style="gap:6px"><span class="small bold">Swap options in this recipe</span>${alts.map((a, j) => html`<button type="button" class="choice" data-action="swap-use" data-id="${r.id}" data-from="${it.ingredientId}" data-alt="${j}"><span class="tx" style="flex:1"><strong>${m.ingById[a.ingredientId].name}</strong><span>${fmtAmount(a.qty, a.unit)} for the whole recipe</span></span></button>`)}</div>` : ''}
<button type="button" class="choice" data-action="swap-skip"><span class="tx"><strong>Leave it out this time</strong><span>Cook without ${name.toLowerCase()}</span></span></button>
<span class="small bold">Or use something else</span>
<label class="search">${icon('search')}<span class="sr-only">Search your ingredients</span><input type="search" placeholder="Search your ingredients" data-field="swap-query" data-key="swap-query" value="${s.query}"></label>
<div class="sheet-scroll">${list || html`<p class="small muted">Nothing matches “${s.query}”.</p>`}</div>
<button type="button" class="btn ghost lg" data-action="close-sheet">Cancel</button>`;
}

function setSwap(recipeId, from, item) {
  ui.swaps = { ...(ui.swaps || {}), [recipeId]: { ...swapsFor(recipeId), [from]: item } };
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
  const n = recipeNutrition(asCooked(r), maps().ingById).perServing;
  const changed = Object.keys(swapsFor(r.id)).length;
  return html`<h2 id="sheet-title">${plan ? 'Add to meal plan' : 'Log as eaten'}: ${r.name}</h2>
${d.members.length ? memberChips(d.members, sheet.memberId, 'sheet-member') : html`<p class="notice warn">Add a member first.</p>`}
${plan ? html`<div class="field"><span>Day</span><div class="chips">${weekDays().map((day) => html`<button type="button" class="chip" data-action="sheet-day" data-value="${day}"${pressed(day === sheet.date)}>${parseDay(day).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}</button>`)}</div></div>` : ''}
<div class="field"><span>Meal</span>${seg(SLOTS, sheet.slot, 'sheet-slot')}</div>
<div class="spread"><span class="bold">Servings</span>${stepper(servingsText(sheet.servings), 'sheet-less', 'sheet-more', '', ['Fewer servings', 'More servings'])}</div>
<p class="small muted num">${fmtInt(n.kcal * sheet.servings)} kcal · P ${fmtInt(n.p * sheet.servings)} · C ${fmtInt(n.c * sheet.servings)} · F ${fmtInt(n.f * sheet.servings)}${changed ? ` · with your ${changed === 1 ? 'swap' : 'swaps'}` : ''}</p>
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
      const r = asCooked(m.recipeById[ds.id]);
      const servings = (ui.cookServings || {})[r.id] || r.servings;
      const before = {};
      update((d) => {
        for (const x of stockNeeds(r, servings, m.ingById)) {
          if (!x.ing || !Number.isFinite(x.need)) continue;
          const ing = d.ingredients.find((i) => i.id === x.ing.id);
          if (!(ing.id in before)) before[ing.id] = ing.stock;
          ing.stock = Math.max(0, ing.stock - x.need);
        }
      });
      toast(`Cooked ${servingsText(servings)} of ${r.name}. Stock updated.`, () => update((d) => {
        for (const [iid, stock] of Object.entries(before)) { const ing = d.ingredients.find((i) => i.id === iid); if (ing) ing.stock = stock; }
      }));
    },
    'shop-add-missing': ({ ds }) => {
      const m = maps();
      const r = asCooked(m.recipeById[ds.id]);
      const servings = (ui.cookServings || {})[r.id] || r.servings;
      const adds = stockNeeds(r, servings, m.ingById)
        .filter((x) => x.short && x.ing && Number.isFinite(x.need))
        .map((x) => ({ id: uid(), ingredientId: x.ing.id, base: x.need - Math.max(0, x.have), recipeId: r.id }));
      update((d) => {
        d.shopping = d.shopping.filter((s) => !(s.recipeId === r.id && adds.some((a) => a.ingredientId === s.ingredientId)));
        d.shopping.push(...adds);
      });
      toast(`Added ${adds.length} item${adds.length === 1 ? '' : 's'} to the shopping list.`);
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
      const swaps = swapCopy(r.id);
      if (swaps) entry.swaps = swaps;
      if (eaten) entry.snap = scale(recipeNutrition(withSwaps(r, swaps), m.ingById).perServing, s.servings);
      update((d) => d.entries.push(entry));
      ui.memberId = s.memberId;
      closeSheet();
      const who = m.memberById[s.memberId].name;
      toast(eaten ? `Logged ${servingsText(s.servings)} for ${who}.` : `Added to ${who}’s plan.`, () => update((d) => { d.entries = d.entries.filter((e) => e.id !== entry.id); }));
    },
    'recipe-delete': ({ ds }) => openSheet({ type: 'recipe-delete', id: ds.id }),
    'swap-open': ({ ds }) => openSheet({ type: 'swap', recipeId: ds.id, from: ds.from, query: '', pick: null, save: false }),
    'swap-use': ({ ds }) => {
      const r = maps().recipeById[ds.id];
      const a = r.items.find((x) => x.ingredientId === ds.from).alts[+ds.alt];
      setSwap(r.id, ds.from, { ingredientId: a.ingredientId, qty: a.qty, unit: a.unit });
      if (ui.sheet) closeSheet(); else refresh();
    },
    'swap-skip': () => { setSwap(ui.sheet.recipeId, ui.sheet.from, null); closeSheet(); },
    'swap-pick': ({ ds }) => {
      const s = ui.sheet;
      const m = maps();
      const it = m.recipeById[s.recipeId].items.find((x) => x.ingredientId === s.from);
      const a = startAmount(m.ingById[ds.id], it);
      s.pick = { ingredientId: ds.id, qty: String(+a.qty.toFixed(3)), unit: a.unit };
      refresh();
    },
    'swap-back': () => { ui.sheet.pick = null; refresh(); },
    'swap-save-toggle': () => { ui.sheet.save = !ui.sheet.save; refresh(); },
    'swap-confirm': () => {
      const s = ui.sheet;
      const item = { ingredientId: s.pick.ingredientId, qty: parseFloat(s.pick.qty), unit: s.pick.unit };
      if (!(item.qty > 0)) return;
      setSwap(s.recipeId, s.from, item);
      if (s.save) {
        update((d) => {
          const it = d.recipes.find((x) => x.id === s.recipeId).items.find((x) => x.ingredientId === s.from);
          it.alts = [...(it.alts || []).filter((a) => a.ingredientId !== item.ingredientId), { ...item }];
        });
      }
      closeSheet();
      if (s.save) toast('Swap saved in the recipe for next time.');
    },
    'swap-undo': ({ ds }) => {
      const next = { ...swapsFor(ds.id) };
      delete next[ds.from];
      ui.swaps = { ...(ui.swaps || {}), [ds.id]: next };
      refresh();
    },
    'swap-reset': ({ ds }) => { ui.swaps = { ...(ui.swaps || {}), [ds.id]: {} }; refresh(); },
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
    'swap-query': (v) => { ui.sheet.query = v; return true; },
    'swap-qty': (v) => { ui.sheet.pick.qty = v; return true; },
    'swap-unit': (v) => { ui.sheet.pick.unit = v; return true; },
  },
  sheets: { swap: swapSheet, 'add-recipe': addSheet, 'log-recipe': logSheet, 'plan-recipe': logSheet, 'recipe-delete': deleteSheet },
};
