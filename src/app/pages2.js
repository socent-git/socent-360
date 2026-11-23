/* ---------- organisation helpers ---------- */
const SECTIONS = [
  ["identity", "Identity"], ["people", "People"], ["journey", "Journey"], ["funding", "Funding"], ["team", "Team & finances"],
  ["readiness", "Readiness"], ["impact", "Impact"], ["ecosystem", "Ecosystem support"], ["notes", "Notes & follow-ups"], ["sources", "Data & sources"]
];
const SEC_NO = Object.fromEntries(SECTIONS.map(([k], i) => [k, i + 2]));
function orgParts(ov) {
  return ov.parts.map(p => ({ ...p, c: S.cohorts[p.cohortId], prog: S.programmes[S.cohorts[p.cohortId]?.programmeId] })).sort((a, b) => String(a.startD).localeCompare(String(b.startD)));
}
function programmesOrdered() {
  return Object.entries(S.programmes).map(([id, p]) => ({ id, ...p })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
}
/* the^delta grants: one row per tranche, with programme and financial year */
function deltaGrants(ov) {
  return orgParts(ov).flatMap(p => (p.grants || []).map(g => ({ ...g, amt: numOr(g.amt), partId: p.id, progId: p.c?.programmeId, prog: p.prog?.name || "", cohort: p.c?.name || "", fy: toFY(g.date) }))).filter(g => isNum(g.amt));
}
/* readiness: assessments are the source of truth; participation start/end scores are the fallback */
function readinessSummary(ov) {
  const rows = (ov.o.readiness || []).filter(r => r.date && numOr(r.score) != null);
  const dates = uniq(rows.map(r => r.date)).sort();
  const overallAt = d => { const rs = rows.filter(r => r.date === d); const o = rs.find(r => norm(r.dimension) === "overall"); return o ? numOr(o.score) : sum(rs.map(r => numOr(r.score))) / rs.length; };
  const link = rows.filter(r => r.link).sort((a, b) => String(a.date).localeCompare(String(b.date))).pop()?.link || ov.o.matrixLink || "";
  if (dates.length) {
    const first = dates[0], last = dates[dates.length - 1];
    const dims = uniq(rows.map(r => r.dimension).filter(d => d && norm(d) !== "overall"));
    const dimRows = dims.map(d => {
      const ds = rows.filter(r => r.dimension === d).sort((a, b) => String(a.date).localeCompare(String(b.date)));
      return { d, first: numOr(ds[0].score), firstD: ds[0].date, last: numOr(ds[ds.length - 1].score), lastD: ds[ds.length - 1].date };
    });
    return { source: "matrix", dates, series: dates.map(overallAt), initial: overallAt(first), initialD: first, latest: overallAt(last), latestD: last, dims: dimRows, link };
  }
  const rp = ov.parts.filter(p => numOr(p.readiness?.start) != null || numOr(p.readiness?.end) != null).sort((a, b) => String(a.startD).localeCompare(String(b.startD)));
  if (rp.length) {
    const f = rp[0], l = rp[rp.length - 1];
    const initial = numOr(f.readiness?.start) ?? numOr(f.readiness?.end);
    const latest = numOr(l.readiness?.end) ?? numOr(l.readiness?.start);
    return { source: "programme", dates: [], series: [], initial, initialD: f.startD, latest, latestD: numOr(l.readiness?.end) != null ? l.endD : l.startD, dims: [], link };
  }
  return { source: "none", dates: [], series: [], dims: [], link };
}
function mainImpact(ov) {
  const M = S.config.metrics?.std || DEFAULT_METRICS;
  const imp = orgImpact(ov, null);
  const pref = ov.o.mainMetric && imp[ov.o.mainMetric] ? ov.o.mainMetric : (imp.reach ? "reach" : Object.keys(imp).find(k => M.some(m => m.key === k)) || Object.keys(imp)[0]);
  if (!pref) return null;
  const r = imp[pref];
  const label = M.find(m => m.key === pref)?.label || pref.replace(/^own:/, "");
  return { key: pref, label, v: r.cum ?? r.latest, fy: r.cumFy || r.latestFy || "", kind: r.cumFromAnn ? "sum of yearly figures" : "cumulative" };
}
function teamLatest(ov) { const t = ov.teamSeries; return t[t.length - 1] || null; }
function orgFigures(ov) {
  const tl = teamLatest(ov);
  const grants = deltaGrants(ov);
  const rd = readinessSummary(ov);
  const mi = mainImpact(ov);
  return [
    { k: "Full-time team", v: tl && numOr(tl.ft) != null ? fmtN(+tl.ft) + (numOr(tl.pt) != null ? " · " + fmtN(+tl.pt) + " part-time" : "") : "–", d: tl ? "as of " + fmtDate(tl.asOf) : "" },
    { k: "the^delta funding", v: grants.length ? fmtINR(sum(grants.map(g => g.amt))) + " · " + grants.length + " grant" + (grants.length > 1 ? "s" : "") : "–", d: grants.length ? uniq(grants.map(g => g.prog)).filter(Boolean).join(", ") : "" },
    { k: "External funds raised", v: ov.extTotal != null ? fmtINR(ov.extTotal) : "–", d: ov.extLast ? "as of " + (toFY(ov.extLast) === ov.extLast ? ov.extLast : fmtDate(ov.extLast)) : "" },
    { k: "Readiness", v: rd.latest != null ? fmtN(rd.latest, 1) + (rd.initial != null && rd.latestD !== rd.initialD ? " · " + (rd.latest - rd.initial >= 0 ? "+" : "") + fmtN(rd.latest - rd.initial, 1) : "") : "–", d: rd.latestD ? "latest " + fmtDate(rd.latestD) : "" },
    { k: mi ? mi.label : "Main impact figure", v: mi ? fmtN(mi.v) : "–", d: mi ? (mi.fy ? "FY" + mi.fy : "") : "" }
  ];
}
function figGrid(ov, cls) {
  return h("div", { class: cls || "figs" }, orgFigures(ov).map(f => h("div", { class: "fig" }, h("span", { class: "k" }, f.k), h("b", null, f.v), h("span", { class: "d" }, f.d))));
}
function progTags(ov) {
  return uniq(ov.parts.map(p => S.programmes[S.cohorts[p.cohortId]?.programmeId]?.name).filter(Boolean)).map(p => h("span", { class: "tag solid" }, p));
}
function statusTag(ov) { return ov.status ? h("span", { class: "tag" + (ov.status === "operating" ? "" : " red") }, ov.status) : h("span", { class: "tag" }, "status not recorded"); }
function readinessMove(ov) {
  const r = readinessSummary(ov);
  if (r.latest == null) return null;
  return { e: r.latest, m: r.initial != null ? r.latest - r.initial : 0 };
}
function siteLabel(u) { return String(u || "").replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""); }

async function copyOrgLink(id) {
  const url = location.origin + location.pathname + "#org-" + id;
  try { await navigator.clipboard.writeText(url); toast("Link copied. Colleagues need a SocEnt 360 role to open it."); }
  catch (e) { prompt("Copy this link:", url); }
}
/* ---------- organisations list (prototype) ---------- */
function orgsPage() {
  const st = UI.ol;
  const ids = liveOrgIds();
  const title = h("h1", { class: "sr" }, "Organisations");
  if (!ids.length) return [title, emptyPortfolio()];
  const all = ids.map(orgView);
  const q = norm(st.q);
  const qRaw = st.q.trim().toLowerCase();
  const progs = programmesOrdered();
  const cohorts = Object.entries(S.cohorts).filter(([, c]) => !st.f.prog || c.programmeId === st.f.prog).sort((a, b) => String(a[1].start).localeCompare(String(b[1].start)));
  const band = y => !y ? "" : y < 2010 ? "before 2010" : y < 2015 ? "2010–2014" : y < 2020 ? "2015–2019" : "2020 onwards";
  const incYear = ov => ov.inc ? +String(ov.inc).slice(0, 4) : (ov.yearStarted ? +ov.yearStarted : null);
  const list = all.filter(ov => {
    if (qRaw) {
      const hay = [ov.name, ...ov.former, val(ov.f.legalName), ov.website, ov.id, ov.sector, ...ov.founders.map(f => f.name)].filter(Boolean);
      if (!(hay.some(x => q && norm(x).includes(q)) || hay.some(x => String(x).toLowerCase().includes(qRaw)))) return false;
    }
    const f = st.f;
    if (f.prog && !ov.parts.some(p => S.cohorts[p.cohortId]?.programmeId === f.prog)) return false;
    if (f.cohort && !ov.parts.some(p => p.cohortId === f.cohort)) return false;
    if (f.sector && ov.sector !== f.sector) return false;
    if (f.status && (ov.status || "not known") !== f.status) return false;
    if (f.wl === "yes" && ov.wl !== true) return false;
    if (f.wl === "no" && ov.wl !== false) return false;
    if (f.state && !ov.states.includes(f.state)) return false;
    if (f.inc && band(incYear(ov)) !== f.inc) return false;
    return true;
  });
  const lastCohortYear = ov => Math.max(0, ...ov.parts.map(p => +(S.cohorts[p.cohortId]?.year || String(p.startD || "").slice(0, 4) || 0)));
  const sorters = {
    name: (a, b) => a.name.localeCompare(b.name),
    updated: (a, b) => String(b.e.updatedAt || b.o.updatedAt || "").localeCompare(String(a.e.updatedAt || a.o.updatedAt || "")),
    cohort: (a, b) => lastCohortYear(b) - lastCohortYear(a) || a.name.localeCompare(b.name),
    raised: (a, b) => (b.extTotal ?? -1) - (a.extTotal ?? -1),
    team: (a, b) => (numOr(teamLatest(b)?.ft) ?? -1) - (numOr(teamLatest(a)?.ft) ?? -1)
  };
  list.sort(sorters[st.sort] || sorters.name);
  const sortNames = { name: "name", updated: "last updated", cohort: "cohort year", raised: "funds raised", team: "team size" };
  const sectors = uniq(all.map(o => o.sector).filter(Boolean)).sort();
  const states = uniq(all.flatMap(o => o.states)).sort((a, b) => stateName(a).localeCompare(stateName(b)));
  const sel = (label, key, options) => h("select", { "aria-label": label, onchange: e => { st.f[key] = e.target.value; if (key === "prog") st.f.cohort = ""; render(); } }, h("option", { value: "" }, label + ": All"), options.map(([v, l]) => h("option", { value: v, selected: st.f[key] === v }, label + ": " + l)));
  const tools = [
    h("div", { style: { display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center", margin: "6px 0 4px" } },
      h("input", { type: "search", class: "osearch", placeholder: "Search by organisation, founder, sector or any former name…", value: st.q, "data-keep": "q", "aria-label": "Search organisations", oninput: e => { st.q = e.target.value; render(); } }),
      sel("Programme", "prog", progs.map(p => [p.id, p.name])),
      sel("Cohort", "cohort", cohorts.map(([id, c]) => [id, c.name])),
      sel("Sector", "sector", sectors.map(x => [x, x])),
      sel("Status", "status", STATUS.map(x => [x, x])),
      sel("Women-led", "wl", [["yes", "yes"], ["no", "no"]]),
      sel("State", "state", states.map(x => [x, stateName(x)])),
      sel("Incorporated", "inc", ["before 2010", "2010–2014", "2015–2019", "2020 onwards"].map(x => [x, x]))),
    h("div", { class: "list-meta" },
      h("span", null, list.length + " of " + all.length + " organisations · sorted by "),
      h("select", { "aria-label": "Sort", onchange: e => { st.sort = e.target.value; render(); }, style: { padding: "2px 4px" } }, Object.entries(sortNames).map(([v, l]) => h("option", { value: v, selected: st.sort === v }, l))),
      h("span", { class: "spacer" }),
      S.role === "admin" ? h("button", { class: "btn primary", type: "button", onclick: addOrgDialog }, "Add organisation") : null,
      h("button", { class: "btn", type: "button", onclick: () => exportCSV("organisations", ["ID", "organisation", "legal name", "website", "sector", "status", "programmes", "cohorts", "head office", "states", "year of incorporation", "founders", "women-led"], list.map(ov => [ov.id, ov.name, val(ov.f.legalName) || "", ov.website, ov.sector, ov.status, uniq(ov.parts.map(p => S.programmes[S.cohorts[p.cohortId]?.programmeId]?.name)).join("; "), ov.parts.map(p => S.cohorts[p.cohortId]?.name).join("; "), ov.hq, ov.states.map(stateName).join("; "), incYear(ov) || "", ov.founders.map(f => f.name).join("; "), ov.wl === true ? "yes" : ov.wl === false ? "no" : ""]), "Search: " + (st.q || "none") + " | Filters: " + Object.entries(st.f).filter(([, v]) => v).map(([k, v]) => k + "=" + v).join(", ")) }, "Export"),
      h("span", { class: "views" }, h("button", { type: "button", class: st.mode === "table" ? "on" : null, onclick: () => { st.mode = "table"; render(); } }, "Table view"), "|", h("button", { type: "button", class: st.mode === "cards" ? "on" : null, onclick: () => { st.mode = "cards"; render(); } }, "Card view")))];
  if (!list.length) return [title, tools, h("div", { class: "notice" }, h("b", null, "No organisations match"), "Try another name, or clear a filter.")];
  const founderLinks = ov => ov.founders.length ? ov.founders.map((f, i) => [i ? ", " : "", f.linkedin ? h("a", { href: f.linkedin, target: "_blank", rel: "noopener" }, f.name) : f.name]) : h("span", { class: "muted" }, "–");
  const nameCell = ov => [h("a", { class: "oname", href: "#org-" + ov.id }, ov.name), h("div", null, statusTag(ov), progTags(ov))];
  const geo = ov => [ov.hq || h("span", { class: "muted" }, "–"), ov.states.length ? h("span", { class: "sub" }, ov.states.length > 3 ? ov.states.slice(0, 3).map(stateName).join(", ") + " +" + (ov.states.length - 3) : ov.states.map(stateName).join(", ")) : null];
  const rdCell = ov => { const r = readinessMove(ov); return r ? [fmtN(r.e, 1), " ", h("span", { class: "chg " + (r.m >= 0 ? "up" : "dn") }, "(" + (r.m >= 0 ? "+" : "") + fmtN(r.m, 1) + ")")] : h("span", { class: "muted" }, "–"); };
  const what = ov => { const t = val(ov.f.description) || val(ov.f.tagline) || ""; return t.length > 150 ? t.slice(0, 147) + "…" : t; };
  const site = ov => ov.website ? h("a", { href: ov.website, target: "_blank", rel: "noopener" }, siteLabel(ov.website)) : h("span", { class: "muted" }, "–");
  if (st.mode === "cards") return [title, tools, h("div", { class: "cards" }, list.map(ov => h("div", { class: "ocard" }, h("div", null, nameCell(ov)), site(ov), h("div", { class: "small" }, what(ov)), h("div", { class: "small muted" }, [ov.sector, ov.hq, incYear(ov) ? "incorporated " + incYear(ov) : ""].filter(Boolean).join(" · ")), h("div", { class: "small" }, founderLinks(ov)))))];
  const rows = [];
  for (const ov of list) {
    const open = st.open === ov.id;
    rows.push(h("tr", null,
      h("td", { style: { width: "26px" } }, h("button", { class: "exp-btn" + (open ? " open" : ""), type: "button", "aria-expanded": open, "aria-label": (open ? "Collapse " : "Expand ") + ov.name, onclick: () => { st.open = open ? null : ov.id; render(); } }, chev())),
      h("td", { style: { minWidth: "190px" } }, nameCell(ov)),
      h("td", { class: "small" }, site(ov)),
      h("td", { style: { minWidth: "240px", maxWidth: "380px" } }, what(ov)),
      h("td", null, ov.sector || h("span", { class: "muted" }, "–")),
      h("td", { style: { minWidth: "150px" } }, founderLinks(ov)),
      h("td", { class: "small" }, geo(ov)),
      h("td", { class: "r num" }, incYear(ov) || "–"),
      h("td", { class: "r num" }, rdCell(ov))));
    if (open) rows.push(h("tr", { class: "xrow" }, h("td", { colspan: 9 }, expandedRow(ov))));
  }
  return [title, tools, h("div", { class: "panel", style: { padding: "8px 16px" } }, h("div", { class: "tw" }, h("table", null,
    h("thead", null, h("tr", null, h("th", null, ""), h("th", null, "Organisation"), h("th", null, "Website"), h("th", null, "What they do"), h("th", null, "Sector"), h("th", null, "Founders"), h("th", null, "Geography"), h("th", { class: "r" }, "Incorporated"), h("th", { class: "r" }, "Readiness"))),
    h("tbody", null, rows))))];
}
function expandedRow(ov) {
  const parts = orgParts(ov);
  const owner = ov.e.ownerId;
  const meta = ["ID " + ov.id, ov.status || "status not recorded", ...parts.map(p => (p.c?.name || "?") + (p.status && p.status !== "completed" ? " (" + p.status + ")" : "")), "Owner: " + (owner ? personName(owner) : "not set")].join(" · ");
  const openSec = k => { UI.ol.openSec = k; location.hash = "org-" + ov.id; };
  return h("div", { class: "xwrap" },
    h("span", { class: "hint" }, "Expanded below for " + ov.name + ". Open the full profile for every section."),
    h("div", { class: "xbox" },
      h("div", { class: "xbox-h" }, h("h3", null, ov.name), h("span", { class: "small muted" }, meta)),
      figGrid(ov),
      h("div", { class: "secbtns" }, SECTIONS.map(([k, l]) => h("button", { type: "button", onclick: () => openSec(k) }, l))),
      h("div", { class: "redlinks" },
        h("a", { href: "#org-" + ov.id }, "Open as full page"), "·",
        h("button", { type: "button", onclick: () => copyOrgLink(ov.id) }, "Copy link"), "·",
        h("button", { type: "button", onclick: () => { UI.ol.open = null; render(); } }, "Collapse"))));
}
function addOrgDialog() {
  const { node, read } = formFields([{ k: "name", label: "Organisation name", required: true, wide: true }, { k: "src", label: "Where this comes from", placeholder: "e.g. SocEnt Contact List Exhaustive" }], {});
  const warn = h("p", { class: "small", style: { color: "var(--red-ink)" } });
  node.querySelector("input").addEventListener("input", e => {
    const n = norm(e.target.value);
    const hits = n.length > 2 ? liveOrgIds().map(orgView).filter(ov => [ov.name, ...ov.former].some(x => norm(x) === n || (norm(x).includes(n) && n.length > 4))) : [];
    warn.textContent = hits.length ? "Similar records already exist: " + hits.slice(0, 4).map(x => x.name).join(", ") + ". Check before adding a new one." : "";
  });
  modal("add an organisation", h("div", null, node, warn), {
    saveLabel: "add organisation",
    onSave: async () => {
      const r = read();
      if (!r.name) { toast("Enter the organisation's name.", true); return false; }
      const id = await createOrg(r.name, r.src);
      toast("Added " + r.name);
      setTimeout(() => go("org-" + id), 50);
    }
  });
}
