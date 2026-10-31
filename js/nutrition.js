// Pure nutrition, unit and date math. No DOM, no storage: easy to test.

export const UNITS = {
  mass: { g: 1, kg: 1000, oz: 28.3495, lb: 453.592 },
  volume: { ml: 1, l: 1000, tsp: 4.92892, tbsp: 14.7868, 'fl oz': 29.5735, cup: 236.588 },
  count: { each: 1 },
};
export const UNIT_LIST = [...Object.keys(UNITS.mass), ...Object.keys(UNITS.volume), ...Object.keys(UNITS.count)];
export const ZERO = Object.freeze({ kcal: 0, p: 0, c: 0, f: 0 });
export const KEYS = ['kcal', 'p', 'c', 'f'];

export function kindOf(unit) {
  for (const kind of Object.keys(UNITS)) if (unit in UNITS[kind]) return kind;
  return null;
}
export function unitsLike(unit) {
  const kind = kindOf(unit);
  return kind ? Object.keys(UNITS[kind]) : [];
}
/** Amount in the base unit of its kind (g, ml or each). */
export function toBase(qty, unit) {
  const kind = kindOf(unit);
  return kind ? qty * UNITS[kind][unit] : NaN;
}
export function fromBase(base, unit) {
  const kind = kindOf(unit);
  return kind ? base / UNITS[kind][unit] : NaN;
}
export function add(a, b) {
  return { kcal: a.kcal + b.kcal, p: a.p + b.p, c: a.c + b.c, f: a.f + b.f };
}
export function scale(a, k) {
  return { kcal: a.kcal * k, p: a.p * k, c: a.c * k, f: a.f * k };
}
export function sum(list) {
  return list.reduce(add, { ...ZERO });
}

/**
 * An amount in the ingredient's own base unit (g, ml or each, matching its nutrition unit).
 * Other kinds convert through `ing.convert` ([{unit, qty, base}]: qty unit = base units), else NaN.
 */
export function baseAmount(ing, qty, unit) {
  const k = kindOf(unit);
  if (!ing || !k) return NaN;
  if (k === kindOf(ing.basis.unit)) return toBase(qty, unit);
  const c = (ing.convert || []).find((x) => kindOf(x.unit) === k && x.qty > 0);
  return c ? (toBase(qty, unit) / toBase(c.qty, c.unit)) * c.base : NaN;
}
/** Units an ingredient can be measured in. */
export function unitsFor(ing) {
  const kinds = [kindOf(ing.basis.unit), ...(ing.convert || []).map((c) => kindOf(c.unit))];
  return [...new Set(kinds)].filter(Boolean).flatMap((k) => Object.keys(UNITS[k]));
}

/** Nutrition for an amount of an ingredient, or null when the unit can't be converted. */
export function nutrientsFor(ing, qty, unit) {
  if (!ing) return null;
  const basisBase = toBase(ing.basis.qty, ing.basis.unit);
  const amount = baseAmount(ing, qty, unit);
  if (!(basisBase > 0) || !Number.isFinite(amount)) return null;
  return scale(ing.per, amount / basisBase);
}

export function stockIn(ing, unit = ing.stockUnit) {
  return fromBase(ing.stock, unit);
}
export function stockStatus(ing) {
  if (!(ing.stock > 0)) return 'out';
  if (ing.lowAt > 0 && stockIn(ing) <= ing.lowAt + 1e-9) return 'low';
  return 'on';
}

/** Totals for a recipe. `missing` lists items whose ingredient is gone or whose unit doesn't fit. */
export function recipeNutrition(recipe, ingById) {
  let total = { ...ZERO };
  const missing = [];
  for (const item of recipe.items) {
    const n = nutrientsFor(ingById[item.ingredientId], item.qty, item.unit);
    if (n) total = add(total, n);
    else missing.push(item);
  }
  const servings = recipe.servings > 0 ? recipe.servings : 1;
  return { total, perServing: scale(total, 1 / servings), missing };
}

/** What cooking `servings` of a recipe needs from stock, with any shortfalls. */
export function stockNeeds(recipe, servings, ingById) {
  const k = servings / (recipe.servings > 0 ? recipe.servings : 1);
  return recipe.items.map((item) => {
    const ing = ingById[item.ingredientId];
    const need = baseAmount(ing, item.qty, item.unit) * k;
    const compatible = Number.isFinite(need);
    const have = ing ? ing.stock : 0;
    return { item, ing, need, have, after: have - need, short: !compatible || have + 1e-9 < need };
  });
}
export function shortCount(recipe, servings, ingById) {
  return stockNeeds(recipe, servings, ingById).filter((x) => x.short).length;
}

export function proteinShare(n) {
  return n.kcal > 0 ? (n.p * 4) / n.kcal : 0;
}
/** Percent of calories from protein, carbs and fat (adds up to 100). */
export function macroSplit(n) {
  const pk = n.p * 4, ck = n.c * 4, fk = n.f * 9, tot = pk + ck + fk;
  if (!(tot > 0)) return { p: 0, c: 0, f: 0 };
  const p = Math.round((pk / tot) * 100), c = Math.round((ck / tot) * 100);
  return { p, c, f: Math.max(0, 100 - p - c) };
}

// ---------- Body targets ----------
export const ACTIVITY = [
  { value: 1.2, label: 'Sedentary: desk job, little exercise' },
  { value: 1.375, label: 'Light: exercise 1–3 days a week' },
  { value: 1.55, label: 'Moderate: exercise 3–5 days a week' },
  { value: 1.725, label: 'Very active: exercise 6–7 days a week' },
  { value: 1.9, label: 'Athlete: hard training or a physical job' },
];
export const LB_PER_KG = 2.20462;
export const KCAL_PER_LB = 3500;

export function currentWeightKg(member) {
  const w = [...(member.weights || [])].sort((a, b) => (a.date < b.date ? -1 : 1));
  return w.length ? w[w.length - 1].kg : member.weightKg || 0;
}

/** Mifflin-St Jeor targets. Returns null when the profile is incomplete. */
export function targets(member) {
  const kg = currentWeightKg(member);
  const cm = member.heightCm, age = member.age;
  if (!(kg > 0 && cm > 0 && age > 0)) return null;
  const bmr = 10 * kg + 6.25 * cm - 5 * age + (member.sex === 'female' ? -161 : 5);
  const tdee = bmr * (member.activity || 1.2);
  const paceLb = (member.paceKg || 0) * LB_PER_KG;
  const delta = member.goal === 'lose' ? -(paceLb * KCAL_PER_LB) / 7 : member.goal === 'gain' ? (paceLb * KCAL_PER_LB) / 7 : 0;
  const floor = member.sex === 'female' ? 1200 : 1500;
  let kcal = Math.round((tdee + delta) / 10) * 10;
  const floored = kcal < floor;
  if (floored) kcal = floor;
  const perLb = member.goal === 'lose' ? 0.9 : member.goal === 'gain' ? 1 : 0.8;
  const fatShare = member.goal === 'maintain' ? 0.3 : 0.25;
  let p = Math.round((kg * LB_PER_KG * perLb) / 5) * 5;
  let f = Math.round((kcal * fatShare) / 9);
  let c = Math.max(0, Math.round((kcal - p * 4 - f * 9) / 4));
  const calc = { bmr, tdee, delta, kcal, p, c, f, floored, floor, perLb, fatShare };
  if (member.custom) {
    const o = member.custom;
    return { ...calc, kcal: o.kcal || kcal, p: o.p || p, c: o.c || c, f: o.f || f, custom: true };
  }
  return calc;
}

/** Date a goal weight is reached at the member's pace, or null. */
export function goalDate(member, from = new Date()) {
  const kg = currentWeightKg(member), goal = member.goalWeightKg, pace = member.paceKg;
  if (member.goal === 'maintain' || !(goal > 0) || !(pace > 0)) return null;
  if (member.goal === 'lose' ? goal >= kg : goal <= kg) return null;
  const weeks = Math.abs(kg - goal) / pace;
  const d = new Date(from);
  d.setDate(d.getDate() + Math.round(weeks * 7));
  return { date: d, weeks };
}

// ---------- Dates ----------
export function dayKey(d = new Date()) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export function parseDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(key, n) {
  const d = parseDay(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}
export function weekStart(key) {
  const d = parseDay(key);
  const offset = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - offset);
  return dayKey(d);
}

// ---------- Formatting ----------
const FRACTIONS = [[0, ''], [0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾'], [1, '']];
const FRACTION_UNITS = new Set(['cup', 'tbsp', 'tsp', 'each']);

export function fmtNum(v, unit) {
  if (!isFinite(v)) return '—';
  if (FRACTION_UNITS.has(unit) && v > 0) {
    const whole = Math.floor(v + 1e-9), rest = v - whole;
    let best = FRACTIONS[0];
    for (const f of FRACTIONS) if (Math.abs(rest - f[0]) < Math.abs(rest - best[0])) best = f;
    if (Math.abs(rest - best[0]) < 0.04) {
      const w = best[0] === 1 ? whole + 1 : whole;
      if (!best[1]) return String(w);
      return (w ? w : '') + best[1];
    }
  }
  const abs = Math.abs(v);
  const r = abs >= 100 ? Math.round(v) : abs >= 10 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100;
  return String(r);
}
export function fmtAmount(qty, unit) {
  if (unit === 'each') return fmtNum(qty, unit);
  return `${fmtNum(qty, unit)} ${unit === 'cup' && qty > 1 + 1e-9 ? 'cups' : unit}`;
}
export function fmtInt(v) {
  return isFinite(v) ? Math.round(v).toLocaleString('en-US') : '—';
}
export function fmtWeight(kg, units) {
  return units === 'metric' ? `${(Math.round(kg * 10) / 10).toFixed(1)} kg` : `${(Math.round(kg * LB_PER_KG * 10) / 10).toFixed(1)} lb`;
}
