import { getData, update, uid } from '../store.js';
import { ui, maps, currentMember, dayTotals, entriesFor, entryNutrition, entryName, openSheet, closeSheet, toast, refresh } from '../app.js';
import { addDays, dayKey, fmtAmount, fmtInt, nutrientsFor, parseDay, recipeNutrition, scale, targets, unitsFor, weekStart } from '../nutrition.js';
import { html, icon, pressed, bar, leftTiles, memberChips, seg, stepper, SLOTS, slotLabel, servingsText } from '../ui.js';

const MACROS = [['Protein', 'p', 'fill-protein'], ['Carbs', 'c', 'fill-carbs'], ['Fat', 'f', 'fill-fat']];
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
    return html`<li class="has-check">
<button type="button" class="check" data-action="toggle-eaten" data-id="${e.id}"${pressed(!!e.eaten)} aria-label="${entryName(e, m)} eaten"><span>${icon('check', 16, 3)}</span></button>
<div class="grow">${e.kind === 'recipe' && m.recipeById[e.recipeId] ? html`<a class="title" href="#/recipes/${e.recipeId}" style="color:inherit;text-decoration:none">${entryName(e, m)}</a>` : html`<span class="title">${entryName(e, m)}</span>`}
<span class="meta num"><span class="nw">${entryQty(e)}</span> · <span class="nw">${fmtInt(n.kcal)} kcal</span> · <span class="nw">P ${fmtInt(n.p)}</span> · <span class="nw">C ${fmtInt(n.c)}</span> · <span class="nw">F ${fmtInt(n.f)}</span>${e.eaten ? html` · <strong style="color:var(--accent-text)">Eaten</strong>` : ''}</span>
${swapText(e, m)}
${shared.length ? html`<span class="tiny" style="font-weight:600;color:var(--accent-strong)">Also on ${shared.map((x) => (m.memberById[x.memberId] || {}).name).filter(Boolean).join(' and ')}’s plan</span>` : ''}</div>
<button type="button" class="icon-btn bare" data-action="entry-remove" data-id="${e.id}" aria-label="Remove ${entryName(e, m)}">${icon('trash', 18)}</button></li>`;
  })}</ul>` : html`<p class="empty" style="padding:12px 14px">Nothing planned.</p>`}
</section>`;
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
  const left = t ? { kcal: t.kcal - planned.kcal, p: t.p - planned.p, c: t.c - planned.c, f: t.f - planned.f } : null;
  const dayName = parseDay(day).toLocaleDateString('en-US', { weekday: 'long' });
  const rangeLabel = `${parseDay(start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${parseDay(addDays(start, 6)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  return html`<main class="main" id="main">
<header class="page-head"><div><h1>Meal plan</h1><p class="sub">Week of ${rangeLabel}</p></div>${memberChips(d.members, member.id, 'pick-member')}</header>
<div class="stack" style="gap:8px">
<div class="spread"><button type="button" class="icon-btn bare" data-action="plan-week" data-value="-7" aria-label="Previous week">${icon('chevronLeft')}</button>
${start !== weekStart(today) ? html`<button type="button" class="btn ghost" data-action="plan-today">Back to today</button>` : html`<span class="small bold">This week</span>`}
<button type="button" class="icon-btn bare" data-action="plan-week" data-value="7" aria-label="Next week">${icon('chevron')}</button></div>
<div class="day-strip" role="group" aria-label="Day">${days.map((k) => {
    const n = entriesFor(member.id, k).length;
    return html`<button type="button" class="${k === today ? 'today' : ''}" data-action="plan-day" data-value="${k}"${pressed(k === day)}><span class="d">${parseDay(k).toLocaleDateString('en-US', { weekday: 'short' })}</span><span class="n">${parseDay(k).getDate()}</span><span class="m">${n ? html`<span class="pips" aria-hidden="true">${'•'.repeat(Math.min(n, 4))}${n > 4 ? '+' : ''}</span><span class="tx">${n} item${n === 1 ? '' : 's'}</span>` : ''}</span></button>`;
  })}</div></div>
<div class="cols side-first"><div class="col-main stack">
${list.length ? html`<p class="small muted">Tap the circle when a meal is eaten.</p>` : ''}
${SLOTS.map(([slot, label]) => slotSection(slot, label, list.filter((e) => e.slot === slot), m))}
<div class="row wrap"><button type="button" class="btn plain" data-action="plan-food">${icon('plus', 18, 2.2)}Log something else</button>
${!list.length && entriesFor(member.id, addDays(day, -1)).length ? html`<button type="button" class="btn plain" data-action="plan-copy">${icon('copy', 18)}Copy the day before</button>` : ''}</div>
</div>
<aside class="col-side stack">
<section class="card" aria-label="Day totals">
<div class="spread"><h2>${member.name}’s ${dayName}</h2><span class="small muted">Target ${t ? fmtInt(t.kcal) : '—'} kcal</span></div>
<div class="row" style="gap:24px"><div><span class="small muted row" style="gap:6px"><span class="dot fill-accent"></span>Eaten</span><strong class="num" style="display:block;font-size:24px">${fmtInt(eaten.kcal)}</strong></div>
<div><span class="small muted row" style="gap:6px"><span class="dot fill-soft"></span>Planned</span><strong class="num" style="display:block;font-size:24px;color:var(--muted2)">${fmtInt(planned.kcal)}</strong></div></div>
<span class="bar thick" role="img" aria-label="${fmtInt(eaten.kcal)} calories eaten and ${fmtInt(planned.kcal)} planned of ${t ? fmtInt(t.kcal) : 'no target'}"><i class="fill-soft" style="width:${t ? Math.min(100, (planned.kcal / t.kcal) * 100).toFixed(1) : 0}%"></i><i class="fill-accent" style="width:${t ? Math.min(100, (eaten.kcal / t.kcal) * 100).toFixed(1) : 0}%"></i></span>
<div class="macro-grid">${MACROS.map(([label, k, cls]) => html`<div class="macro-row"><span class="small bold">${label}</span><span class="tiny muted num">${fmtInt(eaten[k])} / ${t ? fmtInt(t[k]) : '—'} g</span>${bar(t && t[k] ? eaten[k] / t[k] : 0, cls, 'thin')}</div>`)}</div>
${left ? leftTiles(left, 'Still to plan') : ''}
${left && left.kcal > 50 ? html`<a class="notice ok spread" href="#/suggested" style="text-decoration:none">Find recipes that fit what’s left ${icon('chevron', 18)}</a>` : ''}
</section>
</aside></div>
</main>`;
}

/** What the member still has to plan for the day, after the item in the sheet. */
function sheetLeft(preview) {
  const member = currentMember();
  const t = member && targets(member);
  if (!t) return '';
  const { planned } = dayTotals(member.id, ui.planDay || dayKey());
  const n = preview || { kcal: 0, p: 0, c: 0, f: 0 };
  const left = { kcal: t.kcal - planned.kcal - n.kcal, p: t.p - planned.p - n.p, c: t.c - planned.c - n.c, f: t.f - planned.f - n.f };
  return leftTiles(left, preview ? `${member.name}’s day after adding this` : `${member.name} still has to plan`);
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
${ing ? html`<div class="row"><label class="field" style="flex:1">Amount<input class="input" type="text" inputmode="decimal" autocomplete="off" data-field="sheet-qty" data-key="sheet-qty" value="${s.qty}"></label>
<label class="field" style="width:120px">Unit<select class="select" data-field="sheet-unit" data-key="sheet-unit">${unitsFor(ing).map((u) => html`<option${u === s.unit ? html` selected` : ''}>${u}</option>`)}</select></label></div>` : ''}`}
${preview ? html`<p class="small muted num">${fmtInt(preview.kcal)} kcal · P ${fmtInt(preview.p)} · C ${fmtInt(preview.c)} · F ${fmtInt(preview.f)}</p>` : ''}
${sheetLeft(preview)}
<div class="spread"><span id="eaten-l" style="font-weight:600">Already eaten</span><button type="button" class="switch" role="switch" aria-labelledby="eaten-l" aria-checked="${s.eaten ? 'true' : 'false'}" data-action="sheet-eaten"></button></div>
<div class="row"><button type="button" class="btn plain lg" data-action="close-sheet" style="flex:1">Cancel</button><button type="button" class="btn primary lg" data-action="sheet-add" style="flex:1"${(s.mode === 'recipe' ? s.recipeId : ing && parseFloat(s.qty) > 0) ? '' : html` disabled`}>${s.eaten ? 'Log it' : 'Add to plan'}</button></div>`;
}

/** "Chicken instead of turkey · no spinach" for a recipe cooked with swaps. */
function swapText(e, m) {
  const name = (id) => ((m.ingById[id] || {}).name || 'a deleted food').split(',')[0].toLowerCase();
  const parts = Object.entries(e.swaps || {}).map(([from, to]) => (to ? `${name(to.ingredientId)} instead of ${name(from)}` : `no ${name(from)}`));
  return parts.length ? html`<span class="tiny muted">With ${parts.join(' · ')}</span>` : '';
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

