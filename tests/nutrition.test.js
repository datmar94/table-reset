// Checks for the math that everything else relies on. Open tests/index.html to run them.
import { addDays, fmtNum, goalDate, macroSplit, nutrientsFor, recipeNutrition, stockNeeds, stockStatus, targets, toBase, weekStart, LB_PER_KG } from '../js/nutrition.js';
import { parseLine, matchIngredient, bestHit, newFood } from '../js/views/recipeEdit.js';
import { buildFood, offProduct, portionUnit, servingPortion, usdaHit, usdaPortions } from '../js/foods.js';
import { baseAmount, unitsFor } from '../js/nutrition.js';
import { sampleData } from '../js/seed.js';
import { byId } from '../js/store.js';
import { shoppingRows } from '../js/views/shopping.js';
import { applyDocs, changesSince, combine, dataFrom, itemsOf } from '../js/sync.js';

const results = [];
function test(name, fn) {
  try { fn(); results.push([name, true, '']); } catch (e) { results.push([name, false, e.message]); }
}
function eq(actual, expected, msg = '') {
  if (actual !== expected) throw new Error(`${msg} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function near(actual, expected, tol, msg = '') {
  if (!(Math.abs(actual - expected) <= tol)) throw new Error(`${msg} expected ${expected} ± ${tol}, got ${actual}`);
}

const alex = { sex: 'male', age: 34, heightCm: 180.34, activity: 1.55, goal: 'lose', paceKg: 1 / LB_PER_KG, goalWeightKg: 185 / LB_PER_KG, weights: [{ date: '2026-10-26', kg: 210 / LB_PER_KG }] };

test('Mifflin-St Jeor matches the mockup numbers for Alex', () => {
  const t = targets(alex);
  near(t.bmr, 1915, 1, 'BMR');
  near(t.tdee, 2968, 1, 'maintenance');
  eq(t.kcal, 2470, 'target');
  eq(t.p, 190, 'protein');
  eq(t.f, 69, 'fat');
  eq(t.c, 272, 'carbs');
});
test('Women use the -161 constant and maintain uses 30% fat', () => {
  const t = targets({ sex: 'female', age: 32, heightCm: 165.1, activity: 1.375, goal: 'maintain', weights: [{ date: '2026-10-26', kg: 68 }] });
  near(t.bmr, 1391, 1, 'BMR');
  eq(t.kcal, 1910, 'target');
  eq(t.f, Math.round((1910 * 0.3) / 9), 'fat');
});
test('Targets never drop below the safe minimum', () => {
  const t = targets({ sex: 'female', age: 70, heightCm: 150, activity: 1.2, goal: 'lose', paceKg: 2 / LB_PER_KG, weights: [{ date: '2026-10-26', kg: 50 }] });
  eq(t.kcal, 1200);
  eq(t.floored, true);
});
test('Own targets override the formula', () => {
  const t = targets({ ...alex, custom: { kcal: 2000, p: 160, c: 200, f: 60 } });
  eq(t.kcal, 2000);
  eq(t.custom, true);
});
test('Incomplete profiles have no targets', () => eq(targets({ sex: 'male', age: 30, heightCm: 0, weights: [] }), null));
test('Goal date: 25 lb at 1 lb/week from Oct 26 2026 is Apr 19 2027', () => {
  const g = goalDate(alex, new Date(2026, 9, 26));
  eq(g.date.toDateString(), new Date(2027, 3, 19).toDateString());
});

test('Units convert within a kind and refuse across kinds', () => {
  const chicken = { basis: { qty: 100, unit: 'g' }, per: { kcal: 120, p: 22.5, c: 0, f: 2.6 } };
  near(nutrientsFor(chicken, 1, 'lb').kcal, 544.3, 0.1);
  eq(nutrientsFor(chicken, 1, 'cup'), null);
});
test('Recipe totals and per-serving numbers', () => {
  const d = sampleData('2026-10-26');
  const ing = byId(d.ingredients);
  const bowl = d.recipes.find((r) => r.name.startsWith('Chicken, rice'));
  const n = recipeNutrition(bowl, ing);
  near(n.perServing.kcal, 499, 1, 'kcal per serving');
  near(n.perServing.p, 42, 0.5, 'protein per serving');
  eq(n.missing.length, 0);
});
test('Stock needs and shortfalls', () => {
  const d = sampleData('2026-10-26');
  const ing = byId(d.ingredients);
  const skillet = d.recipes.find((r) => r.name.startsWith('Turkey'));
  const one = stockNeeds(skillet, 1, ing).filter((x) => x.short).map((x) => x.ing.name);
  eq(one.join(), 'Baby spinach', 'one serving');
  const four = stockNeeds(skillet, 4, ing).filter((x) => x.short).map((x) => x.ing.name).sort();
  eq(four.join(), 'Baby spinach,Sweet potatoes', 'four servings');
});
test('Stock status: out, low, on hand', () => {
  const base = { stockUnit: 'each', lowAt: 4 };
  eq(stockStatus({ ...base, stock: 0 }), 'out');
  eq(stockStatus({ ...base, stock: 3 }), 'low');
  eq(stockStatus({ ...base, stock: 6 }), 'on');
  eq(stockStatus({ stockUnit: 'lb', lowAt: 0.5, stock: toBase(2, 'lb') }), 'on');
});
test('Macro split adds up to 100', () => {
  const s = macroSplit({ kcal: 500, p: 42, c: 58, f: 11 });
  eq(s.p + s.c + s.f, 100);
  eq(s.p, 34);
});
test('Dates: weeks start on Monday', () => {
  eq(weekStart('2026-10-28'), '2026-10-26');
  eq(weekStart('2026-11-01'), '2026-10-26');
  eq(addDays('2026-10-31', 1), '2026-11-01');
});
test('Amounts show kitchen fractions', () => {
  eq(fmtNum(0.5, 'cup'), '½');
  eq(fmtNum(1.5, 'cup'), '1½');
  eq(fmtNum(2, 'cup'), '2');
  eq(fmtNum(0.33, 'cup'), '⅓');
  eq(fmtNum(453.6, 'g'), '454');
});
test('Ingredient lines are parsed', () => {
  const a = parseLine('1½ lb salmon fillets');
  eq(a.qty, 1.5); eq(a.unit, 'lb'); eq(a.name, 'salmon fillets');
  const b = parseLine('- 2 tbsp olive oil, divided');
  eq(b.qty, 2); eq(b.unit, 'tbsp'); eq(b.name, 'olive oil');
  const c = parseLine('1/2 cup rolled oats');
  eq(c.qty, 0.5); eq(c.unit, 'cup');
  const d = parseLine('3 large eggs');
  eq(d.qty, 3); eq(d.unit, null);
});
test('Lines match the right ingredient', () => {
  const ings = sampleData('2026-10-26').ingredients;
  eq(matchIngredient('olive oil', ings).name, 'Olive oil');
  eq(matchIngredient('large eggs, beaten', ings).name, 'Large eggs');
  eq(matchIngredient('chopped broccoli florets', ings).name, 'Broccoli, chopped');
  eq(matchIngredient('salmon fillets', ings), null);
});

test('Looked-up foods convert between cups, grams and pieces', () => {
  const flour = buildFood({ kcal: 364, p: 10.3, c: 76.3, f: 0.98 }, [{ unit: 'cup', qty: 1, grams: 125 }], 'cup');
  eq(flour.basis.unit, 'cup');
  eq(flour.per.kcal, 455, 'kcal per cup');
  near(nutrientsFor(flour, 100, 'g').kcal, 364, 0.5, '100 g');
  near(nutrientsFor(flour, 0.5, 'cup').kcal, 227.5, 0.01, 'half a cup');
  const egg = buildFood({ kcal: 143, p: 12.6, c: 0.7, f: 9.5 }, [{ unit: 'each', qty: 1, grams: 50 }], 'each');
  eq(egg.basis.unit, 'each');
  near(nutrientsFor(egg, 100, 'g').kcal, 143, 1, 'two eggs by weight');
  const plain = buildFood({ kcal: 120, p: 20, c: 0, f: 4 }, [], 'cup');
  eq(plain.basis.unit, 'g', 'no cup weight known, stays per 100 g');
  eq(nutrientsFor(plain, 1, 'cup'), null);
  eq(unitsFor(flour).includes('g'), true);
  near(baseAmount(flour, 125, 'g'), 236.588, 0.01, '125 g of flour is a cup');
});
test('USDA results and portions are read', () => {
  const hit = usdaHit({ fdcId: 1, description: 'CHICKEN, BREAST, RAW', foodNutrients: [{ nutrientNumber: '957', value: 120 }, { nutrientNumber: '203', value: 22.5 }, { nutrientNumber: '204', value: 2.6 }] });
  eq(hit.name, 'Chicken, breast, raw'); eq(hit.per100.kcal, 120); eq(hit.per100.p, 22.5); eq(hit.per100.c, 0);
  const ps = usdaPortions({ foodPortions: [
    { amount: 1, modifier: 'tablespoon', measureUnit: { name: 'undetermined' }, gramWeight: 14 },
    { amount: 1, measureUnit: { name: 'cup' }, modifier: 'chopped', gramWeight: 140 },
    { amount: 1, modifier: 'large', measureUnit: { name: 'undetermined' }, gramWeight: 50 },
    { amount: 1, modifier: 'serving (4 oz)', measureUnit: { name: 'undetermined' }, gramWeight: 0 },
  ] });
  eq(ps.map((p) => p.unit).join(','), 'tbsp,cup,each');
  eq(portionUnit('fl oz'), 'fl oz'); eq(portionUnit('cup, sliced'), 'cup'); eq(portionUnit('oz'), 'oz'); eq(portionUnit('dash'), null);
});
test('Barcode products are read from Open Food Facts', () => {
  const p = offProduct({ status: 1, code: '3017624010701', product: { brands: 'Ferrero', product_name: 'Nutella', product_quantity: 400, product_quantity_unit: 'g', nutrition_data_per: '100g', nutriments: { 'energy-kcal_100g': 539, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9 } } });
  eq(p.name, 'Ferrero Nutella'); eq(p.per.kcal, 539); eq(p.basis.unit, 'g'); eq(p.pack.qty, 400); eq(p.barcode, '3017624010701');
  eq(offProduct({ status: 0 }), null);
  const milk = offProduct({ status: 1, product: { product_name: 'Milk', product_quantity: 1000, product_quantity_unit: 'ml', nutriments: { 'energy-kcal_100g': 64 } } });
  eq(milk.basis.unit, 'ml'); eq(milk.pack.unit, 'ml');
  eq(offProduct({ status: 1, product: { product_name: 'Oats', quantity: '18 oz', nutriments: { 'energy-kcal_100g': 379 } } }).pack.qty, 510, 'size from the label text');
});
test('Scanned foods use the label’s serving size', () => {
  // US Nutella, as Open Food Facts returns it: the label is per 37 g serving.
  const p = offProduct({ status: 1, product: { product_name: 'Nutella', serving_size: '2 tbsp (37 g)', serving_quantity: 37, nutrition_data_per: '100g', nutriments: { 'energy-kcal_100g': 540, proteins_100g: 5.41, carbohydrates_100g: 59.46, fat_100g: 29.73, 'energy-kcal_serving': 200, proteins_serving: 2, carbohydrates_serving: 22, fat_serving: 11 } } });
  eq(p.basis.qty, 37); eq(p.basis.unit, 'g'); eq(p.per.kcal, 200); eq(p.per.p, 2); eq(p.per.c, 22); eq(p.per.f, 11); eq(p.serving, '2 tbsp (37 g)');
  near(nutrientsFor({ ...p, id: 'n' }, 2, 'tbsp').kcal, 200, 1, '2 tbsp is one serving');
  // No per-serving numbers: worked out from per 100 g.
  const c = offProduct({ status: 1, product: { product_name: 'Cereal', serving_size: '39g', serving_quantity: 39, nutriments: { 'energy-kcal_100g': 359, proteins_100g: 12.8 } } });
  eq(c.per.kcal, 140); eq(c.per.p, 5); eq(c.convert.length, 0);
  eq(servingPortion('1 1/2 cups (45 g)').qty, 1.5); eq(servingPortion('1 bar (40g)').unit, 'each'); eq(servingPortion('1 serving (37 g)'), null);
});
test('Import keeps lines that aren’t in Ingredients', () => {
  const none = newFood({ name: 'Saffron', qty: 1, unit: 'tsp' }, null);
  eq(none.needsNutrition, true); eq(none.basis.unit, 'cup'); eq(none.stockUnit, 'tsp'); eq(none.stock, 0); eq(none.unitOk, true);
  const found = newFood({ name: 'Eggs', qty: 3, unit: 'each' }, { ...buildFood({ kcal: 143, p: 12.6, c: 0.7, f: 9.5 }, [{ unit: 'each', qty: 1, grams: 50 }], 'each'), source: 'USDA: Egg' });
  eq(found.needsNutrition, false); eq(found.stockUnit, 'each'); eq(found.per.kcal, 72);
  const pick = bestHit('chicken breast', [{ name: 'Lunchmeat, chicken breast, sliced' }, { name: 'Chicken, broilers or fryers, breast, meat only, raw' }]);
  eq(pick.name, 'Chicken, broilers or fryers, breast, meat only, raw');
  eq(bestHit('saffron', [{ name: 'Beef, ground' }]), null);
});
test('Recipes using cups of a food stocked in grams take the right amount', () => {
  const flour = { id: 'f', basis: { qty: 100, unit: 'g' }, per: { kcal: 364, p: 10, c: 76, f: 1 }, convert: [{ unit: 'ml', qty: 1, base: 125 / 236.588 }], stock: 500, stockUnit: 'g' };
  const [x] = stockNeeds({ servings: 2, items: [{ ingredientId: 'f', qty: 2, unit: 'cup' }] }, 2, { f: flour });
  near(x.need, 250, 0.01, 'grams needed'); eq(x.short, false);
  const [y] = stockNeeds({ servings: 1, items: [{ ingredientId: 'f', qty: 2, unit: 'each' }] }, 1, { f: flour });
  eq(y.short, true, 'no way to convert pieces');
});
test('Shopping list: planned meals, staples and packages', () => {
  const d = {
    ingredients: [
      { id: 't', name: 'Turkey', basis: { qty: 100, unit: 'g' }, per: { kcal: 150 }, stock: 200, stockUnit: 'g', pack: { qty: 454, unit: 'g' } },
      { id: 'e', name: 'Eggs', basis: { qty: 1, unit: 'each' }, per: { kcal: 72 }, stock: 3, stockUnit: 'each', staple: true, lowAt: 4 },
      { id: 's', name: 'Spinach', basis: { qty: 1, unit: 'cup' }, per: { kcal: 7 }, stock: 0, stockUnit: 'cup', staple: true, lowAt: 0 },
      { id: 'o', name: 'Oats', basis: { qty: 100, unit: 'g' }, per: { kcal: 379 }, stock: 1000, stockUnit: 'g' },
    ],
    recipes: [{ id: 'r', name: 'Skillet', servings: 2, items: [{ ingredientId: 't', qty: 500, unit: 'g' }] }],
    entries: [
      { date: '2026-11-05', kind: 'recipe', recipeId: 'r', servings: 2, eaten: false },
      { date: '2026-11-05', kind: 'recipe', recipeId: 'r', servings: 2, eaten: true },
      { date: '2026-11-20', kind: 'recipe', recipeId: 'r', servings: 2, eaten: false },
    ],
    shopping: [{ id: 'x', ingredientId: 'o', base: 250, recipeId: null }],
  };
  const rows = shoppingRows(d, '2026-11-05');
  eq(rows.map((r) => r.ing.name).join(','), 'Eggs,Oats,Spinach,Turkey', 'only planned, low, out and added foods');
  const by = Object.fromEntries(rows.map((r) => [r.ing.id, r]));
  eq(by.t.packs, 1, 'short 300 g rounds up to one 454 g pack'); eq(by.t.buy, 454);
  eq(by.e.buy, 5, 'a low staple is brought back to twice its low mark');
  eq(by.s.buy, null, 'nothing to go on: the app asks');
  eq(by.o.buy, 250); eq(by.o.reasons[0], 'added by you');
});

test('Sync sends only changed records and merges other devices’ changes', () => {
  const d = { version: 1, updatedAt: 5, settings: { defaultUnits: 'imperial' }, members: [{ id: 'm1', name: 'Alex' }], ingredients: [{ id: 'i1', name: 'Oats' }, { id: 'i2', name: 'Eggs' }], recipes: [], entries: [], shopping: [] };
  const first = changesSince(d, {}, 'tab');
  eq(first.map((x) => x.key).sort().join(','), '_~settings,ingredients~i1,ingredients~i2,members~m1', 'everything once, never version or updatedAt');
  const known = Object.fromEntries(first.map((x) => [x.key, x.h]));
  eq(changesSince(d, known, 'tab').length, 0, 'nothing new to send');
  // The phone builds the same data from the records.
  const docs = first.map((x) => ({ ...x, t: { s: 1, n: 0 } }));
  const phone = dataFrom(docs);
  eq(phone.ingredients.map((x) => x.name).join(','), 'Oats,Eggs', 'order kept');
  eq(phone.settings.defaultUnits, 'imperial');
  // One edit and one delete on the tablet: two records.
  const d2 = JSON.parse(JSON.stringify(d));
  d2.ingredients[0].name = 'Rolled oats';
  d2.ingredients.splice(1, 1);
  const two = changesSince(d2, known, 'tab');
  eq(two.map((x) => `${x.key}${x.del ? ' deleted' : ''}`).sort().join(','), 'ingredients~i1,ingredients~i2 deleted');
  // The phone applies them; a record the phone changed and hasn't sent yet keeps the phone's version.
  const phoneKnown = { ...known };
  phone.members[0].name = 'Alex B';
  const back = applyDocs(phone, [...two, { key: 'members~m1', c: 'members', k: 'm1', o: 0, v: JSON.stringify({ id: 'm1', name: 'Alex T' }) }, { key: 'recipes~r1', c: 'recipes', k: 'r1', o: 0, v: JSON.stringify({ id: 'r1', name: 'Oatmeal' }) }], phoneKnown);
  eq(back.data.ingredients.map((x) => x.name).join(','), 'Rolled oats');
  eq(back.data.members[0].name, 'Alex B', 'unsent change on this device wins');
  eq(back.data.recipes[0].name, 'Oatmeal', 'new record added');
  eq(back.applied.includes('members~m1'), false);
  // Combining keeps this device's records and adds the synced ones it doesn't have.
  const mine = { ...d, ingredients: [{ id: 'i9', name: 'Rice' }, { id: 'i1', name: 'My oats' }] };
  const both = combine(mine, docs);
  eq(both.ingredients.map((x) => x.name).join(','), 'Rice,My oats,Eggs');
  eq(Object.keys(itemsOf(both)).length, 5);
});

const out = document.getElementById('out');
const failed = results.filter((r) => !r[1]);
out.innerHTML = `<h1>${failed.length ? `${failed.length} failed` : 'All passed'} (${results.length} checks)</h1><ul>${results.map(([n, ok, msg]) => `<li style="color:${ok ? 'green' : 'crimson'}">${ok ? 'PASS' : 'FAIL'} ${n}${msg ? ' — ' + msg : ''}</li>`).join('')}</ul>`;
window.testResults = { total: results.length, failed: failed.map((r) => `${r[0]}: ${r[2]}`) };
