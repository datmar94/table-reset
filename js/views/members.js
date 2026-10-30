import { getData, update, uid } from '../store.js';
import { ui, go, openSheet, closeSheet, toast, refresh } from '../app.js';
import { ACTIVITY, currentWeightKg, dayKey, fmtInt, goalDate, LB_PER_KG, targets } from '../nutrition.js';
import { html, icon, avatar, seg, pressed } from '../ui.js';

const PACE = { imperial: [0.5, 1, 1.5, 2], metric: [0.25, 0.5, 0.75, 1] };
const COLORS = ['#DCE6FB', '#FBE3CF', '#E6DDF7', '#D6F0E0', '#F6E3A8', '#F8D6DD'];
const r1 = (v) => (Math.round(v * 10) / 10).toString();

function draftFor(id) {
  const key = 'member:' + (id || 'new');
  if (ui.drafts[key]) return ui.drafts[key];
  const d = getData();
  const m = id ? d.members.find((x) => x.id === id) : null;
  const units = m ? m.units : d.settings.defaultUnits || 'imperial';
  const imp = units === 'imperial';
  const kg = m ? currentWeightKg(m) : 0;
  const inches = m ? Math.round(m.heightCm / 2.54) : 0;
  const paceUnit = (m ? m.paceKg : 0.4536) * (imp ? LB_PER_KG : 1);
  const paces = PACE[units];
  let pace = 1;
  paces.forEach((p, i) => { if (Math.abs(p - paceUnit) < Math.abs(paces[pace] - paceUnit)) pace = i; });
  const t = m && m.custom ? m.custom : null;
  ui.drafts[key] = {
    id: m ? m.id : null, name: m ? m.name : '', units, sex: m ? m.sex : 'male', age: m ? String(m.age) : '',
    wt: kg ? r1(imp ? kg * LB_PER_KG : kg) : '', ft: inches ? String(Math.floor(inches / 12)) : '', inch: inches ? String(inches % 12) : '',
    cm: m ? String(Math.round(m.heightCm)) : '', activity: String(m ? m.activity : 1.375), goal: m ? m.goal : 'maintain', pace,
    goalWt: m && m.goalWeightKg ? r1(imp ? m.goalWeightKg * LB_PER_KG : m.goalWeightKg) : '',
    customOn: !!t, ck: t ? String(t.kcal) : '', cp: t ? String(t.p) : '', cc: t ? String(t.c) : '', cf: t ? String(t.f) : '',
    color: m ? m.color : COLORS[d.members.length % COLORS.length], error: null,
  };
  return ui.drafts[key];
}

/** Turn the form into a member (metric inside). */
function fromDraft(dr, base) {
  const imp = dr.units === 'imperial';
  const wt = parseFloat(dr.wt), goalWt = parseFloat(dr.goalWt);
  const heightCm = imp ? ((parseFloat(dr.ft) || 0) * 12 + (parseFloat(dr.inch) || 0)) * 2.54 : parseFloat(dr.cm);
  const kg = imp ? wt / LB_PER_KG : wt;
  const paceKg = PACE[dr.units][dr.pace] / (imp ? LB_PER_KG : 1);
  const today = dayKey();
  // A changed weight is recorded as today's weigh-in; an unchanged one leaves the history alone.
  let weights = base ? [...(base.weights || [])] : [];
  const prev = base ? currentWeightKg(base) : 0;
  if (kg > 0 && (!weights.length || Math.abs(prev - kg) > 0.04)) {
    weights = weights.filter((w) => w.date !== today).concat([{ date: today, kg: Math.round(kg * 100) / 100 }]);
  }
  const custom = dr.customOn ? { kcal: +dr.ck || 0, p: +dr.cp || 0, c: +dr.cc || 0, f: +dr.cf || 0 } : null;
  return {
    ...(base || {}), id: base ? base.id : null, name: dr.name.trim(), units: dr.units, sex: dr.sex, age: parseFloat(dr.age),
    heightCm, activity: parseFloat(dr.activity), goal: dr.goal, paceKg, goalWeightKg: goalWt > 0 ? (imp ? goalWt / LB_PER_KG : goalWt) : 0,
    weights, weightKg: kg, color: dr.color, custom,
  };
}

function numberField(label, field, value, step = '1') {
  return html`<label class="field">${label}<input class="input" type="number" inputmode="decimal" step="${step}" data-field="${field}" data-key="${field}" value="${value}"></label>`;
}

function render(params) {
  const id = params.id === 'new' ? null : params.id;
  const d = getData();
  if (id && !d.members.find((x) => x.id === id)) return html`<main class="main" id="main"><p class="empty">That member was removed. <a href="#/progress">Back to Progress</a></p></main>`;
  const dr = draftFor(id);
  const imp = dr.units === 'imperial';
  const base = id ? d.members.find((x) => x.id === id) : null;
  const preview = fromDraft(dr, base);
  const t = targets({ ...preview, custom: null });
  const shown = targets(preview);
  const gd = goalDate(preview);
  const unit = imp ? 'lb' : 'kg';
  let goalNote = 'Fill in age, height and weight to see targets.';
  if (t) {
    if (dr.goal === 'maintain') goalNote = `Maintenance keeps ${dr.name || 'this member'} around ${dr.wt} ${unit}.`;
    else if (gd) goalNote = `At this pace ${dr.goalWt} ${unit} is reached around ${gd.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} (${Math.round(gd.weeks)} weeks).`;
    else goalNote = dr.goal === 'lose' ? 'Set a goal weight below the current weight to see a date.' : 'Set a goal weight above the current weight to see a date.';
  }
  const age = parseFloat(dr.age);
  return html`<main class="main" id="main">
<div class="topbar"><a class="icon-btn bare lg" href="#/progress" aria-label="Back to Progress">${icon('back', 24)}</a><h1>${id ? dr.name || 'Member' : 'New member'}</h1>
<button type="button" class="btn primary" data-action="member-save" data-id="${id || 'new'}">Save</button></div>
${dr.error ? html`<p class="notice warn" role="alert">${dr.error}</p>` : ''}
<div class="cols"><div class="col-main stack">
<section class="card">
<div class="row">${avatar({ name: dr.name || '?', color: dr.color }, 52)}<label class="field" style="flex:1">Name<input class="input" type="text" data-field="m-name" data-key="m-name" value="${dr.name}" autocomplete="off"></label></div>
<div class="grid2">
<div class="field"><span id="units-l">Units</span>${seg([['imperial', 'lb · ft/in'], ['metric', 'kg · cm']], dr.units, 'm-units', ' aria-labelledby="units-l"')}</div>
<div class="field"><span id="sex-l">Sex (used in the formula)</span>${seg([['male', 'Male'], ['female', 'Female']], dr.sex, 'm-sex', ' aria-labelledby="sex-l"')}</div>
${numberField('Age', 'm-age', dr.age)}
${numberField(`Weight (${unit})`, 'm-wt', dr.wt, '0.1')}
${imp ? html`<div class="grid2">${numberField('Height (ft)', 'm-ft', dr.ft)}${numberField('Height (in)', 'm-inch', dr.inch)}</div>` : numberField('Height (cm)', 'm-cm', dr.cm)}
<label class="field">Activity level<select class="select" data-field="m-activity" data-key="m-activity">${ACTIVITY.map((a) => html`<option value="${a.value}"${String(a.value) === dr.activity ? html` selected` : ''}>${a.label}</option>`)}</select></label>
</div>
${age > 0 && age < 18 ? html`<p class="notice warn">These targets are made for adults. Check with a doctor before setting goals for someone under 18.</p>` : ''}
</section>
<section class="card">
<div class="grid2"><div class="field"><span id="goal-l">Goal</span>${seg([['lose', 'Lose'], ['maintain', 'Maintain'], ['gain', 'Gain']], dr.goal, 'm-goal', ' aria-labelledby="goal-l"')}</div>
${dr.goal !== 'maintain' ? numberField(`Goal weight (${unit})`, 'm-goalwt', dr.goalWt, '0.1') : ''}</div>
${dr.goal !== 'maintain' ? html`<div class="field"><span id="pace-l">Pace</span><div class="grid4" role="group" aria-labelledby="pace-l">${PACE[dr.units].map((p, i) => html`<button type="button" class="btn plain${i === dr.pace ? ' on' : ''}" data-action="m-pace" data-value="${i}"${pressed(i === dr.pace)}>${p} ${unit}/wk</button>`)}</div></div>` : ''}
<p class="small" style="color:var(--muted2)">${goalNote}</p>
</section>
${id ? html`<button type="button" class="btn danger" data-action="member-delete" data-id="${id}">${icon('trash', 18)}Remove ${dr.name || 'member'}</button>` : ''}
</div>
<aside class="col-side stack">
<section class="hero" aria-live="polite">
<span class="label">${shown && shown.custom ? 'Your own daily target' : 'Suggested daily target'}${dr.name ? ` for ${dr.name}` : ''}</span>
<span class="big num">${shown ? fmtInt(shown.kcal) : '—'} kcal</span>
<div class="grid3 small" style="color:var(--hero-muted)"><div><span>Body at rest</span><strong class="num" style="display:block;color:var(--on-primary)">${t ? fmtInt(t.bmr) : '—'}</strong></div>
<div><span>Maintenance</span><strong class="num" style="display:block;color:var(--on-primary)">${t ? fmtInt(t.tdee) : '—'}</strong></div>
<div><span>Daily change</span><strong class="num" style="display:block;color:var(--on-primary)">${t ? (t.delta === 0 ? '0' : (t.delta > 0 ? '+' : '−') + fmtInt(Math.abs(t.delta))) : '—'}</strong></div></div>
<div class="grid3 macro-tiles"><div class="tile-p" style="background:var(--surface);color:var(--ink)"><span>Protein</span><strong class="num">${shown ? fmtInt(shown.p) : '—'} g</strong></div>
<div style="background:var(--surface);color:var(--ink)"><span style="color:var(--warn-text)">Carbs</span><strong class="num">${shown ? fmtInt(shown.c) : '—'} g</strong></div>
<div style="background:var(--surface);color:var(--ink)"><span style="color:var(--fat-text)">Fat</span><strong class="num">${shown ? fmtInt(shown.f) : '—'} g</strong></div></div>
${t && t.floored && !dr.customOn ? html`<p class="small">Raised to the safe minimum of ${fmtInt(t.floor)} kcal. Try a slower pace.</p>` : ''}
</section>
<section class="card tight">
<div class="spread"><span id="custom-l" class="bold">Set my own targets</span><button type="button" class="switch" role="switch" aria-labelledby="custom-l" aria-checked="${dr.customOn ? 'true' : 'false'}" data-action="m-custom"></button></div>
${dr.customOn ? html`<div class="grid2">${numberField('Calories', 'm-ck', dr.ck)}${numberField('Protein (g)', 'm-cp', dr.cp)}${numberField('Carbs (g)', 'm-cc', dr.cc)}${numberField('Fat (g)', 'm-cf', dr.cf)}</div>` : ''}
<p class="tiny muted">Suggestions use the Mifflin-St Jeor formula. They’re estimates, not medical advice.</p>
</section>
</aside></div>
</main>`;
}

function deleteSheet(sheet) {
  const m = getData().members.find((x) => x.id === sheet.id);
  if (!m) return '';
  return html`<h2 id="sheet-title">Remove ${m.name}?</h2><p>This removes ${m.name}’s profile, weight history and everything logged for them. It can’t be undone.</p>
<div class="row"><button type="button" class="btn plain lg" data-action="close-sheet" style="flex:1">Keep</button><button type="button" class="btn primary lg" data-action="member-delete-confirm" data-id="${m.id}" style="flex:1">Remove</button></div>`;
}

const cur = () => ui.drafts['member:' + (ui.route.params.id || 'new')];
const setField = (k) => (value) => { cur()[k] = value; cur().error = null; return true; };

export const membersView = {
  routes: { member: render },
  actions: {
    'm-units': ({ ds }) => {
      const dr = cur();
      if (dr.units === ds.value) return;
      const toMetric = ds.value === 'metric';
      const conv = (v) => (parseFloat(v) > 0 ? r1(toMetric ? parseFloat(v) / LB_PER_KG : parseFloat(v) * LB_PER_KG) : '');
      if (toMetric) {
        const inches = (parseFloat(dr.ft) || 0) * 12 + (parseFloat(dr.inch) || 0);
        dr.cm = inches ? String(Math.round(inches * 2.54)) : '';
      } else {
        const inches = Math.round((parseFloat(dr.cm) || 0) / 2.54);
        dr.ft = inches ? String(Math.floor(inches / 12)) : '';
        dr.inch = inches ? String(inches % 12) : '';
      }
      dr.wt = conv(dr.wt);
      dr.goalWt = conv(dr.goalWt);
      dr.units = ds.value;
      refresh();
    },
    'm-sex': ({ ds }) => { cur().sex = ds.value; refresh(); },
    'm-goal': ({ ds }) => { cur().goal = ds.value; refresh(); },
    'm-pace': ({ ds }) => { cur().pace = +ds.value; refresh(); },
    'm-custom': () => {
      const dr = cur();
      dr.customOn = !dr.customOn;
      if (dr.customOn && !dr.ck) {
        const base = ui.route.params.id !== 'new' ? getData().members.find((x) => x.id === ui.route.params.id) : null;
        const t = targets({ ...fromDraft(dr, base), custom: null });
        if (t) { dr.ck = String(t.kcal); dr.cp = String(t.p); dr.cc = String(t.c); dr.cf = String(t.f); }
      }
      refresh();
    },
    'member-save': ({ ds }) => {
      const id = ds.id === 'new' ? null : ds.id;
      const dr = cur();
      const base = id ? getData().members.find((x) => x.id === id) : null;
      const m = fromDraft(dr, base);
      if (!m.name) dr.error = 'Give this member a name.';
      else if (!(m.age > 0) || !(m.heightCm > 0) || !(m.weightKg > 0)) dr.error = 'Fill in age, height and weight.';
      if (dr.error) { refresh(); return; }
      delete m.weightKg;
      update((data) => {
        if (id) data.members = data.members.map((x) => (x.id === id ? m : x));
        else { m.id = uid(); data.members.push(m); }
      });
      delete ui.drafts['member:' + (id || 'new')];
      ui.memberId = m.id;
      toast(`Saved ${m.name}.`);
      go('#/progress');
    },
    'member-delete': ({ ds }) => openSheet({ type: 'member-delete', id: ds.id }),
    'member-delete-confirm': ({ ds }) => {
      const m = getData().members.find((x) => x.id === ds.id);
      update((data) => {
        data.members = data.members.filter((x) => x.id !== ds.id);
        data.entries = data.entries.filter((e) => e.memberId !== ds.id);
      });
      delete ui.drafts['member:' + ds.id];
      closeSheet();
      toast(`Removed ${m.name}.`);
      go('#/progress');
    },
  },
  fields: {
    'm-name': setField('name'), 'm-age': setField('age'), 'm-wt': setField('wt'), 'm-ft': setField('ft'), 'm-inch': setField('inch'),
    'm-cm': setField('cm'), 'm-activity': setField('activity'), 'm-goalwt': setField('goalWt'),
    'm-ck': setField('ck'), 'm-cp': setField('cp'), 'm-cc': setField('cc'), 'm-cf': setField('cf'),
  },
  sheets: { 'member-delete': deleteSheet },
  onLeave: (route) => { if (route.name === 'member') delete ui.drafts['member:' + (route.params.id || 'new')]; },
};
