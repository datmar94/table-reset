// Shared UI state, navigation and data selectors used by every screen.
import { getData, byId } from './store.js';
import { add, dayKey, nutrientsFor, recipeNutrition, scale, sum, targets, withSwaps, ZERO } from './nutrition.js';

/** Screen state that isn't saved (filters, drafts, open sheets). */
export const ui = {
  memberId: null,
  planDay: dayKey(),
  sheet: null,
  toast: null,
  drafts: {},
};

let rerender = () => {};
export function setRenderer(fn) {
  rerender = fn;
}
export function refresh() {
  rerender();
}
export function go(hash) {
  if (location.hash === hash) rerender();
  else location.hash = hash;
}
export function openSheet(sheet) {
  ui.sheet = sheet;
  rerender();
}
export function closeSheet() {
  ui.sheet = null;
  rerender();
}

let toastTimer = null;
export function toast(msg, undo = null) {
  ui.toast = { msg, undo };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    ui.toast = null;
    rerender();
  }, 6000);
  rerender();
}

export function maps() {
  const d = getData();
  return { ingById: byId(d.ingredients), recipeById: byId(d.recipes), memberById: byId(d.members) };
}

/** The member most screens focus on: the one picked last, else the first. */
export function currentMember() {
  const { members } = getData();
  return members.find((m) => m.id === ui.memberId) || members[0] || null;
}

export function entryNutrition(entry, m = maps()) {
  if (entry.snap) return entry.snap;
  if (entry.kind === 'recipe') {
    const r = withSwaps(m.recipeById[entry.recipeId], entry.swaps);
    return r ? scale(recipeNutrition(r, m.ingById).perServing, entry.servings) : { ...ZERO };
  }
  return nutrientsFor(m.ingById[entry.ingredientId], entry.qty, entry.unit) || { ...ZERO };
}
export function entryName(entry, m = maps()) {
  if (entry.kind === 'recipe') return (m.recipeById[entry.recipeId] || {}).name || entry.label || 'Deleted recipe';
  return (m.ingById[entry.ingredientId] || {}).name || entry.label || 'Deleted food';
}

export function entriesFor(memberId, date) {
  return getData().entries.filter((e) => e.memberId === memberId && e.date === date);
}

/** Eaten and planned totals for a member on a day. */
export function dayTotals(memberId, date, m = maps()) {
  const list = entriesFor(memberId, date);
  const eaten = sum(list.filter((e) => e.eaten).map((e) => entryNutrition(e, m)));
  const planned = sum(list.map((e) => entryNutrition(e, m)));
  return { eaten, planned, count: list.length };
}

export function remaining(member, date = dayKey()) {
  const t = targets(member);
  const { eaten } = dayTotals(member.id, date);
  if (!t) return null;
  return { kcal: t.kcal - eaten.kcal, p: t.p - eaten.p, c: t.c - eaten.c, f: t.f - eaten.f };
}

export { add };
