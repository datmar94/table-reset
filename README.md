# Table Reset

A web app for planning meals, tracking calories and macros, and keeping the pantry stocked for a whole household. It is built for Samsung phones (bottom tabs) and tablets in landscape (side rail), in Black & Gold with Day, Night and Auto appearance.

There is no build step and nothing to install: plain HTML, CSS and JavaScript modules.

## Run it on this Mac

```bash
python3 -m http.server 8765 --bind 127.0.0.1 --directory "/Users/datskiy/Documents/Claude/meal-macros"
```

Then open http://localhost:8765 in Chrome. On first open, choose **Explore with a sample household** or **Add the first member**.

## Checks

Open http://localhost:8765/tests/ while the server is running. It runs the checks for the calorie formula, unit conversion, recipe totals, stock math, dates and recipe-list parsing.

## What's in it

| Tab | What it does |
| --- | --- |
| Meal plan | Week view per member, meals by slot, log as eaten, log a single food, copy the day before, day totals vs targets with calories, protein, carbs and fat still to plan. Tap a meal's circle to log it as eaten |
| Shopping list | Cart button at the top of every phone screen (Shopping in the tablet's side rail). Foods short for meals planned in the next 7 days, low or out staples, and items added by hand or from recipes, grouped by store section and rounded up to whole packages. Tapping the circle adds the amount to stock (with undo) |
| Recipes | Search and filter; recipe detail with macros per serving, stock before and after cooking, **Cook** (updates stock, with undo), log a serving and add to plan in a bar that stays at the bottom. **Add recipe** offers *Import* (paste an ingredient list; lines not in your food become new foods with nutrition looked up) or *Type it in yourself*. **Add missing to shopping list**. **Swap** an ingredient for this time (or leave it out); saved swap options, like pizza toppings, show as one-tap choices. The numbers, cooking, logging and planning all use the swap. In the editor every unit is offered; when a food can't be measured that way yet, the row asks what 1 cup or one piece weighs and saves it with the food |
| Suggested | Saved recipes you can make now or are one ingredient short of, filtered by what each member has left today, high protein, under 20 minutes, dinner |
| Ingredients | Foods in groups (Meat & seafood, Eggs & dairy, Vegetables…) that open on tap; searching or filtering opens every group with a match. The group is guessed from the name and can be changed. Stock amounts with − / +, low and out status, staples. **Look up nutrition** (USDA FoodData Central) or **Scan** a barcode (Open Food Facts); scanning a known product adds a package to stock. **Sizes and measures**: what 1 cup and one piece weigh (so recipes and stock can use cups, spoons or pieces), and named sizes like Small / Large / Jumbo eggs with their weights, with typical USDA weights offered for eggs, onions, potatoes and a few other foods |
| Progress | Every member's day: calories ring, macro bars, weight trend, log weight; a 7-day summary |
| Member profile | Targets from the Mifflin-St Jeor formula, updated as you type; lose / maintain / gain with pace and goal date; units per member; your own targets if you prefer |
| Settings | Gear button at the top of every phone screen (Settings in the tablet's side rail). Sync (sign in with Google), appearance (Auto / Day / Night, per device), household members, units for new members, backup download and restore, sample data, erase |

## Food lookups

Nutrition lookup uses the USDA FoodData Central API. Without a key it uses the shared `DEMO_KEY`, which allows only a few lookups an hour; a free personal key from api.data.gov/signup goes in **Settings › Food database**. Barcodes use Open Food Facts, which needs no key.

## Where data lives

Everything is saved in the browser on each device (`localStorage`), so the app works offline. With **Settings › Sync** turned on, `js/sync.js` also copies household data to Firebase Firestore (project `table-reset`) and listens for changes from the other devices. The device's appearance setting never syncs.

- Each member, food, recipe, meal and shopping item is its own document under `households/home/items`, so edits on two devices merge item by item. If both devices change the same item before syncing, the change that hasn't been sent yet wins.
- Sign-in is Google through Firebase Authentication. The Firestore rules only let the household's listed Gmail addresses read or write; add an address there to let a new person in.
- The Firebase web config in `js/sync.js` isn't a secret. The rules are what protect the data.

**Settings › Download a backup file** still works for keeping a copy.

## Not built yet

- Importing a recipe straight from a web link (needs a small server)

## Code layout

- `js/nutrition.js`: pure math (units, sizes and conversions, swaps, targets, recipe totals, stock, dates, formatting)
- `js/kitchen.js`: food groups, guessing a food's group from its name, typical piece sizes
- `js/store.js`: saved data and device settings
- `js/sync.js`: Firebase sign-in and record-by-record sync
- `js/app.js`: shared screen state, navigation, toasts, sheets, selectors
- `js/ui.js`: escaped HTML templates, icons and shared pieces
- `js/views/*.js`: one file per screen, each with its routes, actions, fields and sheets
- `js/main.js`: router, rendering and event wiring
- `js/foods.js`: USDA and Open Food Facts lookups, and turning their numbers into an ingredient
- `js/scan.js`: camera barcode scanner (Chrome's built-in barcode reader), with typing the number as a fallback
- `sw.js`, `manifest.webmanifest`, `icons/`: install and offline support
