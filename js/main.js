import { getDevice, subscribe, saveFailed } from './store.js';
import { ui, setRenderer, closeSheet, refresh } from './app.js';
import { html, icon } from './ui.js';
import { planView } from './views/plan.js';
import { recipesView } from './views/recipes.js';
import { recipeEditView } from './views/recipeEdit.js';
import { suggestedView } from './views/suggested.js';
import { ingredientsView } from './views/ingredients.js';
import { progressView } from './views/progress.js';
import { membersView } from './views/members.js';
import { settingsView } from './views/settings.js';
import { shoppingView, shoppingCount } from './views/shopping.js';

const VIEWS = [planView, recipesView, recipeEditView, suggestedView, ingredientsView, progressView, membersView, settingsView, shoppingView];
const routes = Object.assign({}, ...VIEWS.map((v) => v.routes));
const actions = Object.assign({}, ...VIEWS.map((v) => v.actions));
const fields = Object.assign({}, ...VIEWS.map((v) => v.fields));
const sheets = Object.assign({}, ...VIEWS.map((v) => v.sheets));

const TABS = [
  ['plan', 'Meal plan', '#/plan', ['plan']],
  ['recipes', 'Recipes', '#/recipes', ['recipes', 'recipeEdit', 'recipeImport']],
  ['suggest', 'Suggested', '#/suggested', ['suggested']],
  ['pantry', 'Ingredients', '#/ingredients', ['ingredients', 'ingredient']],
  ['progress', 'Progress', '#/progress', ['progress', 'member', 'settings']],
];

function parseRoute(hash) {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [a, b, c] = parts;
  if (a === 'recipes') {
    if (b === 'new') return { name: 'recipeEdit', params: { id: 'new' } };
    if (b === 'import') return { name: 'recipeImport', params: {} };
    if (b && c === 'edit') return { name: 'recipeEdit', params: { id: b } };
    return { name: 'recipes', params: { id: b || null } };
  }
  if (a === 'ingredients') return b ? { name: 'ingredient', params: { id: b } } : { name: 'ingredients', params: {} };
  if (a === 'members' && b) return { name: 'member', params: { id: b } };
  if (a && routes[a]) return { name: a, params: {} };
  return { name: 'plan', params: {} };
}

// Screens with their own Save bar: on a phone the tabs step aside so the form gets the room.
const EDITING = ['recipeEdit', 'recipeImport', 'ingredient', 'member'];

function countBadge(n) {
  return n ? html`<span class="count" aria-hidden="true">${n > 99 ? '99+' : n}</span>` : '';
}

function nav(route, shopN) {
  const here = (names) => (names.includes(route.name) ? html` aria-current="page"` : '');
  return html`<nav class="nav" aria-label="Main">${TABS.map(([key, label, href, names]) => html`<a href="${href}"${here(names)}><span class="pill">${icon(key, 22, 1.9)}</span><span>${label}</span></a>`)}
<div class="rail-extra"><a href="#/shopping"${here(['shopping'])} aria-label="Shopping list${shopN ? `, ${shopN} items` : ''}"><span class="pill">${icon('cart', 22, 1.9)}${countBadge(shopN)}</span><span>Shopping</span></a>
<a href="#/settings"${here(['settings'])}><span class="pill">${icon('gear', 22, 1.9)}</span><span>Settings</span></a></div></nav>`;
}

/** Phone only: the app name, the shopping list and settings, above every main screen. */
function appBar(route, shopN) {
  if (EDITING.includes(route.name) || route.name === 'settings') return '';
  return html`<header class="appbar"><span class="brand">Table Reset</span>
<a class="icon-btn bare" href="#/shopping"${route.name === 'shopping' ? html` aria-current="page"` : ''} aria-label="Shopping list${shopN ? `, ${shopN} items` : ''}">${icon('cart', 22, 1.9)}${countBadge(shopN)}</a>
<a class="icon-btn bare" href="#/settings" aria-label="Settings">${icon('gear', 22, 1.9)}</a></header>`;
}

function sheetHtml() {
  if (!ui.sheet) return '';
  const body = sheets[ui.sheet.type] ? sheets[ui.sheet.type](ui.sheet) : '';
  return html`<div class="scrim" data-scrim><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">${body}</div></div>`;
}

function toastHtml() {
  if (!ui.toast) return '';
  return html`<div class="toast" role="status"><span>${ui.toast.msg}</span>${ui.toast.undo ? html`<button type="button" class="btn" data-action="toast-undo">Undo</button>` : ''}</div>`;
}

function applyTheme() {
  const mode = getDevice().appearance || 'auto';
  document.documentElement.dataset.theme = mode;
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  let meta = document.querySelector('meta[name="theme-color"]:not([media])');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = bg || '#F6F3EA';
}

const root = document.getElementById('app');
let lastSheetType = null;

function render() {
  applyTheme();
  const active = document.activeElement;
  const key = active && active.dataset ? active.dataset.key : null;
  let sel = null;
  try { sel = key && active.selectionStart != null ? [active.selectionStart, active.selectionEnd] : null; } catch (e) { sel = null; }
  const view = routes[ui.route.name] || routes.plan;
  const shopN = shoppingCount();
  root.innerHTML = String(html`<div class="app${EDITING.includes(ui.route.name) ? ' editing' : ''}">${nav(ui.route, shopN)}<div class="page">${appBar(ui.route, shopN)}${view(ui.route.params)}</div></div>${sheetHtml()}${toastHtml()}${saveFailed ? html`<p class="notice warn" role="alert" style="position:fixed;top:8px;left:8px;right:8px;z-index:70">This device couldn’t save your last change. Free up storage, or download a backup in Settings.</p>` : ''}`);
  if (key) {
    const el = root.querySelector(`[data-key="${CSS.escape(key)}"]`);
    if (el) {
      el.focus({ preventScroll: true });
      if (sel) { try { el.setSelectionRange(sel[0], sel[1]); } catch (e) { /* number inputs can't select */ } }
    }
  } else if (ui.sheet && ui.sheet.type !== lastSheetType) {
    const first = root.querySelector('.sheet [autofocus], .sheet button, .sheet a, .sheet input');
    if (first) first.focus();
  }
  lastSheetType = ui.sheet ? ui.sheet.type : null;
}

function onRoute() {
  const next = parseRoute(location.hash);
  const prev = ui.route;
  if (prev) VIEWS.forEach((v) => v.onLeave && v.onLeave(prev, next));
  ui.route = next;
  ui.sheet = null;
  render();
  // On a tablet the recipe list stays put while the detail changes; everywhere else start at the top.
  const same = prev && prev.name === 'recipes' && next.name === 'recipes' && window.matchMedia('(min-width: 1000px)').matches;
  if (!same) window.scrollTo(0, 0);
}

root.addEventListener('click', (e) => {
  if (e.target.matches && e.target.matches('[data-scrim]')) { closeSheet(); return; }
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const name = el.dataset.action;
  if (name === 'close-sheet') { closeSheet(); return; }
  if (name === 'go-back') { if (history.length > 1) history.back(); else location.hash = '#/plan'; return; }
  if (name === 'toast-undo') {
    const undo = ui.toast && ui.toast.undo;
    ui.toast = null;
    if (undo) undo(); else refresh();
    return;
  }
  const fn = actions[name];
  if (fn) {
    if (el.tagName !== 'A') e.preventDefault();
    fn({ ds: el.dataset, el, ev: e });
  }
});

function onField(e) {
  const el = e.target.closest('[data-field]');
  if (!el) return;
  const isText = el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['file', 'checkbox', 'radio'].includes(el.type));
  if (e.type === 'input' && !isText) return;
  if (e.type === 'change' && isText) return;
  const fn = fields[el.dataset.field];
  if (fn && fn(el.value, el.dataset, el)) render();
}
root.addEventListener('input', onField);
root.addEventListener('change', onField);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ui.sheet) closeSheet(); });

setRenderer(render);
subscribe(render);
window.addEventListener('hashchange', onRoute);
if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render);
onRoute();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
