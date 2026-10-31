// Tiny HTML-string toolkit: escaped templates, icons and shared pieces of UI.
import { fmtInt, macroSplit } from './nutrition.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
export const raw = (s) => new Raw(String(s));
function val(v) {
  if (v == null || v === false || v === true) return '';
  if (Array.isArray(v)) return v.map(val).join('');
  if (v instanceof Raw) return v.s;
  return esc(v);
}
/** Template tag: interpolated values are escaped unless they came from `html` or `raw`. */
export function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += val(vals[i]) + strings[i + 1];
  return new Raw(out);
}
export const attr = (cond, name, value = '') => (cond ? raw(` ${name}${value === '' ? '' : `="${esc(value)}"`}`) : '');
export const pressed = (on) => raw(` aria-pressed="${on ? 'true' : 'false'}"`);

const PATHS = {
  plan: 'M4 6h16v14H4z M4 10h16 M8 3v5 M16 3v5',
  recipes: 'M6 4h10a3 3 0 0 1 3 3v13H9a3 3 0 0 1-3-3z M6 17a3 3 0 0 1 3-3h10',
  suggest: 'M11 3l1.8 4.7 4.7 1.8-4.7 1.8L11 16l-1.8-4.7-4.7-1.8 4.7-1.8z M18 14l.9 2.1 2.1.9-2.1.9L18 20l-.9-2.1-2.1-.9 2.1-.9z',
  pantry: 'M4 9h16l-1.6 10.4a1.8 1.8 0 0 1-1.8 1.6H7.4a1.8 1.8 0 0 1-1.8-1.6z M8 9l3-5 M16 9l-3-5 M10 13v4 M14 13v4',
  progress: 'M5 20v-8 M11 20V5 M17 20v-5 M3 20h18',
  plus: 'M12 5v14 M5 12h14',
  minus: 'M5 12h14',
  close: 'M6 6l12 12 M18 6L6 18',
  back: 'M19 12H5 M11 6l-6 6 6 6',
  chevron: 'M9 6l6 6-6 6',
  chevronLeft: 'M15 6l-6 6 6 6',
  check: 'M5 12l5 5 9-10',
  edit: 'M4 20h4L19 9l-4-4L4 16z M13.5 6.5l4 4',
  trash: 'M5 7h14 M10 7V5h4v2 M7 7l1 12h8l1-12',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M20 20l-4-4',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  star: 'M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8 6.6 19.7l1.1-6.1-4.5-4.2 6.1-.8z',
  scan: 'M4 7V5a1 1 0 0 1 1-1h2 M17 4h2a1 1 0 0 1 1 1v2 M20 17v2a1 1 0 0 1-1 1h-2 M7 20H5a1 1 0 0 1-1-1v-2 M8 8v8 M11 8v8 M14 8v8 M17 8v8',
  list: 'M9 6h11 M9 12h11 M9 18h11 M4.5 6h.01 M4.5 12h.01 M4.5 18h.01',
  copy: 'M8 8h11v11H8z M5 16V5h11',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  swap: 'M7 7h11l-3-3 M17 17H6l3 3',
  circle: 'M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16z',
};
export function icon(name, size = 20, stroke = 2) {
  const fill = name === 'star' ? 'currentColor' : 'none';
  return raw(`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${PATHS[name]}"></path></svg>`);
}

export function avatar(member, size = 40) {
  const initial = (member.name || '?').trim().charAt(0).toUpperCase() || '?';
  return html`<span class="avatar" aria-hidden="true" style="width:${size}px;height:${size}px;background:${member.color || '#DCE6FB'};font-size:${Math.round(size * 0.42)}px">${initial}</span>`;
}

export function ring(pct, { size = 88, label = '', big = '', small = '' } = {}) {
  const r = 26, c = 2 * Math.PI * r;
  const len = Math.max(0, Math.min(1, pct)) * c;
  return html`<div class="ring" style="width:${size}px;height:${size}px">
<svg width="${size}" height="${size}" viewBox="0 0 64 64" role="img" aria-label="${label}"><circle class="track" cx="32" cy="32" r="${r}" fill="none" stroke-width="6"></circle><circle class="val" cx="32" cy="32" r="${r}" fill="none" stroke-width="6" stroke-linecap="round" stroke-dasharray="${len.toFixed(1)} 200" transform="rotate(-90 32 32)"></circle></svg>
<div class="center" aria-hidden="true"><strong class="num">${big}</strong><span>${small}</span></div></div>`;
}

export function bar(pct, cls, extra = '') {
  const w = Math.max(0, Math.min(100, pct * 100));
  return html`<span class="bar ${extra}" aria-hidden="true"><i class="${cls}" style="width:${w.toFixed(1)}%"></i></span>`;
}

const MACROS = [['Protein', 'p', 'fill-protein'], ['Carbs', 'c', 'fill-carbs'], ['Fat', 'f', 'fill-fat']];
/** Protein / carbs / fat bars of eaten against target. */
export function macroBars(eaten, target, thin = false) {
  return MACROS.map(([label, k, cls]) => html`<div class="macro-row">
<div class="spread"><span class="bold" style="font-weight:600">${label}</span><span class="muted num">${fmtInt(eaten[k])} / ${target ? fmtInt(target[k]) : '—'} g</span></div>
${bar(target && target[k] ? eaten[k] / target[k] : 0, cls, thin ? 'thin' : '')}</div>`);
}

export function splitBar(n) {
  const s = macroSplit(n);
  return html`<div class="split-bar" role="img" aria-label="Calories from protein ${s.p}%, carbs ${s.c}%, fat ${s.f}%"><i class="fill-protein" style="width:${s.p}%"></i><i class="fill-carbs" style="width:${s.c}%"></i><i class="fill-fat" style="width:${s.f}%"></i></div>`;
}

export function macroLine(n) {
  return `${fmtInt(n.kcal)} kcal · P ${fmtInt(n.p)} · C ${fmtInt(n.c)} · F ${fmtInt(n.f)}`;
}

/** Calories and macros left against a target; going over shows as "over". */
export function leftTiles(left, label) {
  const tile = (cls, name, v, unit) => html`<div class="${cls}"><span>${name}</span><strong class="num">${v < -0.5 ? `${fmtInt(-v)}${unit} over` : `${fmtInt(Math.max(0, v))}${unit}`}</strong></div>`;
  return html`<div class="stack" style="gap:6px"><span class="small bold">${label}</span>
<div class="grid4 macro-tiles left-tiles">${tile('tile-k', 'Calories', left.kcal, '')}${tile('tile-p', 'Protein', left.p, ' g')}${tile('tile-c', 'Carbs', left.c, ' g')}${tile('tile-f', 'Fat', left.f, ' g')}</div></div>`;
}
export function heroTotals(n, kcalLabel = 'kcal') {
  return html`<section class="hero" aria-live="polite"><div class="hero-grid">
<div><span>${kcalLabel}</span><strong class="num">${fmtInt(n.kcal)}</strong></div>
<div><span>Protein</span><strong class="num">${fmtInt(n.p)} g</strong></div>
<div><span>Carbs</span><strong class="num">${fmtInt(n.c)} g</strong></div>
<div><span>Fat</span><strong class="num">${fmtInt(n.f)} g</strong></div></div></section>`;
}

export function sparkline(values, label) {
  if (values.length < 2) return html`<span class="tiny muted">Log weight to see a trend</span>`;
  const min = Math.min(...values), max = Math.max(...values);
  const range = Math.max(max - min, 1);
  const mid = (max + min) / 2;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * 100;
    const y = 16 - ((v - mid) / range) * 24;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return html`<svg class="spark" width="100" height="32" viewBox="0 0 100 32" preserveAspectRatio="none" role="img" aria-label="${label}" style="flex:1;min-width:0"><polyline points="${pts}" fill="none" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"></polyline></svg>`;
}

export function seg(options, current, action, extra = '') {
  return html`<div class="seg" role="group"${raw(extra)}>${options.map(([value, label]) => html`<button type="button" data-action="${action}" data-value="${value}"${pressed(value === current)}>${label}</button>`)}</div>`;
}

export function stepper(value, lessAction, moreAction, data = '', labels = ['Less', 'More']) {
  return html`<span class="stepper"><button type="button" class="icon-btn" data-action="${lessAction}"${raw(data)} aria-label="${labels[0]}">${icon('minus', 18, 2.2)}</button><span class="val num">${value}</span><button type="button" class="icon-btn" data-action="${moreAction}"${raw(data)} aria-label="${labels[1]}">${icon('plus', 18, 2.2)}</button></span>`;
}

export function memberChips(members, currentId, action) {
  return html`<div class="people" role="group" aria-label="Member">${members.map((m) => html`<button type="button" class="person" data-action="${action}" data-id="${m.id}"${pressed(m.id === currentId)}>${avatar(m, 32)}${m.name}</button>`)}</div>`;
}

export const SLOTS = [['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['dinner', 'Dinner'], ['snack', 'Snack']];
export const slotLabel = (id) => (SLOTS.find((s) => s[0] === id) || [id, id])[1];
export const servingsText = (n) => `${+n.toFixed(2)} serving${n === 1 ? '' : 's'}`;
