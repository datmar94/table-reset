// Kitchen know-how: the food groups, a best guess at a food's group from its name, and typical piece sizes.

export const CATEGORIES = [
  'Meat & seafood', 'Eggs & dairy', 'Vegetables', 'Fruit', 'Bread, grains & pasta', 'Beans, nuts & seeds',
  'Oils, sauces & condiments', 'Spices & seasonings', 'Baking & sweeteners', 'Canned & jarred', 'Frozen', 'Snacks', 'Drinks', 'Other',
];
// Groups from before 2026-11, and where their foods go when the name doesn't say.
const OLD = { Proteins: 'Meat & seafood', Dairy: 'Eggs & dairy', 'Grains & starches': 'Bread, grains & pasta', Produce: 'Vegetables', Pantry: 'Oils, sauces & condiments' };

// Checked first: phrases whose last word would point to the wrong group.
const PHRASES = [
  ['Frozen', /\bfrozen\b|\bice cream/],
  ['Canned & jarred', /\bcanned\b|\bbroth\b|\b(chicken|beef|vegetable|bone) stock\b|tomato (sauce|paste)|(crushed|diced) tomato|coconut milk|\bpickle/],
  ['Spices & seasonings', /(garlic|onion|chili|chilli|curry|chipotle) powder|black pepper|pepper flake|\bseasoning\b|\bspices?\b/],
  ['Vegetables', /sweet potato|bell pepper|green bean|snap pea|green onion|spring onion|bok choy/],
  ['Beans, nuts & seeds', /(peanut|almond|cashew) butter/],
  ['Oils, sauces & condiments', /(soy|hot|fish|bbq|barbecue|pizza|pasta|marinara) sauce|\bmayo/],
  ['Baking & sweeteners', /baking (soda|powder)|chocolate chip|maple syrup/],
  ['Eggs & dairy', /cream cheese|sour cream|heavy cream|half and half|cottage cheese/],
];
const WORDS = {
  'Meat & seafood': 'chicken beef steak pork bacon ham sausage turkey lamb veal salmon tuna cod tilapia halibut shrimp prawn fish crab lobster scallop sardine anchovy meat brisket chorizo pepperoni salami prosciutto mince jerky meatball',
  'Eggs & dairy': 'egg milk cheese cheddar mozzarella parmesan feta ricotta provolone yogurt yoghurt butter cream kefir ghee',
  Vegetables: 'broccoli spinach kale lettuce carrot onion garlic potato tomato cucumber zucchini squash pepper celery cabbage cauliflower mushroom pea corn asparagus eggplant beet radish leek shallot arugula jalapeno ginger artichoke okra pumpkin sprout greens',
  Fruit: 'apple banana orange lemon lime berry blueberry strawberry raspberry blackberry grape mango pineapple peach pear plum cherry kiwi melon watermelon avocado fig raisin cranberry pomegranate apricot',
  'Bread, grains & pasta': 'bread rice pasta spaghetti noodle oat oatmeal quinoa tortilla bagel bun roll couscous barley cereal granola cracker pita naan macaroni penne lasagna dough crust',
  'Beans, nuts & seeds': 'bean lentil chickpea peanut almond walnut cashew pecan pistachio hazelnut nut seed chia flax sesame sunflower tofu tempeh edamame hummus',
  'Oils, sauces & condiments': 'oil sauce ketchup mustard mayonnaise dressing vinegar salsa pesto relish sriracha',
  'Spices & seasonings': 'salt cumin paprika oregano basil thyme rosemary cinnamon nutmeg turmeric parsley cilantro dill sage cayenne coriander',
  'Baking & sweeteners': 'flour sugar honey syrup yeast vanilla chocolate cocoa cornstarch stevia molasses',
  Snacks: 'chip cookie candy popcorn pretzel',
  Drinks: 'juice coffee tea soda water wine beer kombucha',
};
const BY_WORD = {};
for (const [cat, list] of Object.entries(WORDS)) for (const w of list.split(' ')) BY_WORD[w] = cat;

/** "apples" → "apple", "tomatoes" → "tomato", "cherries" → "cherry". */
export function singular(w) {
  if (/ies$/.test(w)) return w.slice(0, -3) + 'y';
  if (/(oes|ches|shes|sses|xes)$/.test(w)) return w.slice(0, -2);
  if (/[^s]s$/.test(w) && w.length > 3) return w.slice(0, -1);
  return w;
}

/** The food group a name points to, or null. The last word usually names the food ("almond milk" is milk). */
export function guessCategory(name) {
  const s = String(name || '').toLowerCase();
  for (const [cat, re] of PHRASES) if (re.test(s)) return cat;
  for (const part of s.split(',')) {
    const words = part.replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean).map(singular).reverse();
    for (const w of words) if (BY_WORD[w]) return BY_WORD[w];
  }
  return null;
}

/** The group to show a food under. */
export function categoryOf(ing) {
  const c = ing && ing.category;
  if (CATEGORIES.includes(c)) return c;
  return guessCategory(ing && ing.name) || OLD[c] || 'Other';
}

/** One-time move to the newer groups: foods in an old group or in "Other" get the group their name points to. */
export function migrateCategories(d) {
  if (d.settings.groups >= 2) return false;
  for (const ing of d.ingredients) if (!CATEGORIES.includes(ing.category) || ing.category === 'Other') ing.category = categoryOf({ ...ing, category: OLD[ing.category] ? ing.category : undefined });
  d.settings.groups = 2;
  return true;
}

// Typical raw weights of one piece, from USDA FoodData Central. People change them when theirs differ.
const SIZE_PRESETS = [
  [/\beggs?\b/, 'egg', [['Small', 38], ['Medium', 44], ['Large', 50, true], ['Extra large', 56], ['Jumbo', 63]]],
  [/\bonions?\b/, 'onion', [['Small', 70], ['Medium', 110, true], ['Large', 150]]],
  [/(?<!sweet )\bpotato/, 'potato', [['Small', 170], ['Medium', 213, true], ['Large', 369]]],
  [/\btomato(es)?\b/, 'tomato', [['Small', 91], ['Medium', 123, true], ['Large', 182]]],
  [/\bbell peppers?\b|\b(red|green|yellow|orange) peppers?\b/, 'pepper', [['Small', 74], ['Medium', 119, true], ['Large', 164]]],
  [/\bcarrots?\b/, 'carrot', [['Small', 50], ['Medium', 61, true], ['Large', 72]]],
  [/\bapples?\b/, 'apple', [['Small', 149], ['Medium', 182, true], ['Large', 223]]],
  [/\bbananas?\b/, 'banana', [['Small', 101], ['Medium', 118, true], ['Large', 136]]],
  [/\bgarlic\b(?! powder)/, 'garlic', [['Clove', 3, true]]],
];

/** Typical sizes for a food, by name: { label: 'egg', sizes: [{name, g, usual}] }, or null. */
export function sizePreset(name) {
  const s = String(name || '').toLowerCase();
  const hit = SIZE_PRESETS.find(([re]) => re.test(s));
  return hit ? { label: hit[1], sizes: hit[2].map(([n, g, usual]) => ({ name: n, g, usual: !!usual })) } : null;
}
