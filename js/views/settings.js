import { getData, getDevice, update, updateDevice, replaceData, emptyData } from '../store.js';
import { ui, openSheet, closeSheet, toast } from '../app.js';
import { dayKey } from '../nutrition.js';
import { html, icon, avatar, seg } from '../ui.js';
import { sampleData } from '../seed.js';

const MODES = [
  ['auto', 'Auto', 'Day normally, Night when this device is in dark mode', '#F6F3EA', '#0F0F10', '#C9A23F'],
  ['day', 'Day', 'Ivory and gold, all the time', '#F6F3EA', '#F6F3EA', '#141414'],
  ['night', 'Night', 'Black and gold, all the time', '#0F0F10', '#0F0F10', '#D4AF37'],
];

function swatch(left, right, dot) {
  return html`<svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true"><rect x="0.5" y="0.5" width="21.5" height="43" rx="10" fill="${left}"></rect><rect x="22" y="0.5" width="21.5" height="43" rx="10" fill="${right}"></rect><rect x="0.5" y="0.5" width="43" height="43" rx="12" fill="none" stroke="#8C8778"></rect><circle cx="22" cy="22" r="7" fill="${dot}"></circle></svg>`;
}

function render() {
  const d = getData();
  const dev = getDevice();
  return html`<main class="main" id="main">
<div class="topbar"><a class="icon-btn bare lg" href="#/progress" aria-label="Back to Progress">${icon('back', 24)}</a><h1>Settings</h1></div>
<div class="cols"><div class="col-main stack">
<section class="card" aria-labelledby="appearance-h"><h2 id="appearance-h">Appearance</h2>
<div class="stack" role="radiogroup" aria-labelledby="appearance-h" style="gap:8px">${MODES.map(([id, label, desc, l, r, dot]) => html`<button type="button" class="choice" role="radio" aria-checked="${dev.appearance === id ? 'true' : 'false'}" data-action="set-appearance" data-value="${id}">${swatch(l, r, dot)}<span class="tx" style="flex:1"><strong>${label}</strong><span>${desc}</span></span>${dev.appearance === id ? icon('check', 22, 2.6) : ''}</button>`)}</div>
<p class="small muted">Each device keeps its own choice.</p></section>
<section class="card" aria-labelledby="units-h"><h2 id="units-h">Units for new members</h2>
${seg([['imperial', 'lb · ft/in'], ['metric', 'kg · cm']], d.settings.defaultUnits, 'set-default-units', ' aria-labelledby="units-h"')}
<p class="small muted">Each member can still switch in their own profile.</p></section>
<section class="card"><h2>Install on this device</h2>
<p>Open the app in Chrome, tap the menu (three dots), then <strong>Add to Home screen</strong> or <strong>Install app</strong>. It then opens full screen like any other app, and works without internet.</p></section>
<section class="card"><div class="spread"><h2>Sync</h2><span class="badge muted">Not set up yet</span></div>
<p>Right now everything is saved on this device only. Syncing your phone and tablet is the next step to build. Until then you can move data with a backup file below.</p></section>
</div>
<div class="col-side stack">
<section class="card tight" aria-labelledby="members-h"><h2 id="members-h">Household members</h2>
${d.members.length ? d.members.map((m) => html`<a class="link-row" href="#/members/${m.id}" style="border-bottom:1px solid var(--line-soft)">${avatar(m, 36)}<span style="flex:1"><span class="bold" style="display:block">${m.name}</span><span class="tiny muted">${m.goal === 'maintain' ? 'Maintain' : m.goal === 'lose' ? 'Lose weight' : 'Gain weight'} · ${m.units === 'metric' ? 'kg' : 'lb'}</span></span>${icon('chevron', 18)}</a>`) : html`<p class="muted small">No members yet.</p>`}
<a class="btn ghost" href="#/members/new" style="justify-content:flex-start">${icon('plus', 18, 2.2)}Add member</a></section>
<section class="card"><h2>Your data</h2>
<button type="button" class="btn plain" data-action="export-data">${icon('copy', 18)}Download a backup file</button>
<label class="btn plain" style="position:relative">Restore from a backup file<input type="file" accept="application/json,.json" data-field="import-file" class="sr-only"></label>
<button type="button" class="btn plain" data-action="ask-sample">Load the sample household</button>
<button type="button" class="btn danger" data-action="ask-erase">${icon('trash', 18)}Erase everything on this device</button>
</section></div></div>
</main>`;
}

function confirmSheet(sheet) {
  const copy = {
    sample: ['Load the sample household?', 'This replaces everything saved on this device with sample members, food and recipes.', 'Load sample'],
    erase: ['Erase everything?', 'This deletes all members, ingredients, recipes and logs on this device. Download a backup first if you might want them back.', 'Erase'],
    restore: ['Restore this backup?', `This replaces everything on this device with the backup from ${sheet.when || 'that file'}.`, 'Restore'],
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
  sheets: { 'confirm-data': confirmSheet },
};
