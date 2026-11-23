/* ---------- import data (Settings › Import data) ----------
   1 choose a file (or paste rows)  2 map columns  3 match organisations and cohorts  4 review and import
   New figures are added as dated records; identity values keep the old value in history. Re-importing the same file adds no duplicates. */
const XLSX_URL = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
let xlsxP = null;
function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (window.__loadXLSX) return window.__loadXLSX().then(m => (window.XLSX = m.default && m.default.utils ? m.default : m));
  if (!xlsxP) xlsxP = new Promise((res, rej) => { const sc = document.createElement("script"); sc.src = XLSX_URL; sc.onload = () => res(window.XLSX); sc.onerror = () => { xlsxP = null; rej(new Error("load")); }; document.head.appendChild(sc); });
  return xlsxP;
}
const IMP = { step: 1, fileName: "", sheets: null, sheet: "", grid: null, headerRow: 0, source: "", asOf: "", fy: "", map: {}, units: {}, rows: null, matches: null, cohortMap: {}, mode: "newer", plan: null, busy: false, progress: "", report: null, wb: null };

/* what a column can be loaded into */
function importTargets() {
  const M = S.config.metrics?.std || DEFAULT_METRICS;
  const T = [
    ["Identity", "name", "Organisation name (used for matching)", "text"], ["Identity", "former", "Former names or abbreviations", "list"], ["Identity", "legalName", "Legal name", "text"],
    ["Identity", "legalForm", "Legal structure", "text"], ["Identity", "sector", "Sector", "text"], ["Identity", "status", "Operating status", "status"], ["Identity", "website", "Website", "url"],
    ["Identity", "linkedin", "Organisation LinkedIn", "url"], ["Identity", "hq", "Head office city", "text"], ["Identity", "states", "States of operation", "list"], ["Identity", "yearStarted", "Year of establishment", "year"],
    ["Identity", "incorporated", "Date of incorporation", "date"], ["Identity", "description", "Description", "text"], ["Identity", "tagline", "Tagline", "text"], ["Identity", "whoServe", "Target beneficiaries", "text"],
    ["Identity", "revenueModel", "Revenue model", "text"], ["Identity", "stage", "Organisation stage", "text"], ["Identity", "womenLed", "Women-led (yes/no)", "bool"], ["Identity", "brightSpark", "Bright Spark (yes/no)", "bool"],
    ["Identity", "firstSupported", "First supported by the^delta (yes/no)", "bool"], ["Identity", "convertedForProfit", "Converted to for-profit (yes/no)", "bool"],
    ["People", "founders", "Founder names (several in one cell)", "list"],
    ...[1, 2, 3].flatMap(n => [["People", "f" + n + "name", "Founder " + n + " name", "text"], ["People", "f" + n + "gender", "Founder " + n + " gender", "gender"], ["People", "f" + n + "linkedin", "Founder " + n + " LinkedIn", "url"], ["People", "f" + n + "education", "Founder " + n + " education", "text"], ["People", "f" + n + "role", "Founder " + n + " role", "text"]]),
    ["People", "headName", "Head of organisation", "text"], ["People", "email", "Contact email", "text"], ["People", "phone", "Contact phone", "text"],
    ["Journey", "cohort", "Cohort", "cohort"], ["Journey", "partStatus", "Participation status", "text"], ["Journey", "grant", "the^delta grant disbursed", "money"], ["Journey", "grantDate", "Grant disbursement date", "date"],
    ["Journey", "approved", "the^delta grant approved", "money"], ["Journey", "rs", "Readiness at entry", "number"], ["Journey", "re", "Readiness at completion", "number"],
    ["Journey", "base", "External funds raised the year before the programme", "money"], ["Journey", "post", "External funds raised the year after the programme", "money"], ["Journey", "graduated", "Graduation date", "date"], ["Journey", "awards", "Awards and recognitions", "list"],
    ["Funding", "extAmt", "External funding amount", "money"], ["Funding", "extWhen", "External funding date or financial year", "when"], ["Funding", "extFunder", "External funder", "text"], ["Funding", "extType", "External funding type", "text"],
    ["Team", "ft", "Full-time employees", "number"], ["Team", "pt", "Part-time employees", "number"], ["Team", "women", "Women employees", "number"], ["Team", "teamAsOf", "Team figures as of (date)", "date"],
    ["Finances", "revenue", "Total income / revenue", "money"], ["Finances", "grantIncome", "Grant income", "money"], ["Finances", "finFY", "Financial year of income", "fy"],
    ...M.flatMap(m => [["Impact", "imp:" + m.key + ":annual", m.label + " (for the year)", "number"], ["Impact", "imp:" + m.key + ":cumulative", m.label + " (cumulative to date)", "number"]]),
    ["Impact", "own", "Own impact measure: name", "text"], ["Impact", "ownVal", "Own impact measure: value", "number"], ["Impact", "impFY", "Financial year of impact figures", "fy"], ["Impact", "impMethod", "How impact was measured", "method"],
    ["Impact", "lvPeople", "People with increased income", "number"], ["Impact", "lvAvg", "Average income increase per person", "money"], ["Impact", "lvTotal", "Total income enabled", "money"],
    ["Notes", "note", "Note to add", "text"]
  ];
  return T.map(([g, k, l, t]) => ({ g, k, l, t }));
}
const tgt = k => importTargets().find(t => t.k === k);
function stableStr(o) { if (Array.isArray(o)) return "[" + o.map(stableStr).join(",") + "]"; if (o && typeof o === "object") return "{" + Object.keys(o).sort().filter(k => o[k] !== undefined).map(k => JSON.stringify(k) + ":" + stableStr(o[k])).join(",") + "}"; return JSON.stringify(o); }

/* ---------- parsing ---------- */
function parseAmount(x, unit) {
  if (x == null || x === "") return null;
  if (typeof x === "number") return x * (unit === "crore" ? 1e7 : unit === "lakh" ? 1e5 : 1);
  let s0 = String(x).toLowerCase().replace(/₹|rs\.?|inr|\/-/g, "").replace(/,/g, "").trim();
  if (!s0 || /^(na|n\/a|nil|-|–|—|not available)$/.test(s0)) return null;
  const m = /(-?\d+(\.\d+)?)\s*(crores?|cr|lakhs?|lacs?|l|k|thousand|mn|million)?/.exec(s0);
  if (!m) return null;
  const n = +m[1], u = m[3] || "";
  if (/^cr/.test(u)) return n * 1e7;
  if (/^(lakh|lac|l$)/.test(u)) return n * 1e5;
  if (u === "k" || u === "thousand") return n * 1e3;
  if (u === "mn" || u === "million") return n * 1e6;
  return n * (unit === "crore" ? 1e7 : unit === "lakh" ? 1e5 : 1);
}
function parseNum(x) { if (x == null || x === "") return null; if (typeof x === "number") return x; const s0 = String(x).replace(/,/g, "").trim(); const m = /-?\d+(\.\d+)?/.exec(s0); return m ? +m[0] : null; }
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
const iso = (y, m, d) => y + "-" + String(m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
function parseDate(x) {
  if (x == null || x === "") return null;
  if (x instanceof Date && !isNaN(x)) return iso(x.getFullYear(), x.getMonth(), x.getDate());
  if (typeof x === "number" && x > 20000 && x < 80000) { const d = new Date(Math.round((x - 25569) * 864e5)); return iso(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); }
  const s0 = String(x).trim();
  let m;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s0))) return iso(+m[1], +m[2] - 1, +m[3]);
  if ((m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/.exec(s0))) { const y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; return iso(y, +m[2] - 1, +m[1]); } // Indian dd/mm/yyyy
  if ((m = /^(?:(\d{1,2})[\s\-]+)?([a-z]{3,9})[\s,'\-]+(\d{2,4})$/i.exec(s0))) {
    const mo = MONTHS[m[2].slice(0, 4).toLowerCase()] ?? MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (mo != null) { const y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; return iso(y, mo, m[1] ? +m[1] : 1); }
  }
  if ((m = /^(\d{4})$/.exec(s0))) return iso(+m[1], 0, 1);
  return null;
}
function parseFY(x) {
  if (x == null || x === "") return null;
  const s0 = String(x).trim().toUpperCase().replace(/^FY\s*/, "");
  let m;
  if ((m = /^(\d{4})\s*[-–\/]\s*(\d{2,4})$/.exec(s0))) return fyOf(+m[1]);
  if ((m = /^(\d{2})\s*[-–\/]\s*(\d{2})$/.exec(s0))) return fyOf(2000 + +m[1]);
  if ((m = /^(\d{2})$/.exec(s0))) return fyOf(2000 + +m[1] - 1); // FY25 = 2024-25
  if ((m = /^(\d{4})$/.exec(s0))) return fyOf(+m[1] - 1);       // FY2025 = 2024-25
  const d = parseDate(x); return d ? toFY(d) : null;
}
function parseBool(x) { const s0 = String(x ?? "").trim().toLowerCase(); if (!s0) return null; if (/^(y|yes|true|1|✓|✔|x)$/.test(s0)) return true; if (/^(n|no|false|0)$/.test(s0)) return false; return null; }
function parseGender(x) { const s0 = String(x ?? "").trim().toLowerCase(); if (!s0) return ""; if (/^(f|female|woman|women|w)$/.test(s0)) return "woman"; if (/^(m|male|man|men)$/.test(s0)) return "man"; return "other"; }
function parseStatus(x) { const s0 = String(x ?? "").toLowerCase(); if (!s0.trim()) return ""; if (/shut|closed|defunct|wound/.test(s0)) return "shut down"; if (/dormant|inactive|paused/.test(s0)) return "dormant"; if (/operat|active|running|alive|yes/.test(s0)) return "operating"; return ""; }
function parseMethod(x) { const s0 = String(x ?? "").toLowerCase(); if (/record|actual|mis|data/.test(s0)) return "record"; if (/survey|sample/.test(s0)) return "survey"; if (/estim|approx|project/.test(s0)) return "estimate"; if (/evaluat|sattva|deloitte|audit/.test(s0)) return "evaluation"; return ""; }
const splitList = x => String(x ?? "").split(/[,;\n\/|]| and | & /i).map(t => t.trim()).filter(Boolean);
function cellText(x) { return x instanceof Date ? parseDate(x) : String(x ?? "").trim(); }

/* ---------- guessing column meaning from its header ---------- */
function guessTarget(head) {
  const t = String(head || "").toLowerCase();
  const M = S.config.metrics?.std || DEFAULT_METRICS;
  const cum = /cumulat|till date|to date|life ?time|ltd|total/.test(t) ? "cumulative" : "annual";
  const rules = [
    [/^(organi[sz]ation|org|enterprise|startup|company)( name)?$|name of (the )?(organi[sz]ation|org|enterprise)|^name$/, "name"],
    [/former|previous name|also known|aka|abbrev/, "former"], [/legal name|registered name|entity name/, "legalName"], [/legal (form|structure|entity type)|registration type/, "legalForm"],
    [/sector|domain|thematic/, "sector"], [/operat|current status|status of org|alive|^status$/, "status"], [/web ?site|url/, "website"], [/linked ?in/, "linkedin"],
    [/head ?office|hq|city|headquarter/, "hq"], [/states?( of operation)?|geograph|presence/, "states"], [/year of (estab|found)|founded in|established/, "yearStarted"], [/incorporat/, "incorporated"],
    [/description|what (they|it) do|about/, "description"], [/tagline/, "tagline"], [/beneficiar(y|ies) (type|group)|who (they )?serve|target (group|beneficiar)/, "whoServe"], [/revenue model|business model/, "revenueModel"],
    [/women[- ]led/, "womenLed"], [/bright ?spark/, "brightSpark"], [/for[- ]profit/, "convertedForProfit"],
    [/founder.*gender|gender/, "f1gender"], [/founder.*educ|education/, "f1education"], [/founder.*linked ?in/, "f1linkedin"], [/^(founder|founder ?(1|one)|founder'?s? name|founder ?1 name|primary founder)$/, "f1name"], [/founder ?(2|two)/, "f2name"], [/founder ?(3|three)/, "f3name"], [/founders( names?)?$|co-?founders?/, "founders"],
    [/^head|ceo|executive director/, "headName"], [/e-?mail/, "email"], [/phone|mobile|contact (no|number)|whatsapp/, "phone"],
    [/cohort|batch/, "cohort"], [/participation|programme status|program status/, "partStatus"], [/grant (approved|sanction)/, "approved"], [/disburse|grant( amount)?|the\^?delta (grant|funding)/, "grant"],
    [/readiness.*(start|entry|before|baseline)|baseline readiness/, "rs"], [/readiness.*(end|exit|after|final)|final readiness/, "re"],
    [/baseline (fund|raise)|raised before|pre[- ]programme/, "base"], [/year after|post[- ]programme|raised after|after graduation/, "post"], [/graduat/, "graduated"], [/award|accolade|recognition/, "awards"],
    [/funder|investor|donor/, "extFunder"], [/funds? raised|external fund|amount raised/, "extAmt"],
    [/full[- ]?time|fte/, "ft"], [/part[- ]?time/, "pt"], [/women (employees|staff)|female (employees|staff)/, "women"],
    [/grant income/, "grantIncome"], [/revenue|income|turnover|budget/, "revenue"], [/financial year|^fy$/, "impFY"], [/method|how measured|measurement/, "impMethod"],
    [/income enabled|additional income|total income increase/, "lvTotal"], [/average (income )?increase/, "lvAvg"], [/increased income|income increase/, "lvPeople"]
  ];
  for (const [re, k] of rules) if (re.test(t)) return k;
  const metricRules = [["reach", /people (directly )?reached|beneficiar|lives (touched|impacted)|people (served|impacted)|outreach/], ["students", /student|children|child/], ["educators", /teacher|educator/], ["skilled", /train|skill/], ["livelihoods", /livelihood|jobs/], ["women", /women( and girls)? (reached|served|impacted)|girls/], ["farmers", /farmer/], ["health", /patient|health/], ["households", /household|families/], ["pwd", /disabilit|pwd/], ["area", /acre|hectare|land/], ["waste", /waste|emission|co2|carbon/]];
  for (const [k, re] of metricRules) if (re.test(t) && M.some(m => m.key === k)) return "imp:" + k + ":" + cum;
  return "";
}

/* ---------- matching ---------- */
function bigrams(t) { const s0 = " " + t + " "; const out = []; for (let i = 0; i < s0.length - 1; i++) out.push(s0.slice(i, i + 2)); return out; }
function dice(a, b) { if (!a || !b) return 0; if (a === b) return 1; const A = bigrams(a), B = bigrams(b); const m = new Map(); for (const x of A) m.set(x, (m.get(x) || 0) + 1); let n = 0; for (const x of B) { const c = m.get(x); if (c) { n++; m.set(x, c - 1); } } return 2 * n / (A.length + B.length); }
function orgIndex() {
  const out = [];
  for (const id of liveOrgIds()) { const ov = orgView(id); for (const n of uniq([ov.name, ...ov.former, val(ov.f.legalName)].filter(Boolean))) out.push({ id, key: norm(n), raw: n }); }
  return out;
}
function matchName(name, idx) {
  const k = norm(name); if (!k) return { kind: "none" };
  const exact = uniq(idx.filter(x => x.key === k).map(x => x.id));
  if (exact.length === 1) return { kind: "exact", id: exact[0] };
  if (exact.length > 1) return { kind: "likely", id: exact[0], alts: exact, why: "more than one record has this name" };
  let best = null;
  for (const x of idx) { const sc = dice(k, x.key); if (!best || sc > best.sc) best = { ...x, sc }; }
  if (best && best.sc >= 0.86) return { kind: "likely", id: best.id, why: "similar to " + best.raw + " (" + Math.round(best.sc * 100) + "%)" };
  return { kind: "none" };
}
function matchCohort(label) {
  const k = norm(label); if (!k) return null;
  for (const [id, c] of Object.entries(S.cohorts)) if (norm(c.name) === k || (c.aliases || []).some(a => norm(a) === k)) return id;
  return null;
}

/* ---------- the page ---------- */
function setImport() {
  const steps = ["Choose data", "Map columns", "Match organisations", "Review and import"];
  const bar = h("div", { class: "ptabs" }, steps.map((t, i) => h("button", { type: "button", class: IMP.step === i + 1 ? "on" : null, disabled: IMP.busy || (i + 1 > 1 && !IMP.grid) || (i + 1 > 2 && !Object.values(IMP.map).includes("name")) || (i + 1 > 3 && !IMP.matches), onclick: () => { goStep(i + 1); } }, (i + 1) + " · " + t)));
  const body = IMP.report ? impReport() : IMP.step === 1 ? impStep1() : IMP.step === 2 ? impStep2() : IMP.step === 3 ? impStep3() : impStep4();
  return h("div", null, bar, body);
}
function goStep(n) {
  if (n >= 3 && !Object.values(IMP.map).includes("name")) { toast("Map one column to “Organisation name” first.", true); return; }
  if (n === 3 && !IMP.matches) buildRows();
  if (n === 4) IMP.plan = buildPlan();
  IMP.step = n; render();
}
function impStep1() {
  const fileIn = h("input", { type: "file", accept: ".xlsx,.xls,.csv,.tsv", onchange: async e => {
    const f = e.target.files[0]; if (!f) return;
    IMP.fileName = f.name; IMP.source = IMP.source || f.name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ");
    try {
      const X = await loadXLSX();
      const buf = await f.arrayBuffer();
      IMP.wb = X.read(buf, { type: "array", cellDates: true });
      IMP.sheets = IMP.wb.SheetNames; IMP.sheet = IMP.sheets[0];
      readSheet(); toast("Read " + f.name);
    } catch (er) { toast(er.message === "load" ? "The spreadsheet reader couldn't load. Paste the rows below instead." : "This file couldn't be read. Save it as .xlsx or .csv, or paste the rows below.", true); }
    render();
  } });
  const paste = h("textarea", { placeholder: "Or copy the rows (with the header row) from a spreadsheet and paste them here", style: { minHeight: "90px" } });
  const meta = formFields([{ k: "source", label: "Source name (shown beside every value)", required: true, placeholder: "e.g. SocEnt Key Metrics 2025" }, { k: "asOf", label: "Figures refer to (date)", type: "date", help: "Used when a row has no date of its own." }, { k: "fy", label: "Financial year of figures", placeholder: "e.g. 2024-25", help: "Used when a row has no financial year of its own." }], { source: IMP.source, asOf: IMP.asOf, fy: IMP.fy });
  const saveMeta = () => { const r = meta.read(); IMP.source = r.source; IMP.asOf = r.asOf; IMP.fy = parseFY(r.fy) || ""; };
  for (const el of Object.values(meta.els)) el.addEventListener("change", saveMeta);
  const grid = IMP.grid;
  return h("div", { class: "panel" },
    h("h2", null, "choose the data"),
    h("p", { class: "small muted", style: { maxWidth: "75ch" } }, "Load one sheet at a time: the Contact List, Key Metrics 2025, Catalysts for Change, or a sheet of Sattva or Deloitte findings. Each row can be one organisation, or one organisation in one cohort. Nothing is saved until the last step."),
    h("div", { style: { display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", margin: "10px 0" } }, fileIn, IMP.fileName ? h("span", { class: "small" }, IMP.fileName) : null,
      IMP.sheets && IMP.sheets.length > 1 ? h("select", { "aria-label": "Sheet", onchange: e => { IMP.sheet = e.target.value; readSheet(); render(); } }, IMP.sheets.map(n => h("option", { value: n, selected: n === IMP.sheet }, "Sheet: " + n))) : null),
    paste, h("div", { style: { marginTop: "6px" } }, h("button", { class: "btn", type: "button", onclick: () => {
      const t = paste.value.trim(); if (!t) { toast("Paste some rows first.", true); return; }
      const sep = t.includes("\t") ? "\t" : ",";
      IMP.grid = t.split(/\r?\n/).map(l => sep === "\t" ? l.split("\t") : csvSplit(l)); IMP.fileName = "pasted rows"; IMP.sheets = null; afterGrid(); render();
    } }, "Use pasted rows")),
    h("h3", { style: { margin: "18px 0 8px" } }, "about this data"), meta.node,
    grid ? [h("h3", { style: { margin: "18px 0 8px" } }, "preview"),
      h("label", { class: "f small" }, "Header row", h("input", { type: "number", min: 1, value: IMP.headerRow + 1, style: { width: "70px" }, onchange: e => { IMP.headerRow = Math.max(0, +e.target.value - 1); afterGrid(true); render(); } }), h("span", { class: "muted" }, (grid.length - IMP.headerRow - 1) + " data rows")),
      h("div", { class: "tw", style: { maxHeight: "260px", overflow: "auto", marginTop: "8px" } }, h("table", { class: "hist" }, h("tbody", null, grid.slice(0, 8).map((r, i) => h("tr", { class: i === IMP.headerRow ? "sel" : null }, r.slice(0, 14).map(c => h("td", null, cellText(c).slice(0, 40)))))))),
      h("div", { class: "actions" }, h("button", { class: "btn primary", type: "button", onclick: () => { saveMeta(); if (!IMP.source) { toast("Give the source a name.", true); return; } goStep(2); } }, "Next: map columns"))] : null);
}
function csvSplit(line) { const out = []; let cur = "", q = false; for (let i = 0; i < line.length; i++) { const c = line[i]; if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; } else if (c === '"') q = true; else if (c === ",") { out.push(cur); cur = ""; } else cur += c; } out.push(cur); return out; }
function readSheet() {
  const ws = IMP.wb.Sheets[IMP.sheet];
  IMP.grid = window.XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "", blankrows: false });
  afterGrid();
}
function afterGrid(keepHeader) {
  const g = IMP.grid;
  if (!keepHeader) { IMP.headerRow = Math.max(0, g.findIndex(r => r.filter(c => String(c).trim()).length >= 3)); }
  const heads = (g[IMP.headerRow] || []).map(cellText);
  const sig = hashStr(heads.map(norm).join("|"));
  const saved = S.config.importMaps?.[sig] || (S.importMaps || {})[sig];
  IMP.map = {}; IMP.units = {};
  heads.forEach((hd, i) => { IMP.map[i] = saved?.map?.[i] ?? guessTarget(hd); IMP.units[i] = saved?.units?.[i] || (/crore|\bcr\b/i.test(hd) ? "crore" : /lakh|lac|\(l\)|in l\b/i.test(hd) ? "lakh" : "rupees"); });
  IMP.sig = sig; IMP.savedMap = !!saved; IMP.matches = null; IMP.plan = null;
}
function impStep2() {
  const g = IMP.grid, heads = (g[IMP.headerRow] || []).map(cellText);
  const T = importTargets(); const groups = uniq(T.map(t => t.g));
  const data = g.slice(IMP.headerRow + 1);
  const used = Object.values(IMP.map).filter(Boolean);
  const dup = used.filter((k, i) => used.indexOf(k) !== i && !/^(note)$/.test(k));
  return h("div", { class: "panel" },
    h("div", { class: "panel-h" }, h("h2", null, "map columns"), h("span", { class: "small muted" }, IMP.savedMap ? "Using the mapping saved the last time a sheet with these columns was imported." : "Guessed from the column names. Check each one; choose “Leave out” for columns you don't need.")),
    dup.length ? h("div", { class: "notice" }, h("b", null, "Two columns go to the same place"), uniq(dup).map(k => tgt(k)?.l).join(", ") + ". Only the last one will be kept.") : null,
    h("div", { class: "tw" }, h("table", null, h("thead", null, h("tr", null, h("th", null, "Column"), h("th", null, "Examples"), h("th", null, "Load into"), h("th", null, "Amounts are in"))),
      h("tbody", null, heads.map((hd, i) => {
        const ex = uniq(data.map(r => cellText(r[i])).filter(Boolean)).slice(0, 3).map(x => x.length > 30 ? x.slice(0, 28) + "…" : x).join(" · ");
        const t = tgt(IMP.map[i]);
        return h("tr", null, h("td", null, h("b", null, hd || "(no header) " + (i + 1))), h("td", { class: "small muted", style: { maxWidth: "280px" } }, ex || "empty"),
          h("td", null, h("select", { "aria-label": "Load " + hd + " into", onchange: e => { IMP.map[i] = e.target.value; IMP.matches = null; render(); } },
            h("option", { value: "" }, "Leave out"), groups.map(gr => { const og = h("optgroup", { label: gr }); for (const t2 of T.filter(x => x.g === gr)) og.appendChild(h("option", { value: t2.k, selected: IMP.map[i] === t2.k }, t2.l)); return og; }))),
          h("td", null, t?.t === "money" ? h("select", { "aria-label": "Unit", onchange: e => { IMP.units[i] = e.target.value; } }, ["rupees", "lakh", "crore"].map(u => h("option", { value: u, selected: IMP.units[i] === u }, u))) : ""));
      })))),
    h("p", { class: "foot" }, "Amounts written with “L”, “lakh”, “Cr” or “crore” are read correctly whatever unit you choose; the unit applies to plain numbers."),
    h("div", { class: "actions" }, h("button", { class: "btn", type: "button", onclick: () => goStep(1) }, "Back"), h("button", { class: "btn primary", type: "button", onclick: () => goStep(3) }, "Next: match organisations")));
}
/* group the sheet's rows, match each to an organisation and a cohort */
function buildRows() {
  const g = IMP.grid, data = g.slice(IMP.headerRow + 1).filter(r => r.some(c => String(c).trim()));
  const col = k => Object.keys(IMP.map).filter(i => IMP.map[i] === k).map(Number).pop();
  const nameCol = col("name"), cohortCol = col("cohort");
  const idx = orgIndex();
  const byName = new Map();
  IMP.rows = [];
  data.forEach((r, ri) => {
    const name = cellText(r[nameCol]); if (!name) return;
    const k = norm(name) || name.toLowerCase();
    if (!byName.has(k)) { const m = matchName(name, idx); byName.set(k, { key: k, name, rows: [], match: m, choice: m.kind === "none" ? "new" : m.id }); }
    byName.get(k).rows.push(ri);
  });
  IMP.matches = [...byName.values()];
  const labels = cohortCol != null ? uniq(data.map(r => cellText(r[cohortCol])).filter(Boolean)) : [];
  IMP.cohortMap = {};
  for (const l of labels) for (const part of splitCohorts(l)) IMP.cohortMap[part] = IMP.cohortMap[part] ?? (matchCohort(part) || "");
  IMP.data = data;
}
const splitCohorts = l => String(l).split(/[;\n]|,(?![^(]*\))/).map(t => t.trim()).filter(Boolean);
function impStep3() {
  const ms = IMP.matches || [];
  const liveOpts = liveOrgIds().map(id => [id, orgView(id).name]).sort((a, b) => a[1].localeCompare(b[1]));
  const cnt = k => ms.filter(m => (k === "new" ? m.choice === "new" : k === "skip" ? m.choice === "skip" : m.match.kind === k && m.choice !== "new" && m.choice !== "skip")).length;
  const cohortLabels = Object.keys(IMP.cohortMap);
  const unmatchedC = cohortLabels.filter(l => !IMP.cohortMap[l]);
  const cohortOpts = Object.entries(S.cohorts).sort((a, b) => String(a[1].start).localeCompare(String(b[1].start))).map(([id, c]) => [id, (S.programmes[c.programmeId]?.name || "") + " · " + c.name]);
  const sorted = ms.slice().sort((a, b) => ({ likely: 0, none: 1, exact: 2 }[a.match.kind] - { likely: 0, none: 1, exact: 2 }[b.match.kind]) || a.name.localeCompare(b.name));
  return h("div", null,
    h("div", { class: "heads" },
      card("Matched exactly", fmtN(cnt("exact")), "same name, former name or legal name", ""),
      card("Please check", fmtN(cnt("likely")), "similar name, not identical", "", null, cnt("likely") ? "" : null),
      card("New organisations", fmtN(cnt("new")), "will be created", ""),
      card("Skipped", fmtN(cnt("skip")), "rows left out", "")),
    cohortLabels.length ? h("div", { class: "panel sec" }, h("div", { class: "panel-h" }, h("h2", null, "cohorts in this sheet"), h("span", { class: "small muted" }, unmatchedC.length ? unmatchedC.length + " label" + (unmatchedC.length > 1 ? "s" : "") + " didn't match a cohort. Choose one, or leave it to skip those participations." : "Every cohort label matched.")),
      h("div", { class: "tw" }, h("table", null, h("thead", null, h("tr", null, h("th", null, "Label in the sheet"), h("th", null, "Cohort in SocEnt 360"))),
        h("tbody", null, cohortLabels.map(l => h("tr", { class: IMP.cohortMap[l] ? null : "warn" }, h("td", null, h("b", null, l)), h("td", null, h("select", { onchange: e => { IMP.cohortMap[l] = e.target.value; IMP.plan = null; } }, h("option", { value: "" }, "skip this label"), cohortOpts.map(([id, n]) => h("option", { value: id, selected: IMP.cohortMap[l] === id }, n))))))))),
      h("p", { class: "foot" }, "Tip: add the sheet's label as an “other label” on the cohort in Programmes and cohorts, and it will match by itself next time.")) : null,
    h("div", { class: "panel sec" }, h("div", { class: "panel-h" }, h("h2", null, "organisations in this sheet"), h("span", { class: "small muted" }, ms.length + " organisations from " + IMP.data.length + " rows")),
      h("div", { class: "tw", style: { maxHeight: "520px", overflow: "auto" } }, h("table", null, h("thead", null, h("tr", null, h("th", null, "Name in the sheet"), h("th", null, "Rows"), h("th", null, "Match"), h("th", null, "Load into"))),
        h("tbody", null, sorted.map(m => h("tr", { class: m.match.kind === "likely" ? "warn" : null },
          h("td", null, h("b", null, m.name)), h("td", { class: "num" }, m.rows.length),
          h("td", { class: "small" }, m.match.kind === "exact" ? "exact" : m.match.kind === "likely" ? h("span", { style: { color: "var(--red-ink)" } }, "check: " + m.match.why) : "no match"),
          h("td", null, h("select", { "aria-label": "Load " + m.name + " into", onchange: e => { m.choice = e.target.value; IMP.plan = null; render(); } },
            h("option", { value: "new", selected: m.choice === "new" }, "Create a new organisation"), h("option", { value: "skip", selected: m.choice === "skip" }, "Skip"),
            h("optgroup", { label: "Existing organisation" }, liveOpts.map(([id, n]) => h("option", { value: id, selected: m.choice === id }, n)))))))))),
      h("div", { class: "actions" }, h("button", { class: "btn", type: "button", onclick: () => goStep(2) }, "Back"), h("button", { class: "btn primary", type: "button", onclick: () => goStep(4) }, "Next: review changes"))));
}

/* ---------- planning: apply every row to working copies; collect changes and conflicts ---------- */
function buildPlan() {
  const src = IMP.source || "import", fileAsOf = IMP.asOf || "", fileFY = IMP.fy || (IMP.asOf ? toFY(IMP.asOf) : "");
  const colsFor = k => Object.keys(IMP.map).filter(i => IMP.map[i] === k).map(Number);
  const get = (r, k) => { const cs = colsFor(k); if (!cs.length) return undefined; return r[cs[cs.length - 1]]; };
  const unitOf = k => IMP.units[colsFor(k).pop()] || "rupees";
  const keys = new Set(Object.values(IMP.map).filter(Boolean));
  const plan = { orgs: [], conflicts: [], counts: { created: 0, updated: 0, fields: 0, records: 0, skippedGrants: 0, unchanged: 0 }, warnings: [] };
  const stampF = v => ({ v, src, asOf: fileAsOf || today(), by: S.me?.id || null, at: nowISO() });
  for (const m of IMP.matches) {
    if (m.choice === "skip") continue;
    const isNew = m.choice === "new";
    const id = isNew ? (m.newId = m.newId || "o" + uid()) : m.choice;
    const O = isNew ? { name: m.name, createdAt: nowISO(), createdBy: S.me?.id || null, parts: [], history: [] } : clone(S.orgs[id] || { parts: [], history: [] });
    const E = isNew ? { f: { displayName: stampF(m.name) }, formerNames: [], founders: [], contacts: [], notes: [], follow: [], docs: [], support: [], partStatus: {}, history: [] } : clone(S.edits[id] || { f: {}, history: [] });
    E.f = E.f || {};
    const changes = [], fieldHist = [];
    const setF = (k, v) => {
      if (v == null || v === "" || (Array.isArray(v) && !v.length)) return;
      const cur = E.f[k]; const cv = val(cur);
      if (stableStr(cv) === stableStr(v)) return;
      const empty = cv == null || cv === "" || (Array.isArray(cv) && !cv.length);
      const incomingNewer = !cur?.asOf || !fileAsOf || fileAsOf >= cur.asOf;
      if (!empty && (IMP.mode === "empty" || !incomingNewer)) { plan.conflicts.push({ org: m.name, field: IDENTITY_COLS.find(c => c.k === k)?.label || k, kept: summarise(cv), offered: summarise(v), why: IMP.mode === "empty" ? "only empty fields are filled" : "existing value is more recent" }); return; }
      if (!empty) plan.conflicts.push({ org: m.name, field: IDENTITY_COLS.find(c => c.k === k)?.label || k, kept: summarise(v), offered: summarise(cv), why: "replaced; old value kept in history", replaced: true });
      if (!empty) fieldHist.push({ at: nowISO(), by: S.me?.id || null, sec: "identity", field: k, old: summarise(cv) + (cur?.src ? " (" + cur.src + ")" : ""), new: summarise(v) + " (" + src + ")" });
      E.f[k] = stampF(v); changes.push(["identity", k, cv, v]);
    };
    const addRec = (arr, rec, same, sec) => {
      const list = (arr || []).slice(); const i = list.findIndex(same);
      if (i >= 0) { if (stableStr({ ...list[i], ...rec, id: 0, by: 0, at: 0 }) === stableStr({ ...list[i], id: 0, by: 0, at: 0 })) return list; list[i] = { ...list[i], ...rec, id: list[i].id }; }
      else list.push({ id: uid(), ...rec, by: S.me?.id || null, at: nowISO() });
      changes.push([sec, "record", "", summarise(rec)]); return list;
    };
    for (const ri of m.rows) {
      const r = IMP.data[ri];
      const tx = k => { const x = get(r, k); return x == null ? "" : cellText(x); };
      /* identity */
      for (const k of ["legalName", "legalForm", "sector", "website", "linkedin", "hq", "description", "tagline", "whoServe", "revenueModel", "stage"]) if (keys.has(k)) { let v = tx(k); if (k === "website" && v && !/^https?:/i.test(v)) v = "https://" + v.replace(/^\/+/, ""); setF(k, v); }
      if (keys.has("status")) setF("status", parseStatus(get(r, "status")));
      if (keys.has("states")) setF("states", splitList(get(r, "states")).map(x => stateCode(x) ? stateName(stateCode(x)) : x));
      if (keys.has("yearStarted")) { const y = parseNum(get(r, "yearStarted")); if (y && y > 1900 && y < 2100) setF("yearStarted", y); }
      if (keys.has("incorporated")) setF("incorporated", parseDate(get(r, "incorporated")));
      for (const k of ["womenLed", "brightSpark", "firstSupported", "convertedForProfit"]) if (keys.has(k)) { const b = parseBool(get(r, k)); if (b != null) setF(k, b); }
      if (keys.has("former")) { const add = splitList(get(r, "former")).filter(n => !(E.formerNames || []).some(x => norm(x) === norm(n)) && norm(n) !== norm(val(E.f.displayName))); if (add.length) { E.formerNames = [...(E.formerNames || []), ...add]; changes.push(["identity", "formerNames", "", add.join(", ")]); } }
      if (!isNew && norm(m.name) !== norm(val(E.f.displayName)) && !(E.formerNames || []).some(x => norm(x) === norm(m.name)) && norm(m.name) !== norm(val(E.f.legalName))) { E.formerNames = [...(E.formerNames || []), m.name]; changes.push(["identity", "formerNames", "", m.name]); }
      /* people */
      const founders = (E.founders || []).slice();
      const upF = (name, extra) => { if (!name) return; const i = founders.findIndex(f => norm(f.name) === norm(name)); const clean = Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== "" && v != null)); if (i >= 0) { const before = JSON.stringify(founders[i]); founders[i] = { ...founders[i], ...Object.fromEntries(Object.entries(clean).filter(([k]) => !founders[i][k])) }; if (JSON.stringify(founders[i]) !== before) changes.push(["people", "founder", "", name]); } else { founders.push({ id: uid(), name, ...clean, src }); changes.push(["people", "founder", "", name]); } };
      if (keys.has("founders")) for (const n of splitList(get(r, "founders"))) upF(n, {});
      for (const n of [1, 2, 3]) if (keys.has("f" + n + "name")) upF(tx("f" + n + "name"), { gender: keys.has("f" + n + "gender") ? parseGender(get(r, "f" + n + "gender")) : "", linkedin: tx("f" + n + "linkedin"), education: tx("f" + n + "education"), role: tx("f" + n + "role") });
      if (keys.has("f1gender") && !keys.has("f1name") && founders.length === 1 && !founders[0].gender) { founders[0] = { ...founders[0], gender: parseGender(get(r, "f1gender")) }; }
      E.founders = founders;
      if (keys.has("headName")) setF("headName", tx("headName"));
      if (keys.has("email") || keys.has("phone")) {
        const email = tx("email"), phone = tx("phone");
        if (email || phone) { const cs = (E.contacts || []).slice(); if (!cs.some(c => (email && c.email === email) || (!email && phone && c.phone === phone))) { cs.push({ id: uid(), name: tx("headName") || founders[0]?.name || "", email, phone, src }); E.contacts = cs; changes.push(["people", "contact", "", email || phone]); } }
      }
      /* journey */
      let part = null;
      if (keys.has("cohort")) {
        const labs = splitCohorts(tx("cohort"));
        if (labs.length > 1 && keys.has("grant") && parseAmount(get(r, "grant"), unitOf("grant")) != null) plan.warnings.push(m.name + ": several cohorts in one cell, so the grant was added to " + labs[labs.length - 1] + ". Check it in Funding.");
        for (const lab of labs) {
          const cid = IMP.cohortMap[lab]; if (!cid) continue;
          O.parts = O.parts || [];
          part = O.parts.find(p => p.cohortId === cid);
          if (!part) { part = { id: uid(), cohortId: cid, status: "", grants: [], readiness: {}, by: S.me?.id || null, at: nowISO() }; O.parts.push(part); changes.push(["journey", "participation", "", S.cohorts[cid]?.name]); }
        }
      }
      const pset = (k, v) => { if (!part || v == null || v === "") return; if (stableStr(part[k]) !== stableStr(v)) { part[k] = v; changes.push(["journey", k, "", summarise(v)]); } };
      if (part) {
        if (keys.has("partStatus")) { const s0 = tx("partStatus").toLowerCase(); pset("status", /left|drop|exit/.test(s0) ? "left early" : /ongoing|current|in progress/.test(s0) ? "ongoing" : /complet|graduat|alumni/.test(s0) ? "completed" : ""); }
        if (keys.has("graduated")) pset("graduated", parseDate(get(r, "graduated")));
        if (keys.has("approved")) pset("approved", parseAmount(get(r, "approved"), unitOf("approved")));
        if (keys.has("rs") || keys.has("re")) { const rs = parseNum(get(r, "rs")), re = parseNum(get(r, "re")); const nr = { ...(part.readiness || {}) }; if (rs != null) nr.start = rs; if (re != null) nr.end = re; pset("readiness", nr); }
        if (keys.has("base")) { const v = parseAmount(get(r, "base"), unitOf("base")); if (v != null && numOr(val(part.baseFunds)) !== v) { part.baseFunds = { v, src, asOf: fileAsOf || today() }; changes.push(["journey", "baseline", "", v]); } }
        if (keys.has("post")) { const v = parseAmount(get(r, "post"), unitOf("post")); if (v != null && numOr(val(part.postFunds)) !== v) { part.postFunds = { v, src, asOf: fileAsOf || today() }; changes.push(["journey", "year after", "", v]); } }
      }
      if (keys.has("grant")) {
        const amt = parseAmount(get(r, "grant"), unitOf("grant"));
        if (amt != null) {
          if (!part) plan.counts.skippedGrants++;
          else { const date = parseDate(get(r, "grantDate")) || S.cohorts[part.cohortId]?.start || fileAsOf || ""; part.grants = addRec(part.grants, { amt, date, src }, g => numOr(g.amt) === amt && (g.date || "") === date, "funding"); }
        }
      }
      if (keys.has("awards")) for (const a of splitList(get(r, "awards"))) { if (!(O.awards || []).some(x => norm(x.name) === norm(a))) { O.awards = [...(O.awards || []), { id: uid(), name: a, src }]; changes.push(["journey", "award", "", a]); } }
      /* funding */
      if (keys.has("extAmt")) {
        const amt = parseAmount(get(r, "extAmt"), unitOf("extAmt"));
        if (amt != null && amt > 0) {
          const w = get(r, "extWhen"); const fy = parseFY(w); const d = w instanceof Date || /\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}|\d{4}-\d{2}-\d{2}|[a-z]{3}/i.test(String(w ?? "")) ? parseDate(w) : null;
          const rec = { date: d || "", fy: d ? "" : (fy || fileFY || ""), funder: tx("extFunder") || "not itemised (" + src + ")", type: tx("extType").toLowerCase() || "", amt, src };
          O.rounds = addRec(O.rounds, rec, x => numOr(x.amt) === amt && (x.date || "") === rec.date && (x.fy || "") === rec.fy && norm(x.funder) === norm(rec.funder), "funding");
        }
      }
      /* team */
      if (keys.has("ft") || keys.has("pt") || keys.has("women")) {
        const ft = parseNum(get(r, "ft")), pt = parseNum(get(r, "pt")), wo = parseNum(get(r, "women"));
        if (ft != null || pt != null || wo != null) { const asOf = parseDate(get(r, "teamAsOf")) || fileAsOf || today(); const rec = { asOf, ...(ft != null ? { ft } : {}), ...(pt != null ? { pt } : {}), ...(wo != null ? { women: wo } : {}), src }; O.team = addRec(O.team, rec, x => x.asOf === asOf, "team"); }
      }
      /* finances */
      if (keys.has("revenue") || keys.has("grantIncome")) {
        const rev = parseAmount(get(r, "revenue"), unitOf("revenue")), gi = parseAmount(get(r, "grantIncome"), unitOf("grantIncome"));
        const fy = parseFY(get(r, "finFY")) || fileFY;
        if ((rev != null || gi != null) && fy) O.fin = addRec(O.fin, { fy, period: "full year", ...(rev != null ? { revenue: rev } : {}), ...(gi != null ? { grantIncome: gi } : {}), src }, x => x.fy === fy && (!x.period || x.period === "full year"), "team");
        else if (rev != null || gi != null) plan.warnings.push(m.name + ": income left out because no financial year was given");
      }
      /* impact */
      const fyI = parseFY(get(r, "impFY")) || fileFY;
      const method = keys.has("impMethod") ? parseMethod(get(r, "impMethod")) : "";
      for (const k of keys) if (k.startsWith("imp:")) {
        const [, metric, kind] = k.split(":"); const v = parseNum(get(r, k)); if (v == null) continue;
        if (!fyI) { plan.warnings.push(m.name + ": impact figures left out because no financial year was given"); continue; }
        O.impact = addRec(O.impact, { metric, fy: fyI, kind, value: v, method, src, asOf: fileAsOf || "" }, x => x.metric === metric && x.fy === fyI && (x.kind || "annual") === kind && (x.src || "") === src, "impact");
      }
      if (keys.has("own") && keys.has("ownVal")) {
        const nm = tx("own"), v = parseNum(get(r, "ownVal"));
        if (nm && v != null && fyI) { if (!(O.own || []).some(x => norm(x.name) === norm(nm))) O.own = [...(O.own || []), { name: nm, unit: "", linkedTo: "" }]; const metric = "own:" + ((O.own || []).find(x => norm(x.name) === norm(nm))?.name || nm); O.impact = addRec(O.impact, { metric, fy: fyI, kind: "annual", value: v, method, src }, x => x.metric === metric && x.fy === fyI && (x.src || "") === src, "impact"); }
      }
      if (keys.has("lvPeople") || keys.has("lvAvg") || keys.has("lvTotal")) {
        const lv = { ...(O.livelihoods || {}) }; const p0 = parseNum(get(r, "lvPeople")), a0 = parseAmount(get(r, "lvAvg"), unitOf("lvAvg")), t0 = parseAmount(get(r, "lvTotal"), unitOf("lvTotal"));
        if (p0 != null) lv.people = p0; if (a0 != null) lv.avgIncrease = a0; if (t0 != null) lv.totalIncome = t0;
        if (stableStr({ ...lv, fy: 0, src: 0 }) !== stableStr({ ...(O.livelihoods || {}), fy: 0, src: 0 })) { lv.fy = fyI || lv.fy || ""; lv.src = src; O.livelihoods = lv; changes.push(["impact", "livelihoods", "", summarise(lv)]); }
      }
      if (keys.has("note")) { const t = tx("note"); if (t && !(E.notes || []).some(n => n.text === t)) { E.notes = [...(E.notes || []), { id: uid(), date: fileAsOf || today(), type: "other", text: t, src, by: S.me?.id || null, at: nowISO() }]; changes.push(["notes", "note", "", t.slice(0, 40)]); } }
    }
    if (!changes.length && !isNew) { plan.counts.unchanged++; continue; }
    const entry = { at: nowISO(), by: S.me?.id || null, sec: "import", field: "imported from " + src, old: "", new: changes.length + " change" + (changes.length === 1 ? "" : "s") };
    O.history = [...(O.history || []), entry].slice(-HIST_MAX); E.history = [...(E.history || []), ...fieldHist, entry].slice(-HIST_MAX);
    O.updatedAt = nowISO(); E.updatedAt = nowISO();
    plan.orgs.push({ id, name: m.name, isNew, O, E, changes });
    if (isNew) plan.counts.created++; else plan.counts.updated++;
    plan.counts.fields += changes.filter(c => c[0] === "identity" || c[0] === "people").length;
    plan.counts.records += changes.filter(c => c[1] === "record" || c[1] === "participation").length;
  }
  plan.warnings = uniq(plan.warnings);
  return plan;
}
function impStep4() {
  const P = IMP.plan || (IMP.plan = buildPlan());
  const replaced = P.conflicts.filter(c => c.replaced), kept = P.conflicts.filter(c => !c.replaced);
  const modeSeg = h("div", { class: "seg" }, [["newer", "Newer value wins"], ["empty", "Only fill empty fields"]].map(([v, l]) => h("button", { type: "button", class: IMP.mode === v ? "on" : null, onclick: () => { IMP.mode = v; IMP.plan = null; render(); } }, l)));
  return h("div", null,
    h("div", { class: "heads" },
      card("Organisations updated", fmtN(P.counts.updated), "existing records", fmtN(P.counts.unchanged) + " already up to date"),
      card("New organisations", fmtN(P.counts.created), "will be created", ""),
      card("Details filled or changed", fmtN(P.counts.fields), "identity and people", ""),
      card("Dated records added", fmtN(P.counts.records), "participations, grants, funding, team, impact", "earlier records are kept"),
      card("Values in conflict", fmtN(P.conflicts.length), fmtN(replaced.length) + " replaced · " + fmtN(kept.length) + " kept", "")),
    h("div", { class: "box" }, h("span", { class: "lbl" }, "When a value already exists"), modeSeg, h("span", { class: "small muted" }, IMP.mode === "newer" ? "The value with the later “refers to” date is shown; the other stays in the history." : "Existing values are never changed; only blanks are filled.")),
    P.counts.skippedGrants ? h("div", { class: "notice" }, h("b", null, P.counts.skippedGrants + " grant amount" + (P.counts.skippedGrants > 1 ? "s were" : " was") + " left out"), "A grant needs a cohort to belong to. Map a cohort column, or match the cohort labels in step 3.") : null,
    P.warnings.length ? h("div", { class: "notice" }, h("b", null, "Some figures will be left out"), h("ul", { class: "miss" }, P.warnings.slice(0, 20).map(w => h("li", null, w))), P.warnings.length > 20 ? "and " + (P.warnings.length - 20) + " more." : "", " Set the financial year in step 1 to include them.") : null,
    P.conflicts.length ? h("div", { class: "panel sec" }, h("h2", null, "conflicts between sources"),
      h("div", { class: "tw", style: { maxHeight: "320px", overflow: "auto" } }, h("table", { class: "hist" }, h("thead", null, h("tr", null, ["Organisation", "Field", "Shown", "Kept in history", "Why"].map(t => h("th", null, t)))),
        h("tbody", null, P.conflicts.map(c => h("tr", null, h("td", null, c.org), h("td", null, c.field), h("td", null, h("b", null, c.kept)), h("td", { class: "muted" }, c.offered), h("td", { class: "muted" }, c.why))))))) : null,
    h("div", { class: "panel sec" }, h("h2", null, "what will change"),
      P.orgs.length ? h("div", { class: "tw", style: { maxHeight: "380px", overflow: "auto" } }, h("table", null, h("thead", null, h("tr", null, h("th", null, "Organisation"), h("th", null, ""), h("th", null, "Changes"))),
        h("tbody", null, P.orgs.map(o => h("tr", null, h("td", null, h("b", null, o.name)), h("td", null, o.isNew ? h("span", { class: "tag red" }, "new") : ""), h("td", { class: "small" }, summariseChanges(o.changes)))))))
        : h("p", { class: "muted small" }, "Nothing would change: everything in this sheet is already in SocEnt 360.")),
    IMP.busy ? h("div", { class: "notice" }, h("b", null, "Importing…"), IMP.progress + " Please keep this page open and avoid editing these organisations until it finishes.") : null,
    h("div", { class: "actions" }, h("button", { class: "btn", type: "button", disabled: IMP.busy, onclick: () => goStep(3) }, "Back"),
      h("button", { class: "btn primary", type: "button", disabled: IMP.busy || !P.orgs.length, onclick: runImport }, "Import " + P.orgs.length + " organisation" + (P.orgs.length === 1 ? "" : "s"))));
}
function summariseChanges(ch) {
  const c = {}; for (const [sec, k] of ch) { const key = k === "record" ? sec + " record" : k === "participation" ? "participation" : sec === "identity" ? "identity" : k; c[key] = (c[key] || 0) + 1; }
  return Object.entries(c).map(([k, n]) => n + " " + k + (n > 1 && !/identity|s$/.test(k) ? "s" : "")).join(", ");
}
async function runImport() {
  const P = IMP.plan; if (!P || IMP.busy) return;
  if (!confirm("Import " + P.orgs.length + " organisations from " + IMP.source + "?")) return;
  IMP.busy = true; UI.editing++;
  const done = [], failed = [];
  try {
    for (let i = 0; i < P.orgs.length; i++) {
      const o = P.orgs[i];
      IMP.progress = (i + 1) + " of " + P.orgs.length + ": " + o.name + ".";
      try {
        await retryOnce(() => S.db.doc("orgs/" + o.id).set(o.O));
        await retryOnce(() => S.db.doc("edit/" + o.id).set(o.E));
        done.push(o);
      } catch (e) { failed.push({ o, why: explainErr(e) }); if (e.code === "quota_exceeded") break; }
      if (i % 5 === 4) { UI.editing--; render(); UI.editing++; await new Promise(r => setTimeout(r, 20)); }
    }
    const logId = "i" + uid();
    await S.db.doc("imports/" + logId).set({ at: nowISO(), by: S.me?.id || null, source: IMP.source, file: IMP.fileName, sheet: IMP.sheet || "", asOf: IMP.asOf, fy: IMP.fy, mode: IMP.mode, created: done.filter(o => o.isNew).length, updated: done.filter(o => !o.isNew).length, failed: failed.length, conflicts: P.conflicts.length, orgIds: done.map(o => o.id).slice(0, 2000) }).catch(() => {});
    const maps = { ...(S.config.importMaps || {}), [IMP.sig]: { map: IMP.map, units: IMP.units, source: IMP.source, at: nowISO() } };
    await S.db.doc("config/importMaps").set(maps).catch(() => {});
    IMP.report = { done, failed, conflicts: P.conflicts, source: IMP.source };
    toast("Imported " + done.length + " organisations" + (failed.length ? "; " + failed.length + " failed" : ""), !!failed.length);
  } finally { IMP.busy = false; endEditing(); render(); }
}
function impReport() {
  const R = IMP.report;
  const reset = () => { Object.assign(IMP, { step: 1, fileName: "", sheets: null, sheet: "", grid: null, headerRow: 0, map: {}, units: {}, rows: null, matches: null, cohortMap: {}, plan: null, report: null, wb: null }); render(); };
  return h("div", { class: "panel" }, h("h2", null, "import finished"),
    h("p", null, R.done.length + " organisations loaded from " + R.source + " (" + R.done.filter(o => o.isNew).length + " new). " + (R.failed.length ? R.failed.length + " could not be saved." : "")),
    R.failed.length ? h("div", { class: "tw" }, h("table", null, h("tbody", null, R.failed.map(f => h("tr", { class: "warn" }, h("td", null, f.o.name), h("td", { class: "small" }, f.why)))))) : null,
    h("p", { class: "small muted" }, "Next: the Program Team checks its cohorts in Organisations. Settings › Data checks lists anything that looks wrong, including possible duplicates."),
    h("div", { class: "actions", style: { justifyContent: "flex-start" } },
      h("button", { class: "btn", type: "button", onclick: () => exportCSV("import report " + R.source, ["organisation", "ID", "new", "changes"], R.done.map(o => [o.name, o.id, o.isNew ? "yes" : "", summariseChanges(o.changes)]).concat(R.conflicts.map(c => ["CONFLICT: " + c.org, "", "", c.field + " · shown: " + c.kept + " · kept in history: " + c.offered])), "Source: " + R.source) }, "Export import report"),
      h("button", { class: "btn primary", type: "button", onclick: reset }, "Import another sheet"),
      h("button", { class: "btn", type: "button", onclick: () => { UI.st.tab = "checks"; reset(); } }, "Open data checks")));
}
function setImportLog() {
  const rows = Object.entries(S.imports || {}).map(([id, x]) => ({ id, ...x })).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  resolveNames(rows.map(r => r.by));
  return rows.length ? h("div", { class: "panel sec" }, h("h2", null, "earlier imports"), h("div", { class: "tw" }, h("table", null, h("thead", null, h("tr", null, ["When", "Who", "Source", "File", "New", "Updated", "Conflicts", "Failed"].map(t => h("th", null, t)))),
    h("tbody", null, rows.map(r => h("tr", null, h("td", null, fmtDate(r.at)), h("td", null, personName(r.by)), h("td", null, h("b", null, r.source)), h("td", { class: "small" }, r.file + (r.sheet ? " › " + r.sheet : "")), h("td", { class: "num" }, r.created), h("td", { class: "num" }, r.updated), h("td", { class: "num" }, r.conflicts), h("td", { class: "num" }, r.failed))))))) : null;
}
