import { getData, update, uid } from '../store.js';
import { ui, maps, currentMember, dayTotals, entriesFor, entryNutrition, entryName, openSheet, closeSheet, toast, refresh } from '../app.js';
import { addDays, dayKey, fmtAmount, fmtInt, fromBase, kindOf, nutrientsFor, parseDay, recipeNutrition, scale, stockStatus, targets, toBase, unitsLike, weekStart } from '../nutrition.js';
import { html, icon, pressed, bar, macroBars, memberChips, seg, stepper, SLOTS, slotLabel, servingsText } from '../ui.js';
import { welcome } from './progress.js';

function entryQty(e) {
  return e.kind === 'recipe' ? servingsText(e.servings) : fmtAmount(e.qty, e.unit);
}

function slotSection(slot, label, list, m) {
  return html`<section class="stack" style="gap:8px">
<div class="spread"><h2 style="font-size:16px;font-weight:700">${label}</h2>
<button type="button" class="btn ghost" data-action="plan-add" data-slot="${slot}" aria-label="Add to ${label.toLowerCase()}">${icon('plus', 18, 2.2)}Add</button></div>
${list.length ? html`<ul class="list">${list.map((e) => {
    const n = entryNutrition(e, m);
    const shared = e.kind === 'recipe' ? getData().entries.filter((x) => x.date === e.date && x.recipeId === e.recipeId && x.slot === e.slot && x.memberId !== e.memberId) : [];
    return html`<li style="flex-wrap:wrap">
<div class="grow" style="min-width:160px">${e.kind === 'recipe' && m.recipeById[e.recipeId] ? html`<a class="title" href="#/recipes/${e.recipeId}" style="color:inherit;text-decoration:none">${entryName(e, m)}</a>` : html`<span class="title">${entryName(e, m)}</span>`}
<span class="meta num">${entryQty(e)} · ${fmtInt(n.kcal)} kcal · P ${fmtInt(n.p)} · C ${fmtInt(n.c)} · F ${fmtInt(n.f)}</span>
${shared.length ? html`<span class="tiny" style="font-weight:600;color:var(--accent-strong)">Also on ${shared.map((x) => (m.memberById[x.memberId] || {}).name).filter(Boolean).join(' and ')}’s plan</span>` : ''}</div>
${e.eaten
    ? html`<button type="button" class="btn on" data-action="toggle-eaten" data-id="${e.id}" aria-label="Eaten. Tap to undo">${icon('check', 18, 2.6)}Eaten</button>`
    : html`<button type="button" class="btn outline" data-action="toggle-eaten" data-id="${e.id}">${icon('circle', 18)}Log as eaten</button>`}
<button type="button" class="icon-btn bare" data-action="entry-remove" data-id="${e.id}" aria-label="Remove ${entryName(e, m)}">${icon('trash', 18)}</button></li>`;
  })}</ul>` : html`<p class="empty" style="padding:12px 14px">Nothing planned.</p>`}
</section>`;
}

/** What to buy for the planned (not yet eaten) meals this week, plus staples that are low. */
export function shoppingList(startKey) {
  const d = getData();
  const m = maps();
  const end = addDays(startKey, 6);
  const need = {};
  for (const e of d.entries) {
    if (e.eaten || e.date < startKey || e.date > end) continue;
    if (e.kind === 'recipe') {
      const r = m.recipeById[e.recipeId];
      if (!r) continue;
      for (const it of r.items) {
        const ing = m.ingById[it.ingredientId];
        if (!ing || kindOf(it.unit) !== kindOf(ing.basis.unit)) continue;
        need[ing.id] = (need[ing.id] || 0) + (toBase(it.qty, it.unit) * e.servings) / r.servings;
      }
    } else {
      const ing = m.ingById[e.ingredientId];
      if (ing && kindOf(e.unit) === kindOf(ing.basis.unit)) need[ing.id] = (need[ing.id] || 0) + toBase(e.qty, e.unit);
    }
  }
  const out = [];
  for (const [id, base] of Object.entries(need)) {
    const ing = m.ingById[id];
    if (ing.stock + 1e-9 < base) out.push({ ing, text: `Need ${fmtAmount(fromBase(base - ing.stock, ing.stockUnit), ing.stockUnit)} more`, why: 'for planned meals' });
  }
  for (const ing of d.ingredients) {
    const st = stockStatus(ing);
    if (ing.staple && st !== 'on' && !out.some((x) => x.ing.id === ing.id)) out.push({ ing, text: st === 'out' ? 'Out' : `${fmtAmount(fromBase(ing.stock, ing.stockUnit), ing.stockUnit)} left`, why: 'staple' });
  }
  return out.sort((a, b) => a.ing.name.localeCompare(b.ing.name));
}

function render() {
  const d = getData();
  if (!d.members.length) return html`<main class="main" id="main">${welcome()}</main>`;
  const m = maps();
  const member = currentMember();
  const day = ui.planDay || dayKey();
  const start = weekStart(day);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const today = dayKey();
  const t = targets(member);
  const { eaten, planned } = dayTotals(member.id, day, m);
  const list = entriesFor(member.id, day);
  const left = t ? { kcal: t.kcal - planned.kcal, p: t.p - planned.p } : null;
  const dayName = parseDay(day).toLocaleDateString('en-US', { weekday: 'long' });
  const shop = shoppingList(start);
  const rangeLabel = `${parseDay(start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${parseDay(addDays(start, 6)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  return html`<main class="main" id="main">
<header class="page-head"><div><h1>Meal plan</h1><p class="sub">Week of ${rangeLabel}</p></div>${memberChips(d.members, member.id, 'pick-member')}</header>
<div class="stack" style="gap:8px">
<div class="spread"><button type="button" class="icon-btn bare" data-action="plan-week" data-value="-7" aria-label="Previous week">${icon('chevronLeft')}</button>
${start !== weekStart(today) ? html`<button type="button" class="btn ghost" data-action="plan-today">Back to today</button>` : html`<span class="small bold">This week</span>`}
<button type="button" class="icon-btn bare" data-action="plan-week" data-value="7" aria-label="Next week">${icon('chevron')}</button></div>
<div class="day-strip" role="group" aria-label="Day">${days.map((k) => {
    const n = entriesFor(member.id, k).length;
    return html`<button type="button" class="${k === today ? 'today' : ''}" data-action="plan-day" data-value="${k}"${pressed(k === day)}><span class="d">${parseDay(k).toLocaleDateString('en-US', { weekday: 'short' })}</span><span class="n">${parseDay(k).getDate()}</span><span class="m">${n ? `${n} item${n === 1 ? '' : 's'}` : ''}</span></button>`;
  })}</div></div>
<div class="cols side-first"><div class="col-main stack">
${SLOTS.map(([slot, label]) => slotSection(slot, label, list.filter((e) => e.slot === slot), m))}
<div class="row wrap"><button type="button" class="btn plain" data-action="plan-food">${icon('plus', 18, 2.2)}Log something else</button>
${!list.length && entriesFor(member.id, addDays(day, -1)).length ? html`<button type="button" class="btn plain" data-action="plan-copy">${icon('copy', 18)}Copy the day before</button>` : ''}</div>
</div>
<aside class="col-side stack">
<section class="card" aria-label="Day totals">
<div class="spread"><h2>${member.name}’s ${dayName}</h2><span class="small muted">Target ${t ? fmtInt(t.kcal) : '—'} kcal</span></div>
<div class="row" style="gap:24px"><div><span class="small muted">Eaten</span><strong class="num" style="display:block;font-size:24px">${fmtInt(eaten.kcal)}</strong></div>
<div><span class="small muted">Planned</span><strong class="num" style="display:block;font-size:24px;color:var(--muted2)">${fmtInt(planned.kcal)}</strong></div></div>
<span class="bar thick" role="img" aria-label="${fmtInt(eaten.kcal)} calories eaten and ${fmtInt(planned.kcal)} planned of ${t ? fmtInt(t.kcal) : 'no target'}"><i class="fill-soft" style="width:${t ? Math.min(100, (planned.kcal / t.kcal) * 100).toFixed(1) : 0}%"></i><i class="fill-accent" style="width:${t ? Math.min(100, (eaten.kcal / t.kcal) * 100).toFixed(1) : 0}%"></i></span>
<div class="row tiny muted" style="gap:14px"><span class="row" style="gap:5px"><span class="dot fill-accent"></span>Eaten</span><span class="row" style="gap:5px"><span class="dot fill-soft"></span>Planned</span></div>
${macroBars(eaten, t, true)}
${left && left.kcal > 50 ? html`<a class="notice ok spread" href="#/suggested" style="text-decoration:none">${fmtInt(left.kcal)} kcal and ${fmtInt(Math.max(0, left.p))} g protein still to plan. See ideas ${icon('chevron', 18)}</a>` : ''}
</section>
<section class="card tight" aria-label="Shopping list"><h2>Shopping list for this week</h2>
${shop.length ? html`<ul style="list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px">${shop.map((x) => html`<li class="spread small"><span>${x.ing.name}</span><span style="color:${x.why === 'staple' && x.text !== 'Out' ? 'var(--warn-text)' : 'var(--muted)'}">${x.text}${x.why === 'staple' ? ' · staple' : ''}</span></li>`)}</ul>` : html`<p class="small muted">Nothing to buy for the planned meals.</p>`}
</section></aside></div>
</main>`;
}

function addSheet(s) {
  const d = getData();
  const m = maps();
  const recipes = [...d.recipes].sort((a, b) => a.name.localeCompare(b.name));
  const q = (s.query || '').trim().toLowerCase();
  const foods = d.ingredients.filter((i) => !q || i.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 12);
  const ing = s.ingId ? m.ingById[s.ingId] : null;
  let preview = null;
  if (s.mode === 'recipe' && s.recipeId) preview = scale(recipeNutrition(m.recipeById[s.recipeId], m.ingById).perServing, s.servings);
  if (s.mode === 'food' && ing) preview = nutrientsFor(ing, parseFloat(s.qty) || 0, s.unit);
  return html`<h2 id="sheet-title">${s.eaten ? 'Log what was eaten' : `Add to ${slotLabel(s.slot).toLowerCase()}`}</h2>
${seg([['recipe', 'A recipe'], ['food', 'A single food']], s.mode, 'sheet-mode', ' aria-label="What to add"')}
<div class="field"><span>Meal</span>${seg(SLOTS, s.slot, 'sheet-slot')}</div>
${s.mode === 'recipe'
    ? html`${recipes.length ? html`<div class="stack" role="radiogroup" aria-label="Recipe" style="gap:6px;max-height:260px;overflow:auto">${recipes.map((r) => html`<button type="button" class="choice" style="min-height:56px" role="radio" aria-checked="${r.id === s.recipeId ? 'true' : 'false'}" data-action="sheet-recipe" data-id="${r.id}"><span class="tx" style="flex:1"><strong>${r.name}</strong><span class="num">${fmtInt(recipeNutrition(r, m.ingById).perServing.kcal)} kcal per serving</span></span>${r.id === s.recipeId ? icon('check', 20, 2.6) : ''}</button>`)}</div>` : html`<p class="empty">No recipes yet.</p>`}
<div class="spread"><span class="bold">Servings</span>${stepper(servingsText(s.servings), 'sheet-less', 'sheet-more', '', ['Fewer servings', 'More servings'])}</div>`
    : html`<label class="search">${icon('search')}<span class="sr-only">Search food</span><input type="search" placeholder="Search your ingredients" data-field="sheet-query" data-key="sheet-query" value="${s.query || ''}"></label>
<div class="chips">${foods.map((i) => html`<button type="button" class="chip" data-action="sheet-food" data-id="${i.id}"${pressed(i.id === s.ingId)}>${i.name}</button>`)}</div>
${ing ? html`<div class="row"><label class="field" style="flex:1">Amount<input class="input" type="number" inputmode="decimal" step="any" min="0" data-field="sheet-qty" data-key="sheet-qty" value="${s.qty}"></label>
<label class="field" style="width:120px">Unit<select class="select" data-field="sheet-unit" data-key="sheet-unit">${unitsLike(ing.basis.unit).map((u) => html`<option${u === s.unit ? html` selected` : ''}>${u}</option>`)}</select></label></div>` : ''}`}
${preview ? html`<p class="small muted num">${fmtInt(preview.kcal)} kcal · P ${fmtInt(preview.p)} · C ${fmtInt(preview.c)} · F ${fmtInt(preview.f)}</p>` : ''}
<div class="spread"><span id="eaten-l" style="font-weight:600">Already eaten</span><button type="button" class="switch" role="switch" aria-labelledby="eaten-l" aria-checked="${s.eaten ? 'true' : 'false'}" data-action="sheet-eaten"></button></div>
<div class="row"><button type="button" class="btn plain lg" data-action="close-sheet" style="flex:1">Cancel</button><button type="button" class="btn primary lg" data-action="sheet-add" style="flex:1"${(s.mode === 'recipe' ? s.recipeId : ing && parseFloat(s.qty) > 0) ? '' : html` disabled`}>${s.eaten ? 'Log it' : 'Add to plan'}</button></div>`;
}

export const planView = {
  routes: { plan: render },
  actions: {
    'pick-member': ({ ds }) => { ui.memberId = ds.id; refresh(); },
    'plan-day': ({ ds }) => { ui.planDay = ds.value; refresh(); },
    'plan-week': ({ ds }) => { ui.planDay = addDays(ui.planDay || dayKey(), +ds.value); refresh(); },
    'plan-today': () => { ui.planDay = dayKey(); refresh(); },
    'plan-add': ({ ds }) => openSheet({ type: 'plan-add', mode: 'recipe', slot: ds.slot, servings: 1, eaten: false, qty: '', unit: '' }),
    'plan-food': () => openSheet({ type: 'plan-add', mode: 'food', slot: 'snack', servings: 1, eaten: true, qty: '', unit: '' }),
    'sheet-mode': ({ ds }) => { ui.sheet.mode = ds.value; refresh(); },
    'sheet-recipe': ({ ds }) => { ui.sheet.recipeId = ds.id; refresh(); },
    'sheet-food': ({ ds }) => {
      const ing = maps().ingById[ds.id];
      Object.assign(ui.sheet, { ingId: ing.id, qty: String(ing.basis.qty), unit: ing.basis.unit });
      refresh();
    },
    'sheet-eaten': () => { ui.sheet.eaten = !ui.sheet.eaten; refresh(); },
    'sheet-add': () => {
      const s = ui.sheet;
      const m = maps();
      const member = currentMember();
      const entry = { id: uid(), date: ui.planDay || dayKey(), memberId: member.id, slot: s.slot, eaten: s.eaten };
      if (s.mode === 'recipe') Object.assign(entry, { kind: 'recipe', recipeId: s.recipeId, servings: s.servings });
      else Object.assign(entry, { kind: 'food', ingredientId: s.ingId, qty: parseFloat(s.qty), unit: s.unit });
      if (entry.eaten) entry.snap = entryNutrition(entry, m);
      update((d) => d.entries.push(entry));
      closeSheet();
      toast(`${entry.eaten ? 'Logged' : 'Added'} ${entryName(entry, m)}.`, () => update((d) => { d.entries = d.entries.filter((e) => e.id !== entry.id); }));
    },
    'toggle-eaten': ({ ds }) => {
      const m = maps();
      update((d) => {
        const e = d.entries.find((x) => x.id === ds.id);
        e.eaten = !e.eaten;
        if (e.eaten) e.snap = entryNutrition({ ...e, snap: null }, m);
        else delete e.snap;
      });
    },
    'entry-remove': ({ ds }) => {
      const removed = getData().entries.find((e) => e.id === ds.id);
      update((d) => { d.entries = d.entries.filter((e) => e.id !== ds.id); });
      toast(`Removed ${entryName(removed)}.`, () => update((d) => d.entries.push(removed)));
    },
    'plan-copy': () => {
      const member = currentMember();
      const day = ui.planDay || dayKey();
      const prev = entriesFor(member.id, addDays(day, -1));
      const copies = prev.map((e) => {
        const c = { ...e, id: uid(), date: day, eaten: false };
        delete c.snap;
        return c;
      });
      update((d) => d.entries.push(...copies));
      toast(`Copied ${copies.length} item${copies.length === 1 ? '' : 's'} as planned.`);
    },
  },
  fields: {
    'sheet-query': (v) => { ui.sheet.query = v; return true; },
    'sheet-qty': (v) => { ui.sheet.qty = v; return true; },
    'sheet-unit': (v) => { ui.sheet.unit = v; return true; },
  },
  sheets: { 'plan-add': addSheet },
};

