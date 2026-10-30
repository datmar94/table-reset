// Checks for the math that everything else relies on. Open tests/index.html to run them.
import { addDays, fmtNum, goalDate, macroSplit, nutrientsFor, recipeNutrition, stockNeeds, stockStatus, targets, toBase, weekStart, LB_PER_KG } from '../js/nutrition.js';
import { parseLine, matchIngredient } from '../js/views/recipeEdit.js';
import { sampleData } from '../js/seed.js';
import { byId } from '../js/store.js';

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

const out = document.getElementById('out');
const failed = results.filter((r) => !r[1]);
out.innerHTML = `<h1>${failed.length ? `${failed.length} failed` : 'All passed'} (${results.length} checks)</h1><ul>${results.map(([n, ok, msg]) => `<li style="color:${ok ? 'green' : 'crimson'}">${ok ? 'PASS' : 'FAIL'} ${n}${msg ? ' — ' + msg : ''}</li>`).join('')}</ul>`;
window.testResults = { total: results.length, failed: failed.map((r) => `${r[0]}: ${r[2]}`) };
