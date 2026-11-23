"use strict";
/* ============================================================
   SocEnt 360 · phase 1
   Data lives in Supabase (table public.docs, one row per path):
     programmes/{id}   cohorts/{id}   orgs/{id} (admin-only record)
     edit/{id}  (identity, people, notes, documents, participation status: Program Team can edit)
     config/app  config/metrics  config/checks
     pub/meta  pub/p0..pN  pub/o0..oN   (de-identified figures for Overview + Impact, readable by everyone)
     imports/{id}  config/importMaps  (import log and remembered column mappings)
   ============================================================ */

/* ---------- small helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "html") el.innerHTML = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  add(el, kids);
  return el;
}
function add(el, kids) {
  for (const k of kids) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) add(el, k);
    else el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}
const svgNS = "http://www.w3.org/2000/svg";
function s(tag, attrs, ...kids) {
  const el = document.createElementNS(svgNS, tag);
  if (attrs) for (const k in attrs) if (attrs[k] != null) el.setAttribute(k, attrs[k]);
  for (const k of kids.flat()) if (k != null) el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
  return el;
}
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const val = x => (x && typeof x === "object" && !Array.isArray(x) && "v" in x) ? x.v : x;
const isNum = x => typeof x === "number" && isFinite(x);
const sum = a => a.reduce((t, x) => t + (isNum(x) ? x : 0), 0);
const uniq = a => [...new Set(a)];
const clone = o => JSON.parse(JSON.stringify(o ?? null));
const norm = t => String(t ?? "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .replace(/&/g, " and ").replace(/\b(pvt|private|ltd|limited|llp|foundation|trust|society|the|india|org|organisation|organization)\b/g, " ")
  .replace(/[^a-z0-9]+/g, " ").trim();
const nowISO = () => new Date().toISOString();

const fmtN = (v, d = 0) => isNum(v) ? v.toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: 0 }) : "–";
function fmtINR(v) {
  if (!isNum(v)) return "–";
  const a = Math.abs(v);
  if (a >= 1e7) return "₹" + (v / 1e7).toLocaleString("en-IN", { maximumFractionDigits: 2 }) + " Cr";
  if (a >= 1e5) return "₹" + (v / 1e5).toLocaleString("en-IN", { maximumFractionDigits: 1 }) + " L";
  return "₹" + v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}
function fmtC(v) {
  if (!isNum(v)) return "–";
  const a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toLocaleString("en-IN", { maximumFractionDigits: a >= 1e8 ? 0 : 1 }) + "M";
  if (a >= 1e4) return (v / 1e3).toLocaleString("en-IN", { maximumFractionDigits: 0 }) + "k";
  return v.toLocaleString("en-IN", { maximumFractionDigits: 1 });
}
const fmtPct = (v, d = 0) => isNum(v) ? (v * 100).toLocaleString("en-IN", { maximumFractionDigits: d }) + "%" : "–";
const fmtX = v => isNum(v) ? v.toLocaleString("en-IN", { maximumFractionDigits: 1 }) + "×" : "–";
function fmtDate(d) {
  if (!d) return "";
  const t = new Date(d);
  if (isNaN(t)) return String(d);
  return t.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function fmtMonth(d) {
  if (!d) return "";
  const t = new Date(d);
  if (isNaN(t)) return String(d);
  return t.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}
/* Indian financial year, April–March: 2024-06-01 -> "2024-25" */
function toFY(d) {
  if (!d) return null;
  const m = /^(\d{4})-(\d{2})$/.exec(String(d));
  if (m && (+m[1] + 1) % 100 === +m[2]) return String(d);
  const t = new Date(d);
  if (isNaN(t)) return null;
  const y = t.getMonth() >= 3 ? t.getFullYear() : t.getFullYear() - 1;
  return y + "-" + String((y + 1) % 100).padStart(2, "0");
}
const fyStart = fy => fy ? +String(fy).slice(0, 4) : null;
const fyOf = y => y + "-" + String((y + 1) % 100).padStart(2, "0");
const fyShift = (fy, n) => fy ? fyOf(fyStart(fy) + n) : null;
const fyShort = fy => fy ? "FY" + String((fyStart(fy) + 1) % 100).padStart(2, "0") : "";
const numOr = x => (x === "" || x == null || !isNum(+x)) ? null : +x;
function chg(a, b) { // change from b (previous) to a (current)
  if (!isNum(a) || !isNum(b) || b === 0) return null;
  return (a - b) / Math.abs(b);
}

/* ---------- reference lists ---------- */
const STATES = [
  ["JK","Jammu and Kashmir",2,0],["LA","Ladakh",3,0],
  ["PB","Punjab",1,1],["HP","Himachal Pradesh",2,1],["UK","Uttarakhand",3,1],["CH","Chandigarh",0,1],
  ["RJ","Rajasthan",0,2],["HR","Haryana",1,2],["DL","Delhi",2,2],["UP","Uttar Pradesh",3,2],["BR","Bihar",4,2],["SK","Sikkim",5,2],["AR","Arunachal Pradesh",7,2],
  ["GJ","Gujarat",0,3],["MP","Madhya Pradesh",1,3],["CG","Chhattisgarh",2,3],["JH","Jharkhand",3,3],["WB","West Bengal",4,3],["ML","Meghalaya",5,3],["AS","Assam",6,3],["NL","Nagaland",7,3],
  ["DH","Dadra and Nagar Haveli and Daman and Diu",0,4],["MH","Maharashtra",1,4],["TS","Telangana",2,4],["OD","Odisha",3,4],["TR","Tripura",5,4],["MZ","Mizoram",6,4],["MN","Manipur",7,4],
  ["GA","Goa",0,5],["KA","Karnataka",1,5],["AP","Andhra Pradesh",2,5],
  ["LD","Lakshadweep",0,6],["KL","Kerala",1,6],["TN","Tamil Nadu",2,6],["PY","Puducherry",3,6],["AN","Andaman and Nicobar Islands",5,6]
];
const STATE_BY_CODE = Object.fromEntries(STATES.map(s => [s[0], s]));
const STATE_ALIAS = (() => {
  const m = {};
  for (const [c, n] of STATES) { m[norm(n)] = c; m[c.toLowerCase()] = c; }
  Object.assign(m, { "orissa": "OD", "or": "OD", "uttaranchal": "UK", "ut": "UK", "tg": "TS", "telengana": "TS", "pondicherry": "PY",
    "new delhi": "DL", "ncr": "DL", "delhi ncr": "DL", "j and k": "JK", "jammu kashmir": "JK", "bengal": "WB", "chattisgarh": "CG",
    "andaman": "AN", "daman and diu": "DH", "dadra and nagar haveli": "DH", "bangalore": "KA", "bengaluru": "KA", "mumbai": "MH",
    "pune": "MH", "chennai": "TN", "hyderabad": "TS", "kolkata": "WB", "gurgaon": "HR", "gurugram": "HR", "noida": "UP", "jaipur": "RJ",
    "ahmedabad": "GJ", "lucknow": "UP", "bhopal": "MP", "patna": "BR", "ranchi": "JH", "bhubaneswar": "OD", "guwahati": "AS" });
  return m;
})();
const stateCode = t => STATE_ALIAS[norm(t)] || (STATE_BY_CODE[String(t).toUpperCase()] ? String(t).toUpperCase() : null);
const stateName = c => STATE_BY_CODE[c]?.[1] || c;

const STATUS = ["operating", "shut down", "dormant", "not known"];
const METHODS = { record: "organisation's records", survey: "survey", estimate: "estimate", evaluation: "external evaluation", "": "not recorded" };
const PART_STATUS = ["completed", "ongoing", "left early", "selected, not joined"];
const DOC_TYPES = ["application", "agreement", "readiness matrix", "report", "financials", "deck", "other"];

const DEFAULT_METRICS = [
  { key: "reach", label: "People directly reached", desc: "Individuals who directly use or receive the organisation's programmes or services", unit: "people", group: "people", parent: "" },
  { key: "students", label: "Students and children reached", desc: "Children and students in the organisation's education programmes", unit: "people", group: "people", parent: "reach" },
  { key: "educators", label: "Educators trained", desc: "Teachers and educators trained by the organisation", unit: "people", group: "people", parent: "reach" },
  { key: "skilled", label: "People trained or skilled", desc: "People who completed a training or skilling programme", unit: "people", group: "people", parent: "reach" },
  { key: "livelihoods", label: "Livelihoods supported", desc: "People whose earning activity was created or supported", unit: "people", group: "people", parent: "reach" },
  { key: "women", label: "Women and girls reached", desc: "Women and girls among the people directly reached", unit: "people", group: "people", parent: "reach" },
  { key: "farmers", label: "Farmers reached", desc: "Farmers directly reached by the organisation", unit: "people", group: "people", parent: "reach" },
  { key: "health", label: "Health service users", desc: "People who used a health service the organisation provides", unit: "people", group: "people", parent: "reach" },
  { key: "households", label: "Households reached", desc: "Households directly reached", unit: "households", group: "households", parent: "" },
  { key: "pwd", label: "Persons with disabilities reached", desc: "Persons with disabilities directly reached", unit: "people", group: "people", parent: "reach" },
  { key: "area", label: "Area under improved practice", desc: "Land under improved agricultural or ecological practice", unit: "acres", group: "area", parent: "" },
  { key: "waste", label: "Waste diverted and emissions avoided", desc: "Waste diverted from landfill or burning, and the emissions this avoids", unit: "tonnes", group: "env", parent: "" }
];
const OLD_DEFAULT_KEYS = "reach,students,educators,skilled,livelihoods,women,farmers,health,households,pwd,area,waste,emissions";
const VERIFY = { verified: "verified", unverified: "not verified", pending: "verification pending" };
const DEFAULT_PROGRAMMES = [["incubator", "Incubator", "incubator", 1], ["accelerator", "Accelerator", "accelerator", 2], ["merimitti", "Meri Mitti", "other", 3], ["launchpad", "Launchpad", "other", 4], ["pragati", "Pragati", "pragati", 5], ["aiforimpact", "AI for Impact", "other", 6]];
const SUPPORT_TYPES = ["session or workshop", "introduction to a funder or partner", "mentoring", "office hours", "other"];
const NOTE_TYPES = ["meeting", "call", "email", "discussion", "other"];
const HEADLINE_DEFS = {
  participations: "Organisations supported: the number of programme participations (an organisation in two cohorts counts twice).",
  unique: "Unique organisations: distinct organisations among those participations.",
  founders: "Founders: founders recorded for the unique organisations, active or not.",
  womenFounders: "Women founders: women as a share of founders whose gender is recorded.",
  womenLed: "Women-led: the organisation's women-led flag where recorded; otherwise at least one woman founder.",
  operating: "Still operating: organisations with status 'operating', as a share of all unique organisations in scope. Organisations whose status is not recorded are shown separately.",
  shutdown: "Shut down: organisations with status 'shut down'.",
  forprofit: "Converted to for-profit: organisations recorded as having changed to a for-profit legal form.",
  grants: "the^delta grants given: sum of all grant tranches across participations in scope.",
  multiplier: "Incubator grant multiplier: funds raised in the year after the programme divided by the^delta grant, summed across Incubator participations that have both figures.",
  increase: "Accelerator increase in funds raised: (funds raised in the year after the programme − baseline) ÷ baseline, summed across participations that have both figures.",
  pragati: "Pragati AI for Impact funding outcome: as for the Accelerator; shown as due until the cohort's measurement date.",
  raised: "External funds raised: each organisation's latest recorded cumulative external funds raised.",
  employees: "Full-time team: each organisation's latest recorded full-time employees.",
  firstSupported: "First supported by the^delta: organisations for which the^delta was the first institutional supporter.",
  readiness: "Average readiness movement: end score minus start score, averaged across participations with both.",
  cumulative: "Cumulative impact: each organisation's latest cumulative figure; where only yearly figures exist, their sum.",
  sinceJoining: "Since joining: the sum of yearly figures from the financial year the organisation first joined the^delta.",
  latestYear: "Latest year: each organisation's most recent yearly figure."
};
const DEFAULT_CHECKS = {
  missingSector: { on: true, label: "Sector not recorded" },
  missingStatus: { on: true, label: "Operating status not recorded" },
  noParticipation: { on: true, label: "Not linked to any cohort" },
  founderGender: { on: true, label: "Founder gender not recorded" },
  bigGrant: { on: true, label: "Single grant tranche above threshold", threshold: 5000000 },
  bigMultiplier: { on: true, label: "Grant multiplier above threshold", threshold: 50 },
  impactJump: { on: true, label: "Yearly impact figure changed by more than threshold (×)", threshold: 10 },
  negative: { on: true, label: "Negative amount or count" },
  duplicateName: { on: true, label: "Possible duplicate organisation (same or similar name)" },
  noWebsite: { on: false, label: "Website not recorded" },
  outdated: { on: true, label: "Figures not updated within the threshold (months)", threshold: 18 },
  inconsistent: { on: true, label: "Figures that contradict each other" }
};

/* ---------- application state ---------- */
const S = {
  ready: false, db: null, user: null, me: null, downloads: null,
  role: null,               // "admin" | "team" | "viewer"
  programmes: {}, cohorts: {}, orgs: {}, edits: {},
  config: { app: null, metrics: null, checks: null },
  pub: { meta: null, chunks: {} },
  seen: {},
  loaded: new Set(), slow: false, error: null,
  facts: null, factsSource: null
};
const UI = {
  route: "overview", orgId: null,
  ov: { view: "portfolio", prog: null, track: "both", cohort: null, f: { year: "", sector: "", state: "", status: "" } },
  im: { view: "portfolio", prog: null, track: "both", cohort: null, measure: "cumulative", metric: "reach", breakdown: "sector", trend: "cumulative", tab: "impact", f: { year: "", sector: "", state: "", status: "" } },
  ol: { q: "", f: { prog: "", cohort: "", sector: "", status: "", wl: "", state: "", inc: "" }, sort: "name", mode: "table", open: null, openSec: null },
  st: { tab: "users" }, prSec: "identity", fundView: "annual", impTrend: "annual", prMetric: null,
  editing: 0, pendingRender: false
};

/* ---------- derived org view (merges admin record + editable record) ---------- */
function orgView(id) {
  const o = S.orgs[id] || {}, e = S.edits[id] || {};
  const f = e.f || {};
  const F = k => val(f[k]);
  const founders = (e.founders || []);
  const knownG = founders.filter(x => x.gender === "woman" || x.gender === "man" || x.gender === "other");
  const womenF = founders.filter(x => x.gender === "woman");
  let wl = F("womenLed");
  if (typeof wl !== "boolean") wl = knownG.length ? womenF.length > 0 : null;
  const parts = (o.parts || []).map(p => {
    const ov = e.partStatus?.[p.id];
    return { ...p, status: ov?.status || p.status || "", statusNote: ov?.note || "" };
  });
  const ext = (o.rounds || []).map(r => ({ ...r, amt: numOr(r.amt), fy: r.fy || toFY(r.date) })).filter(r => isNum(r.amt)).sort((a, b) => String(a.date || a.fy).localeCompare(String(b.date || b.fy)));
  const extByFY = {};
  for (const r of ext) if (r.fy) extByFY[r.fy] = (extByFY[r.fy] || 0) + r.amt;
  const extTotal = ext.length ? sum(ext.map(r => r.amt)) : null;
  const extLast = ext.length ? (ext[ext.length - 1].date || ext[ext.length - 1].fy) : null;
  for (const p of parts) {
    const c = S.cohorts[p.cohortId] || {};
    p.startD = p.start || c.start || ""; p.endD = p.end || c.end || "";
    const sFY = toFY(p.startD), eFY = toFY(p.endD);
    const sb = numOr(val(p.baseFunds)), sp = numOr(val(p.postFunds));
    const db = sFY && extByFY[fyShift(sFY, -1)] != null ? extByFY[fyShift(sFY, -1)] : null;
    const dp = eFY && extByFY[fyShift(eFY, 1)] != null ? extByFY[fyShift(eFY, 1)] : null;
    p.baseV = sb ?? db; p.baseHow = sb != null ? (val(p.baseFunds) != null && p.baseFunds?.src ? p.baseFunds.src : "recorded") : db != null ? "from funding records, " + fyShift(sFY, -1) : "";
    p.postV = sp ?? dp; p.postHow = sp != null ? (p.postFunds?.src || "recorded") : dp != null ? "from funding records, " + fyShift(eFY, 1) : "";
    p.disbursed = sum((p.grants || []).map(g => numOr(g.amt)));
    p.approvedV = numOr(p.approved);
  }
  const raisedSeries = [];
  { let run = 0; for (const fy of Object.keys(extByFY).sort()) { run += extByFY[fy]; raisedSeries.push({ asOf: fy, v: run }); } }
  const teamSeries = (o.team || []).slice().sort((a, b) => String(a.asOf).localeCompare(String(b.asOf)));
  return {
    id, o, e, f, F,
    name: F("displayName") || o.name || "(unnamed organisation)",
    former: e.formerNames || [],
    sector: F("sector") || "", status: F("status") || "", states: (F("states") || []).map(stateCode).filter(Boolean),
    hq: F("hq") || "", inc: F("incorporated") || "", yearStarted: F("yearStarted") || "",
    website: F("website") || "", linkedin: F("linkedin") || "",
    wl, founders, womenF: womenF.length, knownG: knownG.length,
    fp: F("convertedForProfit") === true, bs: F("brightSpark") === true, first: F("firstSupported") === true,
    parts, raisedSeries, teamSeries, ext, extByFY, extTotal, extLast,
    merged: !!o.mergedInto
  };
}
const liveOrgIds = () => Object.keys(S.orgs).filter(id => !S.orgs[id].mergedInto);

/* ---------- impact per organisation ---------- */
function orgImpact(ov, joinFY) {
  const out = {};
  const by = {};
  for (const en of (ov.o.impact || [])) {
    const k = en.metric; if (!k || !isNum(+en.value)) continue;
    (by[k] = by[k] || []).push({ ...en, value: +en.value });
  }
  for (const k in by) {
    const list = by[k];
    const cum = list.filter(x => x.kind === "cumulative").sort((a, b) => String(a.fy || a.asOf).localeCompare(String(b.fy || b.asOf)));
    const ann = list.filter(x => x.kind !== "cumulative").sort((a, b) => String(a.fy).localeCompare(String(b.fy)));
    const annBy = {};
    for (const a of ann) if (a.fy) annBy[a.fy] = (annBy[a.fy] || 0) + a.value;
    const r = { ann: annBy, methods: {} };
    if (cum.length) { const c = cum[cum.length - 1]; r.cum = c.value; r.cumM = c.method || ""; r.cumFy = c.fy || toFY(c.asOf); r.cumSrc = c.src || ""; }
    else if (ann.length) { r.cum = sum(ann.map(a => a.value)); r.cumM = ann[ann.length - 1].method || ""; r.cumFy = ann[ann.length - 1].fy; r.cumSrc = ann[ann.length - 1].src || ""; r.cumFromAnn = true; }
    if (ann.length) {
      const last = ann[ann.length - 1];
      r.latest = annBy[last.fy]; r.latestFy = last.fy; r.latestM = last.method || "";
      if (joinFY) {
        const since = ann.filter(a => fyStart(a.fy) >= fyStart(joinFY));
        if (since.length) { r.since = sum(since.map(a => a.value)); r.sinceM = since[since.length - 1].method || ""; }
      }
    }
    out[k] = r;
  }
  return out;
}

/* ---------- facts: one row per participation, one per organisation ----------
   The same rows feed every number on Overview and Impact, for every role.
   Staff build them from the live records; everyone else reads the published copy. */
function buildFacts() {
  const parts = [], orgs = [];
  const metricsStd = (S.config.metrics?.std || DEFAULT_METRICS);
  const stdKeys = new Set(metricsStd.map(m => m.key));
  for (const id of liveOrgIds()) {
    const ov = orgView(id);
    let grantsN = 0;
    let joinDate = null;
    for (const p of ov.parts) {
      const c = S.cohorts[p.cohortId]; if (!c) continue;
      const g = (p.grants || []).map(x => +x.amt).filter(isNum);
      grantsN += g.length;
      if (c.start && (!joinDate || c.start < joinDate)) joinDate = c.start;
      parts.push({
        id: p.id, o: id, c: p.cohortId, p: c.programmeId, tr: c.track || "", yr: c.year || (c.start ? +c.start.slice(0, 4) : null),
        g: g.length ? sum(g) : null, gn: g.length, base: p.baseV ?? null, post: p.postV ?? null,
        rs: isNum(+p.readiness?.start) && p.readiness?.start !== "" && p.readiness?.start != null ? +p.readiness.start : null,
        re: isNum(+p.readiness?.end) && p.readiness?.end !== "" && p.readiness?.end != null ? +p.readiness.end : null,
        ps: p.status || ""
      });
    }
    const joinFY = joinDate ? toFY(joinDate) : null;
    const imp = orgImpact(ov, joinFY);
    const own = (ov.o.own || []).map(m => {
      const r = imp["own:" + m.name] || {};
      return { name: m.name, unit: m.unit || "", linked: stdKeys.has(m.linkedTo) ? m.linkedTo : "", latest: r.cum ?? r.latest ?? null, fy: r.cumFy || r.latestFy || "" };
    });
    // own measures linked to a standard metric count towards it, unless the organisation already reports that metric directly
    for (const m of (ov.o.own || [])) {
      if (!m.linkedTo || !stdKeys.has(m.linkedTo)) continue;
      const r = imp["own:" + m.name];
      if (r && !imp[m.linkedTo]) imp[m.linkedTo] = { ...r, viaOwn: m.name };
    }
    const stdImp = {};
    for (const k of stdKeys) if (imp[k]) stdImp[k] = imp[k];
    const lastRaised = ov.extTotal != null ? { v: ov.extTotal } : null;
    const lastTeam = ov.teamSeries[ov.teamSeries.length - 1];
    const lv = ov.o.livelihoods || {};
    orgs.push({
      o: id, n: ov.name, sec: ov.sector, st: ov.states, hq: ov.hq, inc: ov.inc ? +String(ov.inc).slice(0, 4) : (ov.yearStarted ? +ov.yearStarted : null),
      s: ov.status, fp: ov.fp, wl: ov.wl, f: ov.founders.length, fw: ov.womenF, fk: ov.knownG,
      raised: lastRaised ? +lastRaised.v : null, emp: lastTeam && isNum(+lastTeam.ft) && lastTeam.ft !== "" ? +lastTeam.ft : null,
      first: ov.first, bs: ov.bs, aw: (ov.o.awards || []).map(a => a.name + (a.year ? " (" + a.year + ")" : "")),
      ws: val(ov.f.whoServe) || "", gn: grantsN, imp: stdImp, own,
      lv: { people: isNum(+lv.people) && lv.people !== "" ? +lv.people : null, avg: isNum(+lv.avgIncrease) && lv.avgIncrease !== "" ? +lv.avgIncrease : null, total: isNum(+lv.totalIncome) && lv.totalIncome !== "" ? +lv.totalIncome : null, fy: lv.fy || "" },
      ownUnlinked: own.filter(m => !m.linked).length
    });
  }
  const cohorts = {};
  for (const [id, c] of Object.entries(S.cohorts)) cohorts[id] = { name: c.name, programmeId: c.programmeId, track: c.track || "", start: c.start || "", end: c.end || "", year: c.year || null, funders: c.funders || [], outcomeDue: c.outcomeDue || "", satisfaction: isNum(+c.satisfaction) && c.satisfaction !== "" && c.satisfaction != null ? +c.satisfaction : null, number: c.number ?? null };
  const programmes = {};
  for (const [id, p] of Object.entries(S.programmes)) programmes[id] = { name: p.name, kind: p.kind, order: p.order ?? 0 };
  return {
    parts, orgs, cohorts, programmes,
    metrics: metricsStd,
    defs: { ...HEADLINE_DEFS, ...(S.config.metrics?.defs || {}) },
    brightSparkDef: S.config.app?.brightSparkDef || "",
    updated: nowISO()
  };
}

/* ---------- scope + filters ---------- */
function progList(F) {
  return Object.entries(F.programmes).map(([id, p]) => ({ id, ...p })).sort((a, b) => (a.order - b.order) || a.name.localeCompare(b.name));
}
function cohortsOf(F, progId, track) {
  return Object.entries(F.cohorts).map(([id, c]) => ({ id, ...c }))
    .filter(c => (!progId || c.programmeId === progId) && (!track || track === "both" || !c.track || c.track === track))
    .sort((a, b) => (String(a.start).localeCompare(String(b.start))) || a.name.localeCompare(b.name));
}
function scoped(F, st) {
  const om = Object.fromEntries(F.orgs.map(o => [o.o, o]));
  const f = st.f;
  const okOrg = o => o &&
    (!f.sector || o.sec === f.sector) &&
    (!f.state || (o.st || []).includes(f.state)) &&
    (!f.status || (o.s || "not known") === f.status);
  let parts = F.parts.filter(p => okOrg(om[p.o]) && (!f.year || String(p.yr) === String(f.year)));
  if (st.view !== "portfolio" && st.prog) {
    parts = parts.filter(p => p.p === st.prog);
    const prog = F.programmes[st.prog];
    if (prog?.kind === "accelerator" && st.track && st.track !== "both") parts = parts.filter(p => !p.tr || p.tr === st.track);
  }
  const ids = uniq(parts.map(p => p.o));
  return { parts, orgs: ids.map(i => om[i]), om };
}

/* ---------- headline calculations ---------- */
function headline(parts, orgs, F) {
  const r = {};
  r.participations = parts.length;
  r.unique = orgs.length;
  r.founders = sum(orgs.map(o => o.f));
  const fk = sum(orgs.map(o => o.fk)), fw = sum(orgs.map(o => o.fw));
  r.womenFounders = fk ? fw / fk : null; r.womenFoundersN = fk; r.womenFoundersCount = fw;
  const wlKnown = orgs.filter(o => typeof o.wl === "boolean");
  r.womenLed = wlKnown.filter(o => o.wl).length; r.womenLedPct = orgs.length ? r.womenLed / orgs.length : null; r.womenLedKnown = wlKnown.length;
  const st = k => orgs.filter(o => (o.s || "not known") === k).length;
  r.operating = st("operating"); r.shutdown = st("shut down"); r.dormant = st("dormant"); r.statusUnknown = st("not known") + orgs.filter(o => o.s && !STATUS.includes(o.s)).length;
  r.operatingPct = orgs.length ? r.operating / orgs.length : null;
  r.shutdownPct = orgs.length ? r.shutdown / orgs.length : null;
  r.forprofit = orgs.filter(o => o.fp).length;
  const gp = parts.filter(p => isNum(p.g));
  r.grants = gp.length ? sum(gp.map(p => p.g)) : null; r.grantsN = uniq(gp.map(p => p.o)).length;
  r.multiGrant = orgs.filter(o => o.gn > 1).length;
  const kindOf = p => F.programmes[p.p]?.kind;
  const inc = parts.filter(p => kindOf(p) === "incubator" && isNum(p.g) && p.g > 0 && isNum(p.post));
  r.multiplier = inc.length ? sum(inc.map(p => p.post)) / sum(inc.map(p => p.g)) : null; r.multiplierN = inc.length;
  r.multiplierAll = parts.filter(p => kindOf(p) === "incubator").length;
  const acc = parts.filter(p => kindOf(p) === "accelerator" && isNum(p.base) && p.base > 0 && isNum(p.post));
  r.increase = acc.length ? (sum(acc.map(p => p.post)) - sum(acc.map(p => p.base))) / sum(acc.map(p => p.base)) : null; r.increaseN = acc.length;
  r.increaseAll = parts.filter(p => kindOf(p) === "accelerator").length;
  const prag = parts.filter(p => kindOf(p) === "pragati");
  const today = new Date().toISOString().slice(0, 10);
  const pragDue = prag.filter(p => { const c = F.cohorts[p.c]; return c && c.outcomeDue && c.outcomeDue > today; });
  const pragMeas = prag.filter(p => !pragDue.includes(p) && isNum(p.base) && p.base > 0 && isNum(p.post));
  r.pragatiAll = prag.length; r.pragatiN = pragMeas.length; r.pragatiDue = prag.length > 0 && pragMeas.length === 0;
  r.pragatiDueDate = uniq(pragDue.map(p => F.cohorts[p.c].outcomeDue)).sort()[0] || "";
  r.pragati = pragMeas.length ? (sum(pragMeas.map(p => p.post)) - sum(pragMeas.map(p => p.base))) / sum(pragMeas.map(p => p.base)) : null;
  const rp = orgs.filter(o => isNum(o.raised));
  r.raised = rp.length ? sum(rp.map(o => o.raised)) : null; r.raisedN = rp.length;
  const ep = orgs.filter(o => isNum(o.emp));
  r.employees = ep.length ? sum(ep.map(o => o.emp)) : null; r.employeesN = ep.length;
  r.firstSupported = orgs.filter(o => o.first).length;
  r.brightSparks = orgs.filter(o => o.bs).length;
  r.awards = sum(orgs.map(o => o.aw.length)); r.awardOrgs = orgs.filter(o => o.aw.length).length;
  const rd = parts.filter(p => isNum(p.rs) && isNum(p.re));
  r.readiness = rd.length ? sum(rd.map(p => p.re - p.rs)) / rd.length : null; r.readinessN = rd.length;
  r.readinessFrom = rd.length ? sum(rd.map(p => p.rs)) / rd.length : null; r.readinessTo = rd.length ? sum(rd.map(p => p.re)) / rd.length : null;
  return r;
}

/* ---------- impact calculations ---------- */
function impactOf(o, key, measure) {
  const r = o.imp?.[key]; if (!r) return null;
  if (measure === "cumulative") return isNum(r.cum) ? { v: r.cum, fy: r.cumFy, m: r.cumM, via: r.viaOwn } : null;
  if (measure === "since") return isNum(r.since) ? { v: r.since, fy: r.latestFy, m: r.sinceM, via: r.viaOwn } : null;
  return isNum(r.latest) ? { v: r.latest, fy: r.latestFy, m: r.latestM, via: r.viaOwn } : null;
}
function impactTotals(orgs, key, measure) {
  const rows = orgs.map(o => ({ o, x: impactOf(o, key, measure) })).filter(r => r.x);
  const total = sum(rows.map(r => r.x.v));
  const recorded = sum(rows.filter(r => r.x.m === "record" || r.x.m === "evaluation").map(r => r.x.v));
  return { total, n: rows.length, rows, recordedShare: total ? recorded / total : null };
}

/* ---------- data checks ---------- */
function runChecks() {
  const rules = { ...DEFAULT_CHECKS, ...(S.config.checks?.rules || {}) };
  const out = [];
  const flag = (id, key, msg) => out.push({ id, key, msg, label: rules[key]?.label || key });
  const names = {};
  for (const id of liveOrgIds()) {
    const ov = orgView(id);
    const res = ov.o.flagsRes || {};
    const push = (key, msg) => { if (rules[key]?.on && !res[key + ":" + msg]) flag(id, key, msg); };
    if (!ov.sector) push("missingSector", "");
    if (!ov.status) push("missingStatus", "");
    if (!ov.parts.length) push("noParticipation", "");
    const ng = ov.founders.filter(f => !f.gender).length;
    if (ng) push("founderGender", ng + " founder" + (ng > 1 ? "s" : ""));
    if (!ov.website) push("noWebsite", "");
    for (const p of ov.parts) {
      for (const g of (p.grants || [])) {
        if (+g.amt > (rules.bigGrant?.threshold ?? Infinity)) push("bigGrant", fmtINR(+g.amt) + " in " + (S.cohorts[p.cohortId]?.name || "a cohort"));
        if (+g.amt < 0) push("negative", "grant " + fmtINR(+g.amt));
      }
      const gs = sum((p.grants || []).map(x => +x.amt));
      const post = +val(p.postFunds);
      if (gs > 0 && isNum(post) && post / gs > (rules.bigMultiplier?.threshold ?? Infinity)) push("bigMultiplier", fmtX(post / gs) + " in " + (S.cohorts[p.cohortId]?.name || "a cohort"));
    }
    const byM = {};
    for (const en of (ov.o.impact || [])) {
      if (+en.value < 0) push("negative", "impact " + en.metric + " " + en.value);
      if (en.kind !== "cumulative" && en.fy) (byM[en.metric] = byM[en.metric] || []).push(en);
    }
    for (const m in byM) {
      const l = byM[m].sort((a, b) => String(a.fy).localeCompare(String(b.fy)));
      for (let i = 1; i < l.length; i++) {
        const a = +l[i - 1].value, b = +l[i].value;
        const t = rules.impactJump?.threshold ?? Infinity;
        if (a > 0 && b > 0 && (b / a > t || a / b > t)) push("impactJump", m + " " + l[i - 1].fy + " → " + l[i].fy);
      }
    }
    const ageM = d => { if (!d) return null; const t0 = /^\d{4}-\d{2}$/.test(d) && toFY(d) === d ? new Date(fyStart(d) + 1, 2, 31) : new Date(d); return isNaN(t0) ? null : (Date.now() - t0) / 2.63e9; };
    const lim = rules.outdated?.threshold ?? Infinity;
    const lastOf = (arr, k) => (arr || []).map(x => x[k]).filter(Boolean).sort().pop();
    for (const [lab, d] of [["team size", lastOf(ov.o.team, "asOf")], ["finances", lastOf(ov.o.fin, "fy")], ["impact", lastOf(ov.o.impact, "fy")]]) {
      const a = ageM(d); if (a != null && a > lim) push("outdated", lab + " last recorded " + d);
    }
    for (const t of (ov.o.team || [])) if (numOr(t.women) != null && numOr(t.women) > (numOr(t.ft) || 0) + (numOr(t.pt) || 0)) push("inconsistent", "women employees above total team on " + t.asOf);
    for (const p of ov.parts) if (p.approvedV != null && p.disbursed > p.approvedV) push("inconsistent", "disbursed more than approved in " + (S.cohorts[p.cohortId]?.name || "a cohort"));
    const impL = orgImpact(ov, null);
    for (const m of (S.config.metrics?.std || DEFAULT_METRICS)) if (m.parent && impL[m.key]?.cum != null && impL[m.parent]?.cum != null && impL[m.key].cum > impL[m.parent].cum) push("inconsistent", m.label + " larger than " + (impL[m.parent] ? "people reached" : ""));
    const n = norm(ov.name); if (n) (names[n] = names[n] || []).push(id);
    for (const fn of ov.former) { const k = norm(fn); if (k && k !== n) (names[k] = names[k] || []).push(id); }
  }
  for (const k in names) {
    const ids = uniq(names[k]);
    if (ids.length > 1) for (const id of ids) {
      const others = ids.filter(x => x !== id).map(x => orgView(x).name).join(", ");
      const res = S.orgs[id]?.flagsRes || {};
      if (rules.duplicateName?.on && !res["duplicateName:" + others]) flag(id, "duplicateName", others);
    }
  }
  return out;
}

