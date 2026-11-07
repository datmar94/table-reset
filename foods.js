// Nutrition lookup: USDA FoodData Central for plain foods, Open Food Facts for barcodes.
// The parsing functions are pure so the checks can run them on saved sample responses.
import { kindOf, toBase } from './nutrition.js';
import { singular } from './kitchen.js';

const USDA = 'https://api.nal.usda.gov/fdc/v1';
const OFF = 'https://world.openfoodfacts.org/api/v2/product/';
export const DEMO_KEY = 'DEMO_KEY';

const round = (v, dp = 1) => Math.round(v * 10 ** dp) / 10 ** dp;

// ---------- Building an ingredient from per-100 g values ----------

const PORTION_WORDS = {
  cup: 'cup', cups: 'cup', tbsp: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp', tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
  'fl oz': 'fl oz', ml: 'ml', liter: 'l', oz: 'oz', ounce: 'oz', lb: 'lb', pound: 'lb',
  large: 'each', medium: 'each', small: 'each', each: 'each', whole: 'each', piece: 'each', slice: 'each', fruit: 'each',
  egg: 'each', clove: 'each', breast: 'each', fillet: 'each', thigh: 'each', leg: 'each', link: 'each', patty: 'each', item: 'each',
  serving: 'each', container: 'each', can: 'each', bar: 'each', stalk: 'each', head: 'each', bunch: 'each', ear: 'each',
};

/** Which of our units a USDA portion is, e.g. "cup, chopped" → cup, "large" → each. */
export function portionUnit(text) {
  const t = String(text || '').toLowerCase().replace(/[()]/g, ' ').trim();
  if (/^fl\.?\s*oz/.test(t)) return 'fl oz';
  for (const w of t.split(/[\s,]+/)) if (PORTION_WORDS[w]) return PORTION_WORDS[w];
  return null;
}

/**
 * An ingredient's nutrition and unit conversions from per-100 g values and gram weights of portions
 * (`[{unit, qty, grams}]`). `prefer` is the unit the food will be measured in (from a recipe line);
 * when a portion of that kind exists, nutrition is given per 1 of it so the stock reads naturally.
 */
export function buildFood(per100, portions = [], prefer = 'g') {
  const byKind = {};
  for (const p of portions) {
    const k = kindOf(p.unit);
    if (!k || k === 'mass' || !(p.grams > 0) || !(p.qty > 0)) continue;
    // Keep the first of each kind; for counts prefer a medium-size piece.
    if (!byKind[k] || (k === 'count' && p.medium)) byKind[k] = p;
  }
  const want = kindOf(prefer) || 'mass';
  const gramsPerBase = (k) => (k === 'mass' ? 1 : byKind[k] ? byKind[k].grams / toBase(byKind[k].qty, byKind[k].unit) : null);
  const kind = gramsPerBase(want) ? want : 'mass';
  const g = gramsPerBase(kind); // grams in one base unit (1 g, 1 ml or 1 each) of the chosen kind
  const basis = kind === 'mass' ? { qty: 100, unit: 'g' } : kind === 'count' ? { qty: 1, unit: 'each' } : { qty: 1, unit: 'cup' };
  const basisGrams = toBase(basis.qty, basis.unit) * g;
  const per = {};
  for (const k of ['kcal', 'p', 'c', 'f']) per[k] = round(((per100[k] || 0) * basisGrams) / 100, k === 'kcal' ? 0 : 1);
  // Conversions: how many base units of the ingredient's kind one portion of another kind is.
  const convert = [];
  for (const k of ['mass', 'volume', 'count']) {
    if (k === kind) continue;
    const gk = gramsPerBase(k);
    if (!gk) continue;
    const unit = k === 'mass' ? 'g' : k === 'count' ? 'each' : 'ml';
    convert.push({ unit, qty: 1, base: round(gk / g, 4) });
  }
  return { basis, per, convert };
}

// ---------- USDA FoodData Central ----------

const NUM = { '208': 'kcal', '957': 'kcal2', '958': 'kcal3', '203': 'p', '205': 'c', '204': 'f' };

/** One search hit → name, id and nutrition per 100 g. */
export function usdaHit(food) {
  const v = {};
  for (const n of food.foodNutrients || []) {
    const key = NUM[n.nutrientNumber];
    if (key && v[key] == null) v[key] = n.value;
  }
  const kcal = v.kcal ?? v.kcal2 ?? v.kcal3 ?? ((v.p || 0) * 4 + (v.c || 0) * 4 + (v.f || 0) * 9);
  return { id: food.fdcId, name: tidyName(food.description), brand: food.brandOwner || food.brandName || '', per100: { kcal, p: v.p || 0, c: v.c || 0, f: v.f || 0 } };
}

/** USDA portions (cup, tbsp, large…) with gram weights. */
export function usdaPortions(food) {
  const out = [];
  for (const p of food.foodPortions || []) {
    const mu = p.measureUnit && p.measureUnit.name !== 'undetermined' ? p.measureUnit.name : '';
    const text = [mu, p.modifier, p.portionDescription].filter(Boolean).join(' ');
    const unit = portionUnit(text);
    if (unit && p.gramWeight > 0) out.push({ unit, qty: p.amount > 0 ? p.amount : 1, grams: p.gramWeight, medium: /medium/i.test(text) });
  }
  for (const m of food.foodMeasures || []) {
    const unit = portionUnit(m.disseminationText);
    if (unit && m.gramWeight > 0) out.push({ unit, qty: 1, grams: m.gramWeight, medium: /medium/i.test(m.disseminationText) });
  }
  return out;
}

function tidyName(s) {
  const t = String(s || '').trim();
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

async function getJson(url, init) {
  let res;
  try {
    res = await fetch(url, init);
  } catch (e) {
    throw new Error('No connection. Check the internet and try again.');
  }
  if (res.status === 429) throw new Error('limit');
  if (!res.ok) throw new Error(`The food database didn’t answer (${res.status}). Try again in a minute.`);
  return res.json();
}

/** Search plain foods by name. */
// ---------- Matching search results to a food name ----------

export const FILLER = new Set(['chopped', 'diced', 'fresh', 'minced', 'sliced', 'to', 'taste', 'of', 'and', 'or', 'large', 'small', 'medium', 'whole', 'finely', 'roughly', 'halved', 'trimmed', 'cooked', 'raw', 'boneless', 'skinless', 'about', 'plus', 'more', 'for', 'serving', 'divided', 'optional', 'the', 'a', 'into', 'cut', 'pieces', 'peeled', 'ground']);
export const words = (s) => s.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean).map(singular);

// USDA names start with the food itself ("Apples, gala, raw"), sometimes after a class word ("Spices, cinnamon, ground").
const CLASS_WORDS = new Set(['spice', 'oil', 'sugar', 'leavening', 'agent', 'beverage', 'nut', 'seed', 'fish', 'vegetable', 'fruit']);
// Plain, everyday forms win ties; processed or unusual forms lose unless the recipe says so.
const PLAIN = new Set(['raw', 'whole', 'fresh', 'plain', 'granulated', 'purpose', 'table', 'unsalted', 'salted']);
const UNUSUAL = new Set(['babyfood', 'infant', 'dried', 'dehydrated', 'powder', 'sheep', 'goat', 'buffalo', 'canned', 'frozen', 'imitation', 'substitute', 'reduced', 'nonfat', 'lowfat', 'industrial', 'commercial', 'restaurant', 'prepared', 'sweetened', 'sulfured', 'candied', 'fried', 'toasted', 'dessert', 'supplement', 'cooked', 'boiled', 'roasted']);

/** How plainly a search hit is the food asked for: 0 when its name doesn't mention it. */
function hitScore(name, h) {
  const want = words(name).filter((w) => !FILLER.has(w));
  const asked = new Set(words(name));
  const parts = h.name.split(',').map(words);
  const have = new Set(parts.flat());
  const covered = want.filter((w) => have.has(w)).length / Math.max(1, want.length);
  if (!covered) return 0;
  // What the food is: the first part of the name, plus the next one when the first is just a class like "Spices".
  const head = parts[0].every((w) => CLASS_WORDS.has(w)) && parts[1] ? [...parts[0], ...parts[1]] : parts[0];
  const named = head.some((w) => asked.has(w) && !CLASS_WORDS.has(w)) || head.every((w) => asked.has(w));
  const extra = head.filter((w) => !asked.has(w) && !CLASS_WORDS.has(w)).length;
  let score = covered + (named ? 0.4 : 0) - extra * 0.2 - have.size * 0.01;
  for (const w of have) if (!asked.has(w)) score += PLAIN.has(w) ? 0.05 : UNUSUAL.has(w) ? -0.1 : 0;
  return Math.max(score, 0.001);
}

/** Search hits ordered so the plainest form of the food asked for comes first. Hits that don't name it at all go last. */
export function rankHits(name, hits) {
  return hits.map((h, i) => ({ h, i, score: hitScore(name, h) })).sort((a, b) => b.score - a.score || a.i - b.i).map((x) => x.h);
}

/** The search hit that is most plainly the food the recipe asked for, or null when none names it. */
export function bestHit(name, hits) {
  const top = rankHits(name, hits)[0];
  return top && hitScore(name, top) > 0 ? top : null;
}

export async function searchFoods(query, key = DEMO_KEY) {
  const q = encodeURIComponent(query.trim());
  const url = `${USDA}/foods/search?query=${q}&dataType=Foundation,SR%20Legacy&pageSize=25&api_key=${encodeURIComponent(key || DEMO_KEY)}`;
  const json = await getJson(url);
  return (json.foods || []).map(usdaHit);
}

/** Portions for several foods in one request. */
export async function foodPortions(ids, key = DEMO_KEY) {
  if (!ids.length) return {};
  const url = `${USDA}/foods?api_key=${encodeURIComponent(key || DEMO_KEY)}`;
  const json = await getJson(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fdcIds: ids }) });
  const out = {};
  for (const f of json || []) out[f.fdcId] = usdaPortions(f);
  return out;
}

// ---------- Open Food Facts (barcodes) ----------

/** "2 tbsp (32 g)" → { qty: 2, unit: 'tbsp' }; "1 1/2 cups" → 1.5 cup. Null for "1 serving" or plain grams. */
export function servingPortion(text) {
  const m = String(text || '').toLowerCase().match(/^\s*(\d+(?:\.\d+)?)?(?:\s*(\d+)\/(\d+))?\s*([a-z][a-z. ]*)/);
  if (!m) return null;
  const qty = (m[1] ? +m[1] : 0) + (m[2] ? +m[2] / +m[3] : 0);
  const word = m[4].trim();
  if (!(qty > 0) || /^(serving|container|portion|g|gram|ml)\b/.test(word)) return null;
  const unit = portionUnit(word);
  return unit && kindOf(unit) !== 'mass' ? { qty, unit } : null;
}

/**
 * A product → name and an ingredient built from its label. Null when it has no nutrition.
 * Nutrition is given per serving, like the label, when the product lists a serving size; else per 100 g.
 */
export function offProduct(json) {
  const p = json && json.status === 1 ? json.product : null;
  if (!p || !p.nutriments) return null;
  const n = p.nutriments;
  const kcal = n['energy-kcal_100g'] ?? (n.energy_100g != null ? n.energy_100g / 4.184 : null);
  if (kcal == null) return null;
  const liquid = /ml/i.test(p.nutrition_data_per || '') || /^(ml|cl|l)$/i.test(p.product_quantity_unit || '');
  const own = liquid ? 'ml' : 'g';
  const brand = p.brands ? p.brands.split(',')[0].trim() : '';
  const product = String(p.product_name || p.generic_name || '').trim();
  // Skip the brand when the product name already starts with it ("Nutella", not "Nutella Nutella").
  const name = (brand && !product.toLowerCase().startsWith(brand.toLowerCase()) ? `${brand} ${product}` : product || brand).trim() || 'Scanned food';
  const per100 = { kcal, p: n.proteins_100g || 0, c: n.carbohydrates_100g || 0, f: n.fat_100g || 0 };
  const sq = +p.serving_quantity;
  let basis = { qty: 100, unit: own }, per, serving = '', convert = [];
  if (sq > 0) {
    // The label's own per-serving numbers when given, so they match the package exactly.
    const pick = (kServing, v100) => (n[kServing] != null ? +n[kServing] : (v100 * sq) / 100);
    basis = { qty: round(sq), unit: own };
    per = {
      kcal: Math.round(pick('energy-kcal_serving', kcal)),
      p: round(pick('proteins_serving', per100.p)),
      c: round(pick('carbohydrates_serving', per100.c)),
      f: round(pick('fat_serving', per100.f)),
    };
    serving = String(p.serving_size || `${round(sq)} ${own}`).trim();
    // "2 tbsp (32 g)" also lets recipes measure it in tablespoons.
    const portion = servingPortion(serving);
    if (portion) convert.push({ unit: kindOf(portion.unit) === 'count' ? 'each' : 'ml', qty: toBase(portion.qty, portion.unit), base: round(sq, 4) });
  } else {
    per = { kcal: Math.round(kcal), p: round(per100.p), c: round(per100.c), f: round(per100.f) };
  }
  // The package size, from the number field or else the label text ("400 g", "1.5 L", "16 oz").
  let pack = +p.product_quantity > 0 ? { qty: Math.round(+p.product_quantity), unit: own } : null;
  const q = !pack && String(p.quantity || '').toLowerCase().match(/([\d.]+)\s*(kg|g|ml|cl|l|oz|lb|fl oz)\b/);
  if (q) {
    const v = +q[1], u = q[2];
    const conv = { kg: [1000, 'g'], g: [1, 'g'], ml: [1, 'ml'], cl: [10, 'ml'], l: [1000, 'ml'], oz: [28.3495, 'g'], lb: [453.592, 'g'], 'fl oz': [29.5735, 'ml'] }[u];
    if (v > 0 && conv && (conv[1] === 'ml') === liquid) pack = { qty: Math.round(v * conv[0]), unit: conv[1] };
  }
  return { name, basis, per, convert, serving, pack, barcode: p.code || json.code };
}

export async function lookupBarcode(code) {
  const clean = String(code).replace(/\D/g, '');
  if (clean.length < 8) throw new Error('That barcode number looks too short.');
  const fields = 'code,product_name,generic_name,brands,quantity,product_quantity,product_quantity_unit,serving_size,serving_quantity,nutrition_data_per,nutriments';
  const json = await getJson(`${OFF}${clean}.json?fields=${fields}`);
  return offProduct(json);
}
