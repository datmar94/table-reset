// Sync between devices through Firebase. Every record (member, food, recipe, meal, list item) is its own
// document, so changes made on two devices merge record by record. Firebase only loads once sync is on.
import { getData, replaceData, subscribe, emptyData, uid } from './store.js';
import { refresh, openSheet, closeSheet, toast } from './app.js';

const SDK = 'https://www.gstatic.com/firebasejs/12.19.0/';
const CONFIG = {
  apiKey: 'AIzaSyDftK24coTS_mW6Dw5tvg1AwLDHuiEU1XI',
  authDomain: 'table-reset.firebaseapp.com',
  projectId: 'table-reset',
  storageBucket: 'table-reset.firebasestorage.app',
  messagingSenderId: '394252836594',
  appId: '1:394252836594:web:b5031fcf7c41262126ba6b',
};
const HOUSEHOLD = 'home';
const STATE_KEY = 'mealmacros.sync.v1';
const LOCAL_ONLY = ['version', 'updatedAt'];

/** What Settings shows. status: off, loading, choose, syncing, synced or error. */
export const sync = { status: 'off', user: null, error: '', lastAt: 0 };

// ---------- Records ----------

function hashStr(s) {
  let h1 = 0xdeadbeef ^ s.length, h2 = 0x41c6ce57 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
export const hashOf = (v) => hashStr(JSON.stringify(v));

/** The household data as records: "entries~<id>" for each list item, "_~settings" for the rest. */
export function itemsOf(d) {
  const out = {};
  for (const [c, val] of Object.entries(d)) {
    if (LOCAL_ONLY.includes(c)) continue;
    if (Array.isArray(val)) val.forEach((x, o) => { if (x && x.id) out[`${c}~${x.id}`] = { c, k: x.id, o, v: x }; });
    else out[`_~${c}`] = { c: '_', k: c, o: 0, v: val };
  }
  return out;
}

/** Household data built from synced records alone. */
export function dataFrom(docs) {
  const d = emptyData();
  const lists = {};
  for (const x of docs) {
    if (x.del) continue;
    if (x.c === '_') d[x.k] = JSON.parse(x.v);
    else (lists[x.c] = lists[x.c] || []).push(x);
  }
  for (const [c, xs] of Object.entries(lists)) d[c] = xs.sort((a, b) => a.o - b.o).map((x) => JSON.parse(x.v));
  return d;
}

/** This device's data plus any synced records it doesn't have. */
export function combine(local, docs) {
  const next = JSON.parse(JSON.stringify(local));
  const theirs = dataFrom(docs);
  for (const [c, list] of Object.entries(theirs)) {
    if (!Array.isArray(list)) continue;
    const have = new Set((next[c] || []).map((x) => x.id));
    next[c] = (next[c] || []).concat(list.filter((x) => !have.has(x.id)));
  }
  return next;
}

/**
 * Apply records changed on another device. `known` holds the hash of each record as last synced; a record
 * changed here since then hasn't been sent yet, so this device's change wins and is sent next.
 */
export function applyDocs(d, docs, known) {
  const next = JSON.parse(JSON.stringify(d));
  const mine = itemsOf(d);
  const applied = [];
  for (const x of docs) {
    const local = mine[x.key];
    if ((local ? hashOf(local.v) : undefined) !== known[x.key]) continue;
    if (x.c === '_') {
      if (x.del) delete next[x.k];
      else next[x.k] = JSON.parse(x.v);
    } else {
      const list = next[x.c] || (next[x.c] = []);
      const i = list.findIndex((y) => y && y.id === x.k);
      if (x.del) { if (i >= 0) list.splice(i, 1); }
      else if (i >= 0) list[i] = JSON.parse(x.v);
      else list.splice(Math.min(x.o, list.length), 0, JSON.parse(x.v));
    }
    applied.push(x.key);
  }
  return { data: next, applied };
}

/** Records to send: everything that differs from what was last synced, plus deletions. */
export function changesSince(d, known, device) {
  const now = itemsOf(d);
  const out = [];
  for (const [key, it] of Object.entries(now)) {
    const v = JSON.stringify(it.v);
    const h = hashStr(v);
    if (known[key] !== h) out.push({ key, c: it.c, k: it.k, o: it.o, v, del: false, by: device, h });
  }
  for (const key of Object.keys(known)) {
    if (now[key]) continue;
    const at = key.indexOf('~');
    out.push({ key, c: key.slice(0, at), k: key.slice(at + 1), o: 0, v: '', del: true, by: device, h: null });
  }
  return out;
}

const later = (a, b) => !b || a.s > b.s || (a.s === b.s && a.n > b.n);
function latest(docs, since = null) {
  for (const x of docs) if (x.t && later(x.t, since)) since = x.t;
  return since;
}
function counts(d) {
  return { members: d.members.length, ingredients: d.ingredients.length, recipes: d.recipes.length, entries: d.entries.length };
}
const isEmpty = (d) => Object.values(d).every((v) => !Array.isArray(v) || !v.length);

// ---------- Firebase ----------

async function firebase() {
  const [{ initializeApp }, A, F] = await Promise.all([
    import(`${SDK}firebase-app.js`), import(`${SDK}firebase-auth.js`), import(`${SDK}firebase-firestore.js`),
  ]);
  const app = initializeApp(CONFIG);
  const auth = A.getAuth(app);
  const db = F.getFirestore(app);
  const col = F.collection(db, 'households', HOUSEHOLD, 'items');
  const who = (u) => u && { email: u.email, name: u.displayName };
  const out = (snap) => {
    const x = snap.data();
    return { key: snap.id, c: x.c, k: x.k, o: x.o, v: x.v, del: !!x.del, by: x.by, t: x.t ? { s: x.t.seconds, n: x.t.nanoseconds } : null };
  };
  return {
    user: () => new Promise((res) => { const off = A.onAuthStateChanged(auth, (u) => { off(); res(who(u)); }); }),
    signIn: async () => who((await A.signInWithPopup(auth, new A.GoogleAuthProvider())).user),
    signOut: () => A.signOut(auth),
    getAll: async () => (await F.getDocs(col)).docs.map(out),
    listen: (since, onDocs, onError) => F.onSnapshot(
      since ? F.query(col, F.where('t', '>', new F.Timestamp(since.s, since.n)), F.orderBy('t')) : F.query(col, F.orderBy('t')),
      (snap) => onDocs(snap.docChanges().filter((ch) => ch.type !== 'removed').map((ch) => out(ch.doc))),
      onError),
    write: async (docs) => {
      for (let i = 0; i < docs.length; i += 400) {
        const batch = F.writeBatch(db);
        for (const { key, h, ...rest } of docs.slice(i, i + 400)) batch.set(F.doc(col, key), { ...rest, t: F.serverTimestamp() });
        await batch.commit();
      }
    },
  };
}

// ---------- Running ----------

function readState() {
  try {
    const s = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
    if (s && s.device) return { hashes: {}, since: null, ...s };
  } catch (e) {}
  return { on: false, device: uid(), hashes: {}, since: null };
}
let state = readState();
const saveState = () => { try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (e) {} };

let remote = null, stopListen = null, flushing = false, timer = null, offered = null, watching = false;

function set(status) {
  sync.status = status;
  refresh();
}

function message(e) {
  const code = (e && e.code) || '';
  if (code.endsWith('permission-denied')) return `${sync.user ? sync.user.email : 'This account'} isn’t on the allowed list. In Firebase, open Firestore › Rules and add this email.`;
  if (code === 'auth/unauthorized-domain') return 'Firebase doesn’t allow sign-in from this website yet. In Firebase, open Authentication › Settings › Authorized domains and add datmar94.github.io.';
  if (code === 'auth/popup-blocked') return 'The sign-in window was blocked. Tap Sign in with Google again.';
  if (code === 'auth/network-request-failed' || code === 'unavailable' || e instanceof TypeError) return 'No connection. Sync starts again when this device is back online.';
  return `Sync stopped: ${(e && e.message) || 'something went wrong'}`;
}
function fail(e) {
  stop();
  sync.error = message(e);
  set('error');
}

async function getRemote() {
  if (!remote) remote = await (globalThis.__tableResetRemote || firebase)();
  return remote;
}

function stop() {
  if (stopListen) stopListen();
  stopListen = null;
  clearTimeout(timer);
}

function schedule(ms = 1000) {
  clearTimeout(timer);
  timer = setTimeout(flush, ms);
}

async function flush() {
  if (!state.on || !stopListen || flushing) return;
  const out = changesSince(getData(), state.hashes, state.device);
  if (!out.length) { if (sync.status !== 'synced') set('synced'); return; }
  flushing = true;
  set('syncing');
  try {
    await remote.write(out);
    for (const x of out) { if (x.h) state.hashes[x.key] = x.h; else delete state.hashes[x.key]; }
    saveState();
    sync.lastAt = Date.now();
    flushing = false;
    flush();
  } catch (e) {
    flushing = false;
    fail(e);
  }
}

function run() {
  stop();
  sync.error = '';
  set('syncing');
  if (!watching) {
    watching = true;
    subscribe(() => { if (state.on && stopListen) schedule(); });
    window.addEventListener('online', () => { if (state.on && sync.status === 'error') retrySync(); else refresh(); });
    window.addEventListener('offline', () => refresh());
  }
  const seen = {}; // newest server time per record, so an older version arriving late is ignored
  stopListen = remote.listen(state.since, (docs) => {
    const theirs = docs.filter((x) => {
      if (x.t) { if (seen[x.key] && !later(x.t, seen[x.key])) return false; seen[x.key] = x.t; }
      return x.by !== state.device;
    });
    if (theirs.length) {
      const { data, applied } = applyDocs(getData(), theirs, state.hashes);
      if (applied.length) {
        replaceData(data);
        const now = itemsOf(getData());
        for (const key of applied) { if (now[key]) state.hashes[key] = hashOf(now[key].v); else delete state.hashes[key]; }
      }
    }
    state.since = latest(docs, state.since);
    saveState();
    sync.lastAt = Date.now();
    schedule(0);
  }, fail);
}

function adopt(docs, mode) {
  const next = mode === 'remote' ? dataFrom(docs) : combine(getData(), docs);
  state = { on: true, device: state.device, hashes: {}, since: latest(docs) };
  for (const x of docs) if (!x.del) state.hashes[x.key] = hashStr(x.v);
  saveState();
  offered = null;
  replaceData(next);
  run();
}

/** Load Firebase ahead of time so the sign-in window opens right on the tap. */
export function preloadSync() {
  getRemote().catch(() => {});
}

/** At start-up: pick sync back up on a device where it's on. */
export async function startSync() {
  if (!state.on) return;
  set('loading');
  try {
    const r = await getRemote();
    const u = await r.user();
    if (!u) { state.on = false; saveState(); set('off'); return; }
    sync.user = u;
    run();
  } catch (e) {
    fail(e);
  }
}

export function retrySync() {
  if (!state.on) signIn();
  else if (sync.user && remote) run();
  else startSync();
}

export async function signIn() {
  sync.error = '';
  set('loading');
  try {
    const r = await getRemote();
    sync.user = await r.signIn();
    const docs = await r.getAll();
    const local = getData();
    if (!docs.some((x) => !x.del)) { adopt(docs, 'combine'); toast('Sync is on. This device’s data is now saved for your other devices.'); }
    else if (isEmpty(local)) { adopt(docs, 'remote'); toast('Sync is on. This device now has the synced data.'); }
    else { offered = docs; set('choose'); offerChoice(); }
  } catch (e) {
    if (e && (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request')) { sync.user = null; set('off'); return; }
    sync.user = sync.user || null;
    fail(e);
  }
}

/** Ask which data to keep when both this device and the account already have some. */
export function offerChoice() {
  if (offered) openSheet({ type: 'sync-choice', mine: counts(getData()), theirs: counts(dataFrom(offered)) });
}

export function chooseData(mode) {
  if (!offered) return;
  closeSheet();
  adopt(offered, mode);
  toast(mode === 'remote' ? 'Sync is on. This device now has the synced data.' : 'Sync is on. Both devices’ data is combined.');
}

export async function signOutSync() {
  stop();
  offered = null;
  state = { on: false, device: state.device, hashes: {}, since: null };
  saveState();
  sync.user = null;
  sync.error = '';
  set('off');
  try { if (remote) await remote.signOut(); } catch (e) {}
}

export const syncOn = () => state.on;
