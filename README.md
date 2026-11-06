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
| Recipes | Search and filter; recipe detail with macros per serving, stock before and after cooking, **Cook** (updates stock, with undo), log a serving and add to plan in a bar that stays at the bottom. **Add recipe** offers *Import* (paste an ingredient list; lines not in your food become new foods with nutrition looked up) or *Type it in yourself*. **Add missing to shopping list** |
| Suggested | Saved recipes you can make now or are one ingredient short of, filtered by what each member has left today, high protein, under 20 minutes, dinner |
| Ingredients | Stock amounts with − / +, low and out status, staples. **Look up nutrition** (USDA FoodData Central) or **Scan** a barcode (Open Food Facts); scanning a known product adds a package to stock |
| Progress | Every member's day: calories ring, macro bars, weight trend, log weight; a 7-day summary |
| Member profile | Targets from the Mifflin-St Jeor formula, updated as you type; lose / maintain / gain with pace and goal date; units per member; your own targets if you prefer |
| Settings | Gear button at the top of every phone screen (Settings in the tablet's side rail). Appearance (Auto / Day / Night, per device), household members, units for new members, backup download and restore, sample data, erase |

## Food lookups

Nutrition lookup uses the USDA FoodData Central API. Without a key it uses the shared `DEMO_KEY`, which allows only a few lookups an hour; a free personal key from api.data.gov/signup goes in **Settings › Food database**. Barcodes use Open Food Facts, which needs no key.

## Where data lives

Everything is saved in the browser on each device (`localStorage`). Household data and the device's appearance setting are kept separately, so sync can share the first and not the second. Use **Settings › Download a backup file** to keep a copy or move data between devices until sync exists.

## Not built yet

- Sync between phone and tablet (needs an online database and sign-in)
- Hosting at a web address, so the phone can install it (needs HTTPS)
- Importing a recipe straight from a web link (needs a small server, comes with sync)

## Code layout

- `js/nutrition.js`: pure math (units, targets, recipe totals, stock, dates, formatting)
- `js/store.js`: saved data and device settings
- `js/app.js`: shared screen state, navigation, toasts, sheets, selectors
- `js/ui.js`: escaped HTML templates, icons and shared pieces
- `js/views/*.js`: one file per screen, each with its routes, actions, fields and sheets
- `js/main.js`: router, rendering and event wiring
- `js/foods.js`: USDA and Open Food Facts lookups, and turning their numbers into an ingredient
- `js/scan.js`: camera barcode scanner (Chrome's built-in barcode reader), with typing the number as a fallback
- `sw.js`, `manifest.webmanifest`, `icons/`: install and offline support
