import { getData, update, uid } from '../store.js';
import { ui, go, openSheet, closeSheet, toast, refresh } from '../app.js';
import { fmtAmount, fmtNum, kindOf, stockIn, stockStatus, toBase, unitsLike, UNIT_LIST } from '../nutrition.js';
import { html, icon, pressed } from '../ui.js';

export const CATEGORIES = ['Proteins', 'Dairy', 'Grains & starches', 'Produce', 'Pantry', 'Snacks', 'Drinks', 'Other'];
const STEP = { g: 50, kg: 0.25, oz: 1, lb: 0.25, ml: 50, l: 0.25, tsp: 1, tbsp: 1, 'fl oz': 1, cup: 0.5, each: 1 };
const WORD = { on: 'On hand', low: 'Running low', out: 'Out' };

function stockText(ing) {
  return ing.stock > 0 ? fmtAmount(stockIn(ing), ing.stockUnit) : '0';
}

function row(ing) {
  const st = stockStatus(ing);
  const color = st === 'on' ? 'var(--accent-strong)' : st === 'low' ? 'var(--warn-text)' : 'var(--muted2)';
  const note = WORD[st] + (ing.staple && st !== 'on' ? ' · on shopping list' : '');
  return html`<li>
<a class="tap" href="#/ingredients/${ing.id}" style="text-decoration:none;color:inherit"><span class="title">${ing.name}${ing.staple ? html` <span style="color:var(--accent)" aria-label="staple">${icon('star', 13)}</span>` : ''}</span><span class="tiny" style="font-weight:700;color:${color}">${note}</span></a>
<button type="button" class="icon-btn" data-action="stock-less" data-id="${ing.id}" aria-label="Less ${ing.name}">${icon('minus', 16, 2.4)}</button>
<span class="num bold" style="min-width:64px;text-align:center;font-size:14px">${stockText(ing)}</span>
<button type="button" class="icon-btn" data-action="stock-more" data-id="${ing.id}" aria-label="More ${ing.name}">${icon('plus', 16, 2.4)}</button>
</li>`;
}

function renderList() {
  const d = getData();
  const q = (ui.ingQuery || '').trim().toLowerCase();
  const filter = ui.ingFilter || 'all';
  const counts = { all: d.ingredients.length, on: 0, low: 0, out: 0 };
  d.ingredients.forEach((i) => counts[stockStatus(i)]++);
  const shown = d.ingredients
    .filter((i) => (filter === 'all' || stockStatus(i) === filter) && (!q || i.name.toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name));
  const groups = CATEGORIES.map((c) => [c, shown.filter((i) => (CATEGORIES.includes(i.category) ? i.category : 'Other') === c)]).filter((g) => g[1].length);
  return html`<main class="main" id="main">
<header class="page-head"><div><h1>Ingredients</h1><p class="sub">Amounts go down when you cook a recipe. Tap − or + to correct them.</p></div>
<a class="btn primary" href="#/ingredients/new">${icon('plus', 18, 2.2)}Add food</a></header>
<div class="row wrap"><label class="search" style="flex:1;min-width:220px">${icon('search')}<span class="sr-only">Search my ingredients</span><input type="search" placeholder="Search my ingredients" data-field="ing-query" data-key="ing-query" value="${ui.ingQuery || ''}"></label>
<div class="chips" role="group" aria-label="Filter by stock">${[['all', 'All'], ['on', 'On hand'], ['low', 'Low'], ['out', 'Out']].map(([id, label]) => html`<button type="button" class="chip" data-action="ing-filter" data-value="${id}"${pressed(filter === id)}>${label} · ${counts[id]}</button>`)}</div></div>
${!d.ingredients.length ? html`<p class="empty">No ingredients yet. Add the food you keep at home, with the nutrition from its label.</p>`
    : !groups.length ? html`<p class="empty">Nothing matches.</p>`
    : html`<div class="cards two">${groups.map(([title, items]) => html`<section class="stack" style="gap:6px"><h2 class="section-title">${title}</h2><ul class="list">${items.map(row)}</ul></section>`)}</div>`}
</main>`;
}

function draftFor(id) {
  const key = 'ing:' + (id || 'new');
  if (ui.drafts[key]) return ui.drafts[key];
  const ing = id ? getData().ingredients.find((x) => x.id === id) : null;
  ui.drafts[key] = ing
    ? {
        name: ing.name, category: ing.category, bq: String(ing.basis.qty), bu: ing.basis.unit,
        kcal: String(ing.per.kcal), p: String(ing.per.p), c: String(ing.per.c), f: String(ing.per.f),
        stock: fmtNum(stockIn(ing), 'g'), su: ing.stockUnit, low: ing.lowAt ? String(ing.lowAt) : '', staple: !!ing.staple, source: ing.source || 'Entered by you', error: null,
      }
    : { name: ui.newIngName || '', category: 'Other', bq: '100', bu: 'g', kcal: '', p: '', c: '', f: '', stock: '', su: 'g', low: '', staple: false, source: 'Entered by you', error: null };
  ui.newIngName = '';
  return ui.drafts[key];
}

function num(label, field, value, step = 'any') {
  return html`<label class="field">${label}<input class="input" type="number" inputmode="decimal" step="${step}" min="0" data-field="${field}" data-key="${field}" value="${value}"></label>`;
}
function unitSelect(field, value, options, label) {
  return html`<label class="field">${label}<select class="select" data-field="${field}" data-key="${field}">${options.map((u) => html`<option value="${u}"${u === value ? html` selected` : ''}>${u}</option>`)}</select></label>`;
}

function renderEditor(params) {
  const id = params.id === 'new' ? null : params.id;
  const ing = id ? getData().ingredients.find((x) => x.id === id) : null;
  if (id && !ing) return html`<main class="main" id="main"><p class="empty">That ingredient was removed. <a href="#/ingredients">Back to Ingredients</a></p></main>`;
  const dr = draftFor(id);
  const usedIn = id ? getData().recipes.filter((r) => r.items.some((it) => it.ingredientId === id)) : [];
  return html`<main class="main with-bar" id="main">
<div class="topbar"><a class="icon-btn bare lg" href="${ui.returnTo || '#/ingredients'}" aria-label="Back">${icon('back', 24)}</a><h1>${id ? dr.name || 'Ingredient' : 'Add food'}</h1></div>
${dr.error ? html`<p class="notice warn" role="alert">${dr.error}</p>` : ''}
<div class="cols"><div class="col-main stack">
<section class="card">
<label class="field">Name<input class="input" type="text" data-field="i-name" data-key="i-name" value="${dr.name}" autocomplete="off" placeholder="e.g. Chicken thighs, boneless"></label>
<label class="field">Group<select class="select" data-field="i-category" data-key="i-category">${CATEGORIES.map((c) => html`<option${c === dr.category ? html` selected` : ''}>${c}</option>`)}</select></label>
</section>
<section class="card"><h2>Nutrition</h2><p class="small muted">Copy these from the package label, or look the food up on the USDA FoodData Central website.</p>
<div class="grid2">${num('Amount', 'i-bq', dr.bq)}${unitSelect('i-bu', dr.bu, UNIT_LIST, 'Unit')}</div>
<div class="grid2">${num('Calories', 'i-kcal', dr.kcal)}${num('Protein (g)', 'i-p', dr.p)}${num('Carbs (g)', 'i-c', dr.c)}${num('Fat (g)', 'i-f', dr.f)}</div>
<p class="tiny muted">Source: ${dr.source}</p></section>
</div>
<aside class="col-side stack">
<section class="card"><h2>In stock</h2>
<div class="grid2">${num('Amount at home', 'i-stock', dr.stock)}${unitSelect('i-su', dr.su, unitsLike(dr.bu), 'Unit')}</div>
${num(`Mark as low below (${dr.su})`, 'i-low', dr.low)}
<div class="spread"><span id="staple-l" style="font-weight:600">Staple: I always keep this</span><button type="button" class="switch" role="switch" aria-labelledby="staple-l" aria-checked="${dr.staple ? 'true' : 'false'}" data-action="i-staple"></button></div>
<p class="tiny muted">Staples that run low or out go on the shopping list.</p></section>
${usedIn.length ? html`<section class="card tight"><h2>Used in</h2>${usedIn.map((r) => html`<a href="#/recipes/${r.id}">${r.name}</a>`)}</section>` : ''}
${id ? html`<button type="button" class="btn danger" data-action="ing-delete" data-id="${id}">${icon('trash', 18)}Delete ${dr.name || 'ingredient'}</button>` : ''}
</aside></div>
<div class="bottom-bar"><a class="btn plain lg" href="${ui.returnTo || '#/ingredients'}">Cancel</a><button type="button" class="btn primary lg" data-action="ing-save" data-id="${id || 'new'}">Save</button></div>
</main>`;
}

function deleteSheet(sheet) {
  const d = getData();
  const ing = d.ingredients.find((x) => x.id === sheet.id);
  if (!ing) return '';
  const n = d.recipes.filter((r) => r.items.some((it) => it.ingredientId === ing.id)).length;
  return html`<h2 id="sheet-title">Delete ${ing.name}?</h2>
<p>${n ? `${n} recipe${n === 1 ? ' uses' : 's use'} it. Those recipes will show it as missing until you pick a replacement.` : 'No recipes use it.'}</p>
<div class="row"><button type="button" class="btn plain lg" data-action="close-sheet" style="flex:1">Keep</button><button type="button" class="btn primary lg" data-action="ing-delete-confirm" data-id="${ing.id}" style="flex:1">Delete</button></div>`;
}

const cur = () => ui.drafts['ing:' + (ui.route.params.id || 'new')];
const setField = (k, rerender = false) => (value) => { cur()[k] = value; cur().error = null; return rerender; };

function bumpStock(id, dir) {
  update((d) => {
    const ing = d.ingredients.find((x) => x.id === id);
    const step = STEP[ing.stockUnit] || 1;
    const now = stockIn(ing);
    const next = Math.max(0, dir > 0 ? Math.floor(now / step + 1e-9) * step + step : Math.ceil(now / step - 1e-9) * step - step);
    ing.stock = toBase(next, ing.stockUnit);
  });
}

export const ingredientsView = {
  routes: { ingredients: renderList, ingredient: renderEditor },
  actions: {
    'ing-filter': ({ ds }) => { ui.ingFilter = ds.value; refresh(); },
    'stock-less': ({ ds }) => bumpStock(ds.id, -1),
    'stock-more': ({ ds }) => bumpStock(ds.id, 1),
    'i-staple': () => { cur().staple = !cur().staple; refresh(); },
    'ing-save': ({ ds }) => {
      const id = ds.id === 'new' ? null : ds.id;
      const dr = cur();
      const bq = parseFloat(dr.bq), stock = parseFloat(dr.stock) || 0;
      if (!dr.name.trim()) dr.error = 'Give the food a name.';
      else if (!(bq > 0)) dr.error = 'Enter the amount the nutrition is for, like 100 g or 1 cup.';
      else if (!(parseFloat(dr.kcal) >= 0)) dr.error = 'Enter the calories (0 is fine).';
      else if (kindOf(dr.su) !== kindOf(dr.bu)) dr.error = 'Pick a stock unit that matches the nutrition unit.';
      if (dr.error) { refresh(); return; }
      const ing = {
        id: id || uid(), name: dr.name.trim(), category: dr.category, basis: { qty: bq, unit: dr.bu },
        per: { kcal: +dr.kcal || 0, p: +dr.p || 0, c: +dr.c || 0, f: +dr.f || 0 },
        stock: toBase(stock, dr.su), stockUnit: dr.su, lowAt: parseFloat(dr.low) || 0, staple: dr.staple, source: dr.source,
      };
      update((d) => {
        if (id) d.ingredients = d.ingredients.map((x) => (x.id === id ? ing : x));
        else d.ingredients.push(ing);
      });
      delete ui.drafts['ing:' + (id || 'new')];
      toast(`Saved ${ing.name}.`);
      const back = ui.returnTo || '#/ingredients';
      if (ui.onIngredientSaved) { ui.onIngredientSaved(ing); ui.onIngredientSaved = null; }
      ui.returnTo = null;
      go(back);
    },
    'ing-delete': ({ ds }) => openSheet({ type: 'ing-delete', id: ds.id }),
    'ing-delete-confirm': ({ ds }) => {
      const ing = getData().ingredients.find((x) => x.id === ds.id);
      update((d) => { d.ingredients = d.ingredients.filter((x) => x.id !== ds.id); });
      delete ui.drafts['ing:' + ds.id];
      closeSheet();
      toast(`Deleted ${ing.name}.`);
      go('#/ingredients');
    },
  },
  fields: {
    'ing-query': (v) => { ui.ingQuery = v; return true; },
    'i-name': setField('name', true), 'i-category': setField('category'), 'i-bq': setField('bq'),
    'i-bu': (v) => {
      const dr = cur();
      dr.bu = v;
      if (kindOf(dr.su) !== kindOf(v) || !dr.stock) dr.su = v;
      return true;
    },
    'i-kcal': setField('kcal'), 'i-p': setField('p'), 'i-c': setField('c'), 'i-f': setField('f'),
    'i-stock': setField('stock'),
    'i-su': (v) => { cur().su = v; return true; },
    'i-low': setField('low'),
  },
  sheets: { 'ing-delete': deleteSheet },
  onLeave: (route) => {
    if (route.name !== 'ingredient') return;
    delete ui.drafts['ing:' + (route.params.id || 'new')];
    ui.returnTo = null;
    ui.onIngredientSaved = null;
  },
};
