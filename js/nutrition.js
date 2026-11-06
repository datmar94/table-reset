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

/** A food's named piece size, e.g. eggs: { name: 'Large', g: 50 }. */
export function sizeOf(ing, unit) {
  return (ing && ing.sizes && ing.sizes.find((s) => s.name === unit)) || null;
}
/** The size recipes start with. For foods counted per piece with no weight given, the nutrition is for one of these. */
export function usualSize(ing) {
  const list = (ing && ing.sizes) || [];
  return list.find((s) => s.usual) || list[0] || null;
}

/**
 * An amount in the ingredient's own base unit (g, ml or each, matching its nutrition unit), or NaN.
 * Other kinds convert through `ing.convert` ([{unit, qty, base}]: qty unit = base units) or its sizes.
 */
export function baseAmount(ing, qty, unit) {
  if (!ing) return NaN;
  const size = sizeOf(ing, unit);
  if (size) return size.g > 0 ? baseAmount(ing, qty * size.g, 'g') : NaN;
  const k = kindOf(unit), bk = kindOf(ing.basis.unit);
  if (!k) return NaN;
  if (k === bk) return toBase(qty, unit);
  const c = (ing.convert || []).find((x) => kindOf(x.unit) === k && x.qty > 0);
  if (c) return (toBase(qty, unit) / toBase(c.qty, c.unit)) * c.base;
  // Sizes also tie pieces to weight: "each" is one of the usual size.
  const usual = usualSize(ing);
  if (usual && usual.g > 0) {
    if (k === 'count') return baseAmount(ing, qty, usual.name);
    if (k === 'mass' && bk === 'count') return toBase(qty, unit) / usual.g;
  }
  return NaN;
}

const BASE_UNIT = { mass: 'g', volume: 'ml', count: 'each' };
/** An amount of a food in the base unit of another kind (g, ml or each). A Large egg is still one egg. */
export function amountAs(ing, qty, unit, kind) {
  if (!ing) return NaN;
  if (kind === 'count' && sizeOf(ing, unit)) return qty;
  if (kindOf(unit) === kind) return toBase(qty, unit);
  const b = baseAmount(ing, qty, unit);
  return kind === kindOf(ing.basis.unit) ? b : b / baseAmount(ing, 1, BASE_UNIT[kind]);
}
/** An amount in the units the food's stock is kept in (base units of its stock unit). */
export function stockAmount(ing, qty, unit) {
  return ing ? amountAs(ing, qty, unit, kindOf(ing.stockUnit) || kindOf(ing.basis.unit)) : NaN;
}

/** Units an ingredient can be measured in right now: its sizes first, then any unit that converts. */
export function unitsFor(ing) {
  return [...(ing.sizes || []).map((s) => s.name), ...UNIT_LIST.filter((u) => Number.isFinite(baseAmount(ing, 1, u)))];
}

/** What 1 cup of a food weighs in grams, or NaN when that isn't known. */
export function cupWeight(ing) {
  return amountAs(ing, 1, 'cup', 'mass');
}
/** What one piece weighs in grams, from the food's own conversions (not its sizes). */
export function pieceWeight(ing) {
  return amountAs({ ...ing, sizes: [] }, 1, 'each', 'mass');
}
/**
 * The food's conversions after saying what 1 cup and one piece weigh in grams.
 * A number sets it, 0 or NaN removes it, undefined leaves it as it is.
 */
export function withMeasures(ing, cup, piece) {
  const bk = kindOf(ing.basis.unit);
  const f = { ...ing, convert: [...(ing.convert || [])] };
  const set = (kind, entry) => { f.convert = f.convert.filter((c) => kindOf(c.unit) !== kind).concat(entry ? [entry] : []); };
  const doCup = () => {
    if (bk === 'volume') { set('mass', cup > 0 ? { unit: 'g', qty: cup, base: toBase(1, 'cup') } : null); return; }
    const b = cup > 0 ? baseAmount(f, cup, 'g') : NaN;
    set('volume', Number.isFinite(b) ? { unit: 'cup', qty: 1, base: b } : null);
  };
  const doPiece = () => {
    if (bk === 'count') { set('mass', piece > 0 ? { unit: 'g', qty: piece, base: 1 } : null); return; }
    const b = piece > 0 ? baseAmount({ ...f, sizes: [] }, piece, 'g') : NaN;
    set('count', Number.isFinite(b) ? { unit: 'each', qty: 1, base: b } : null);
  };
  // Pieces of a counted food need their weight before a cup of them can be weighed, and the other way round.
  const order = bk === 'count' ? [[piece, doPiece], [cup, doCup]] : [[cup, doCup], [piece, doPiece]];
  for (const [v, fn] of order) if (v !== undefined) fn();
  return f.convert;
}
/** Which weight to ask for so a unit works for this food: 'cup', 'piece' or null when it already works. */
export function measureAsk(ing, unit) {
  const k = kindOf(unit);
  if (!ing || !k || Number.isFinite(baseAmount(ing, 1, unit))) return null;
  const weighed = Number.isFinite(baseAmount(ing, 1, 'g'));
  if (k === 'volume') return weighed ? 'cup' : 'piece';
  if (k === 'count') return weighed ? 'piece' : 'cup';
  return kindOf(ing.basis.unit) === 'volume' ? 'cup' : 'piece';
}

/** Where a food starts when it's added to a recipe: the same amount as `like` when that unit works, else one of its usual size, else its nutrition amount. */
export function startAmount(ing, like = null) {
  if (like && like.qty > 0 && Number.isFinite(baseAmount(ing, 1, like.unit))) return { qty: like.qty, unit: like.unit };
  const u = usualSize(ing);
  return u ? { qty: 1, unit: u.name } : { qty: ing.basis.qty, unit: ing.basis.unit };
}

/** A recipe with ingredients swapped for others or left out. `swaps`: { ingredientId: item, or null to leave it out }. */
export function withSwaps(recipe, swaps) {
  if (!recipe || !swaps || !Object.keys(swaps).length) return recipe;
  const items = recipe.items.flatMap((it) => (!(it.ingredientId in swaps) ? [it] : swaps[it.ingredientId] ? [swaps[it.ingredientId]] : []));
  return { ...recipe, items };
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
    const need = stockAmount(ing, item.qty, item.unit) * k;
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
  { value: 1.2, label: 'Sedentary: little or no exercise' },
  { value: 1.375, label: 'Light: 1–3 workouts a week' },
  { value: 1.55, label: 'Moderate: 3–5 workouts a week' },
  { value: 1.725, label: 'Very active: 6–7 workouts a week' },
  { value: 1.9, label: 'Athlete or physical job' },
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
  if ((FRACTION_UNITS.has(unit) || (unit && !kindOf(unit))) && v > 0) {
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
const SIZE_WORDS = new Set(['small', 'medium', 'large', 'extra large', 'jumbo', 'mini', 'xl']);
export function fmtAmount(qty, unit) {
  if (unit === 'each') return fmtNum(qty, unit);
  if (unit && !kindOf(unit)) {
    // A size: "2 large", "3 cloves".
    const word = unit.toLowerCase();
    return `${fmtNum(qty, unit)} ${qty > 1 + 1e-9 && !SIZE_WORDS.has(word) && !/s$/.test(word) ? word + 's' : word}`;
  }
  return `${fmtNum(qty, unit)} ${unit === 'cup' && qty > 1 + 1e-9 ? 'cups' : unit}`;
}
export function fmtInt(v) {
  return isFinite(v) ? Math.round(v).toLocaleString('en-US') : '—';
}
export function fmtWeight(kg, units) {
  return units === 'metric' ? `${(Math.round(kg * 10) / 10).toFixed(1)} kg` : `${(Math.round(kg * LB_PER_KG * 10) / 10).toFixed(1)} lb`;
}
