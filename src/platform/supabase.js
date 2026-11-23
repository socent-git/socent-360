/* SocEnt 360 · platform layer on Supabase
   The app talks to three small interfaces: db (records), user (people and roles) and downloads.
   This file provides them on top of Supabase:
     db        → table public.docs (one row per record, JSONB), live via Supabase Realtime
     user      → Supabase Auth + table public.profiles (role: admin | team | viewer | pending)
     downloads → a normal browser download
   Row-level security in the database decides what each role may read and change. */
import { createClient } from "@supabase/supabase-js";

/* Accept the Project URL however it was pasted: trims spaces, quotes, a trailing slash, or a copied /rest/v1/ path. */
function cleanUrl(u) {
  let s = String(u || "").trim().replace(/^["']|["']$/g, "");
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  try { const x = new URL(s); return x.origin; } catch (e) { return s.replace(/\/+$/, ""); }
}
const URL_ = cleanUrl(import.meta.env.VITE_SUPABASE_URL);
const KEY_ = String(import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim().replace(/^["']|["']$/g, "");
export const configured = Boolean(URL_ && KEY_);
export const supabase = configured
  ? createClient(URL_, KEY_, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" } })
  : null;

/* ---------- errors, in the shape the app expects ---------- */
function dbError(e) {
  const msg = (e && (e.message || e.error_description)) || String(e || "");
  const code = e && e.code;
  if (code === "42501" || code === "P0002" || /row-level security|permission denied|violates|not exist or you may not/i.test(msg)) return { code: "invalid_argument", message: msg };
  if (code === "54000" || /too large|payload/i.test(msg)) return { code: "quota_exceeded", message: msg };
  if (/JWT|expired|refresh token/i.test(msg)) return { code: "revoked", message: msg };
  return { code: "unavailable", message: msg };
}

/* ---------- records ---------- */
const cache = new Map();          // path → data
const missing = new Set();        // paths known not to exist (or not visible)
const loadedColls = new Set();
const collListeners = new Map();  // coll → Set(fn)
const docListeners = new Map();   // path → Set(fn)
const parentOf = path => path.slice(0, path.lastIndexOf("/"));
const idOf = path => path.slice(path.lastIndexOf("/") + 1);
const segs = p => p.split("/").filter(Boolean);
const clone = o => (o == null ? o : JSON.parse(JSON.stringify(o)));

function checkPath(path, wantDoc) {
  const n = segs(path).length;
  if (!n || (wantDoc ? n % 2 : !(n % 2))) throw new TypeError((wantDoc ? "document" : "collection") + " path has the wrong number of segments: " + path);
  if (!/^[A-Za-z0-9_\-.~:@+\/]+$/.test(path)) throw new TypeError("path has characters that aren't allowed: " + path);
}
function docSnap(path) {
  const has = cache.has(path);
  const d = has ? cache.get(path) : undefined;
  return { id: idOf(path), exists: has, data: () => (has ? clone(d) : undefined), metadata: { fromCache: false, hasPendingWrites: false } };
}
function collSnap(coll) {
  const docs = [];
  for (const p of cache.keys()) if (parentOf(p) === coll) docs.push(p);
  docs.sort((a, b) => idOf(a).localeCompare(idOf(b)));
  const snaps = docs.map(docSnap);
  return { docs: snaps, size: snaps.length, empty: !snaps.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } };
}
let notifyQueued = new Set(), notifyT = null;
function notify(path) {
  notifyQueued.add(path);
  if (notifyT) return;
  notifyT = setTimeout(() => {
    const paths = notifyQueued; notifyQueued = new Set(); notifyT = null;
    const colls = new Set([...paths].map(parentOf));
    for (const c of colls) for (const fn of collListeners.get(c) || []) safe(fn, collSnap(c));
    for (const p of paths) for (const fn of docListeners.get(p) || []) safe(fn, docSnap(p));
  }, 15);
}
function safe(fn, arg) { try { fn(arg); } catch (e) { console.error(e); } }
function put(path, data) { cache.set(path, data); missing.delete(path); notify(path); }
function drop(path) { cache.delete(path); missing.add(path); notify(path); }

async function fetchColl(coll) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("docs").select("path,data").eq("coll", coll).order("doc_id").range(from, from + 999);
    if (error) throw dbError(error);
    out.push(...data);
    if (data.length < 1000) break;
  }
  const seen = new Set(out.map(r => r.path));
  for (const p of [...cache.keys()]) if (parentOf(p) === coll && !seen.has(p)) cache.delete(p);
  for (const r of out) cache.set(r.path, r.data);
  loadedColls.add(coll);
  notify(coll + "/__");
  for (const r of out) notify(r.path);
}
async function fetchDoc(path) {
  const { data, error } = await supabase.from("docs").select("data").eq("path", path).maybeSingle();
  if (error) throw dbError(error);
  if (data) cache.set(path, data.data); else { cache.delete(path); missing.add(path); }
}
async function withRetry(fn) {
  try { return await fn(); }
  catch (e) {
    if (e && e.code === "unavailable") { await new Promise(r => setTimeout(r, 500 + Math.random() * 700)); return await fn(); }
    throw e;
  }
}

/* live updates: one channel for the whole table; the database only sends rows this person may read */
let channel = null;
function startRealtime() {
  if (channel) return;
  channel = supabase.channel("socent360-docs")
    .on("postgres_changes", { event: "*", schema: "public", table: "docs" }, payload => {
      if (payload.eventType === "DELETE") { const p = payload.old && payload.old.path; if (p) drop(p); return; }
      const row = payload.new; if (row && row.path) put(row.path, row.data);
    })
    .subscribe(status => {
      if (status === "SUBSCRIBED") resync();
    });
  // if the tab was asleep, catch up when it comes back
  let hiddenAt = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > 30000) resync();
  });
  window.addEventListener("online", resync);
}
let resyncing = null;
function resync() {
  if (resyncing) return resyncing;
  resyncing = Promise.all([...loadedColls].map(c => fetchColl(c).catch(() => {})))
    .then(() => Promise.all([...docListeners.keys()].filter(p => !loadedColls.has(parentOf(p))).map(p => fetchDoc(p).then(() => notify(p)).catch(() => {}))))
    .finally(() => { resyncing = null; });
  return resyncing;
}

function docRef(path) {
  checkPath(path, true);
  const coll = parentOf(path), id = idOf(path);
  return {
    id, path,
    async get() { await withRetry(() => fetchDoc(path)); return docSnap(path); },
    async set(data) {
      if (!data || typeof data !== "object" || Array.isArray(data)) throw { code: "invalid_argument", message: "a record must be an object" };
      const body = clone(data);
      await withRetry(async () => {
        const { error } = await supabase.from("docs").upsert({ path, coll, doc_id: id, data: body }, { onConflict: "path" });
        if (error) throw dbError(error);
      });
      put(path, body);
    },
    async update(patch) {
      const merged = await withRetry(async () => {
        const { data, error } = await supabase.rpc("docs_update", { p_path: path, p_patch: clone(patch) });
        if (error) throw dbError(error);
        return data;
      });
      put(path, merged);
    },
    async delete() {
      await withRetry(async () => {
        const { error } = await supabase.from("docs").delete().eq("path", path);
        if (error) throw dbError(error);
      });
      drop(path);
    },
    async acquire() { return { acquired: true }; },
    onSnapshot(next, onErr) {
      startRealtime();
      if (!docListeners.has(path)) docListeners.set(path, new Set());
      docListeners.get(path).add(next);
      const known = cache.has(path) || missing.has(path) || loadedColls.has(coll);
      if (known) setTimeout(() => safe(next, docSnap(path)), 0);
      else fetchDoc(path).then(() => notify(path)).catch(e => onErr && onErr(e));
      return () => docListeners.get(path)?.delete(next);
    },
    collection(sub) { return collRef(path + "/" + sub); }
  };
}
function collRef(coll) {
  checkPath(coll, false);
  const q = {
    path: coll,
    doc(id) { return docRef(coll + "/" + (id || (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "").slice(0, 20) : Math.random().toString(36).slice(2)))); },
    async add(data) { const r = q.doc(); await r.set(data); return r; },
    async get() { await withRetry(() => fetchColl(coll)); return collSnap(coll); },
    onSnapshot(next, onErr) {
      startRealtime();
      if (!collListeners.has(coll)) collListeners.set(coll, new Set());
      collListeners.get(coll).add(next);
      if (loadedColls.has(coll)) setTimeout(() => safe(next, collSnap(coll)), 0);
      else withRetry(() => fetchColl(coll)).then(() => safe(next, collSnap(coll))).catch(e => onErr && onErr(e));
      return () => collListeners.get(coll)?.delete(next);
    },
    where() { return q; }, orderBy() { return q; }, limit() { return q; }
  };
  return q;
}
export const db = { doc: docRef, collection: collRef };

/* ---------- people ---------- */
let me = null; // { id, email, name, role }
const profileCache = new Map();
function initials(name) { return String(name || "?").split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("") || "?"; }
function avatar(name) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'><rect width='40' height='40' fill='#6e7475'/><text x='50%' y='54%' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='16' fill='#fff'>${initials(name)}</text></svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}
function profileOut(p) { return { id: p.id, name: p.name || (p.email || "").split("@")[0] || "", avatarUrl: avatar(p.name || p.email), color: "#6e7475", email: p.email || null, isMe: me && p.id === me.id, guest: false }; }

export async function loadMe() {
  const { data: { user: u } } = await supabase.auth.getUser();
  if (!u) return null;
  for (let i = 0; i < 6; i++) { // the profile is created by a trigger at sign-up; give it a moment
    const { data } = await supabase.from("profiles").select("id,email,name,role,last_seen").eq("id", u.id).maybeSingle();
    if (data) { me = data; profileCache.set(data.id, data); return me; }
    await new Promise(r => setTimeout(r, 500));
  }
  me = { id: u.id, email: u.email, name: u.email, role: "pending" };
  return me;
}
export const user = {
  async me() { return { id: me.id, name: me.name || "", avatarUrl: avatar(me.name || me.email), color: "#6e7475", email: me.email || null, isOwner: me.role === "admin", canEdit: me.role === "admin" }; },
  async id() { return me?.id ?? null; },
  async isOwner() { return me?.role === "admin"; },
  async canEdit() { return me?.role === "admin"; },
  async can(name) { if (name === "data.write") return me?.role === "admin" || me?.role === "team"; return false; },
  async name() { return me?.name || ""; },
  async email() { return me?.email || null; },
  async avatarUrl() { return avatar(me?.name || me?.email); },
  role() { return me?.role || "pending"; },
  async profiles(ids) {
    ids = [...new Set([].concat(ids).filter(Boolean))];
    const need = ids.filter(i => !profileCache.has(i));
    if (need.length && (me?.role === "admin" || me?.role === "team")) {
      const { data } = await supabase.from("profiles").select("id,email,name,role,last_seen").in("id", need);
      for (const p of data || []) profileCache.set(p.id, p);
    }
    const out = {};
    for (const i of ids) out[i] = profileCache.has(i) ? profileOut(profileCache.get(i)) : { id: i, name: "", avatarUrl: avatar("?"), color: "#999", email: null, isMe: false, guest: false };
    return out;
  },
  async search(q) {
    if (!(me?.role === "admin" || me?.role === "team")) return [];
    let req = supabase.from("profiles").select("id,email,name,role,last_seen").in("role", ["admin", "team"]).order("name").limit(8);
    const t = String(q || "").trim().replace(/[%,()]/g, "");
    if (t) req = req.or(`name.ilike.%${t}%,email.ilike.%${t}%`);
    const { data } = await req;
    for (const p of data || []) profileCache.set(p.id, p);
    return (data || []).map(profileOut);
  },
  /* added for this platform: people and roles in Settings */
  async listUsers() {
    const { data, error } = await supabase.from("profiles").select("id,email,name,role,created_at,last_seen").order("created_at");
    if (error) throw dbError(error);
    for (const p of data || []) profileCache.set(p.id, p);
    return data || [];
  },
  async setRole(id, role) { const { error } = await supabase.rpc("set_role", { target: id, new_role: role }); if (error) throw { code: "invalid_argument", message: error.message }; },
  async getAutoDomains() { const { data } = await supabase.from("app_settings").select("value").eq("key", "auto_viewer_domains").maybeSingle(); return data?.value || []; },
  async setAutoDomains(list) { const { error } = await supabase.from("app_settings").upsert({ key: "auto_viewer_domains", value: list }); if (error) throw dbError(error); },
  async touchSeen() { try { await supabase.rpc("touch_seen", { display_name: null }); } catch (e) { /* not important */ } },
  async signOut() { await supabase.auth.signOut(); location.hash = ""; location.reload(); }
};

/* ---------- downloads ---------- */
export const downloads = {
  async save({ filename, data }) {
    if (!filename || data == null) throw { code: "bad_request", message: "nothing to save" };
    const blob = data instanceof Blob ? data : new Blob([data], { type: /\.csv$/i.test(filename) ? "text/csv;charset=utf-8" : /\.json$/i.test(filename) ? "application/json" : "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return { status: "saved" };
  }
};

/* the app reaches everything through claude.use(name) */
export function installRuntime() {
  window.claude = { use: async name => ({ db, user, downloads })[name] ?? null };
}
