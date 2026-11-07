import { getData, update, uid } from '../store.js';
import { ui, go, maps, openSheet, closeSheet, toast, refresh } from '../app.js';
import { baseAmount, fmtAmount, fmtInt, fmtNum, kindOf, measureAsk, nutrientsFor, recipeNutrition, startAmount, unitsFor, usualSize, withMeasures } from '../nutrition.js';
import { bestHit, buildFood, FILLER, foodPortions, searchFoods, words } from '../foods.js';
import { guessCategory } from '../kitchen.js';
import { foodKey, foodPicker, lookupError, unitOptions } from './ingredients.js';
import { html, icon, pressed, seg, stepper, heroTotals, SLOTS, servingsText } from '../ui.js';

// ---------- Ingredient-list parsing (used by Import) ----------
const FRACTIONS = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };
const UNIT_WORDS = {
  cup: 'cup', cups: 'cup', c: 'cup', tablespoon: 'tbsp', tablespoons: 'tbsp', tbsp: 'tbsp', tbs: 'tbsp', tbl: 'tbsp',
  teaspoon: 'tsp', teaspoons: 'tsp', tsp: 'tsp', ounce: 'oz', ounces: 'oz', oz: 'oz', pound: 'lb', pounds: 'lb', lb: 'lb', lbs: 'lb',
  gram: 'g', grams: 'g', g: 'g', kilogram: 'kg', kilograms: 'kg', kg: 'kg', ml: 'ml', milliliter: 'ml', milliliters: 'ml',
  liter: 'l', liters: 'l', l: 'l', clove: 'each', cloves: 'each', can: 'each', cans: 'each', piece: 'each', pieces: 'each',
};

export function parseLine(line) {
  let s = line.trim().replace(/^[-•*\d.)\s]*?(?=[\d½¼¾⅓⅔⅛])/, '').replace(/\(.*?\)/g, ' ');
  for (const [ch, v] of Object.entries(FRACTIONS)) s = s.replace(new RegExp('(\\d)?\\s*' + ch), (_m, d) => ` ${(d ? +d : 0) + v} `);
  const m = s.match(/^\s*(\d+(?:\.\d+)?)(?:\s+(\d+)\/(\d+)|\/(\d+))?(?:\s*(?:-|to)\s*\d+(?:\.\d+)?)?\s*/);
  let qty = null;
  if (m) {
    qty = +m[1];
    if (m[2]) qty += +m[2] / +m[3];
    if (m[4]) qty = +m[1] / +m[4];
    s = s.slice(m[0].length);
  }
  let unit = null;
  const fl = s.match(/^fl\.?\s*oz\.?\s+/i);
  if (fl) { unit = 'fl oz'; s = s.slice(fl[0].length); }
  else {
    const w = s.match(/^([a-zA-Z]+)\.?\s+/);
    if (w && UNIT_WORDS[w[1].toLowerCase()]) { unit = UNIT_WORDS[w[1].toLowerCase()]; s = s.slice(w[0].length); }
  }
  return { raw: line.trim(), qty, unit, name: s.replace(/,.*$/, '').trim() };
}

export { bestHit };

export function matchIngredient(name, ingredients) {
  const want = new Set(words(name).filter((w) => !FILLER.has(w)));
  let best = null, bestScore = 0;
  for (const ing of ingredients) {
    const have = words(ing.name).filter((w) => !FILLER.has(w));
    if (!have.length) continue;
    const hits = have.filter((w) => want.has(w)).length;
    const score = hits / have.length;
    if (score > bestScore) { best = ing; bestScore = score; }
  }
  return bestScore >= 0.5 ? best : null;
}


/** A food the import creates for a line that isn't in Ingredients yet. */
export function newFood(line, found) {
  const unit = line.unit || 'each';
  const kind = kindOf(unit);
  const food = found || { basis: kind === 'mass' ? { qty: 100, unit: 'g' } : kind === 'volume' ? { qty: 1, unit: 'cup' } : { qty: 1, unit: 'each' }, per: { kcal: 0, p: 0, c: 0, f: 0 }, convert: [] };
  const sameKind = Number.isFinite(baseAmount(food, 1, unit));
  return {
    name: line.name, category: guessCategory(line.name) || 'Other', basis: food.basis, per: food.per, convert: food.convert || [],
    stock: 0, stockUnit: kindOf(food.basis.unit) === kind ? unit : food.basis.unit, lowAt: 0, staple: false,
    source: found ? found.source : 'Imported: nutrition not found yet', needsNutrition: !found, unitOk: sameKind,
  };
}

// ---------- Editor ----------
function blankDraft() {
  return { id: null, name: '', servings: 2, minutes: '', meals: {}, items: [], steps: '', view: 'serving', query: '', error: null, notes: [], patch: {} };
}
function draftFor(id) {
  const key = 'recipe:' + (id || 'new');
  if (ui.drafts[key]) return ui.drafts[key];
  const r = id ? getData().recipes.find((x) => x.id === id) : null;
  ui.drafts[key] = r
    ? {
        id: r.id, name: r.name, servings: r.servings, minutes: r.minutes ? String(r.minutes) : '', meals: Object.fromEntries(r.meals.map((x) => [x, true])),
        items: r.items.map((it) => ({ ...it, qty: String(it.qty), alts: (it.alts || []).map((a) => ({ ...a, qty: String(a.qty) })) })), steps: (r.steps || []).join('\n'), view: 'serving', query: '', error: null, notes: [], patch: {},
      }
    : blankDraft();
  return ui.drafts[key];
}

/** A food with the weights typed into the recipe so far (`p`: { cup, piece } as typed). */
function patched(ing, p) {
  if (!ing || !p) return ing;
  const n = (v) => (v === undefined ? undefined : parseFloat(v) || 0);
  return { ...ing, convert: withMeasures(ing, n(p.cup), n(p.piece)) };
}
/** Weights to ask for on this row. Once asked, a question stays while the person types. */
function asksFor(it, ing) {
  const next = measureAsk(ing, it.unit);
  if (next && !(it.asks || []).includes(next)) it.asks = [...(it.asks || []), next];
  return it.asks || [];
}

function askField(kind, ing, i, dr) {
  const name = ing.name.toLowerCase();
  return html`<div class="item-sub ask-row"><label for="ask-${i}-${kind}">${kind === 'cup' ? `1 cup of ${name} weighs` : `One ${name.replace(/s$/, '')} weighs`}</label>
<input id="ask-${i}-${kind}" class="input short" type="text" inputmode="decimal" autocomplete="off" data-field="r-ask" data-id="${ing.id}" data-kind="${kind}" data-key="r-ask-${i}-${kind}" value="${(dr.patch[ing.id] || {})[kind] || ''}"><span class="muted small">g</span></div>`;
}

/** The line an import couldn't read an amount from, until the person checks it. */
function checkRow(it, i) {
  if (it.checked) return html`<p class="item-sub tiny muted" style="margin:0">The recipe said: “${it.check}”</p>`;
  return html`<div class="item-sub ask-row check-row"><span>Check the amount. The recipe said: “${it.check}”</span><button type="button" class="btn plain sm" data-action="r-check-ok" data-index="${i}">Looks right</button></div>`;
}

function altRow(a, i, j, ingById) {
  const ing = ingById[a.ingredientId];
  const name = ing ? ing.name : 'Deleted ingredient';
  return html`<div class="item-sub alt-row"><span class="or">or</span><span class="alt-name">${name}</span>
<label class="sr-only" for="alt-${i}-${j}">Amount of ${name}</label><input id="alt-${i}-${j}" class="input short" type="text" inputmode="decimal" autocomplete="off" data-field="r-alt-qty" data-index="${i}" data-alt="${j}" data-key="r-alt-qty-${i}-${j}" value="${a.qty}">
<label class="sr-only" for="alt-u-${i}-${j}">Unit</label><select id="alt-u-${i}-${j}" class="select" data-field="r-alt-unit" data-index="${i}" data-alt="${j}" data-key="r-alt-unit-${i}-${j}">${ing ? unitOptions(a.unit, ing.sizes || [], unitsFor(ing)) : html`<option>${a.unit}</option>`}</select>
<button type="button" class="icon-btn bare" data-action="r-alt-remove" data-index="${i}" data-alt="${j}" aria-label="Remove ${name} as a swap">${icon('close', 18)}</button></div>`;
}

function itemRow(it, i, ingById, dr) {
  const ing = ingById[it.ingredientId];
  const n = ing && !ing.needsNutrition ? nutrientsFor(ing, parseFloat(it.qty) || 0, it.unit) : null;
  const asks = ing ? asksFor(it, ing) : [];
  const name = ing ? ing.name : 'Deleted ingredient';
  const meta = n ? `${fmtInt(n.kcal)} kcal · P ${fmtInt(n.p)} · C ${fmtInt(n.c)} · F ${fmtInt(n.f)}`
    : ing && ing.needsNutrition ? 'No nutrition yet: look it up in Ingredients after saving'
    : asks.length ? 'Fill in the weight below to use this unit' : 'Pick a matching unit';
  return html`<li class="item-row${it.check && !it.checked ? ' to-check' : ''}">
<div class="grow"><span class="title">${name}${ing && ing.isNew ? html` <span class="badge muted">New food</span>` : ''}</span><span class="meta num">${meta}</span></div>
<label class="sr-only" for="qty-${i}">Amount of ${name}</label>
<input id="qty-${i}" class="input short" type="text" inputmode="decimal" autocomplete="off" data-field="r-qty" data-index="${i}" data-key="r-qty-${i}" value="${it.qty}">
<label class="sr-only" for="unit-${i}">Unit</label>
<select id="unit-${i}" class="select" style="width:auto;min-width:84px" data-field="r-unit" data-index="${i}" data-key="r-unit-${i}">${ing ? unitOptions(it.unit, ing.sizes || []) : html`<option>${it.unit}</option>`}</select>
<button type="button" class="icon-btn bare" data-action="r-remove" data-index="${i}" aria-label="Remove ${name}">${icon('trash', 18)}</button>
${it.check ? checkRow(it, i) : ''}
${ing ? asks.map((k) => askField(k, ing, i, dr)) : ''}
${asks.length ? html`<p class="item-sub tiny muted" style="margin:0">Check the package or weigh it once. It’s saved with the food.</p>` : ''}
${(it.alts || []).map((a, j) => altRow(a, i, j, ingById))}
${ing ? html`<button type="button" class="item-sub link-btn" data-action="r-alt-add" data-index="${i}">${icon('swap', 16)}${(it.alts || []).length ? 'Add another swap' : 'Add a swap option'}</button>` : ''}</li>`;
}

function altSheet(s) {
  const dr = cur();
  const it = dr && dr.items[s.index];
  if (!it) return '';
  const m = maps();
  const name = (m.ingById[it.ingredientId] || (dr.newIngs || {})[it.ingredientId] || { name: 'this ingredient' }).name;
  const used = new Set([it.ingredientId, ...(it.alts || []).map((a) => a.ingredientId)]);
  const foods = getData().ingredients.filter((i) => !used.has(i.id));
  const list = foodPicker(foods, { query: s.query, action: 'r-alt-pick', prefix: 'alt' });
  return html`<h2 id="sheet-title">Swap option for ${name}</h2>
<p class="small muted">When you cook this recipe, you can use it instead of ${name.toLowerCase()}. Handy for things that change, like pizza toppings.</p>
<label class="search">${icon('search')}<span class="sr-only">Search your ingredients</span><input type="search" placeholder="Search your ingredients" data-field="alt-query" data-key="alt-query" value="${s.query}"></label>
<div class="sheet-scroll">${list || html`<p class="small muted">Nothing matches “${s.query}”.</p>`}</div>
<button type="button" class="btn plain lg" data-action="close-sheet">Cancel</button>`;
}

function checkNotice(dr, ingById) {
  const left = dr.items.filter((it) => it.check && !it.checked);
  if (!left.length) return '';
  const names = left.map((it) => (ingById[it.ingredientId] || { name: 'Deleted ingredient' }).name.split(',')[0]);
  return html`<p class="notice warn">Check the amount for ${names.length === 1 ? names[0] : `${names.length} ingredients: ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`}. The recipe didn’t give one the app could use, so ${names.length === 1 ? 'it’s' : 'they’re'} marked below. You can still save and fix ${names.length === 1 ? 'it' : 'them'} later.</p>`;
}

function render(params) {
  const id = params.id && params.id !== 'new' ? params.id : null;
  const d = getData();
  if (id && !d.recipes.find((x) => x.id === id)) return html`<main class="main" id="main"><p class="empty">That recipe was deleted. <a href="#/recipes">Back to Recipes</a></p></main>`;
  const dr = draftFor(id);
  const m = maps();
  m.ingById = { ...m.ingById, ...(dr.newIngs || {}) };
  for (const [iid, p] of Object.entries(dr.patch)) m.ingById[iid] = patched(m.ingById[iid], p);
  const items = dr.items.map((it) => ({ ...it, qty: parseFloat(it.qty) || 0 }));
  const { total, perServing } = recipeNutrition({ servings: dr.servings, items }, m.ingById);
  const shown = dr.view === 'serving' ? perServing : total;
  const used = new Set(dr.items.map((it) => it.ingredientId));
  const q = dr.query.trim().toLowerCase();
  // Without a search, offer the foods used most in other recipes rather than the whole list.
  const uses = {};
  d.recipes.forEach((r) => r.items.forEach((it) => { uses[it.ingredientId] = (uses[it.ingredientId] || 0) + 1; }));
  const picks = q
    ? d.ingredients.filter((i) => !used.has(i.id) && i.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 12)
    : d.ingredients.filter((i) => !used.has(i.id)).sort((a, b) => (uses[b.id] || 0) - (uses[a.id] || 0) || a.name.localeCompare(b.name)).slice(0, 8);
  const back = id ? `#/recipes/${id}` : '#/recipes';
  return html`<main class="main with-bar" id="main">
<div class="topbar"><a class="icon-btn bare lg" href="${back}" aria-label="Discard changes and go back">${icon('close', 24)}</a><h1>${id ? 'Edit recipe' : 'New recipe'}</h1></div>
${dr.error ? html`<p class="notice warn" role="alert">${dr.error}</p>` : ''}
${checkNotice(dr, m.ingById)}
${dr.notes.length ? html`<div class="notice ok">${dr.notes.join(' ')}</div>` : ''}
<div class="cols"><div class="col-side stack">
<section class="card">
<label class="field">Recipe name<input class="input" type="text" data-field="r-name" data-key="r-name" value="${dr.name}" placeholder="e.g. Grandma’s turkey rice bowl" autocomplete="off"></label>
<div class="spread"><span class="bold">Makes</span>${stepper(servingsText(dr.servings), 'r-serv-less', 'r-serv-more', '', ['Fewer servings', 'More servings'])}</div>
<label class="spread" style="font-weight:600">Time (minutes)<input class="input short" type="text" inputmode="numeric" autocomplete="off" data-field="r-minutes" data-key="r-minutes" value="${dr.minutes}"></label>
<div class="chips" role="group" aria-label="Meal type">${SLOTS.map(([sid, label]) => html`<button type="button" class="chip" data-action="r-meal" data-value="${sid}"${pressed(!!dr.meals[sid])}>${label}</button>`)}</div>
</section>
</div>
<div class="col-main stack">
<div class="row" style="align-items:stretch;flex-wrap:wrap"><div style="flex:1;min-width:260px">${heroTotals(shown, dr.view === 'serving' ? 'kcal / serving' : 'kcal total')}</div>
<div style="min-width:220px">${seg([['serving', 'Per serving'], ['whole', 'Whole recipe']], dr.view, 'r-view', ' aria-label="Show nutrition for"')}</div></div>
<div class="spread"><h2 style="font-size:17px;font-weight:700">Ingredients</h2><span class="small muted">for the whole recipe</span></div>
${dr.items.length ? html`<ul class="list">${dr.items.map((it, i) => itemRow(it, i, m.ingById, dr))}</ul>
<p class="tiny muted" style="margin-top:-4px">Swap options are for ingredients that change from time to time. You pick one when you cook.</p>` : html`<p class="empty">No ingredients yet. Add some below.</p>`}
<section class="card tight"><h2 style="font-size:15px">Add an ingredient</h2>
<label class="search">${icon('search')}<span class="sr-only">Search your ingredients</span><input type="search" placeholder="Type to search, e.g. oats" data-field="r-query" data-key="r-query" value="${dr.query}"></label>
${picks.length ? html`<span class="small" style="font-weight:600;color:var(--muted2)">${q ? 'Matches' : 'Used most'} · tap to add</span>` : ''}
<div class="chips">${picks.map((i) => html`<button type="button" class="chip" data-action="r-add" data-id="${i.id}">${icon('plus', 16, 2.4)}${i.name}</button>`)}</div>
${q && !picks.length ? html`<p class="small muted">“${dr.query}” isn’t in your ingredients yet.</p>` : ''}
${!q && d.ingredients.some((i) => !used.has(i.id)) ? html`<span class="small" style="font-weight:600;color:var(--muted2)">Or browse your food</span>${foodPicker(d.ingredients.filter((i) => !used.has(i.id)), { action: 'r-add', prefix: 'radd' })}` : ''}
<button type="button" class="btn plain" data-action="r-new-ing">${icon('plus', 18, 2.2)}${q && !picks.length ? `Add “${dr.query.trim()}” as a new food` : 'Add a new food'}</button>
</section>
<label class="field" style="font-size:15px;font-weight:700;color:var(--ink)">Steps (optional)<textarea class="textarea" data-field="r-steps" data-key="r-steps" placeholder="One step per line">${dr.steps}</textarea></label>
</div></div>
<div class="bottom-bar"><a class="btn plain lg" href="${back}">Cancel</a><button type="button" class="btn primary lg" data-action="r-save">Save recipe</button></div>
</main>`;
}

// ---------- Import (paste) ----------
function renderImport() {
  const imp = ui.importDraft || (ui.importDraft = { name: '', text: '', servings: 4, parsed: null });
  const ings = getData().ingredients;
  const lines = imp.parsed || [];
  return html`<main class="main with-bar" id="main">
<div class="topbar"><a class="icon-btn bare lg" href="#/recipes" aria-label="Cancel import">${icon('close', 24)}</a><h1>Import a recipe</h1></div>
<p class="notice ok">Open the recipe in Chrome, select its ingredient list, copy it and paste it below. Importing straight from a link comes with the online sync step.</p>
<div class="cols"><div class="col-main stack">
<section class="card">
<label class="field">Recipe name<input class="input" type="text" data-field="imp-name" data-key="imp-name" value="${imp.name}" placeholder="e.g. Sheet-pan lemon garlic salmon"></label>
<div class="spread"><span class="bold">Makes</span>${stepper(servingsText(imp.servings), 'imp-less', 'imp-more', '', ['Fewer servings', 'More servings'])}</div>
<label class="field">Ingredient list<textarea class="textarea" style="min-height:180px" data-field="imp-text" data-key="imp-text" placeholder="1½ lb salmon fillets&#10;2 tbsp olive oil&#10;1 lb baby potatoes, halved">${imp.text}</textarea></label>
<p class="tiny muted">Each line is matched to your ingredients as soon as you paste.</p>
</section></div>
<div class="col-side stack">${lines.length ? html`<section class="card tight"><h2>Matches</h2>${lines.map((l) => html`<div style="padding:8px 0;border-bottom:1px solid var(--line-soft)">
<span class="tiny muted">From the page: “${l.raw}”</span>
<div class="spread"><span class="bold">${l.skip ? 'Seasoning' : l.ing ? l.ing.name : l.name}</span>${l.skip ? html`<span class="badge muted">Not counted</span>` : l.ing ? (l.ok ? html`<span class="badge ok">${l.amount}</span>` : html`<span class="badge warn">Check the amount</span>`) : l.ok ? html`<span class="badge muted">New food</span>` : html`<span class="badge warn">New food · check the amount</span>`}</div>
${l.isNew ? html`<span class="tiny" style="color:var(--muted2)">${lookText(l)}</span>` : ''}</div>`)}
${lines.some((l) => !l.skip && !l.ok) ? html`<p class="small muted">For lines marked “Check the amount”, add the amount to that line in the list (for example “2 apples” or “1 cup flour”), or fix it on the next screen.</p>` : ''}
<p class="small muted">${lines.filter((l) => l.ing).length} of ${lines.filter((l) => !l.skip).length} lines are already in your ingredients. The rest are added as new foods (with 0 in stock) when you save.</p>
${imp.lookNote ? html`<p class="notice warn">${imp.lookNote}</p>` : ''}</section>` : html`<p class="empty">Matches show here after you paste the list.</p>`}</div></div>
<div class="bottom-bar"><a class="btn plain lg" href="#/recipes">Cancel</a><button type="button" class="btn primary lg" data-action="imp-continue"${lines.length && !lines.some((l) => l.look === 'pending') ? '' : html` disabled`}>${lines.some((l) => l.look === 'pending') ? 'Looking up nutrition…' : 'Review and save'}</button></div>
</main>`;
}

function lookText(l) {
  if (l.look === 'pending') return 'Looking up nutrition…';
  if (l.look === 'found') return `Nutrition from ${l.found.source}`;
  if (l.look === 'limit' || l.look === 'error') return 'Nutrition not looked up: you can look it up in Ingredients later';
  return 'Nutrition not found: you can look it up in Ingredients later';
}

/** Look up nutrition for the new foods, one search each, then their portion sizes in one go. */
async function lookupNew(imp) {
  const fresh = imp.parsed.filter((l) => l.isNew && l.look === 'pending');
  const key = foodKey();
  for (const l of fresh) {
    if (ui.importDraft !== imp) return;
    if (imp.lookNote) { l.look = 'limit'; continue; }
    try {
      const hit = bestHit(l.name, await searchFoods(l.name, key));
      l.hit = hit;
      l.look = hit ? 'found' : 'none';
      if (hit) l.found = { ...buildFood(hit.per100, [], l.unit || 'g'), source: `USDA: ${hit.name}` };
    } catch (e) {
      l.look = e.message === 'limit' ? 'limit' : 'error';
      imp.lookNote = lookupError(e);
    }
    refresh();
  }
  const ids = fresh.filter((l) => l.hit).map((l) => l.hit.id);
  if (ids.length && ui.importDraft === imp) {
    try {
      const portions = await foodPortions(ids, key);
      for (const l of fresh) if (l.hit) l.found = { ...buildFood(l.hit.per100, portions[l.hit.id] || [], l.unit || 'g'), source: `USDA: ${l.hit.name}` };
    } catch (e) { /* per-100 g nutrition is still right; only cup/each conversions are missing */ }
  }
  // Remember the answers so editing the list doesn't look the same foods up again.
  for (const l of fresh) if (l.look !== 'pending') imp.cache[lookKey(l)] = { look: l.look, hit: l.hit, found: l.found };
  refresh();
}

const lookKey = (l) => `${l.name.toLowerCase()}|${l.unit || ''}`;

function parseImport() {
  const imp = ui.importDraft;
  const ings = getData().ingredients;
  imp.cache = imp.cache || {};
  imp.parsedText = imp.text;
  imp.parsed = imp.text.split('\n').map((s) => s.trim()).filter((s) => s && !/^(ingredients?|for the .*|:)$/i.test(s)).map((line) => {
    if (/\b(to taste|as needed|for garnish)\b/i.test(line)) return { raw: line, skip: true };
    const p = parseLine(line);
    const ing = matchIngredient(p.name || line, ings);
    let qty = p.qty, unit = p.unit;
    if (!unit && (!ing || kindOf(ing.basis.unit) === 'count' || (ing.convert || []).some((c) => c.unit === 'each'))) unit = 'each';
    if (!ing) {
      const name = (p.name || line).replace(/^(of|a|an)\s+/i, '').trim();
      const line = { raw: p.raw, isNew: true, name: name.charAt(0).toUpperCase() + name.slice(1), qty: qty > 0 ? qty : 1, unit, ok: qty > 0, look: 'pending' };
      return Object.assign(line, imp.cache[lookKey(line)] || {});
    }
    // "2 large eggs" uses the Large size; a plain count uses the usual one.
    if (ing.sizes && ing.sizes.length && (!unit || unit === 'each')) {
      const said = [...ing.sizes].sort((a, b) => b.name.length - a.name.length).find((x) => new RegExp(`\\b${x.name.toLowerCase().replace(/[^a-z ]/g, '')}\\b`).test(line.toLowerCase()));
      unit = (said || usualSize(ing)).name;
    }
    const ok = !!(qty > 0 && unit && unitsFor(ing).includes(unit));
    return { raw: p.raw, ing, qty, unit, ok, amount: ok ? fmtAmount(qty, unit) : '' };
  });
  imp.lookNote = null;
  lookupNew(imp);
}

const cur = () => ui.drafts['recipe:' + (ui.route.params.id || 'new')];
let matchTimer = null;

export const recipeEditView = {
  routes: { recipeEdit: render, recipeImport: renderImport },
  actions: {
    'r-serv-less': () => { cur().servings = Math.max(1, cur().servings - 1); refresh(); },
    'r-serv-more': () => { cur().servings += 1; refresh(); },
    'r-meal': ({ ds }) => { const dr = cur(); dr.meals[ds.value] = !dr.meals[ds.value]; refresh(); },
    'r-view': ({ ds }) => { cur().view = ds.value; refresh(); },
    'r-add': ({ ds }) => {
      const ing = maps().ingById[ds.id];
      const a = startAmount(ing);
      cur().items.push({ ingredientId: ing.id, qty: String(a.qty), unit: a.unit });
      cur().query = '';
      cur().error = null;
      refresh();
    },
    'r-check-ok': ({ ds }) => { cur().items[+ds.index].checked = true; refresh(); },
    'r-remove': ({ ds }) => { cur().items.splice(+ds.index, 1); refresh(); },
    'r-alt-add': ({ ds }) => openSheet({ type: 'alt-pick', index: +ds.index, query: '' }),
    'r-alt-pick': ({ ds }) => {
      const it = cur().items[ui.sheet.index];
      const a = startAmount(maps().ingById[ds.id], { qty: parseFloat(it.qty), unit: it.unit });
      it.alts = [...(it.alts || []), { ingredientId: ds.id, qty: String(+a.qty.toFixed(3)), unit: a.unit }];
      closeSheet();
    },
    'r-alt-remove': ({ ds }) => { cur().items[+ds.index].alts.splice(+ds.alt, 1); refresh(); },
    'r-new-ing': () => {
      const dr = cur();
      const here = location.hash;
      ui.newIngName = dr.query.trim();
      ui.returnTo = here;
      ui.onIngredientSaved = (ing) => {
        const a = startAmount(ing);
        dr.items.push({ ingredientId: ing.id, qty: String(a.qty), unit: a.unit });
        dr.query = '';
      };
      go('#/ingredients/new');
    },
    'r-save': () => {
      const dr = cur();
      const fresh = dr.newIngs || {};
      const realId = {};
      dr.error = null;
      for (const it of dr.items) if (fresh[it.ingredientId] && !realId[it.ingredientId]) realId[it.ingredientId] = uid();
      const items = dr.items.map((it) => {
        const item = { ingredientId: realId[it.ingredientId] || it.ingredientId, qty: parseFloat(it.qty) || 0, unit: it.unit };
        const alts = (it.alts || []).map((a) => ({ ingredientId: a.ingredientId, qty: parseFloat(a.qty) || 0, unit: a.unit }));
        if (alts.length) item.alts = alts;
        return item;
      });
      if (!dr.name.trim()) dr.error = 'Give the recipe a name.';
      else if (!items.length) dr.error = 'Add at least one ingredient.';
      else if (items.some((it) => !(it.qty > 0) || (it.alts || []).some((a) => !(a.qty > 0)))) dr.error = 'Every ingredient and swap needs an amount above zero.';
      if (dr.error) { refresh(); window.scrollTo(0, 0); return; }
      const recipe = {
        id: dr.id || uid(), name: dr.name.trim(), servings: dr.servings, minutes: parseInt(dr.minutes, 10) || 0,
        meals: SLOTS.map((s) => s[0]).filter((s) => dr.meals[s]), items, steps: dr.steps.split('\n').map((s) => s.trim()).filter(Boolean),
        source: dr.source || 'manual',
      };
      update((d) => {
        // Weights typed into the recipe are saved with the food.
        for (const [iid, p] of Object.entries(dr.patch)) {
          if (fresh[iid]) fresh[iid] = patched(fresh[iid], p);
          const ing = d.ingredients.find((x) => x.id === iid);
          if (ing) ing.convert = patched(ing, p).convert;
        }
        for (const [tempId, id] of Object.entries(realId)) {
          const { isNew, unitOk, ...ing } = fresh[tempId];
          d.ingredients.push({ ...ing, id });
        }
        if (dr.id) d.recipes = d.recipes.map((x) => (x.id === dr.id ? { ...x, ...recipe } : x));
        else d.recipes.push(recipe);
      });
      delete ui.drafts['recipe:' + (dr.id || 'new')];
      toast(`Saved ${recipe.name}.`);
      go(`#/recipes/${recipe.id}`);
    },
    'imp-less': () => { ui.importDraft.servings = Math.max(1, ui.importDraft.servings - 1); refresh(); },
    'imp-more': () => { ui.importDraft.servings += 1; refresh(); },
    'imp-continue': () => {
      const imp = ui.importDraft;
      // Pressed before the latest edit was matched: match it first.
      if (imp.parsedText !== imp.text) { clearTimeout(matchTimer); parseImport(); refresh(); return; }
      const dr = blankDraft();
      dr.name = imp.name;
      dr.servings = imp.servings;
      dr.source = 'import';
      dr.newIngs = {};
      for (const l of imp.parsed) {
        if (l.skip) continue;
        if (l.ing && l.ok) dr.items.push({ ingredientId: l.ing.id, qty: String(+l.qty.toFixed(3)), unit: l.unit });
        else if (l.ing) { const a = startAmount(l.ing); dr.items.push({ ingredientId: l.ing.id, qty: String(a.qty), unit: a.unit, check: l.raw }); }
        else {
          const tempId = 'new:' + uid();
          const food = newFood(l, l.look === 'found' ? l.found : null);
          dr.newIngs[tempId] = { ...food, id: tempId, isNew: true };
          // A unit the food can't convert yet keeps the recipe's amount; the row asks for its weight.
          dr.items.push({ ingredientId: tempId, qty: String(+l.qty.toFixed(3)), unit: l.unit, ...(l.ok ? {} : { check: l.raw }) });
        }
      }
      const added = Object.keys(dr.newIngs).length;
      if (added) dr.notes.push(`${added} new food${added === 1 ? '' : 's'} will be added to Ingredients with 0 in stock when you save. Then use “Add missing to shopping list” on the recipe.`);
      ui.drafts['recipe:new'] = dr;
      ui.importDraft = null;
      go('#/recipes/new');
    },
  },
  fields: {
    'r-name': (v) => { cur().name = v; cur().error = null; },
    'r-minutes': (v) => { cur().minutes = v; },
    'r-steps': (v) => { cur().steps = v; },
    'r-query': (v) => { cur().query = v; return true; },
    'r-qty': (v, ds) => { const it = cur().items[+ds.index]; it.qty = v; it.checked = true; return true; },
    'r-unit': (v, ds) => { const it = cur().items[+ds.index]; it.unit = v; it.asks = []; it.checked = true; return true; },
    'r-ask': (v, ds) => { const dr = cur(); dr.patch[ds.id] = { ...(dr.patch[ds.id] || {}), [ds.kind]: v }; return true; },
    'r-alt-qty': (v, ds) => { cur().items[+ds.index].alts[+ds.alt].qty = v; return true; },
    'r-alt-unit': (v, ds) => { cur().items[+ds.index].alts[+ds.alt].unit = v; return true; },
    'alt-query': (v) => { ui.sheet.query = v; return true; },
    'imp-name': (v) => { ui.importDraft.name = v; },
    'imp-text': (v) => {
      const imp = ui.importDraft;
      imp.text = v;
      clearTimeout(matchTimer);
      matchTimer = setTimeout(() => {
        if (ui.importDraft !== imp) return;
        if (imp.text.trim()) parseImport();
        else imp.parsed = null;
        refresh();
      }, 600);
    },
  },
  sheets: { 'alt-pick': altSheet },
  onLeave: (route, next) => {
    if (route.name === 'recipeEdit' && !(next && next.name === 'ingredient')) delete ui.drafts['recipe:' + (route.params.id || 'new')];
  },
};
