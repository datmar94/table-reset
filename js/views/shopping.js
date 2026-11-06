import { getData, update, uid, byId } from '../store.js';
import { ui, maps, openSheet, closeSheet, toast, refresh } from '../app.js';
import { addDays, dayKey, fmtAmount, fromBase, kindOf, stockAmount, stockStatus, toBase, unitsFor, withSwaps } from '../nutrition.js';
import { html, icon, pressed } from '../ui.js';
import { CATEGORIES, categoryOf } from '../kitchen.js';

/** How much of each food the meals planned (and not yet eaten) from `fromKey` for 7 days use, in base units. */
function plannedNeeds(d, fromKey, ingById, recipeById) {
  const end = addDays(fromKey, 6);
  const need = {};
  for (const e of d.entries) {
    if (e.eaten || e.date < fromKey || e.date > end) continue;
    if (e.kind === 'recipe') {
      const r = withSwaps(recipeById[e.recipeId], e.swaps);
      if (!r) continue;
      for (const it of r.items) {
        const base = stockAmount(ingById[it.ingredientId], it.qty, it.unit);
        if (Number.isFinite(base)) need[it.ingredientId] = (need[it.ingredientId] || 0) + (base * e.servings) / r.servings;
      }
    } else {
      const base = stockAmount(ingById[e.ingredientId], e.qty, e.unit);
      if (Number.isFinite(base)) need[e.ingredientId] = (need[e.ingredientId] || 0) + base;
    }
  }
  return need;
}

/** One package size in the food's base units, when the package is measured the same way as the stock. */
function packBase(ing) {
  return ing.pack && kindOf(ing.pack.unit) === kindOf(ing.stockUnit) ? toBase(ing.pack.qty, ing.pack.unit) : 0;
}

/**
 * The shopping list: one row per food, from planned meals, staples that ran low and items added by hand or from
 * recipes. `buy` is what checking it off adds to stock (rounded up to whole packages when the size is known),
 * or null when there's nothing to go on and the app has to ask.
 */
export function shoppingRows(d, fromKey) {
  const ingById = byId(d.ingredients), recipeById = byId(d.recipes);
  const rows = {};
  const row = (ing) => (rows[ing.id] = rows[ing.id] || { ing, short: 0, added: 0, reasons: [], itemIds: [] });
  for (const [id, base] of Object.entries(plannedNeeds(d, fromKey, ingById, recipeById))) {
    const ing = ingById[id];
    if (ing && ing.stock + 1e-9 < base) { const r = row(ing); r.short = base - ing.stock; r.reasons.push('for planned meals'); }
  }
  for (const s of d.shopping || []) {
    const ing = ingById[s.ingredientId];
    if (!ing) continue;
    const r = row(ing);
    r.added += s.base || 0;
    r.itemIds.push(s.id);
    const why = recipeById[s.recipeId] ? `for ${recipeById[s.recipeId].name}` : 'added by you';
    if (!r.reasons.includes(why)) r.reasons.push(why);
  }
  for (const ing of d.ingredients) {
    const st = stockStatus(ing);
    if (ing.staple && st !== 'on') row(ing).reasons.push(st === 'out' ? 'staple, out' : 'staple, running low');
  }
  return Object.values(rows).map((r) => {
    const ing = r.ing;
    let buy = Math.max(r.short, r.added);
    // A staple with nothing planned: bring it back to twice its "low" mark.
    if (!(buy > 0) && ing.lowAt > 0) buy = Math.max(toBase(ing.lowAt * 2, ing.stockUnit) - ing.stock, toBase(ing.lowAt, ing.stockUnit));
    const pack = packBase(ing);
    let packs = 0;
    if (pack) { packs = Math.max(1, Math.ceil(buy / pack - 1e-9)); buy = packs * pack; }
    return { ...r, buy: buy > 0 ? buy : null, packs };
  }).sort((a, b) => a.ing.name.localeCompare(b.ing.name));
}

function buyText(r) {
  if (!r.buy) return 'Amount not set';
  const amount = fmtAmount(fromBase(r.buy, r.ing.stockUnit), r.ing.stockUnit);
  return r.packs ? `${r.packs} pack${r.packs === 1 ? '' : 's'} · ${amount}` : amount;
}

/** How many foods are on the list (for the badge). */
export function shoppingCount() {
  return shoppingRows(getData(), dayKey()).length;
}

function itemRow(r) {
  return html`<li>
<button type="button" class="check" data-action="shop-check" data-id="${r.ing.id}"${pressed(false)} aria-label="Got ${r.ing.name}: add it to stock"><span>${icon('check', 16, 3)}</span></button>
<div class="grow"><span class="title">${r.ing.name}</span><span class="meta">${r.reasons.join(' · ')}</span></div>
<span class="num bold small" style="text-align:right">${buyText(r)}</span>
${r.itemIds.length && !r.short ? html`<button type="button" class="icon-btn bare" data-action="shop-remove" data-id="${r.ing.id}" aria-label="Remove ${r.ing.name} from the list">${icon('close', 18)}</button>` : ''}
</li>`;
}

function render() {
  const d = getData();
  const rows = shoppingRows(d, dayKey());
  const groups = CATEGORIES.map((c) => [c, rows.filter((r) => categoryOf(r.ing) === c)]).filter((g) => g[1].length);
  const done = ui.bought || [];
  return html`<main class="main" id="main">
<header class="page-head"><div><h1>Shopping list</h1><p class="sub">Tap the circle as each item goes in the cart. It’s added to your stock.</p></div>
<button type="button" class="btn primary" data-action="shop-add">${icon('plus', 18, 2.2)}Add item</button></header>
${!rows.length ? html`<p class="empty">Nothing to buy. Meals planned for the next 7 days are covered and your staples are stocked.</p>`
    : html`<div class="cards two">${groups.map(([title, items]) => html`<section class="stack" style="gap:6px"><h2 class="section-title">${title}</h2><ul class="list">${items.map(itemRow)}</ul></section>`)}</div>`}
${done.length ? html`<section class="stack" style="gap:6px"><h2 class="section-title">In the cart</h2><ul class="list">${done.map((b) => html`<li>
<span class="check" aria-hidden="true" style="opacity:.7"><span style="background:var(--accent);color:var(--surface)">${icon('check', 16, 3)}</span></span>
<div class="grow"><span class="title" style="text-decoration:line-through;color:var(--muted)">${b.name}</span><span class="meta">Added ${b.text} to stock</span></div>
<button type="button" class="btn ghost" data-action="shop-uncheck" data-key="${b.key}">Undo</button></li>`)}</ul></section>` : ''}
<p class="small muted">The list covers meals planned for today and the next 6 days, staples that are low or out, and anything you add. Mark a food as a staple in Ingredients to keep it stocked.</p>
</main>`;
}

function addSheet(s) {
  const d = getData();
  const q = (s.query || '').trim().toLowerCase();
  const foods = d.ingredients.filter((i) => !q || i.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 12);
  const ing = s.ingId ? maps().ingById[s.ingId] : null;
  return html`<h2 id="sheet-title">Add to the shopping list</h2>
<label class="search">${icon('search')}<span class="sr-only">Search your ingredients</span><input type="search" placeholder="Search your ingredients" data-field="shop-query" data-key="shop-query" value="${s.query || ''}"></label>
<div class="chips">${foods.map((i) => html`<button type="button" class="chip" data-action="shop-pick" data-id="${i.id}"${pressed(i.id === s.ingId)}>${i.name}</button>`)}</div>
${q && !foods.length ? html`<p class="small muted">“${s.query.trim()}” isn’t in your ingredients. Add it in Ingredients first.</p>` : ''}
${ing ? html`<div class="row"><label class="field" style="flex:1">${s.ask ? `How much ${ing.name} did you get?` : 'How much'}<input class="input" type="text" inputmode="decimal" autocomplete="off" data-field="shop-qty" data-key="shop-qty" value="${s.qty}"></label>
<label class="field" style="width:120px">Unit<select class="select" data-field="shop-unit" data-key="shop-unit">${unitsFor(ing).map((u) => html`<option${u === s.unit ? html` selected` : ''}>${u}</option>`)}</select></label></div>` : ''}
<div class="row"><button type="button" class="btn plain lg" data-action="close-sheet" style="flex:1">Cancel</button><button type="button" class="btn primary lg" data-action="shop-add-save" style="flex:1"${ing && parseFloat(s.qty) > 0 ? '' : html` disabled`}>${s.ask ? 'Add to stock' : 'Add to list'}</button></div>`;
}

/** Add `base` to a food's stock and clear its list items; returns how to undo it. */
function buy(ingId, base) {
  const d = getData();
  const before = (d.ingredients.find((i) => i.id === ingId) || {}).stock;
  const items = (d.shopping || []).filter((s) => s.ingredientId === ingId);
  update((x) => {
    x.shopping = (x.shopping || []).filter((s) => s.ingredientId !== ingId);
    const i = x.ingredients.find((y) => y.id === ingId);
    if (i) i.stock = (i.stock || 0) + base;
  });
  return () => update((x) => {
    x.shopping = (x.shopping || []).concat(items);
    const i = x.ingredients.find((y) => y.id === ingId);
    if (i) i.stock = before;
  });
}

function addToCart(ing, base) {
  const undo = buy(ing.id, base);
  const key = uid();
  const text = fmtAmount(fromBase(base, ing.stockUnit), ing.stockUnit);
  ui.bought = [{ key, name: ing.name, text, undo }, ...(ui.bought || [])];
  toast(`${ing.name}: added ${text} to stock.`, () => { ui.bought = ui.bought.filter((b) => b.key !== key); undo(); });
}

export const shoppingView = {
  routes: { shopping: render },
  actions: {
    'shop-check': ({ ds }) => {
      const r = shoppingRows(getData(), dayKey()).find((x) => x.ing.id === ds.id);
      if (!r) return;
      if (r.buy) { addToCart(r.ing, r.buy); return; }
      openSheet({ type: 'shop-add', ingId: r.ing.id, qty: '', unit: r.ing.stockUnit, ask: true });
    },
    'shop-uncheck': ({ ds }) => {
      const b = (ui.bought || []).find((x) => x.key === ds.key);
      if (!b) return;
      ui.bought = ui.bought.filter((x) => x.key !== b.key);
      ui.toast = null;
      b.undo();
    },
    'shop-remove': ({ ds }) => {
      const items = getData().shopping.filter((s) => s.ingredientId === ds.id);
      update((d) => { d.shopping = d.shopping.filter((s) => s.ingredientId !== ds.id); });
      toast('Removed from the shopping list.', () => update((d) => { d.shopping.push(...items); }));
    },
    'shop-add': () => openSheet({ type: 'shop-add', query: '', ingId: null, qty: '', unit: '' }),
    'shop-pick': ({ ds }) => {
      const ing = maps().ingById[ds.id];
      const pack = ing.pack && unitsFor(ing).includes(ing.pack.unit) ? ing.pack : null;
      Object.assign(ui.sheet, { ingId: ing.id, qty: pack ? String(pack.qty) : '1', unit: pack ? pack.unit : ing.stockUnit });
      refresh();
    },
    'shop-add-save': () => {
      const s = ui.sheet;
      const ing = maps().ingById[s.ingId];
      const base = stockAmount(ing, parseFloat(s.qty), s.unit);
      if (!(base > 0)) return;
      closeSheet();
      if (s.ask) { addToCart(ing, base); return; }
      const item = { id: uid(), ingredientId: ing.id, base, recipeId: null };
      update((d) => { d.shopping = (d.shopping || []).concat(item); });
      toast(`Added ${ing.name} to the list.`, () => update((d) => { d.shopping = d.shopping.filter((x) => x.id !== item.id); }));
    },
  },
  fields: {
    'shop-query': (v) => { ui.sheet.query = v; return true; },
    'shop-qty': (v) => { ui.sheet.qty = v; return true; },
    'shop-unit': (v) => { ui.sheet.unit = v; return true; },
  },
  sheets: { 'shop-add': addSheet },
};
