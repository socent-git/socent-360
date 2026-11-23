/* ---------- boot ---------- */
async function boot() {
  render();
  const C = window.claude;
  if (!C || typeof C.use !== "function") { S.error = "nohost"; render(); return; }
  const [db, user, dl] = await Promise.all([C.use("db"), C.use("user"), C.use("downloads")]);
  S.user = user; S.downloads = dl;
  if (!db) { S.error = "nodb"; render(); return; }
  S.db = db;
  try { S.me = user ? await user.me() : null; } catch (e) { S.me = null; }
  let role = "viewer";
  try {
    if (user && typeof user.role === "function") role = user.role();
    else if (user && await user.canEdit()) role = "admin";
    else {
      const w = user ? await user.can("data.write") : null;
      if (w === true) role = "team";
      else if (w === null) {
        const snap = await db.doc("config/app").get();
        role = snap.exists ? "team" : "viewer";
      }
    }
  } catch (e) { role = "viewer"; }
  S.role = role;
  if (role === "admin") await ensureConfig();
  subscribe();
  if (S.user?.touchSeen) S.user.touchSeen();
  if (role === "admin") loadUsers();
  setTimeout(() => { if (!S.ready) { S.slow = true; render(); } }, 10000);
  window.addEventListener("hashchange", onRoute);
  onRoute();
}

async function ensureConfig() {
  const db = S.db;
  try {
    const [a, m, c] = await Promise.all(["config/app", "config/metrics", "config/checks"].map(p => db.doc(p).get()));
    if (!a.exists) await db.doc("config/app").set({ createdAt: nowISO(), createdBy: S.me?.id || null, roster: [], brightSparkDef: "", womenLedDef: "" });
    if (!m.exists) await db.doc("config/metrics").set({ std: DEFAULT_METRICS, version: 1, defs: {}, defVersions: {}, signoffs: [], changes: [] });
    else if ((m.data().std || []).map(x => x.key).join(",") === OLD_DEFAULT_KEYS) {
      const cur = m.data();
      await db.doc("config/metrics").update({ std: DEFAULT_METRICS, version: (cur.version || 1) + 1, changes: [...(cur.changes || []), { at: nowISO(), by: S.me?.id || null, what: "standard metrics set to the 12 the^delta metrics" }].slice(-200) });
    }
    if (!c.exists) await db.doc("config/checks").set({ rules: DEFAULT_CHECKS });
  } catch (e) { console.warn("config set-up", e); }
}

const SUBS = [];
function subscribe() {
  const db = S.db;
  const need = [];
  const mark = k => { S.loaded.add(k); if (need.every(n => S.loaded.has(n)) && !S.ready) { S.ready = true; } schedule(); };
  const onErr = k => e => {
    console.warn("db", k, e);
    if (e.code === "revoked") S.error = "revoked";
    S.loaded.add(k); schedule();
  };
  const coll = (path, target, key) => {
    need.push(key);
    SUBS.push(db.collection(path).onSnapshot(snap => {
      const o = {};
      for (const d of snap.docs) o[d.id] = d.data();
      if (typeof target === "function") target(o); else S[target] = o;
      if (!snap.metadata.fromCache || snap.size) mark(key); else schedule();
    }, onErr(key)));
  };
  const doc = (path, fn, key) => {
    need.push(key);
    SUBS.push(db.doc(path).onSnapshot(snap => { fn(snap.exists ? snap.data() : null); if (!snap.metadata.fromCache || snap.exists) mark(key); else schedule(); }, onErr(key)));
  };
  if (S.role !== "viewer") {
    coll("programmes", "programmes", "programmes");
    coll("cohorts", "cohorts", "cohorts");
    coll("orgs", "orgs", "orgs");
    coll("edit", "edits", "edit");
    doc("config/app", d => S.config.app = d, "app");
    doc("config/metrics", d => S.config.metrics = d, "metrics");
    doc("config/checks", d => S.config.checks = d, "checks");
    doc("pub/meta", d => S.pub.meta = d, "pubmeta");
    if (S.role === "admin") {
      SUBS.push(db.doc("config/importMaps").onSnapshot(snap => { S.config.importMaps = snap.exists ? snap.data() : {}; }, () => {}));
      SUBS.push(db.collection("imports").onSnapshot(snap => { S.imports = {}; for (const d of snap.docs) S.imports[d.id] = d.data(); schedule(); }, () => {}));
    }

  } else {
    coll("pub", o => { S.pub.meta = o.meta || null; S.pub.chunks = o; }, "pub");
  }
}

/* ---------- people and roles (Settings) ---------- */
async function loadUsers() {
  if (!S.user?.listUsers) return;
  try { S.users = await S.user.listUsers(); S.autoDomains = S.user.getAutoDomains ? await S.user.getAutoDomains() : []; schedule(); }
  catch (e) { console.warn("users", e); }
}

/* ---------- render scheduling ---------- */
let renderT = null;
function schedule() {
  clearTimeout(renderT);
  renderT = setTimeout(() => {
    S.facts = null;
    if (UI.editing > 0) { UI.pendingRender = true; return; }
    render();
    if (S.role !== "viewer" && S.ready) schedulePublish();
  }, 60);
}
function facts() {
  if (S.facts) return S.facts;
  if (S.role === "viewer") {
    const m = S.pub.meta;
    if (!m) return null;
    const parts = [], orgs = [];
    for (const id of (m.pChunks || [])) { const c = S.pub.chunks[id]; if (c) parts.push(...(c.rows || [])); }
    for (const id of (m.oChunks || [])) { const c = S.pub.chunks[id]; if (c) orgs.push(...(c.rows || [])); }
    S.facts = { parts, orgs, cohorts: m.cohorts || {}, programmes: m.programmes || {}, metrics: m.metrics || DEFAULT_METRICS, defs: m.defs || HEADLINE_DEFS, brightSparkDef: m.brightSparkDef || "", updated: m.updated };
  } else {
    S.facts = buildFacts();
  }
  return S.facts;
}

/* ---------- publishing the de-identified figures for Overview + Impact ---------- */
function hashStr(str) { let h1 = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h1 ^= str.charCodeAt(i); h1 = Math.imul(h1, 16777619); } return (h1 >>> 0).toString(36) + ":" + str.length; }
function chunkRows(rows, maxBytes = 150000) {
  const out = []; let cur = [], size = 0;
  for (const r of rows) {
    const b = JSON.stringify(r).length + 1;
    if (cur.length && size + b > maxBytes) { out.push(cur); cur = []; size = 0; }
    cur.push(r); size += b;
  }
  if (cur.length) out.push(cur);
  return out;
}
let pubT = null, publishing = false, pubAgain = false;
function schedulePublish() { clearTimeout(pubT); pubT = setTimeout(publishFacts, 2500); }
async function publishFacts() {
  if (publishing) { pubAgain = true; return; }
  if (!S.db || S.role === "viewer") return;
  const F = buildFacts();
  const body = { parts: F.parts, orgs: F.orgs, cohorts: F.cohorts, programmes: F.programmes, metrics: F.metrics, defs: F.defs, brightSparkDef: F.brightSparkDef };
  const hash = hashStr(JSON.stringify(body));
  if (S.pub.meta?.hash === hash) return;
  publishing = true;
  try {
    const pc = chunkRows(F.parts), oc = chunkRows(F.orgs);
    const pIds = pc.map((_, i) => "p" + i), oIds = oc.map((_, i) => "o" + i);
    for (let i = 0; i < pc.length; i++) await S.db.doc("pub/" + pIds[i]).set({ rows: pc[i], hash });
    for (let i = 0; i < oc.length; i++) await S.db.doc("pub/" + oIds[i]).set({ rows: oc[i], hash });
    const old = S.pub.meta;
    await S.db.doc("pub/meta").set({ hash, updated: nowISO(), by: S.me?.id || null, pChunks: pIds, oChunks: oIds, cohorts: F.cohorts, programmes: F.programmes, metrics: F.metrics, defs: F.defs, brightSparkDef: F.brightSparkDef });
    const stale = [...(old?.pChunks || []), ...(old?.oChunks || [])].filter(x => !pIds.includes(x) && !oIds.includes(x));
    for (const x of stale) await S.db.doc("pub/" + x).delete().catch(() => {});
  } catch (e) {
    console.warn("publish", e);
    if (e.code === "quota_exceeded") toast("The shared figures could not be updated: the database is full. Remove unused records, then try again.", true);
  } finally {
    publishing = false;
    if (pubAgain) { pubAgain = false; schedulePublish(); }
  }
}

/* ---------- saving with history ---------- */
const HIST_MAX = 400;
function histEntry(sec, field, oldV, newV) {
  const short = v => { const t = typeof v === "string" ? v : JSON.stringify(v ?? ""); return t.length > 240 ? t.slice(0, 237) + "…" : t; };
  return { at: nowISO(), by: S.me?.id || null, sec, field, old: short(oldV), new: short(newV) };
}
async function writeDoc(path, cur, patch) {
  const ref = S.db.doc(path);
  if (cur) await ref.update(patch);
  else await ref.set(patch);
}
function explainErr(e) {
  if (!e) return "The change was not saved.";
  if (e.code === "invalid_argument") return "You don't have permission to change this, or the value is not valid. Nothing was saved.";
  if (e.code === "quota_exceeded") return "The database is full, so nothing was saved. Remove unused records and try again.";
  if (e.code === "unavailable") return "The database could not be reached. Check your connection and try again.";
  return "The change was not saved (" + (e.message || e.code || "unknown error") + ").";
}
async function retryOnce(fn) {
  try { return await fn(); }
  catch (e) { if (e && e.code === "unavailable") { await new Promise(r => setTimeout(r, 600 + Math.random() * 600)); return await fn(); } throw e; }
}
/* scalar fields in the editable record: f.{key} = {v, src, asOf, by, at} */
async function saveFields(orgId, sec, changes, src) {
  const cur = S.edits[orgId];
  const f = {}; const hist = [];
  for (const k in changes) {
    const oldV = val(cur?.f?.[k]);
    const nv = changes[k];
    const empty = x => x == null || x === "" || x === false || (Array.isArray(x) && !x.length);
    if (empty(oldV) && empty(nv)) continue;
    if (JSON.stringify(oldV ?? "") === JSON.stringify(nv ?? "")) continue;
    f[k] = { v: nv, src: src || "edited in SocEnt 360", asOf: new Date().toISOString().slice(0, 10), by: S.me?.id || null, at: nowISO() };
    hist.push(histEntry(sec, k, oldV, nv));
  }
  if (!hist.length) return false;
  const history = [...(cur?.history || []), ...hist].slice(-HIST_MAX);
  await retryOnce(() => writeDoc("edit/" + orgId, cur, { f, history, updatedAt: nowISO() }));
  return true;
}
/* any top-level key of either record: target "edit" or "orgs" */
async function saveKey(target, orgId, key, value, sec) {
  const store = target === "edit" ? S.edits : S.orgs;
  const cur = store[orgId];
  const oldV = cur?.[key];
  if (JSON.stringify(oldV ?? null) === JSON.stringify(value ?? null)) return false;
  if ((oldV == null || (Array.isArray(oldV) && !oldV.length)) && Array.isArray(value) && !value.length) return false;
  const history = [...(cur?.history || []), histEntry(sec, key, summarise(oldV), summarise(value))].slice(-HIST_MAX);
  await retryOnce(() => writeDoc(target + "/" + orgId, cur, { [key]: value, history, updatedAt: nowISO() }));
  return true;
}
function summarise(v) {
  if (Array.isArray(v)) return v.length + " item" + (v.length === 1 ? "" : "s") + (v.length ? ": " + v.slice(0, 3).map(x => typeof x === "object" ? (x.name || x.title || x.metric || x.fy || x.asOf || x.date || "") : x).filter(Boolean).join(", ") : "");
  if (v && typeof v === "object") return Object.entries(v).filter(([, x]) => x !== "" && x != null).map(([k, x]) => k + ": " + (typeof x === "object" ? val(x) : x)).join(", ");
  return v ?? "";
}

/* ---------- new organisation, merge ---------- */
async function createOrg(name, src) {
  const id = "o" + uid();
  await S.db.doc("orgs/" + id).set({ name, createdAt: nowISO(), createdBy: S.me?.id || null, parts: [], history: [histEntry("record", "created", "", name)] });
  await S.db.doc("edit/" + id).set({ f: { displayName: { v: name, src: src || "added in SocEnt 360", asOf: new Date().toISOString().slice(0, 10), by: S.me?.id || null, at: nowISO() } }, formerNames: [], founders: [], contacts: [], notes: [], follow: [], docs: [], partStatus: {}, history: [], updatedAt: nowISO() });
  return id;
}
async function mergeOrgs(keepId, dropId) {
  const A = clone(S.orgs[keepId]) || {}, B = clone(S.orgs[dropId]) || {};
  const EA = clone(S.edits[keepId]) || {}, EB = clone(S.edits[dropId]) || {};
  const nameB = val(EB.f?.displayName) || B.name || "";
  const arrKeys = ["parts", "rounds", "team", "fin", "runway", "readiness", "impact", "own", "awards", "milestones", "findings", "stories"];
  for (const k of arrKeys) if (B[k]?.length) A[k] = [...(A[k] || []), ...B[k]];
  if (!A.livelihoods && B.livelihoods) A.livelihoods = B.livelihoods;
  A.history = [...(A.history || []), histEntry("record", "merged", nameB, "merged into this record")].slice(-HIST_MAX);
  const keepName = String(val(EA.f?.displayName) || A.name || "").trim().toLowerCase();
  const former = uniq([...(EA.formerNames || []), nameB, ...(EB.formerNames || [])].filter(n => n && String(n).trim().toLowerCase() !== keepName));
  EA.formerNames = former;
  for (const k of ["founders", "leaders", "contacts", "notes", "follow", "docs", "support", "legalFormHistory"]) if (EB[k]?.length) EA[k] = [...(EA[k] || []), ...EB[k]];
  EA.partStatus = { ...(EB.partStatus || {}), ...(EA.partStatus || {}) };
  EA.f = EA.f || {};
  for (const k in (EB.f || {})) if (val(EA.f[k]) == null || val(EA.f[k]) === "") EA.f[k] = EB.f[k];
  EA.history = [...(EA.history || []), histEntry("record", "merged", nameB, "merged into this record")].slice(-HIST_MAX);
  EA.updatedAt = nowISO();
  await S.db.doc("orgs/" + keepId).set(A);
  await S.db.doc("edit/" + keepId).set(EA);
  await S.db.doc("orgs/" + dropId).set({ ...B, mergedInto: keepId, history: [...(B.history || []), histEntry("record", "merged into", "", keepId)].slice(-HIST_MAX) });
}

/* ---------- export ---------- */
function csvCell(v) { const t = v == null ? "" : String(v); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; }
async function exportCSV(name, header, rows, context) {
  const lines = [];
  lines.push(csvCell("SocEnt 360 · " + name));
  lines.push(csvCell("Exported " + new Date().toLocaleString("en-GB")));
  if (context) lines.push(csvCell(context));
  lines.push("");
  lines.push(header.map(csvCell).join(","));
  for (const r of rows) lines.push(r.map(csvCell).join(","));
  const data = "\ufeff" + lines.join("\n");
  const filename = "socent360-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + new Date().toISOString().slice(0, 10) + ".csv";
  if (!S.downloads) { toast("Downloads aren't available in this browser.", true); return; }
  try { await S.downloads.save({ filename, data }); toast("Exported " + filename); }
  catch (e) { if (e.code !== "declined") toast(e.code === "rate_limited" ? "A download is already waiting for your confirmation." : "The export could not be saved.", true); }
}
async function exportJSON() {
  const data = JSON.stringify({ exported: nowISO(), programmes: S.programmes, cohorts: S.cohorts, orgs: S.orgs, edit: S.edits, config: S.config }, null, 1);
  if (!S.downloads) { toast("Downloads aren't available in this view.", true); return; }
  try { await S.downloads.save({ filename: "socent360-backup-" + new Date().toISOString().slice(0, 10) + ".json", data }); toast("Backup exported"); }
  catch (e) { if (e.code !== "declined") toast("The backup could not be saved.", true); }
}
function filterContext(st, F) {
  const bits = [];
  bits.push("View: " + st.view + (st.view !== "portfolio" && st.prog ? " · " + (F.programmes[st.prog]?.name || "") + (st.track && st.track !== "both" ? " (" + st.track + ")" : "") : ""));
  const f = st.f;
  if (f.year) bits.push("Cohort year: " + f.year);
  if (f.sector) bits.push("Sector: " + f.sector);
  if (f.state) bits.push("State: " + stateName(f.state));
  if (f.status) bits.push("Status: " + f.status);
  return bits.join(" | ");
}

/* ---------- people names ---------- */
const nameCache = {};
async function resolveNames(ids) {
  ids = uniq(ids.filter(Boolean)).filter(i => !(i in nameCache));
  if (!ids.length || !S.user) return;
  try { const ps = await S.user.profiles(ids); for (const i of ids) nameCache[i] = ps[i]?.name || ""; } catch (e) { }
}
function personName(id) {
  if (!id) return "someone";
  if (id === S.me?.id) return "you";
  if (!(id in nameCache)) { resolveNames([id]).then(() => { if (nameCache[id]) schedule(); }); return "…"; }
  return nameCache[id] || "a colleague";
}
