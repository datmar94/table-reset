// Optional sample household so the app can be explored before entering real data.
import { addDays, dayKey, toBase, LB_PER_KG } from './nutrition.js';
import { emptyData, uid } from './store.js';

const ING = [
  ['chicken', 'Chicken breast, raw', 'Proteins', [100, 'g'], [120, 22.5, 0, 2.6], [2, 'lb'], 0.5, true],
  ['eggs', 'Large eggs', 'Proteins', [1, 'each'], [72, 6.3, 0.4, 4.8], [3, 'each'], 4, true],
  ['turkey', 'Ground turkey, 93% lean', 'Proteins', [4, 'oz'], [170, 21, 0, 9], [1, 'lb'], 0.5, false],
  ['yogurt', 'Greek yogurt, nonfat', 'Dairy', [170, 'g'], [100, 17, 6, 0.7], [32, 'oz'], 8, false],
  ['feta', 'Feta cheese', 'Dairy', [1, 'oz'], [75, 4, 1.2, 6], [0, 'oz'], 2, false],
  ['rice', 'Brown rice, cooked', 'Grains & starches', [1, 'cup'], [248, 5.5, 52, 2], [6, 'cup'], 2, true],
  ['oats', 'Rolled oats', 'Grains & starches', [0.5, 'cup'], [150, 5, 27, 3], [6, 'cup'], 1.5, true],
  ['potato', 'Sweet potatoes', 'Produce', [1, 'each'], [112, 2, 26, 0.1], [3, 'each'], 1, false],
  ['broccoli', 'Broccoli, chopped', 'Produce', [1, 'cup'], [31, 2.6, 6, 0.3], [4, 'cup'], 1, false],
  ['spinach', 'Baby spinach', 'Produce', [1, 'cup'], [7, 0.9, 1.1, 0.1], [0, 'cup'], 1, true],
  ['berries', 'Blueberries', 'Produce', [0.5, 'cup'], [42, 0.5, 10.7, 0.2], [0.5, 'cup'], 1, false],
  ['pepper', 'Bell peppers', 'Produce', [1, 'each'], [24, 0.8, 5.6, 0.2], [2, 'each'], 1, false],
  ['oil', 'Olive oil', 'Pantry', [1, 'tbsp'], [119, 0, 0, 13.5], [16, 'fl oz'], 4, true],
  ['honey', 'Honey', 'Pantry', [1, 'tsp'], [21, 0, 5.8, 0], [1, 'cup'], 0.25, false],
];

const RECIPES = [
  ['bowl', 'Chicken, rice & broccoli bowl', 2, 25, ['lunch', 'dinner'],
    [['chicken', 300, 'g'], ['rice', 2, 'cup'], ['broccoli', 2, 'cup'], ['oil', 2, 'tsp']],
    ['Cook the brown rice following the package directions.', 'Season the chicken and sear 6–7 min per side until it reaches 165°F inside.', 'Steam the broccoli 4–5 min.', 'Slice the chicken, split everything between bowls and drizzle with oil.']],
  ['sheet', 'Chicken & sweet potato sheet pan', 2, 35, ['dinner'],
    [['chicken', 300, 'g'], ['potato', 2, 'each'], ['broccoli', 2, 'cup'], ['oil', 2, 'tsp']],
    ['Heat the oven to 425°F. Cube the sweet potatoes and chicken.', 'Toss everything with the oil and seasoning on one sheet pan.', 'Roast 25 min, adding the broccoli for the last 10.']],
  ['oats', 'Overnight oats & Greek yogurt', 1, 5, ['breakfast'],
    [['oats', 0.5, 'cup'], ['yogurt', 170, 'g'], ['berries', 0.5, 'cup'], ['honey', 1, 'tsp']],
    ['Stir the oats into the yogurt with a splash of water.', 'Top with blueberries and honey.', 'Cover and chill overnight.']],
  ['ybowl', 'Greek yogurt berry bowl', 1, 5, ['snack'],
    [['yogurt', 170, 'g'], ['berries', 0.5, 'cup'], ['oats', 0.25, 'cup']],
    ['Spoon the yogurt into a bowl.', 'Top with blueberries and oats.']],
  ['skillet', 'Turkey & sweet potato skillet', 4, 30, ['dinner'],
    [['turkey', 1, 'lb'], ['potato', 4, 'each'], ['oil', 4, 'tsp'], ['spinach', 4, 'cup']],
    ['Brown the turkey in the oil, breaking it up.', 'Add diced sweet potato and a splash of water; cover for 12 min.', 'Stir in the spinach until wilted.']],
  ['scramble', 'Veggie egg scramble', 1, 10, ['breakfast'],
    [['eggs', 3, 'each'], ['pepper', 0.5, 'each'], ['broccoli', 0.5, 'cup'], ['feta', 1, 'oz']],
    ['Sauté the pepper and broccoli 3 min.', 'Add the beaten eggs and stir gently until set.', 'Crumble the feta on top.']],
];

const MEMBERS = [
  { key: 'alex', name: 'Alex', sex: 'male', age: 34, heightCm: 180.3, activity: 1.55, goal: 'lose', paceLb: 1, goalLb: 185, units: 'imperial', color: '#DCE6FB',
    weightsLb: [216, 214.8, 213.6, 212.9, 211.4, 210.6, 210.0], mult: 1.5 },
  { key: 'sam', name: 'Sam', sex: 'female', age: 32, heightCm: 165.1, activity: 1.375, goal: 'maintain', paceLb: 0.5, goalLb: 0, units: 'metric', color: '#FBE3CF',
    weightsKg: [68.3, 68.1, 68.4, 68.0, 68.2, 67.9, 68.0], mult: 1 },
  { key: 'dan', name: 'Dan', sex: 'male', age: 61, heightCm: 175.3, activity: 1.2, goal: 'lose', paceLb: 0.5, goalLb: 175, units: 'imperial', color: '#E6DDF7',
    weightsLb: [189, 188.2, 187.5, 187, 186.1, 185.6, 185], mult: 1 },
  { key: 'jake', name: 'Jake', sex: 'male', age: 19, heightCm: 182.9, activity: 1.725, goal: 'gain', paceLb: 0.5, goalLb: 170, units: 'imperial', color: '#D6F0E0',
    weightsLb: [154, 155.1, 156, 157.2, 158, 159.1, 160], mult: 2 },
];

// Today's plan per member: [slot, recipe, servings, eaten]
const TODAY = {
  alex: [['breakfast', 'oats', 1, true], ['lunch', 'bowl', 1.5, true], ['dinner', 'skillet', 2, false], ['snack', 'scramble', 1, false]],
  sam: [['breakfast', 'ybowl', 1, true], ['lunch', 'bowl', 1, true], ['dinner', 'skillet', 1, false]],
  dan: [['breakfast', 'scramble', 1, true], ['lunch', 'sheet', 1, true], ['dinner', 'skillet', 1, false]],
  jake: [['breakfast', 'oats', 2, true], ['lunch', 'bowl', 2, true], ['dinner', 'skillet', 2, false], ['snack', 'ybowl', 2, false]],
};
const SKIP_DAYS = { sam: [3], jake: [2, 5] };

export function sampleData(today = dayKey()) {
  const data = emptyData();
  const ids = {};
  for (const [key, name, category, basis, per, stock, lowAt, staple] of ING) {
    ids[key] = uid();
    data.ingredients.push({
      id: ids[key], name, category,
      basis: { qty: basis[0], unit: basis[1] },
      per: { kcal: per[0], p: per[1], c: per[2], f: per[3] },
      stock: toBase(stock[0], stock[1]), stockUnit: stock[1], lowAt, staple, source: 'USDA FoodData Central',
    });
  }
  const rid = {};
  for (const [key, name, servings, minutes, meals, items, steps] of RECIPES) {
    rid[key] = uid();
    data.recipes.push({
      id: rid[key], name, servings, minutes, meals, steps, source: 'manual',
      items: items.map(([ing, qty, unit]) => ({ ingredientId: ids[ing], qty, unit })),
    });
  }
  for (const m of MEMBERS) {
    const id = uid();
    const kgs = m.weightsKg || m.weightsLb.map((lb) => lb / LB_PER_KG);
    data.members.push({
      id, name: m.name, sex: m.sex, age: m.age, heightCm: m.heightCm, activity: m.activity, goal: m.goal,
      paceKg: m.paceLb / LB_PER_KG, goalWeightKg: m.goalLb ? m.goalLb / LB_PER_KG : 0, units: m.units, color: m.color, custom: null,
      weights: kgs.map((kg, i) => ({ date: addDays(today, (i - (kgs.length - 1)) * 7), kg: Math.round(kg * 100) / 100 })),
    });
    for (const [slot, r, servings, eaten] of TODAY[m.key]) {
      data.entries.push({ id: uid(), date: today, memberId: id, slot, kind: 'recipe', recipeId: rid[r], servings, eaten });
    }
    for (let d = 1; d <= 6; d++) {
      if ((SKIP_DAYS[m.key] || []).includes(d)) continue;
      const date = addDays(today, -d);
      const dinner = d % 2 ? 'sheet' : 'skillet';
      for (const [slot, r, k] of [['breakfast', d % 3 ? 'oats' : 'scramble', 1], ['lunch', 'bowl', 1], ['dinner', dinner, 1.5], ['snack', 'ybowl', 1]]) {
        data.entries.push({ id: uid(), date, memberId: id, slot, kind: 'recipe', recipeId: rid[r], servings: k * m.mult, eaten: true });
      }
    }
  }
  return data;
}
