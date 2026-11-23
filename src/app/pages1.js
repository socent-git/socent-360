/* ---------- routing + shell ---------- */
function onRoute() {
  const hsh = (location.hash || "").replace(/^#/, "");
  if (hsh.startsWith("org-")) { const nid = hsh.slice(4); if (nid !== UI.orgId) UI.prSec = UI.ol.openSec || "identity"; UI.ol.openSec = null; UI.route = "org"; UI.orgId = nid; }
  else if (["overview", "impact", "organisations", "admin"].includes(hsh)) { UI.route = hsh; UI.orgId = null; }
  else { UI.route = "overview"; UI.orgId = null; }
  if (S.role === "viewer" && !["overview", "impact"].includes(UI.route)) UI.route = "overview";
  if (S.role === "team" && UI.route === "admin") UI.route = "overview";
  render();
  window.scrollTo(0, 0);
}
function go(r) { if (location.hash === "#" + r) onRoute(); else location.hash = r; }

function render() {
  const root = $("#app");
  const focusSel = document.activeElement?.dataset?.keep;
  const caret = focusSel ? document.activeElement.selectionStart : null;
  root.replaceChildren(topBar(), h("main", { id: "main" }, page()));
  if (focusSel) { const el = root.querySelector(`[data-keep="${focusSel}"]`); if (el) { el.focus(); try { el.setSelectionRange(caret, caret); } catch (e) { } } }
}
function topBar() {
  const staff = S.role && S.role !== "viewer";
  const items = [["overview", "Overview"], ["impact", "Impact"]];
  if (staff) items.push(["organisations", "Organisations"]);
  const later = staff ? ["Ecosystem Support", "Data Collection", "Engagement"] : [];
  const roleName = { admin: "Admin", team: "Program team", viewer: "view only" }[S.role] || "";
  const active = UI.route === "org" ? "organisations" : UI.route;
  const search = staff && S.ready ? h("input", { type: "search", class: "gsearch", placeholder: "Search organisations, founders…", "aria-label": "Search organisations", onkeydown: e => { if (e.key === "Enter") { UI.ol.q = e.target.value; UI.ol.open = null; go("organisations"); } } }) : null;
  return h("header", { class: "top" },
    h("div", { class: "dark" }, h("div", { class: "dark-in" },
      h("a", { class: "brand", href: "#overview", "aria-label": "SocEnt 360 home" }, caretSVG(), h("span", { class: "wm" }, "the^delta"), h("span", { class: "app" }, "SocEnt 360")),
      search,
      S.role ? h("span", { class: "signed" }, "Signed in · " + (S.role === "viewer" ? "view only" : roleName), S.user?.signOut ? [" · ", h("button", { type: "button", class: "linkish", style: { color: "#c4cbcb", fontWeight: 400 }, onclick: () => S.user.signOut() }, "Sign out")] : null) : null)),
    h("nav", { class: "tabs", "aria-label": "Main" }, h("div", { class: "tabs-in" },
      S.role ? items.map(([r, l]) => h("a", { href: "#" + r, class: active === r ? "on" : null, "aria-current": active === r ? "page" : null }, l)) : null,
      later.map(l => h("span", { class: "later", title: "Arrives in a later phase" }, l)),
      S.role === "admin" ? h("a", { href: "#admin", class: active === "admin" ? "on" : null }, "Settings") : null,
      S.role === "viewer" ? h("span", { class: "right" }, "Read-only · no contact details or finances") : null)));
}
function page() {
  if (S.error === "nohost" || S.error === "nodb") return blocker("sign in to continue", "SocEnt 360 couldn't reach its database. Check your connection, then reload the page.");
  if (S.error === "revoked") return blocker("your session ended", "Sign in again to continue: reload the page.");
  if (!S.ready) return h("div", { class: "loading" }, S.slow ? "The data can't be reached yet. It will appear here as soon as the connection returns." : "Loading SocEnt 360…");
  if (UI.route === "impact") return impactPage();
  if (UI.route === "organisations") return orgsPage();
  if (UI.route === "org") return profilePage(UI.orgId);
  if (UI.route === "admin") return settingsPage();
  return overviewPage();
}
function blocker(t, msg) { return h("div", { class: "emptyhero", style: { marginTop: "30px" } }, h("h2", null, t), h("p", { class: "muted" }, msg)); }
function emptyPortfolio() {
  if (S.role === "viewer") return h("div", { class: "emptyhero" }, h("h2", null, "figures arrive soon"),
    h("p", { class: "muted" }, "The team is loading the^delta's portfolio. Overview and Impact will show here as soon as the first organisations are in."));
  const admin = S.role === "admin";
  const hasCohorts = Object.keys(S.cohorts).length > 0;
  return h("div", { class: "emptyhero" }, h("h2", null, "no organisations loaded yet"),
    h("p", { class: "muted" }, "SocEnt 360 is set up and ready for the portfolio. Phase 1 continues in this order:"),
    h("ol", null,
      h("li", null, hasCohorts ? "Programmes and cohorts are set up. " : "Set up programmes and cohorts in Settings, including the other labels each cohort goes by. ", admin && !hasCohorts ? h("a", { href: "#admin", onclick: () => { UI.st.tab = "cohorts"; } }, "Open settings") : null),
      h("li", null, "Load the existing sources (Contact List, Catalysts for Change, Key Metrics 2025, Sattva and Deloitte findings) with Settings › Import data. Each value keeps its source and date. ", admin ? h("a", { href: "#admin", onclick: () => { UI.st.tab = "import"; } }, "Import data") : null),
      h("li", null, "The Program Team checks its cohorts and organisations and corrects details."),
      h("li", null, "Leadership reviews the headline numbers at Gate 1.")),
    admin ? h("div", { class: "actions", style: { justifyContent: "flex-start" } }, h("button", { class: "btn primary", type: "button", onclick: addOrgDialog }, "Add an organisation")) : null);
}

/* ---------- shared scope controls (prototype: "View at" box + programme tabs) ---------- */
function scopeBar(st, F, opts = {}) {
  const progs = progList(F);
  if (st.view === "programme" && (!st.prog || !F.programmes[st.prog])) st.prog = progs[0]?.id || null;
  if (st.view === "cohort" && st.prog && !F.programmes[st.prog]) st.prog = null;
  const rer = () => render();
  const seg = (items, cur, set, cls) => h("div", { class: "seg" + (cls ? " " + cls : ""), role: "group" }, items.map(([v, l]) => h("button", { type: "button", class: cur === v ? "on" : null, "aria-pressed": cur === v, onclick: () => { set(v); rer(); } }, l)));
  const years = uniq(F.parts.map(p => p.yr).filter(Boolean)).sort();
  const sectors = uniq(F.orgs.map(o => o.sec).filter(Boolean)).sort();
  const states = uniq(F.orgs.flatMap(o => o.st || [])).sort((a, b) => stateName(a).localeCompare(stateName(b)));
  const sel = (label, key, options) => h("select", { "aria-label": label, onchange: e => { st.f[key] = e.target.value; rer(); } },
    h("option", { value: "" }, label + ": All"), options.map(([v, l]) => h("option", { value: v, selected: String(st.f[key]) === String(v) }, label + ": " + l)));
  const prog = F.programmes[st.prog];
  const note = st.view === "portfolio" ? "All programmes · all cohorts" : st.view === "programme" ? (prog?.name || "") : "Compare cohorts · select one to see its detail";
  const tabs = st.view !== "portfolio" && progs.length ? h("div", { class: "ptabs" },
    st.view === "cohort" ? h("button", { type: "button", class: !st.prog ? "on" : null, onclick: () => { st.prog = null; st.cohort = null; rer(); } }, "All programmes") : null,
    progs.map(p => h("button", { type: "button", class: st.prog === p.id ? "on" : null, onclick: () => { st.prog = p.id; st.cohort = null; rer(); } }, p.name + (p.kind === "accelerator" ? " (Seed & Scale)" : ""))),
    prog?.kind === "accelerator" ? seg([["both", "Seed + Scale"], ["seed", "Seed"], ["scale", "Scale"]], st.track, v => st.track = v) : null) : null;
  return [h("div", { class: "box" },
    h("span", { class: "lbl" }, "View at"),
    seg([["portfolio", "Portfolio"], ["programme", "Programme"], ["cohort", "Cohort"]], st.view, v => { st.view = v; st.cohort = null; if (v === "cohort") st.prog = null; }),
    h("span", { class: "scope-note" }, note),
    h("span", { class: "spacer" }),
    sel("Year", "year", years.map(y => [y, y])),
    sel("Sector", "sector", sectors.map(x => [x, x])),
    sel("State", "state", states.map(x => [x, stateName(x)])),
    sel("Status", "status", STATUS.map(x => [x, x])),
    opts.exportBtn), tabs];
}
function scopedFor(st, F) {
  // cohort view with "All programmes" behaves like portfolio for numbers
  const st2 = st.view === "cohort" && !st.prog ? { ...st, view: "portfolio" } : st;
  return scoped(F, st2);
}
const card = (label, value, sub, cover, onclick, cls) => h(onclick ? "button" : "div", { class: "hn" + (onclick ? "" : " static") + (cls ? " " + cls : ""), type: onclick ? "button" : null, onclick, title: onclick ? "Show the organisations behind this number" : null },
  h("span", { class: "hn-l" }, label), h("span", { class: "hn-v" }, value), sub ? h("span", { class: "hn-s" }, sub) : null, cover ? h("span", { class: "hn-c" }, cover) : null);

/* ---------- overview ---------- */
function overviewPage() {
  const F = facts();
  const st = UI.ov;
  const title = h("h1", { class: "sr" }, "Overview");
  if (!F || !F.orgs.length) return [title, emptyPortfolio()];
  const { parts, orgs, om } = scopedFor(st, F);
  const R = headline(parts, orgs, F);
  const ctx = filterContext(st, F);
  const kind = st.view !== "portfolio" && st.prog ? F.programmes[st.prog]?.kind : null;
  const defs = F.defs;
  const list = (title, os, opts = {}) => () => orgListDrawer(title, os.map(o => ({ o: o.o, n: o.n, v: opts.v ? opts.v(o) : null, sortV: opts.sv ? opts.sv(o) : null, sub: opts.sub ? opts.sub(o) : null })), { ...opts, context: ctx });
  const partOrgs = ps => uniq(ps.map(p => p.o)).map(i => om[i]).filter(Boolean);
  const statusSub = o => [o.s || "status not recorded", o.fp ? "converted to for-profit" : ""].filter(Boolean).join(" · ");
  const scopeTxt = st.view === "portfolio" || !st.prog ? "all cohorts" : (F.programmes[st.prog]?.name || "");
  const cohortsInScope = uniq(parts.map(p => p.c));
  const inc = parts.filter(p => F.programmes[p.p]?.kind === "incubator" && isNum(p.g) && p.g > 0 && isNum(p.post));
  const acc = parts.filter(p => F.programmes[p.p]?.kind === "accelerator" && isNum(p.base) && p.base > 0 && isNum(p.post));
  const cards = [
    card("Organisations", fmtN(R.participations), "programme participations", cohortsInScope.length + " cohort" + (cohortsInScope.length === 1 ? "" : "s"), list("organisations", orgs, { subLabel: "status", sub: statusSub, def: defs.participations })),
    card("Unique organisations", fmtN(R.unique), "distinct, across programmes", scopeTxt, list("unique organisations", orgs, { subLabel: "status", sub: statusSub, def: defs.unique })),
    card("Founders", fmtN(R.founders), R.womenFoundersN ? fmtPct(R.womenFounders) + " women" : "gender not yet recorded", "gender known: " + fmtN(R.womenFoundersN), list("founders", orgs.filter(o => o.f), { valueLabel: "founders", v: o => o.f + (o.fw ? " (" + o.fw + " women)" : ""), sv: o => o.f, def: defs.founders + " " + defs.womenFounders })),
    card("Women-led", fmtN(R.womenLed), fmtPct(R.womenLedPct) + " of unique orgs", "founder data: " + fmtN(R.womenLedKnown) + " of " + fmtN(R.unique), list("women-led organisations", orgs.filter(o => o.wl), { def: defs.womenLed })),
    card("Still operating", fmtPct(R.operatingPct), fmtN(R.operating) + " of " + fmtN(R.unique), "status known: " + fmtN(R.unique - R.statusUnknown) + " of " + fmtN(R.unique), list("still operating", orgs.filter(o => o.s === "operating"), { def: defs.operating })),
    card("Shut down", fmtN(R.shutdown), fmtPct(R.shutdownPct) + " of unique orgs", "status known: " + fmtN(R.unique - R.statusUnknown) + " of " + fmtN(R.unique), list("shut down", orgs.filter(o => o.s === "shut down"), { def: defs.shutdown })),
    card("Converted to for-profit", fmtN(R.forprofit), "changed legal form", "of " + fmtN(R.unique) + " organisations", list("converted to for-profit", orgs.filter(o => o.fp), { def: defs.forprofit })),
    card("the^delta grants", fmtINR(R.grants), "disbursed to " + fmtN(R.grantsN) + " orgs", R.multiGrant ? fmtN(R.multiGrant) + " received more than one" : scopeTxt, list("the^delta grants", partOrgs(parts.filter(p => isNum(p.g))), { valueLabel: "grants", v: o => fmtINR(sum(parts.filter(p => p.o === o.o).map(p => p.g))), sv: o => sum(parts.filter(p => p.o === o.o).map(p => p.g)), subLabel: "grants received", sub: o => o.gn > 1 ? o.gn + " grants" : o.gn + " grant", def: defs.grants }))
  ];
  if (!kind || kind === "incubator") cards.push(card("Incubator grant multiplier", fmtX(R.multiplier), "aggregate", fmtN(R.multiplierN) + " of " + fmtN(R.multiplierAll) + " participations", list("incubator grant multiplier", partOrgs(inc), { valueLabel: "multiplier", v: o => { const ps = inc.filter(p => p.o === o.o); return fmtX(sum(ps.map(p => p.post)) / sum(ps.map(p => p.g))); }, sv: o => { const ps = inc.filter(p => p.o === o.o); return sum(ps.map(p => p.post)) / sum(ps.map(p => p.g)); }, def: defs.multiplier })));
  if (!kind || kind === "accelerator") cards.push(card("Accelerator funds raised", isNum(R.increase) ? (R.increase >= 0 ? "+" : "") + fmtPct(R.increase) : "–", "aggregate increase", fmtN(R.increaseN) + " of " + fmtN(R.increaseAll) + " participations", list("accelerator increase in funds raised", partOrgs(acc), { valueLabel: "increase", v: o => { const ps = acc.filter(p => p.o === o.o); return fmtPct((sum(ps.map(p => p.post)) - sum(ps.map(p => p.base))) / sum(ps.map(p => p.base))); }, def: defs.increase })));
  if (!kind || kind === "pragati") cards.push(R.pragatiDue || !R.pragatiAll
    ? h("div", { class: "hn static hn-due" }, h("span", { class: "hn-l" }, "Pragati funding outcome"), h("span", { class: "hn-v" }, R.pragatiAll ? "due" : "–"), h("span", { class: "hn-s" }, R.pragatiAll ? (R.pragatiDueDate ? "measurable from " + fmtDate(R.pragatiDueDate) : "measurement date not set") : "no participations in view"), h("span", { class: "hn-c" }, fmtN(R.pragatiAll) + (R.pragatiAll === 1 ? " participation" : " participations")))
    : card("Pragati funding outcome", fmtPct(R.pragati), "increase in funds raised", fmtN(R.pragatiN) + " of " + fmtN(R.pragatiAll) + " participations", null));
  cards.push(
    card("External funds raised", fmtINR(R.raised), "total recorded", fmtN(R.raisedN) + " of " + fmtN(R.unique) + " orgs with data", list("external funds raised", orgs.filter(o => isNum(o.raised)), { valueLabel: "raised", v: o => fmtINR(o.raised), sv: o => o.raised, def: defs.raised })),
    card("Full-time team", fmtN(R.employees), "people employed", fmtN(R.employeesN) + " of " + fmtN(R.unique) + " orgs with data", list("full-time team", orgs.filter(o => isNum(o.emp)), { valueLabel: "full-time", v: o => fmtN(o.emp), sv: o => o.emp, def: defs.employees })),
    card("First supported by the^delta", fmtN(R.firstSupported), "first institutional support", "of " + fmtN(R.unique) + " organisations", list("first supported by the^delta", orgs.filter(o => o.first), { def: defs.firstSupported })));

  /* cohort rows */
  const cohortRows = cohortsInScope.map(cid => {
    const c = F.cohorts[cid] || {}, ps = parts.filter(p => p.c === cid), os = partOrgs(ps);
    const r = headline(ps, os, F);
    const k = F.programmes[c.programmeId]?.kind;
    const today = new Date().toISOString().slice(0, 10);
    const due = c.outcomeDue && c.outcomeDue > today;
    const outcome = due ? { t: "Due " + fmtMonth(c.outcomeDue) } : k === "incubator" ? { v: r.multiplier, t: fmtX(r.multiplier), n: r.multiplierN }
      : k === "accelerator" ? { v: r.increase, t: isNum(r.increase) ? "+" + fmtPct(r.increase) : "–", n: r.increaseN }
        : k === "pragati" ? { v: r.pragati, t: r.pragatiDue ? "due" : fmtPct(r.pragati), n: r.pragatiN } : { t: "—" };
    const withData = os.filter(o => o.f || isNum(o.raised) || Object.keys(o.imp || {}).length || o.s).length;
    return { cid, c, ps, os, r, k, outcome, withData };
  }).sort((a, b) => String(a.c.start).localeCompare(String(b.c.start)) || String(a.c.name).localeCompare(String(b.c.name)));
  if (st.view === "cohort" && (!st.cohort || !cohortRows.find(r => r.cid === st.cohort))) st.cohort = cohortRows[cohortRows.length - 1]?.cid || null;
  const dates = c => c.start ? fmtMonth(c.start) + (c.end ? " – " + fmtMonth(c.end) : "") : "";
  const showProg = st.view === "portfolio" || (st.view === "cohort" && !st.prog);
  const tableCols = [
    ["Cohort", r => h("b", null, r.c.name || "cohort")],
    showProg ? ["Programme", r => F.programmes[r.c.programmeId]?.name || ""] : ["Dates", r => dates(r.c)],
    ["Funders", r => (r.c.funders || []).join(", ") || "—"],
    ["Orgs", r => fmtN(r.r.unique)], ["Founders", r => fmtN(r.r.founders)], ["Women founders", r => fmtPct(r.r.womenFounders)],
    ["Women-led", r => fmtPct(r.r.womenLedPct)], ["Grants", r => fmtINR(r.r.grants)], ["Operating", r => fmtPct(r.r.operatingPct)],
    ["Shut down", r => fmtN(r.r.shutdown)], ["To for-profit", r => fmtN(r.r.forprofit)],
    ["Multiplier / funds raised", r => r.outcome.t],
    ["Readiness", r => isNum(r.r.readiness) ? [(r.r.readiness >= 0 ? "+" : "") + fmtN(r.r.readiness, 1), h("span", { class: "sub" }, "(" + fmtN(r.r.readinessFrom, 1) + " → " + fmtN(r.r.readinessTo, 1) + ")")] : "—"],
    ["Coverage", r => r.withData + " / " + r.r.unique]
  ];
  const pick = r => { st.cohort = r.cid; if (st.view === "cohort") render(); else cohortPanel(r, F); };
  const tableTitle = st.view === "portfolio" || !st.prog ? "cohort-wise comparison" : (F.programmes[st.prog]?.name || "").toLowerCase() + " cohorts compared";
  const table = h("div", { class: "panel" }, h("div", { class: "panel-h" }, h("h2", null, tableTitle), h("span", { class: "hint" }, st.view === "cohort" ? "click a row to open the cohort" : "click a cohort to view it")),
    cohortRows.length ? h("div", { class: "tw" }, h("table", null,
      h("thead", null, h("tr", null, tableCols.map(([t]) => h("th", null, t)))),
      h("tbody", null, cohortRows.map(row => h("tr", { class: "click" + (st.view === "cohort" && st.cohort === row.cid ? " sel" : ""), tabindex: 0, onclick: () => pick(row), onkeydown: e => { if (e.key === "Enter") pick(row); } }, tableCols.map(([, f]) => h("td", null, f(row)))))))) : noData("No cohorts in this view."),
    h("p", { class: "foot" }, "Multiplier and funds raised use each programme's own measure; “—” means not applicable."));
  const selected = st.view === "cohort" ? cohortRows.find(r => r.cid === st.cohort) : null;
  const top = st.view === "cohort" && selected ? h("div", { class: "grid3 sec" }, table, cohortSide(selected, F)) : h("div", { class: "sec" }, table);

  /* outcome charts */
  const incRows = cohortRows.filter(r => r.k === "incubator" && isNum(r.r.multiplier));
  const accRows = cohortRows.filter(r => r.k === "accelerator");
  const allInc = headline(F.parts.filter(p => F.programmes[p.p]?.kind === "incubator"), [], F).multiplier;
  const accRef = headline(F.parts.filter(p => F.programmes[p.p]?.kind === "accelerator"), [], F).increase;
  const accKey = c => c.number != null && c.number !== "" ? "n" + c.number : String(c.name || "").replace(/\b(seed|scale)\b/ig, "").replace(/[\s\-·–]+$/, "").trim();
  const accGroups = [];
  for (const r of accRows) { const k = accKey(r.c); let g0 = accGroups.find(x => x.k === k); if (!g0) { g0 = { k, label: k.startsWith("n") && r.c.number != null ? "Cohort " + r.c.number : k, ps: [] }; accGroups.push(g0); } g0.ps.push(...r.ps); }
  const outcomeSec = (incRows.length || accRows.length) ? h("div", { class: (incRows.length && accRows.length ? "grid2 " : "") + "sec" },
    incRows.length ? h("div", { class: "panel" }, h("h2", null, "grant multiplier by incubator cohort"), barChart({ cats: incRows.map(r => ({ label: r.c.name, value: r.r.multiplier, sub: r.r.multiplierN + " orgs", row: r })), ref: allInc, refLabel: "all incubator", fmt: fmtX, onClick: c => pick(c.row) })) : null,
    accRows.length ? h("div", { class: "panel" }, h("h2", null, "funds raised: % increase by accelerator cohort"), dotChart({
      cats: accGroups.map(gr => ({ label: gr.label, values: { seed: headline(gr.ps.filter(p => p.tr === "seed"), [], F).increase, scale: headline(gr.ps.filter(p => p.tr === "scale"), [], F).increase, other: headline(gr.ps.filter(p => !p.tr), [], F).increase } })),
      series: [{ key: "seed", name: "Seed", color: "var(--red)" }, { key: "scale", name: "Scale", color: "var(--dark)", shape: "square" }, ...(accRows.some(r => r.ps.some(p => !p.tr)) ? [{ key: "other", name: "track not set", color: "var(--chart-2)" }] : [])],
      ref: accRef, refLabel: "all accelerator", fmt: v => fmtPct(v)
    })) : null) : null;

  /* women-led + satisfaction */
  const wl = cohortRows.length ? h("div", { class: "panel" }, h("h2", null, "women-led organisations by cohort"),
    splitBars({ cats: cohortRows.map(r => ({ label: r.c.name, part: r.r.womenLed, total: r.r.unique, row: r })), partLabel: "women-led", restLabel: "other or not recorded", onClick: c => orgListDrawer("women-led · " + c.label, c.row.os.filter(o => o.wl).map(o => ({ o: o.o, n: o.n })), { def: defs.womenLed }) })) : null;
  const sat = cohortRows.filter(r => isNum(r.c.satisfaction));
  const satP = sat.length ? h("div", { class: "panel" }, h("h2", null, "participant satisfaction by cohort"), barChart({ cats: sat.map(r => ({ label: r.c.name, value: r.c.satisfaction })), fmt: v => fmtN(v, 1), color: "var(--slate)" })) : null;

  /* sectors */
  const secs = {};
  for (const o of orgs) { const k = o.sec || "not recorded"; (secs[k] = secs[k] || { orgs: [], grants: 0 }).orgs.push(o); }
  for (const p of parts) { const k = om[p.o]?.sec || "not recorded"; if (secs[k] && isNum(p.g)) secs[k].grants += p.g; }
  const secItems = Object.entries(secs).map(([k, v]) => ({ label: k, value: v.orgs.length, grants: v.grants, orgs: v.orgs })).sort((a, b) => b.value - a.value);
  const sectorSec = h("div", { class: "grid2 sec" },
    h("div", { class: "panel" }, h("h2", null, "organisations by sector"), hBars(secItems, { grey: true, onClick: it => orgListDrawer(it.label, it.orgs.map(o => ({ o: o.o, n: o.n }))) })),
    h("div", { class: "panel" }, h("h2", null, "the^delta grants by sector"), hBars(secItems.slice().sort((a, b) => b.grants - a.grants).map(x => ({ ...x, value: x.grants })), { fmt: fmtINR, onClick: it => orgListDrawer(it.label, it.orgs.map(o => ({ o: o.o, n: o.n }))) })));

  /* geography */
  const byState = {};
  for (const o of orgs) for (const c of (o.st || [])) byState[c] = (byState[c] || 0) + 1;
  const topStates = Object.entries(byState).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const stList = c => orgListDrawer("working in " + stateName(c), orgs.filter(o => (o.st || []).includes(c)).map(o => ({ o: o.o, n: o.n, sub: o.hq })), { subLabel: "head office" });
  const geoSec = h("div", { class: "grid2 sec" },
    h("div", { class: "panel" }, h("div", { class: "panel-h" }, h("h2", null, "where organisations work"), h("span", { class: "hint" }, "states of operation")), tileMap(byState, { onClick: stList })),
    h("div", { class: "panel" }, h("h2", null, "states with most organisations"), topStates.length ? hBars(topStates.map(([c, n]) => ({ label: stateName(c), value: n, c })), { grey: true, onClick: it => stList(it.c) }) : noData("States of operation not recorded yet.")));

  /* recognition */
  const bsOrgs = orgs.filter(o => o.bs), awOrgs = orgs.filter(o => o.aw.length);
  const recog = h("div", { class: "sec" }, h("div", { class: "heads" },
    card("Bright Sparks", fmtN(bsOrgs.length), F.brightSparkDef ? F.brightSparkDef.slice(0, 60) + (F.brightSparkDef.length > 60 ? "…" : "") : "", "of " + fmtN(R.unique) + " organisations", list("bright sparks", bsOrgs, { def: F.brightSparkDef })),
    card("Awards and recognitions", fmtN(R.awards), "received", fmtN(R.awardOrgs) + " organisations", list("awards and recognitions", awOrgs, { valueLabel: "awards", v: o => o.aw.length, sv: o => o.aw.length, subLabel: "awards", sub: o => o.aw.join("; ") }))));

  const exportBtn = h("button", { class: "btn", type: "button", onclick: () => exportCSV("overview cohorts", ["cohort", "programme", "track", "start", "end", "funders", "organisations", "founders", "women founders %", "women-led %", "grants given (₹)", "still operating %", "shut down", "for-profit", "outcome", "readiness movement"],
    cohortRows.map(r => [r.c.name, F.programmes[r.c.programmeId]?.name, r.c.track, r.c.start, r.c.end, (r.c.funders || []).join("; "), r.r.unique, r.r.founders, isNum(r.r.womenFounders) ? Math.round(r.r.womenFounders * 100) : "", isNum(r.r.womenLedPct) ? Math.round(r.r.womenLedPct * 100) : "", r.r.grants ?? "", isNum(r.r.operatingPct) ? Math.round(r.r.operatingPct * 100) : "", r.r.shutdown, r.r.forprofit, r.outcome.t, isNum(r.r.readiness) ? r.r.readiness.toFixed(2) : ""]), ctx) }, "Export");

  return [title, scopeBar(st, F, { exportBtn }), h("div", { class: "heads" }, cards), top, outcomeSec,
    h("div", { class: (sat.length ? "grid2 " : "") + "sec" }, wl, satP), sectorSec, geoSec, recog,
    h("p", { class: "foot" }, "Figures calculated " + fmtDate(F.updated) + ". Click a number to see its definition and the organisations behind it.")];
}
function cohortStats(row) {
  const { c, ps, os, r } = row;
  const sectors = {}; for (const o of os) { const k = o.sec || "not recorded"; sectors[k] = (sectors[k] || 0) + 1; }
  const states = {}; for (const o of os) for (const x of (o.st || [])) states[x] = (states[x] || 0) + 1;
  const left = ps.filter(p => p.ps === "left early").length;
  const postN = ps.filter(p => isNum(p.post)).length;
  return { sectors, states, left, postN, postSum: sum(ps.map(p => p.post)) };
}
function cohortSide(row, F) {
  const { c, os, r, ps } = row;
  const x = cohortStats(row);
  const prog = F.programmes[c.programmeId];
  const men = r.womenFoundersN - r.womenFoundersCount, unk = r.founders - r.womenFoundersN;
  const staff = S.role !== "viewer";
  const kv = (k, v) => [h("div", null, k), h("div", null, v)];
  return h("div", { class: "panel side" },
    h("h2", { class: "nc" }, "selected: " + (c.name || "cohort")),
    h("div", { class: "kv" },
      kv("Organisations", fmtN(r.unique) + (x.left ? " (" + x.left + " left early)" : "")),
      kv("Founders", fmtN(r.founders) + (r.womenFoundersN ? " · " + r.womenFoundersCount + " women · " + men + " men" : "")),
      kv("Women-led organisations", r.womenLed + " of " + r.unique),
      kv("Grants disbursed", fmtINR(r.grants)),
      kv("Raised in year after", x.postN ? fmtINR(x.postSum) + (prog?.kind === "incubator" && isNum(r.multiplier) ? " (multiplier " + fmtX(r.multiplier) + ")" : "") : "—"),
      kv("Readiness movement", isNum(r.readiness) ? (r.readiness >= 0 ? "+" : "") + fmtN(r.readiness, 1) + " average" : "—"),
      (c.funders || []).length ? kv("Funders", c.funders.join(", ")) : null),
    h("h3", { style: { marginTop: "16px", textTransform: "none" } }, "Founders by gender"),
    r.founders ? h("div", { class: "genderbar" },
      r.womenFoundersCount ? h("div", { class: "w", style: { flex: r.womenFoundersCount } }, "Women " + r.womenFoundersCount) : null,
      men ? h("div", { class: "m", style: { flex: men } }, "Men " + men) : null,
      unk ? h("div", { class: "u", style: { flex: unk } }, unk + " not recorded") : null) : h("p", { class: "small muted" }, "No founders recorded."),
    h("h3", { style: { textTransform: "none", marginBottom: "8px" } }, "Sectors"),
    hBars(Object.entries(x.sectors).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ label: k, value: n })), { grey: true }),
    h("p", { class: "small muted" }, "States: " + (Object.entries(x.states).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => stateName(k) + " " + n).join(" · ") || "—") + (Object.keys(x.states).length > 3 ? " · +" + (Object.keys(x.states).length - 3) : "")),
    h("div", { class: "redlinks" },
      h("button", { type: "button", onclick: () => cohortPanel(row, F) }, "See all organisations ›"),
      staff ? h("button", { type: "button", onclick: () => { UI.ol.f = { prog: "", cohort: row.cid, sector: "", status: "", wl: "", state: "", inc: "" }; UI.ol.q = ""; go("organisations"); } }, "Open organisation list ›") : null));
}
function cohortPanel(row, F) {
  const { c, ps, os, r } = row;
  const prog = F.programmes[c.programmeId];
  const x = cohortStats(row);
  const kv = (k, v) => [h("div", null, k), h("div", null, v)];
  const staff = S.role !== "viewer";
  drawer(c.name || "cohort", [prog?.name, c.track, c.start ? fmtDate(c.start) + (c.end ? " – " + fmtDate(c.end) : "") : ""].filter(Boolean).join(" · "), [
    h("div", { class: "kv" },
      kv("organisations", fmtN(r.unique) + (x.left ? " (" + x.left + " left early)" : "")),
      kv("founders", fmtN(r.founders) + (r.womenFoundersN ? " · " + fmtN(r.womenFoundersCount) + " women (of " + fmtN(r.womenFoundersN) + " with gender recorded)" : "")),
      kv("women-led", fmtN(r.womenLed) + " (" + fmtPct(r.womenLedPct) + ")"),
      kv("grants disbursed", fmtINR(r.grants)),
      kv("funds raised in the year after", x.postN ? fmtINR(x.postSum) + " · " + x.postN + " with data" : "–"),
      kv(prog?.kind === "incubator" ? "grant multiplier" : "increase in funds raised", row.outcome.t),
      kv("average readiness movement", isNum(r.readiness) ? (r.readiness >= 0 ? "+" : "") + fmtN(r.readiness, 1) + " (" + fmtN(r.readinessFrom, 1) + " → " + fmtN(r.readinessTo, 1) + ")" : "–"),
      kv("funders", (c.funders || []).join(", ") || "–")),
    h("h3", { style: { margin: "20px 0 8px" } }, "organisations"),
    h("div", { class: "tw" }, h("table", null, h("tbody", null, os.slice().sort((a, b) => a.n.localeCompare(b.n)).map(o => {
      const p = ps.find(q => q.o === o.o);
      return h("tr", null, h("td", null, staff ? h("a", { class: "oname", href: "#org-" + o.o, onclick: () => document.querySelector(".scrim")?.remove() }, o.n) : h("span", { class: "oname" }, o.n)), h("td", { class: "small muted" }, [p?.ps, o.s].filter(Boolean).join(" · ")));
    }))))
  ]);
}

/* ---------- impact ---------- */
function impactPage() {
  const F = facts();
  const st = UI.im;
  const title = h("h1", { class: "sr" }, "Impact");
  if (!F || !F.orgs.length) return [title, emptyPortfolio()];
  const { parts, orgs } = scopedFor(st, F);
  const ctx = filterContext(st, F) + " | Measure: " + st.measure;
  const tabs = h("div", { class: "subtabs" }, [["impact", "Impact"], ["library", "Own-metrics library"]].map(([k, l]) => h("button", { type: "button", class: st.tab === k ? "on" : null, onclick: () => { st.tab = k; render(); } }, l)));
  if (st.tab === "library") return [title, scopeBar(st, F), tabs, ownLibrary(orgs, F, ctx)];
  const M = F.metrics;
  const latestFY = uniq(orgs.flatMap(o => Object.values(o.imp || {}).map(r => r.latestFy)).filter(Boolean)).sort().pop();
  const measureDef = { cumulative: F.defs.cumulative, since: F.defs.sinceJoining, latest: F.defs.latestYear }[st.measure];
  const measureBox = h("div", { class: "box" }, h("span", { class: "lbl" }, "Measure"),
    h("div", { class: "seg red" }, [["cumulative", "Cumulative since founding"], ["since", "Since joining the^delta"], ["latest", "Latest year" + (latestFY ? " (FY" + latestFY.replace("-", "–") + ")" : "")]].map(([v, l]) => h("button", { type: "button", class: st.measure === v ? "on" : null, style: { minWidth: "200px", textAlign: "left" }, "aria-pressed": st.measure === v, onclick: () => { st.measure = v; render(); } }, l))),
    h("span", { class: "small muted" }, measureDef));
  const totals = M.map(m => ({ m, t: impactTotals(orgs, m.key, st.measure) }));
  const withData = totals.filter(x => x.t.n > 0);
  if (!withData.find(x => x.m.key === st.metric)) st.metric = withData[0]?.m.key || st.metric;
  const methodTxt = m => METHODS[m || ""] ?? m;
  const openMetric = (m, rowsIn, ttl) => orgListDrawer(ttl || m.label, (rowsIn || impactTotals(orgs, m.key, st.measure).rows).map(r => ({ o: r.o.o, n: r.o.n, v: fmtN(r.x.v) + " " + m.unit, sortV: r.x.v, sub: [r.x.fy, methodTxt(r.x.m), r.x.via ? "from own measure: " + r.x.via : ""].filter(Boolean).join(" · ") })), { valueLabel: "figure", subLabel: "year · how measured", def: m.desc, context: ctx });
  const reachTot = totals.find(x => x.m.key === "reach")?.t.total;
  const cards = withData.length ? h("div", { class: "heads" }, withData.map(({ m, t }) => card(m.label, [fmtC(t.total), m.unit !== "people" ? h("small", null, m.unit) : null],
    m.parent === "reach" && reachTot && m.key === "women" ? fmtPct(t.total / reachTot) + " of people reached" : m.desc.length > 46 ? m.desc.slice(0, 44) + "…" : m.desc,
    fmtN(t.n) + " orgs" + (isNum(t.recordedShare) ? " · " + fmtPct(t.recordedShare) + " from records" : ""), () => openMetric(m))))
    : h("div", { class: "notice" }, h("b", null, "No impact figures in this view yet"), "Impact figures appear here once they are loaded for organisations in this programme, cohort or filter.");
  if (!withData.length) return [title, scopeBar(st, F), measureBox, tabs, cards];

  const metric = M.find(m => m.key === st.metric) || M[0];
  const T = impactTotals(orgs, metric.key, st.measure);
  const metricSel = h("select", { "aria-label": "Metric", onchange: e => { st.metric = e.target.value; render(); } }, withData.map(({ m }) => h("option", { value: m.key, selected: m.key === metric.key }, m.label)));

  /* over time: annual sums and running cumulative */
  const fys = uniq(orgs.flatMap(o => Object.keys(o.imp?.[metric.key]?.ann || {}))).sort();
  const ann = fys.map(fy => { const v = orgs.map(o => o.imp?.[metric.key]?.ann?.[fy]).filter(isNum); return v.length ? sum(v) : null; });
  let run = 0; const cum = ann.map(v => (run += (v || 0)));
  const trendMode = st.trend || "cumulative";
  const trend = h("div", { class: "panel" }, h("div", { class: "panel-h" }, h("h2", null, metric.label.toLowerCase() + " over time (" + (trendMode === "cumulative" ? "cumulative" : "each year") + ")"),
    h("div", { class: "seg" }, [["annual", "Annual"], ["cumulative", "Cumulative"]].map(([v, l]) => h("button", { type: "button", class: trendMode === v ? "on" : null, onclick: () => { st.trend = v; render(); } }, l)))),
    lineChart({ xs: fys.map(fyShort), series: [{ name: metric.label, color: "var(--red)", values: trendMode === "cumulative" ? cum : ann }], fmt: fmtC }),
    h("p", { class: "foot" }, "Built from yearly figures only, so organisations that report only a cumulative total are not in this chart."));

  /* breakdown */
  const bd = st.breakdown;
  const groups = {};
  const addG = (k, r, label) => { (groups[k] = groups[k] || { label: label || k, v: 0, rows: [] }).v += r.x.v; groups[k].rows.push(r); };
  for (const r of T.rows) {
    if (bd === "cohort") { for (const c of uniq(parts.filter(p => p.o === r.o.o).map(p => p.c))) addG(c, r, F.cohorts[c]?.name || c); }
    else if (bd === "sector") addG(r.o.sec || "not recorded", r);
    else if (bd === "state") { const ss = r.o.st?.length ? r.o.st : ["—"]; for (const c of ss) addG(c, r, c === "—" ? "not recorded" : stateName(c)); }
    else addG(r.o.ws || "not recorded", r);
  }
  const gRows = Object.values(groups).sort((a, b) => b.v - a.v);
  const bdNote = { cohort: "An organisation in two cohorts counts under each, so rows can add up to more than the total.", sector: "Each organisation counts under its own sector.", state: "Figures sit under every state an organisation works in, so rows can add up to more than the total.", served: "Grouped by who the organisation serves." }[bd];
  const breakdown = h("div", { class: "panel" }, h("div", { class: "panel-h" }, h("h2", null, "by " + ({ cohort: "cohort", sector: "sector", state: "state", served: "group served" }[bd])),
    h("div", { class: "seg" }, [["sector", "Sector"], ["cohort", "Cohort"], ["state", "State"], ["served", "Group served"]].map(([v, l]) => h("button", { type: "button", class: bd === v ? "on" : null, onclick: () => { st.breakdown = v; render(); } }, l)))),
    gRows.length ? h("div", { class: "tw", style: { maxHeight: "340px", overflow: "auto" } }, h("table", null, h("thead", null, h("tr", null, h("th", null, "Group"), h("th", { class: "r" }, metric.label), h("th", { class: "r" }, "Orgs"))),
      h("tbody", null, gRows.map(g => h("tr", { class: "click", onclick: () => openMetric(metric, g.rows, metric.label + " · " + g.label) }, h("td", null, h("b", null, g.label)), h("td", { class: "r num" }, fmtC(g.v)), h("td", { class: "r num" }, g.rows.length)))))) : noData(),
    h("p", { class: "foot" }, bdNote));

  /* concentration */
  const sorted = T.rows.slice().sort((a, b) => b.x.v - a.x.v);
  const top = sorted.slice(0, 4);
  const rest = sorted.slice(4);
  const topShare = T.total ? sum(top.map(r => r.x.v)) / T.total : null;
  const concItems = [...top.map(r => ({ label: r.o.n, value: T.total ? r.x.v / T.total : 0, noClick: true })), ...(rest.length ? [{ label: rest.length + " other organisation" + (rest.length > 1 ? "s" : ""), value: T.total ? sum(rest.map(r => r.x.v)) / T.total : 0, light: true }] : [])];
  const band = y => !isNum(y) ? "not recorded" : y < 2010 ? "before 2010" : y < 2015 ? "2010–2014" : y < 2020 ? "2015–2019" : "2020 onwards";
  const bands = {};
  for (const r of T.rows) { const k = band(r.o.inc); (bands[k] = bands[k] || { v: 0, rows: [] }).v += r.x.v; bands[k].rows.push(r); }
  const conc = h("div", { class: "panel" }, h("h2", null, "concentration: top contributors to " + metric.label.toLowerCase()),
    hBars(concItems, { fmt: v => fmtPct(v), max: Math.max(...concItems.map(i => i.value)) }),
    top.length && topShare > .5 ? h("p", { class: "hint", style: { marginTop: "14px" } }, "Top " + top.length + " organisations account for " + fmtPct(topShare) + " of " + metric.label.toLowerCase() + " — report with care.") : null,
    h("h3", { style: { margin: "18px 0 8px", textTransform: "none" } }, "By year of incorporation"),
    hBars(["before 2010", "2010–2014", "2015–2019", "2020 onwards", "not recorded"].filter(b => bands[b]).map(b => ({ label: b, value: bands[b].v, rows: bands[b].rows, sub: "· " + bands[b].rows.length + " orgs" })), { grey: true, fmt: fmtC, onClick: it => openMetric(metric, it.rows, metric.label + " · incorporated " + it.label) }));

  /* confidence and gaps */
  const allFig = M.flatMap(m => impactTotals(orgs, m.key, st.measure).rows.map(r => r.x.m || ""));
  const mCount = {}; for (const m of allFig) mCount[m] = (mCount[m] || 0) + 1;
  const noImpact = orgs.filter(o => !Object.keys(o.imp || {}).length);
  const subs = M.filter(m => m.parent);
  const overlap = orgs.filter(o => subs.some(m => { const a = impactOf(o, m.key, st.measure), b = impactOf(o, m.parent, st.measure); return a && b && a.v > b.v; }));
  const yearlyOnly = orgs.filter(o => Object.values(o.imp || {}).some(r => r.cumFromAnn));
  const unlinked = orgs.flatMap(o => o.own.filter(m => !m.linked).map(m => ({ o, m })));
  const confidence = h("div", { class: "panel" }, h("h2", null, "data confidence and gaps"),
    hBars([["record", "From organisation records"], ["evaluation", "From external evaluations"], ["survey", "From surveys or samples"], ["estimate", "Estimates"], ["", "Method not recorded"]].filter(([k]) => mCount[k]).map(([k, l]) => ({ label: l, value: mCount[k] / allFig.length, noClick: true })), { grey: true, track: true, fmt: v => fmtPct(v), max: 1 }),
    h("div", { style: { marginTop: "18px", fontSize: "14px", display: "flex", flexDirection: "column", gap: "6px" } },
      h("button", { class: "linkish", type: "button", style: { color: "var(--ink)" }, onclick: () => orgListDrawer("no impact data", noImpact.map(o => ({ o: o.o, n: o.n }))) }, "Organisations with no impact data: " + fmtN(noImpact.length) + " of " + fmtN(orgs.length)),
      h("button", { class: "linkish", type: "button", style: { color: "var(--muted)", fontWeight: 400 }, onclick: () => orgListDrawer("cumulative built from yearly figures", yearlyOnly.map(o => ({ o: o.o, n: o.n })), { def: "These organisations report only yearly figures, so their cumulative figure is a sum of years and may count repeat beneficiaries more than once." }) }, "Possible repeat counting: " + fmtN(yearlyOnly.length) + " organisations report only yearly figures"),
      h("button", { class: "linkish", type: "button", style: { color: "var(--muted)", fontWeight: 400 }, onclick: () => orgListDrawer("group larger than people reached", overlap.map(o => ({ o: o.o, n: o.n }))) }, "A group larger than total people reached: " + fmtN(overlap.length) + " organisations"),
      h("button", { class: "linkish", type: "button", style: { color: "var(--muted)", fontWeight: 400 }, onclick: () => { st.tab = "library"; render(); } }, "Own metrics not yet mapped to a standard metric: " + fmtN(unlinked.length))),
    h("p", { class: "foot" }, "The cards overlap (women and farmers are also people reached), so don't add them together."));

  /* map + livelihoods */
  const stCount = {}; const stRows = {};
  for (const r of T.rows) for (const c of (r.o.st || [])) { stCount[c] = (stCount[c] || 0) + 1; (stRows[c] = stRows[c] || []).push(r); }
  const map = h("div", { class: "panel" }, h("div", { class: "panel-h" }, h("h2", null, "who is doing it where"), h("span", { class: "hint" }, metric.label.toLowerCase())),
    tileMap(stCount, { label: "organisations reporting this", onClick: c => openMetric(metric, stRows[c], metric.label + " · working in " + stateName(c)) }));
  const lv = orgs.filter(o => isNum(o.lv?.people) || isNum(o.lv?.total));
  const avgs = lv.filter(o => isNum(o.lv.avg) && isNum(o.lv.people));
  const lvAvg = avgs.length ? sum(avgs.map(o => o.lv.avg * o.lv.people)) / sum(avgs.map(o => o.lv.people)) : null;
  const lvList = t => () => orgListDrawer(t, lv.map(o => ({ o: o.o, n: o.n, v: fmtN(o.lv.people) + " people · " + fmtINR(o.lv.total), sortV: o.lv.total ?? o.lv.people, sub: o.lv.fy })), { valueLabel: "people · income enabled", subLabel: "year" });
  const livelihoods = h("div", { class: "panel" }, h("h2", null, "livelihoods and income enabled"),
    lv.length ? h("div", { class: "heads", style: { marginBottom: 0, gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))" } },
      card("People with increased income", fmtC(sum(lv.map(o => o.lv.people))), "through the organisations' work", fmtN(lv.length) + " orgs", lvList("people with increased income")),
      card("Average increase", fmtINR(lvAvg), "per person, per year", "weighted · " + fmtN(avgs.length) + " orgs", lvList("average increase in income")),
      card("Total income enabled", fmtINR(sum(lv.map(o => o.lv.total))), "extra income", fmtN(lv.filter(o => isNum(o.lv.total)).length) + " orgs", lvList("total extra income enabled")))
      : noData("No livelihood or income figures in this view yet."));

  const exportBtn = h("button", { class: "btn", type: "button", onclick: () => exportCSV("impact " + st.measure, ["metric", "description", "unit", "total", "organisations", "share from records %"], totals.map(({ m, t }) => [m.label, m.desc, m.unit, t.total, t.n, isNum(t.recordedShare) ? Math.round(t.recordedShare * 100) : ""]), ctx + " | " + measureDef) }, "Export");

  return [title, scopeBar(st, F, { exportBtn }), measureBox, tabs, cards,
    h("div", { class: "box", style: { marginBottom: "12px" } }, h("span", { class: "lbl" }, "Look closer at"), metricSel, h("span", { class: "small muted" }, metric.desc)),
    h("div", { class: "grid2 sec" }, trend, breakdown),
    h("div", { class: "grid2 sec" }, conc, confidence),
    h("div", { class: "grid2 sec" }, map, livelihoods)];
}
function ownLibrary(orgs, F, ctx) {
  const M = F.metrics;
  const admin = S.role === "admin";
  const rows = orgs.flatMap(o => o.own.map(m => ({ o, m }))).sort((a, b) => a.o.n.localeCompare(b.o.n) || a.m.name.localeCompare(b.m.name));
  if (!rows.length) return h("div", { class: "notice" }, h("b", null, "No own measures recorded"), "Organisations' own impact measures appear here once they are loaded, with the standard metric each one counts towards.");
  const link = async (orgId, name, key) => {
    const own = clone(S.orgs[orgId]?.own || []);
    const it = own.find(x => x.name === name); if (!it) return;
    it.linkedTo = key;
    try { await saveKey("orgs", orgId, "own", own, "impact"); toast(key ? "Linked: it now counts towards " + (M.find(m => m.key === key)?.label || key) : "Link removed"); }
    catch (e) { toast(explainErr(e), true); }
  };
  return h("div", { class: "panel" },
    h("div", { class: "panel-h" }, h("h2", null, "own-metrics library"), h("span", { class: "small muted" }, rows.length + " measures from " + uniq(rows.map(r => r.o.o)).length + " organisations" + (admin ? ". Link a measure to count it towards a standard metric where the organisation doesn't report that metric directly." : "")),
      h("button", { class: "btn", type: "button", onclick: () => exportCSV("own-metrics library", ["organisation", "measure", "unit", "latest value", "year", "standard metric"], rows.map(r => [r.o.n, r.m.name, r.m.unit, r.m.latest ?? "", r.m.fy, M.find(x => x.key === r.m.linked)?.label || ""]), ctx) }, "Export")),
    h("div", { class: "tw" }, h("table", null,
      h("thead", null, h("tr", null, h("th", null, "Organisation"), h("th", null, "Measure"), h("th", { class: "r" }, "Latest value"), h("th", null, "Year"), h("th", null, "Counts towards"))),
      h("tbody", null, rows.map(r => h("tr", null,
        h("td", null, S.role !== "viewer" ? h("a", { class: "oname", href: "#org-" + r.o.o }, r.o.n) : h("b", null, r.o.n)),
        h("td", null, r.m.name, r.m.unit ? h("span", { class: "sub" }, r.m.unit) : null),
        h("td", { class: "r num" }, fmtN(r.m.latest)),
        h("td", null, r.m.fy || ""),
        h("td", null, admin ? h("select", { onchange: e => link(r.o.o, r.m.name, e.target.value), "aria-label": "Standard metric for " + r.m.name }, h("option", { value: "" }, "not linked"), M.map(m => h("option", { value: m.key, selected: r.m.linked === m.key }, m.label)))
          : (M.find(m => m.key === r.m.linked)?.label || h("span", { class: "muted" }, "not linked")))))))));
}
