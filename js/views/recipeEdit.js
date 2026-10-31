import { getData, update, uid } from '../store.js';
import { ui, go, maps, toast, refresh } from '../app.js';
import { fmtAmount, fmtInt, fmtNum, kindOf, nutrientsFor, recipeNutrition, unitsFor } from '../nutrition.js';
import { buildFood, foodPortions, searchFoods } from '../foods.js';
import { foodKey, lookupError } from './ingredients.js';
import { html, icon, pressed, seg, stepper, heroTotals, SLOTS, servingsText } from '../ui.js';

// ---------- Ingredient-list parsing (used by Import) ----------
const FRACTIONS = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };
const UNIT_WORDS = {
  cup: 'cup', cups: 'cup', c: 'cup', tablespoon: 'tbsp', tablespoons: 'tbsp', tbsp: 'tbsp', tbs: 'tbsp', tbl: 'tbsp',
  teaspoon: 'tsp', teaspoons: 'tsp', tsp: 'tsp', ounce: 'oz', ounces: 'oz', oz: 'oz', pound: 'lb', pounds: 'lb', lb: 'lb', lbs: 'lb',
  gram: 'g', grams: 'g', g: 'g', kilogram: 'kg', kilograms: 'kg', kg: 'kg', ml: 'ml', milliliter: 'ml', milliliters: 'ml',
  liter: 'l', liters: 'l', l: 'l', clove: 'each', cloves: 'each', can: 'each', cans: 'each', piece: 'each', pieces: 'each',
};
const FILLER = new Set(['chopped', 'diced', 'fresh', 'minced', 'sliced', 'to', 'taste', 'of', 'and', 'or', 'large', 'small', 'medium', 'whole', 'finely', 'roughly', 'halved', 'trimmed', 'cooked', 'raw', 'boneless', 'skinless', 'about', 'plus', 'more', 'for', 'serving', 'divided', 'optional', 'the', 'a', 'into', 'cut', 'pieces', 'peeled', 'ground']);
const words = (s) => s.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean).map((w) => (w.length > 3 && w.endsWith('es') ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w));

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

/** The search hit whose name shares the most words with what the recipe asked for. */
export function bestHit(name, hits) {
  const want = words(name).filter((w) => !FILLER.has(w));
  let best = null, bestScore = -1;
  for (const h of hits) {
    const have = new Set(words(h.name));
    const score = want.filter((w) => have.has(w)).length / Math.max(1, want.length) - have.size * 0.01 + (have.has('raw') ? 0.05 : 0);
    if (score > bestScore) { best = h; bestScore = score; }
  }
  return bestScore > 0 ? best : null;
}

/** A food the import creates for a line that isn't in Ingredients yet. */
export function newFood(line, found) {
  const unit = line.unit || 'each';
  const kind = kindOf(unit);
  const food = found || { basis: kind === 'mass' ? { qty: 100, unit: 'g' } : kind === 'volume' ? { qty: 1, unit: 'cup' } : { qty: 1, unit: 'each' }, per: { kcal: 0, p: 0, c: 0, f: 0 }, convert: [] };
  const sameKind = kindOf(food.basis.unit) === kind || (food.convert || []).some((c) => kindOf(c.unit) === kind);
  return {
    name: line.name, category: 'Other', basis: food.basis, per: food.per, convert: food.convert || [],
    stock: 0, stockUnit: kindOf(food.basis.unit) === kind ? unit : food.basis.unit, lowAt: 0, staple: false,
    source: found ? found.source : 'Imported: nutrition not found yet', needsNutrition: !found, unitOk: sameKind,
  };
}

// ---------- Editor ----------
function blankDraft() {
  return { id: null, name: '', servings: 2, minutes: '', meals: {}, items: [], steps: '', view: 'serving', query: '', error: null, notes: [] };
}
function draftFor(id) {
  const key = 'recipe:' + (id || 'new');
  if (ui.drafts[key]) return ui.drafts[key];
  const r = id ? getData().recipes.find((x) => x.id === id) : null;
  ui.drafts[key] = r
    ? {
        id: r.id, name: r.name, servings: r.servings, minutes: r.minutes ? String(r.minutes) : '', meals: Object.fromEntries(r.meals.map((x) => [x, true])),
        items: r.items.map((it) => ({ ...it, qty: String(it.qty) })), steps: (r.steps || []).join('\n'), view: 'serving', query: '', error: null, notes: [],
      }
    : blankDraft();
  return ui.drafts[key];
}

function itemRow(it, i, ingById) {
  const ing = ingById[it.ingredientId];
  const n = ing && !ing.needsNutrition ? nutrientsFor(ing, parseFloat(it.qty) || 0, it.unit) : null;
  const units = ing ? unitsFor(ing) : [it.unit];
  return html`<li class="item-row">
<div class="grow"><span class="title">${ing ? ing.name : 'Deleted ingredient'}${ing && ing.isNew ? html` <span class="badge muted">New food</span>` : ''}</span><span class="meta num">${n ? `${fmtInt(n.kcal)} kcal · P ${fmtInt(n.p)} · C ${fmtInt(n.c)} · F ${fmtInt(n.f)}` : ing && ing.needsNutrition ? 'No nutrition yet: look it up in Ingredients after saving' : 'Pick a matching unit'}</span></div>
<label class="sr-only" for="qty-${i}">Amount of ${ing ? ing.name : 'ingredient'}</label>
<input id="qty-${i}" class="input short" type="text" inputmode="decimal" autocomplete="off" data-field="r-qty" data-index="${i}" data-key="r-qty-${i}" value="${it.qty}">
<label class="sr-only" for="unit-${i}">Unit</label>
<select id="unit-${i}" class="select" style="width:auto;min-width:84px" data-field="r-unit" data-index="${i}" data-key="r-unit-${i}">${units.map((u) => html`<option${u === it.unit ? html` selected` : ''}>${u}</option>`)}</select>
<button type="button" class="icon-btn bare" data-action="r-remove" data-index="${i}" aria-label="Remove ${ing ? ing.name : 'ingredient'}">${icon('trash', 18)}</button></li>`;
}

function render(params) {
  const id = params.id && params.id !== 'new' ? params.id : null;
  const d = getData();
  if (id && !d.recipes.find((x) => x.id === id)) return html`<main class="main" id="main"><p class="empty">That recipe was deleted. <a href="#/recipes">Back to Recipes</a></p></main>`;
  const dr = draftFor(id);
  const m = maps();
  m.ingById = { ...m.ingById, ...(dr.newIngs || {}) };
  const items = dr.items.map((it) => ({ ...it, qty: parseFloat(it.qty) || 0 }));
  const { total, perServing } = recipeNutrition({ servings: dr.servings, items }, m.ingById);
  const shown = dr.view === 'serving' ? perServing : total;
  const used = new Set(dr.items.map((it) => it.ingredientId));
  const q = dr.query.trim().toLowerCase();
  const picks = d.ingredients.filter((i) => !used.has(i.id) && (!q || i.name.toLowerCase().includes(q))).sort((a, b) => a.name.localeCompare(b.name)).slice(0, q ? 30 : 16);
  const back = id ? `#/recipes/${id}` : '#/recipes';
  return html`<main class="main with-bar" id="main">
<div class="topbar"><a class="icon-btn bare lg" href="${back}" aria-label="Discard changes and go back">${icon('close', 24)}</a><h1>${id ? 'Edit recipe' : 'New recipe'}</h1></div>
${dr.error ? html`<p class="notice warn" role="alert">${dr.error}</p>` : ''}
${dr.notes.length ? html`<div class="notice ok">${dr.notes.join(' ')}</div>` : ''}
<div class="cols"><div class="col-side stack">
<section class="card">
<label class="field">Recipe name<input class="input" type="text" data-field="r-name" data-key="r-name" value="${dr.name}" placeholder="e.g. Grandma’s turkey rice bowl" autocomplete="off"></label>
<div class="spread"><span class="bold">Makes</span>${stepper(servingsText(dr.servings), 'r-serv-less', 'r-serv-more', '', ['Fewer servings', 'More servings'])}</div>
<label class="spread" style="font-weight:600">Time (minutes)<input class="input short" type="text" inputmode="numeric" autocomplete="off" data-field="r-minutes" data-key="r-minutes" value="${dr.minutes}"></label>
<div class="chips" role="group" aria-label="Meal type">${SLOTS.map(([sid, label]) => html`<button type="button" class="chip" data-action="r-meal" data-value="${sid}"${pressed(!!dr.meals[sid])}>${label}</button>`)}</div>
</section>
<label class="field" style="font-size:15px;font-weight:700;color:var(--ink)">Steps (optional)<textarea class="textarea" data-field="r-steps" data-key="r-steps" placeholder="One step per line">${dr.steps}</textarea></label>
</div>
<div class="col-main stack">
<div class="row" style="align-items:stretch;flex-wrap:wrap"><div style="flex:1;min-width:260px">${heroTotals(shown, dr.view === 'serving' ? 'kcal / serving' : 'kcal total')}</div>
<div style="min-width:220px">${seg([['serving', 'Per serving'], ['whole', 'Whole recipe']], dr.view, 'r-view', ' aria-label="Show nutrition for"')}</div></div>
<div class="spread"><h2 style="font-size:17px;font-weight:700">Ingredients</h2><span class="small muted">for the whole recipe</span></div>
${dr.items.length ? html`<ul class="list">${dr.items.map((it, i) => itemRow(it, i, m.ingById))}</ul>` : html`<p class="empty">No ingredients yet. Add some below.</p>`}
<section class="card tight"><h2 style="font-size:15px">Add an ingredient</h2>
<label class="search">${icon('search')}<span class="sr-only">Search your ingredients</span><input type="search" placeholder="Type to search, e.g. oats" data-field="r-query" data-key="r-query" value="${dr.query}"></label>
<span class="small" style="font-weight:600;color:var(--muted2)">From your ingredients · tap to add</span>
<div class="chips">${picks.map((i) => html`<button type="button" class="chip" data-action="r-add" data-id="${i.id}">${icon('plus', 16, 2.4)}${i.name}</button>`)}</div>
${q && !picks.length ? html`<p class="small muted">“${dr.query}” isn’t in your ingredients yet.</p>` : ''}
<button type="button" class="btn plain" data-action="r-new-ing">${icon('plus', 18, 2.2)}${q && !picks.length ? `Add “${dr.query.trim()}” as a new food` : 'Add a new food'}</button>
</section></div></div>
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
<p class="notice ok">Open the recipe in Chrome, select its ingredient list, copy it and paste it here. The app matches each line to your ingredients and works out the macros. Importing straight from a link comes with the online sync step.</p>
<div class="cols"><div class="col-main stack">
<section class="card">
<label class="field">Recipe name<input class="input" type="text" data-field="imp-name" data-key="imp-name" value="${imp.name}" placeholder="e.g. Sheet-pan lemon garlic salmon"></label>
<div class="spread"><span class="bold">Makes</span>${stepper(servingsText(imp.servings), 'imp-less', 'imp-more', '', ['Fewer servings', 'More servings'])}</div>
<label class="field">Ingredient list<textarea class="textarea" style="min-height:180px" data-field="imp-text" data-key="imp-text" placeholder="1½ lb salmon fillets&#10;2 tbsp olive oil&#10;1 lb baby potatoes, halved">${imp.text}</textarea></label>
<button type="button" class="btn outline" data-action="imp-parse"${imp.text.trim() ? '' : html` disabled`}>Match to my ingredients</button>
</section></div>
<div class="col-side stack">${lines.length ? html`<section class="card tight"><h2>Matches</h2>${lines.map((l) => html`<div style="padding:8px 0;border-bottom:1px solid var(--line-soft)">
<span class="tiny muted">From the page: “${l.raw}”</span>
<div class="spread"><span class="bold">${l.skip ? 'Seasoning' : l.ing ? l.ing.name : l.name}</span>${l.skip ? html`<span class="badge muted">Not counted</span>` : l.ing ? (l.ok ? html`<span class="badge ok">${l.amount}</span>` : html`<span class="badge warn">Check the amount</span>`) : html`<span class="badge muted">New food</span>`}</div>
${l.isNew ? html`<span class="tiny" style="color:var(--muted2)">${lookText(l)}</span>` : ''}</div>`)}
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
  const fresh = imp.parsed.filter((l) => l.isNew);
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
  refresh();
}

function parseImport() {
  const imp = ui.importDraft;
  const ings = getData().ingredients;
  imp.parsed = imp.text.split('\n').map((s) => s.trim()).filter((s) => s && !/^(ingredients?|for the .*|:)$/i.test(s)).map((line) => {
    if (/\b(to taste|as needed|for garnish)\b/i.test(line)) return { raw: line, skip: true };
    const p = parseLine(line);
    const ing = matchIngredient(p.name || line, ings);
    let qty = p.qty, unit = p.unit;
    if (!unit && (!ing || kindOf(ing.basis.unit) === 'count' || (ing.convert || []).some((c) => c.unit === 'each'))) unit = 'each';
    if (!ing) {
      const name = (p.name || line).replace(/^(of|a|an)\s+/i, '').trim();
      return { raw: p.raw, isNew: true, name: name.charAt(0).toUpperCase() + name.slice(1), qty: qty > 0 ? qty : 1, unit, ok: qty > 0, look: 'pending' };
    }
    const ok = !!(qty > 0 && unit && unitsFor(ing).includes(unit));
    return { raw: p.raw, ing, qty, unit, ok, amount: ok ? fmtAmount(qty, unit) : '' };
  });
  imp.lookNote = null;
  lookupNew(imp);
}

const cur = () => ui.drafts['recipe:' + (ui.route.params.id || 'new')];

export const recipeEditView = {
  routes: { recipeEdit: render, recipeImport: renderImport },
  actions: {
    'r-serv-less': () => { cur().servings = Math.max(1, cur().servings - 1); refresh(); },
    'r-serv-more': () => { cur().servings += 1; refresh(); },
    'r-meal': ({ ds }) => { const dr = cur(); dr.meals[ds.value] = !dr.meals[ds.value]; refresh(); },
    'r-view': ({ ds }) => { cur().view = ds.value; refresh(); },
    'r-add': ({ ds }) => {
      const ing = maps().ingById[ds.id];
      cur().items.push({ ingredientId: ing.id, qty: String(ing.basis.qty), unit: ing.basis.unit });
      cur().query = '';
      cur().error = null;
      refresh();
    },
    'r-remove': ({ ds }) => { cur().items.splice(+ds.index, 1); refresh(); },
    'r-new-ing': () => {
      const dr = cur();
      const here = location.hash;
      ui.newIngName = dr.query.trim();
      ui.returnTo = here;
      ui.onIngredientSaved = (ing) => {
        dr.items.push({ ingredientId: ing.id, qty: String(ing.basis.qty), unit: ing.basis.unit });
        dr.query = '';
      };
      go('#/ingredients/new');
    },
    'r-save': () => {
      const dr = cur();
      const fresh = dr.newIngs || {};
      const realId = {};
      for (const it of dr.items) if (fresh[it.ingredientId] && !realId[it.ingredientId]) realId[it.ingredientId] = uid();
      const items = dr.items.map((it) => ({ ingredientId: realId[it.ingredientId] || it.ingredientId, qty: parseFloat(it.qty) || 0, unit: it.unit }));
      if (!dr.name.trim()) dr.error = 'Give the recipe a name.';
      else if (!items.length) dr.error = 'Add at least one ingredient.';
      else if (items.some((it) => !(it.qty > 0))) dr.error = 'Every ingredient needs an amount above zero.';
      if (dr.error) { refresh(); window.scrollTo(0, 0); return; }
      const recipe = {
        id: dr.id || uid(), name: dr.name.trim(), servings: dr.servings, minutes: parseInt(dr.minutes, 10) || 0,
        meals: SLOTS.map((s) => s[0]).filter((s) => dr.meals[s]), items, steps: dr.steps.split('\n').map((s) => s.trim()).filter(Boolean),
        source: dr.source || 'manual',
      };
      update((d) => {
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
    'imp-parse': () => { parseImport(); refresh(); },
    'imp-continue': () => {
      const imp = ui.importDraft;
      const dr = blankDraft();
      dr.name = imp.name;
      dr.servings = imp.servings;
      dr.source = 'import';
      dr.newIngs = {};
      for (const l of imp.parsed) {
        if (l.skip) continue;
        if (l.ing && l.ok) dr.items.push({ ingredientId: l.ing.id, qty: String(+l.qty.toFixed(3)), unit: l.unit });
        else if (l.ing) dr.items.push({ ingredientId: l.ing.id, qty: String(l.ing.basis.qty), unit: l.ing.basis.unit });
        else {
          const tempId = 'new:' + uid();
          const food = newFood(l, l.look === 'found' ? l.found : null);
          dr.newIngs[tempId] = { ...food, id: tempId, isNew: true };
          dr.items.push({ ingredientId: tempId, qty: String(+l.qty.toFixed(3)), unit: food.unitOk ? l.unit : food.basis.unit });
        }
      }
      const added = Object.keys(dr.newIngs).length;
      if (added) dr.notes.push(`${added} new food${added === 1 ? '' : 's'} will be added to Ingredients with 0 in stock when you save. Then use “Add missing to shopping list” on the recipe.`);
      const unsure = imp.parsed.filter((l) => !l.skip && !l.ok).length;
      if (unsure) dr.error = `Check the amount for ${unsure} ingredient${unsure === 1 ? '' : 's'}: the list didn’t give one the app could use.`;
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
    'r-qty': (v, ds) => { cur().items[+ds.index].qty = v; return true; },
    'r-unit': (v, ds) => { cur().items[+ds.index].unit = v; return true; },
    'imp-name': (v) => { ui.importDraft.name = v; },
    'imp-text': (v) => { ui.importDraft.text = v; ui.importDraft.parsed = null; return true; },
  },
  sheets: {},
  onLeave: (route, next) => {
    if (route.name === 'recipeEdit' && !(next && next.name === 'ingredient')) delete ui.drafts['recipe:' + (route.params.id || 'new')];
  },
};
