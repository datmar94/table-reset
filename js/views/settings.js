import { getData, getDevice, update, updateDevice, replaceData, emptyData } from '../store.js';
import { ui, openSheet, closeSheet, toast } from '../app.js';
import { dayKey } from '../nutrition.js';
import { html, icon, avatar, seg } from '../ui.js';
import { sampleData } from '../seed.js';
import { sync, syncOn, signIn, signOutSync, retrySync, offerChoice, chooseData, preloadSync } from '../sync.js';

const MODES = [
  ['auto', 'Auto', 'Day normally, Night when this device is in dark mode', '#F6F3EA', '#0F0F10', '#C9A23F'],
  ['day', 'Day', 'Ivory and gold, all the time', '#F6F3EA', '#F6F3EA', '#141414'],
  ['night', 'Night', 'Black and gold, all the time', '#0F0F10', '#0F0F10', '#D4AF37'],
];

function swatch(left, right, dot) {
  return html`<svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true"><rect x="0.5" y="0.5" width="21.5" height="43" rx="10" fill="${left}"></rect><rect x="22" y="0.5" width="21.5" height="43" rx="10" fill="${right}"></rect><rect x="0.5" y="0.5" width="43" height="43" rx="12" fill="none" stroke="#8C8778"></rect><circle cx="22" cy="22" r="7" fill="${dot}"></circle></svg>`;
}

function syncStatus() {
  if (!navigator.onLine) return 'Offline. Changes are saved on this device and sync when it’s back online.';
  if (sync.status === 'syncing' || sync.status === 'loading') return 'Syncing…';
  const at = sync.lastAt && Date.now() - sync.lastAt > 60000 ? ` · ${new Date(sync.lastAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ' · just now';
  return `Up to date${sync.lastAt ? at : ''}. Changes show up on your other devices in a few seconds.`;
}

function syncCard() {
  const s = sync;
  const badge = s.status === 'error' ? html`<span class="badge warn">Stopped</span>` : s.user && s.status !== 'choose' ? html`<span class="badge ok">On</span>` : html`<span class="badge muted">Off</span>`;
  const error = s.error ? html`<p class="notice warn">${s.error}</p>` : '';
  if (s.status === 'choose') {
    return html`<section class="card" aria-labelledby="sync-h"><div class="spread"><h2 id="sync-h">Sync</h2>${badge}</div>
<p>Signed in as <strong>${s.user.email}</strong>. Choose what to keep to finish turning sync on.</p>
<div class="row"><button type="button" class="btn primary" data-action="sync-choose">Choose what to keep</button><button type="button" class="btn plain" data-action="sync-sign-out">Cancel</button></div></section>`;
  }
  if (!s.user || (s.status === 'error' && !syncOn())) {
    return html`<section class="card" aria-labelledby="sync-h"><div class="spread"><h2 id="sync-h">Sync</h2>${badge}</div>
<p>Keep your phone and tablet showing the same members, food, recipes, meals and shopping list. Sign in with Google on each device.</p>
${error}
<button type="button" class="btn primary" data-action="sync-sign-in"${s.status === 'loading' ? html` disabled` : ''}>${s.status === 'loading' ? 'Signing in…' : 'Sign in with Google'}</button>
<p class="tiny muted">Start on the device that has the data you want to keep. Appearance stays separate on each device.</p></section>`;
  }
  return html`<section class="card" aria-labelledby="sync-h"><div class="spread"><h2 id="sync-h">Sync</h2>${badge}</div>
<p>Signed in as <strong>${s.user.email}</strong>.</p>
${s.status === 'error' ? html`${error}<button type="button" class="btn primary" data-action="sync-retry">Try again</button>` : html`<p class="small muted" role="status">${syncStatus()}</p>`}
<button type="button" class="btn plain" data-action="sync-sign-out">Turn off sync on this device</button>
<p class="tiny muted">Turning it off keeps everything on this device. It just stops sharing changes.</p></section>`;
}

function choiceSheet(sheet) {
  const n = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
  const line = (c) => `${n(c.members, 'member')}, ${n(c.ingredients, 'ingredient')}, ${n(c.recipes, 'recipe')}, ${n(c.entries, 'planned or logged meal')}`;
  return html`<h2 id="sheet-title">This account already has synced data</h2>
<p class="small"><strong>Synced:</strong> ${line(sheet.theirs)}.<br><strong>This device:</strong> ${line(sheet.mine)}.</p>
<button type="button" class="btn primary lg" data-action="sync-use">Use the synced data</button>
<p class="tiny muted" style="margin-top:-6px">Replaces what’s on this device. Pick this when your other device has the data you want.</p>
<button type="button" class="btn plain lg" data-action="sync-combine">Combine both</button>
<p class="tiny muted" style="margin-top:-6px">Keeps everything from both. Food or recipes you added on both devices will show up twice.</p>
<button type="button" class="btn ghost" data-action="close-sheet">Not now</button>`;
}

function render() {
  setTimeout(preloadSync, 0);
  const d = getData();
  const dev = getDevice();
  return html`<main class="main" id="main">
<div class="topbar"><button type="button" class="icon-btn bare lg" data-action="go-back" aria-label="Back">${icon('back', 24)}</button><h1>Settings</h1></div>
<div class="cols"><div class="col-main stack">
${syncCard()}
<section class="card" aria-labelledby="appearance-h"><h2 id="appearance-h">Appearance</h2>
<div class="stack" role="radiogroup" aria-labelledby="appearance-h" style="gap:8px">${MODES.map(([id, label, desc, l, r, dot]) => html`<button type="button" class="choice" role="radio" aria-checked="${dev.appearance === id ? 'true' : 'false'}" data-action="set-appearance" data-value="${id}">${swatch(l, r, dot)}<span class="tx" style="flex:1"><strong>${label}</strong><span>${desc}</span></span>${dev.appearance === id ? icon('check', 22, 2.6) : ''}</button>`)}</div>
<p class="small muted">Each device keeps its own choice.</p></section>
<section class="card" aria-labelledby="units-h"><h2 id="units-h">Units for new members</h2>
${seg([['imperial', 'lb · ft/in'], ['metric', 'kg · cm']], d.settings.defaultUnits, 'set-default-units', ' aria-labelledby="units-h"')}
<p class="small muted">Each member can still switch in their own profile.</p></section>
<section class="card"><h2>Install on this device</h2>
<p>Open the app in Chrome, tap the menu (three dots), then <strong>Add to Home screen</strong> or <strong>Install app</strong>. It then opens full screen like any other app, and works without internet.</p></section>
<section class="card" aria-labelledby="food-h"><h2 id="food-h">Food database</h2>
<p class="small">“Look up nutrition” uses the free USDA food database. Without a key of your own, everyone shares a demo key that only allows a few lookups an hour.</p>
<p class="small">To get your own free key: open <strong>api.data.gov/signup</strong>, enter your name and email, and the key arrives by email. Paste it here.</p>
<label class="field">Your USDA key<input class="input" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" data-field="food-key" data-key="food-key" value="${d.settings.foodKey || ''}" placeholder="Using the shared demo key"></label>
<p class="tiny muted">Barcode lookups use Open Food Facts, which needs no key.</p></section>
</div>
<div class="col-side stack">
<section class="card tight" aria-labelledby="members-h"><h2 id="members-h">Household members</h2>
${d.members.length ? d.members.map((m) => html`<a class="link-row" href="#/members/${m.id}" style="border-bottom:1px solid var(--line-soft)">${avatar(m, 36)}<span style="flex:1"><span class="bold" style="display:block">${m.name}</span><span class="tiny muted">${m.goal === 'maintain' ? 'Maintain' : m.goal === 'lose' ? 'Lose weight' : 'Gain weight'} · ${m.units === 'metric' ? 'kg' : 'lb'}</span></span>${icon('chevron', 18)}</a>`) : html`<p class="muted small">No members yet.</p>`}
<a class="btn ghost" href="#/members/new" style="justify-content:flex-start">${icon('plus', 18, 2.2)}Add member</a></section>
<section class="card"><h2>Your data</h2>
<button type="button" class="btn plain" data-action="export-data">${icon('copy', 18)}Download a backup file</button>
<label class="btn plain" style="position:relative">Restore from a backup file<input type="file" accept="application/json,.json" data-field="import-file" class="sr-only"></label>
<button type="button" class="btn plain" data-action="ask-sample">Load the sample household</button>
<button type="button" class="btn danger" data-action="ask-erase">${icon('trash', 18)}${syncOn() ? 'Erase everything' : 'Erase everything on this device'}</button>
</section></div></div>
</main>`;
}

function confirmSheet(sheet) {
  const where = syncOn() ? 'on this device and your other synced devices' : 'on this device';
  const copy = {
    sample: ['Load the sample household?', `This replaces everything ${where} with sample members, food and recipes.`, 'Load sample'],
    erase: ['Erase everything?', `This deletes all members, ingredients, recipes and logs ${where}. Download a backup first if you might want them back.`, 'Erase'],
    restore: ['Restore this backup?', `This replaces everything ${where} with the backup from ${sheet.when || 'that file'}.`, 'Restore'],
  }[sheet.kind];
  return html`<h2 id="sheet-title">${copy[0]}</h2><p>${copy[1]}</p>
<div class="row"><button type="button" class="btn plain lg" data-action="close-sheet" style="flex:1">Cancel</button><button type="button" class="btn primary lg" data-action="confirm-data" style="flex:1">${copy[2]}</button></div>`;
}

export const settingsView = {
  routes: { settings: render },
  actions: {
    'set-appearance': ({ ds }) => updateDevice({ appearance: ds.value }),
    'set-default-units': ({ ds }) => update((d) => { d.settings.defaultUnits = ds.value; }),
    'export-data': () => {
      const blob = new Blob([JSON.stringify(getData(), null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `table-reset-backup-${dayKey()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
    'sync-sign-in': () => signIn(),
    'sync-sign-out': () => signOutSync(),
    'sync-retry': () => retrySync(),
    'sync-choose': () => offerChoice(),
    'sync-use': () => chooseData('remote'),
    'sync-combine': () => chooseData('combine'),
    'ask-sample': () => openSheet({ type: 'confirm-data', kind: 'sample' }),
    'ask-erase': () => openSheet({ type: 'confirm-data', kind: 'erase' }),
    'confirm-data': () => {
      const s = ui.sheet;
      try {
        if (s.kind === 'sample') replaceData(sampleData());
        if (s.kind === 'erase') replaceData(emptyData());
        if (s.kind === 'restore') replaceData(s.data);
        ui.memberId = null;
        ui.drafts = {};
        closeSheet();
        toast(s.kind === 'erase' ? 'Everything on this device was erased.' : s.kind === 'sample' ? 'Sample household loaded.' : 'Backup restored.');
      } catch (e) {
        closeSheet();
        toast(e.message);
      }
    },
  },
  fields: {
    'food-key': (v) => update((d) => { d.settings.foodKey = v.trim(); }),
    'import-file': (_v, _ds, el) => {
      const file = el.files && el.files[0];
      if (!file) return;
      file.text().then((text) => {
        let data;
        try { data = JSON.parse(text); } catch (e) { toast('That file isn’t a Table Reset backup.'); return; }
        if (!data || data.version !== 1) { toast('That file isn’t a Table Reset backup.'); return; }
        const when = data.updatedAt ? new Date(data.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
        openSheet({ type: 'confirm-data', kind: 'restore', data, when });
      });
      el.value = '';
    },
  },
  sheets: { 'confirm-data': confirmSheet, 'sync-choice': choiceSheet },
};
