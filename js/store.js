// App data lives in this browser for now. Household data (members, food, recipes, log) is
// kept apart from device settings (appearance) so sync can later share one but not the other.

const DATA_KEY = 'mealmacros.data.v1';
const DEVICE_KEY = 'mealmacros.device.v1';

export function emptyData() {
  return { version: 1, settings: { defaultUnits: 'imperial' }, members: [], ingredients: [], recipes: [], entries: [], shopping: [] };
}

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

let data = normalize(read(DATA_KEY)) || emptyData();
let device = { appearance: 'auto', ...(read(DEVICE_KEY) || {}) };
const listeners = new Set();
export let saveFailed = false;

function normalize(d) {
  if (!d || typeof d !== 'object' || d.version !== 1) return null;
  const base = emptyData();
  for (const k of Object.keys(base)) if (!(k in d)) d[k] = base[k];
  return d;
}

export function getData() {
  return data;
}
export function getDevice() {
  return device;
}
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit() {
  listeners.forEach((fn) => fn());
}

/** Change household data and save it. */
export function update(mutate) {
  mutate(data);
  data.updatedAt = Date.now();
  saveFailed = !write(DATA_KEY, data);
  emit();
}
export function replaceData(next) {
  const n = normalize(next);
  if (!n) throw new Error('That file is not a Table Reset backup.');
  data = n;
  saveFailed = !write(DATA_KEY, data);
  emit();
}
export function updateDevice(patch) {
  device = { ...device, ...patch };
  write(DEVICE_KEY, device);
  emit();
}

export function uid() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export function byId(list) {
  const map = {};
  for (const x of list) map[x.id] = x;
  return map;
}
