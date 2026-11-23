/* ---------- full organisation profile ---------- */
const today = () => new Date().toISOString().slice(0, 10);
const stampV = () => ({ src: "edited in SocEnt 360", asOf: today() });
const saveWith = fn => async (...a) => { try { return await fn(...a); } catch (e) { toast(explainErr(e), true); throw e; } };
function provOf(x) {
  if (!x || typeof x !== "object" || !("v" in x)) return null;
  const bits = [x.src, x.asOf ? fmtDate(x.asOf) : "", x.by ? "by " + personName(x.by) : ""].filter(Boolean);
  return bits.length ? h("span", { class: "prov" }, bits.join(" · ")) : null;
}
function kvRows(rows, cls) { return h("div", { class: "kv" + (cls ? " " + cls : "") }, rows.filter(Boolean).flatMap(([k, v, p]) => [h("div", null, k), h("div", null, v === "" || v == null || (Array.isArray(v) && !v.length) ? h("span", { class: "muted", style: { fontWeight: 400 } }, "–") : v, p || null)])); }
const subH = (t, ...extra) => h("div", { class: "sub-h" }, h("h3", null, t), ...extra);
const tile = (k, v, d) => h("div", { class: "fig" }, h("span", { class: "k" }, k), h("b", null, v), d ? h("span", { class: "d" }, d) : null);
const segToggle = (items, cur, set) => h("div", { class: "seg" }, items.map(([v, l]) => h("button", { type: "button", class: cur === v ? "on" : null, onclick: () => { set(v); render(); } }, l)));

/* completeness: what is filled in, and what is missing */
function profileChecks(ov) {
  const has = x => x != null && x !== "" && !(Array.isArray(x) && !x.length);
  return [
    ["Legal name", has(val(ov.f.legalName))], ["Legal structure", has(val(ov.f.legalForm))], ["Sector", has(ov.sector)], ["Operating status", has(ov.status)],
    ["States of operation", ov.states.length > 0], ["Head office city", has(ov.hq)], ["Year of establishment", has(ov.yearStarted) || has(ov.inc)],
    ["Website", has(ov.website)], ["Description", has(val(ov.f.description))], ["Target beneficiaries", has(val(ov.f.whoServe))], ["Revenue model", has(val(ov.f.revenueModel))],
    ["Founders", ov.founders.length > 0], ["Founder gender", ov.founders.length > 0 && ov.founders.every(f => f.gender)], ["Founder LinkedIn", ov.founders.length > 0 && ov.founders.every(f => f.linkedin)],
    ["Contact details", (ov.e.contacts || []).length > 0], ["Contact consent", (ov.e.contacts || []).length > 0 && (ov.e.contacts || []).every(c => c.consent === true || c.consent === false)],
    ["Relationship owner", has(ov.e.ownerId)], ["Programme participation", ov.parts.length > 0], ["Grant tranches", deltaGrants(ov).length > 0],
    ["External funding records", ov.ext.length > 0], ["Team size", (ov.o.team || []).length > 0], ["Revenue and grant income", (ov.o.fin || []).length > 0],
    ["Readiness scores", readinessSummary(ov).latest != null], ["Impact figures", (ov.o.impact || []).length > 0], ["Impact measurement method", (ov.o.impact || []).length > 0 && (ov.o.impact || []).every(i => i.method)]
  ];
}
function completeness(ov) { const c = profileChecks(ov); return c.filter(x => x[1]).length / c.length; }

function profilePage(id) {
  const back = h("a", { class: "back", href: "#organisations" }, "‹ Back to organisations");
  if (!S.orgs[id] && !S.edits[id]) return [back, blocker("organisation not found", "This organisation isn't in SocEnt 360, or it was removed. Search for it in Organisations.")];
  const ov = orgView(id);
  if (ov.merged) { const to = ov.o.mergedInto; return [back, blocker("this record was merged", ""), h("p", null, h("a", { href: "#org-" + to }, "Open " + orgView(to).name))]; }
  const admin = S.role === "admin", team = S.role === "admin" || S.role === "team";
  const flags = runChecks().filter(f => f.id === id);
  const comp = completeness(ov);
  const formChanged = (ov.e.legalFormHistory || []).length > 1 || ov.fp;
  const fpYear = ov.fp ? String(val(ov.f.convertedOn) || "").slice(0, 4) : "";
  const header = h("div", { class: "phd" },
    h("h1", { class: "nc" }, ov.website ? h("a", { href: ov.website, target: "_blank", rel: "noopener", title: "Open website" }, ov.name) : ov.name),
    h("span", { class: "meta" }, [val(ov.f.legalName) || "legal name not recorded", ov.id].join(" · "), ov.website ? [" · ", h("a", { href: ov.website, target: "_blank", rel: "noopener" }, siteLabel(ov.website))] : null, ov.linkedin ? [" · ", h("a", { href: ov.linkedin, target: "_blank", rel: "noopener" }, "LinkedIn")] : null),
    h("div", { class: "tagsrow" },
      ov.status ? h("span", { class: "tag solid" }, ov.status) : h("span", { class: "tag" }, "status not recorded"),
      ov.sector ? h("span", { class: "tag" }, ov.sector) : null, ov.hq ? h("span", { class: "tag" }, ov.hq) : null,
      ov.wl ? h("span", { class: "tag" }, "Women-led") : null,
      ov.fp ? h("span", { class: "tag red" }, "Converted to for-profit" + (fpYear ? " " + fpYear : "")) : formChanged ? h("span", { class: "tag" }, "Legal structure changed") : null,
      h("span", { class: "tag" }, "Profile " + fmtPct(comp) + " complete"),
      h("button", { class: "tag", type: "button", style: { cursor: "pointer" }, onclick: () => copyOrgLink(ov.id) }, "Copy link"),
      flags.length ? h("button", { class: "tag flag", type: "button", style: { cursor: "pointer" }, onclick: () => { UI.prSec = "sources"; render(); } }, flags.length + " open data flag" + (flags.length > 1 ? "s" : "")) : null));
  const sec = UI.prSec && SEC_NO[UI.prSec] ? UI.prSec : "identity";
  const index = h("nav", { class: "pindex", "aria-label": "Profile sections" }, SECTIONS.map(([k, l]) => h("button", { type: "button", class: sec === k ? "on" : null, "aria-current": sec === k ? "true" : null, onclick: () => { UI.prSec = k; render(); } }, SEC_NO[k] + " " + l)));
  const body = { identity: secIdentity, people: secPeople, journey: secJourney, funding: secFunding, team: secTeam, readiness: secReadiness, impact: secImpact, ecosystem: secEcosystem, notes: secNotes, sources: secSources }[sec](ov, admin, team, flags);
  return [back, header, secOverview(ov), h("div", { class: "prof" }, index, body)];
}
function psec(key, title, editBtn, ...kids) {
  return h("section", { class: "psec", id: "sec-" + key }, h("div", { class: "psec-h" }, h("h2", null, SEC_NO[key] + " · " + title), editBtn), kids);
}

/* 1 · organisation overview */
function secOverview(ov) {
  const grants = deltaGrants(ov);
  const progs = programmesOrdered();
  const byProg = {}; for (const g of grants) byProg[g.progId] = (byProg[g.progId] || 0) + g.amt;
  const tl = teamLatest(ov);
  const rd = readinessSummary(ov);
  const mi = mainImpact(ov);
  const assoc = f => f.association || (f.active === false ? "left" : f.active === true ? "active" : "");
  return h("section", { class: "ovw", "aria-label": "Organisation overview" },
    h("div", { class: "psec-h" }, h("h2", null, "1 · organisation overview")),
    h("div", { class: "ovw-grid" },
      h("div", null,
        h("p", { class: "desc" }, val(ov.f.description) || h("span", { class: "muted" }, "No description recorded yet.")),
        h("div", null, statusTag(ov), ov.sector ? h("span", { class: "tag" }, ov.sector) : null, progTags(ov)),
        h("h3", { style: { margin: "14px 0 0" } }, "founders"),
        ov.founders.length ? h("div", { class: "founders" }, ov.founders.map(f => h("div", { class: "fr" },
          h("b", null, f.linkedin ? h("a", { href: f.linkedin, target: "_blank", rel: "noopener" }, f.name) : f.name),
          h("span", { class: "muted small" }, [f.role, f.gender, assoc(f) ? (assoc(f) === "active" ? "currently active" : assoc(f)) : ""].filter(Boolean).join(" · ")))))
          : h("p", { class: "small muted" }, "No founders recorded.")),
      h("div", null,
        h("h3", { style: { marginBottom: "4px" } }, "the^delta funding (disbursed)"),
        h("table", null, h("thead", null, h("tr", null, h("th", null, "Programme"), h("th", { class: "r" }, "Funding received"))),
          h("tbody", null, progs.map(p => h("tr", null, h("td", null, p.name), h("td", { class: "r num" }, byProg[p.id] ? fmtINR(byProg[p.id]) : h("span", { class: "muted" }, "–"))))),
          h("tfoot", null, h("tr", null, h("td", null, "Total"), h("td", { class: "r num" }, grants.length ? fmtINR(sum(grants.map(g => g.amt))) : "–")))))),
    h("div", { class: "tilegrid", style: { marginTop: "16px", marginBottom: 0 } },
      h("div", { class: "fig" }, h("span", { class: "k" }, "Team size"), h("b", { style: { fontSize: "17px" } }, tl ? "Full-time: " + (numOr(tl.ft) ?? "–") + " | Part-time: " + (numOr(tl.pt) ?? "–") : "–"), h("span", { class: "d" }, tl ? "as of " + fmtDate(tl.asOf) : "not recorded")),
      tile("External funding raised", ov.extTotal != null ? fmtINR(ov.extTotal) : "–", ov.extLast ? "as of " + (toFY(ov.extLast) === ov.extLast ? "FY" + ov.extLast : fmtDate(ov.extLast)) : "no funding records"),
      h("div", { class: "fig" }, h("span", { class: "k" }, "Readiness (latest)"), h("b", null, rd.latest != null ? fmtN(rd.latest, 1) : "–"), h("span", { class: "d" }, rd.latestD ? fmtDate(rd.latestD) + (rd.source === "programme" ? " · from programme scores" : "") : "not recorded", rd.link ? [" · ", h("a", { href: rd.link, target: "_blank", rel: "noopener" }, "view matrix")] : null)),
      tile(mi ? mi.label : "Main impact figure", mi ? fmtN(mi.v) : "–", mi ? (mi.fy ? "FY" + mi.fy + " · " : "") + mi.kind : "not recorded")));
}

/* 2 · identity */
const IDENTITY_COLS = [
  { k: "displayName", label: "Display name", required: true },
  { k: "legalName", label: "Legal name" },
  { k: "legalForm", label: "Legal structure", type: "select", options: ["Trust", "Society", "Section 8 company", "Private limited", "LLP", "Partnership", "Proprietorship", "Cooperative", "Producer company", "Unregistered", "Other"] },
  { k: "sector", label: "Sector", help: "Use the same spelling for every organisation in a sector." },
  { k: "status", label: "Current operating status", type: "select", options: STATUS.slice(0, 3) },
  { k: "convertedForProfit", label: "Converted to a for-profit model", type: "bool" },
  { k: "convertedOn", label: "Converted on", type: "date" },
  { k: "yearStarted", label: "Year of establishment", type: "number" },
  { k: "incorporated", label: "Date of incorporation", type: "date" },
  { k: "hq", label: "Head office city", placeholder: "e.g. Nashik, Maharashtra" },
  { k: "states", label: "States of operation", type: "list", placeholder: "e.g. Karnataka, Bihar" },
  { k: "website", label: "Website", type: "url" },
  { k: "linkedin", label: "Organisation LinkedIn", type: "url" },
  { k: "tagline", label: "Tagline", wide: true },
  { k: "description", label: "What the organisation does", type: "textarea" },
  { k: "whoServe", label: "Target beneficiaries (whom it serves)" },
  { k: "revenueModel", label: "Revenue model (how it earns money)" },
  { k: "stage", label: "Organisation stage", type: "select", options: ["idea", "pilot", "early-stage", "growth", "established", "scale"] },
  { k: "relatedEntities", label: "Related organisations or entities", type: "list" },
  { k: "womenLed", label: "Women-led", type: "tri", help: "Leave as not recorded to work it out from founders." },
  { k: "brightSpark", label: "Bright Spark", type: "bool" },
  { k: "firstSupported", label: "the^delta was its first institutional supporter", type: "bool" }
];
function secIdentity(ov, admin, team) {
  const F = k => ov.f[k];
  const edit = team ? h("button", { class: "btn", type: "button", onclick: () => {
    const row = Object.fromEntries(IDENTITY_COLS.map(c => [c.k, val(F(c.k))]));
    row.formerNames = ov.former;
    const cols = [...IDENTITY_COLS, { k: "formerNames", label: "Former names and abbreviations", type: "list", wide: true }];
    const { node, read } = formFields(cols, row);
    modal("edit identity", node, {
      onSave: saveWith(async () => {
        const r = read();
        if (!r.displayName) { toast("Display name is needed.", true); return false; }
        const { formerNames, ...rest } = r;
        if (rest.states) rest.states = rest.states.map(x => stateCode(x) ? stateName(stateCode(x)) : x);
        const changed = await saveFields(ov.id, "identity", rest);
        const fc = await saveKey("edit", ov.id, "formerNames", formerNames, "identity");
        toast(changed || fc ? "Saved. Overview and Impact are updating." : "No changes");
      })
    });
  } }, "Edit identity") : null;
  const v = k => { const x = val(F(k)); return Array.isArray(x) ? x.join(", ") : typeof x === "boolean" ? (x ? "yes" : "no") : x; };
  const unknownStates = (val(F("states")) || []).filter(x => !stateCode(x));
  return psec("identity", "identity: who is the organisation?", edit,
    kvRows([
      ["Display name", ov.name, provOf(F("displayName"))],
      ["Legal name", v("legalName"), provOf(F("legalName"))],
      ["Former names", ov.former.join(", ")],
      ["Legal structure", v("legalForm"), provOf(F("legalForm"))],
      ["Related organisations", v("relatedEntities")],
      ["Year of establishment", v("yearStarted"), provOf(F("yearStarted"))],
      ["Date of incorporation", fmtDate(v("incorporated")), provOf(F("incorporated"))],
      ["Head office city", v("hq"), provOf(F("hq"))],
      ["States of operation", v("states"), unknownStates.length ? h("span", { class: "prov", style: { color: "var(--red-ink)" } }, "not recognised as states: " + unknownStates.join(", ")) : provOf(F("states"))],
      ["Sector", v("sector"), provOf(F("sector"))],
      ["Description", v("description"), provOf(F("description"))],
      ["Tagline", v("tagline")],
      ["Target beneficiaries", v("whoServe"), provOf(F("whoServe"))],
      ["Revenue model", v("revenueModel"), provOf(F("revenueModel"))],
      ["Organisation stage", v("stage"), provOf(F("stage"))],
      ["Current operating status", v("status"), provOf(F("status"))],
      ["Converted to for-profit", ov.fp ? "yes" + (val(F("convertedOn")) ? ", " + fmtDate(val(F("convertedOn"))) : "") : v("convertedForProfit")],
      ["Women-led", ov.wl === true ? "yes" : ov.wl === false ? "no" : "", typeof val(F("womenLed")) === "boolean" ? provOf(F("womenLed")) : (ov.wl != null ? h("span", { class: "prov" }, "worked out from founders") : null)],
      ["Bright Spark", v("brightSpark")],
      ["First supported by the^delta", v("firstSupported")]
    ]),
    subH("history of legal structure changes"),
    rowEditor({ title: "legal structure", rows: (ov.e.legalFormHistory || []).slice().sort((a, b) => String(a.from).localeCompare(String(b.from))), canEdit: team, addLabel: "add legal structure", cols: [{ k: "form", label: "Legal structure", type: "select", options: IDENTITY_COLS[2].options, required: true }, { k: "from", label: "From", type: "date" }, { k: "entity", label: "Entity name" }, { k: "src", label: "Source" }], onSave: rows => saveKey("edit", ov.id, "legalFormHistory", rows, "identity") }));
}

/* 3 · people */
function pickPerson(onPick) {
  const inp = h("input", { type: "search", placeholder: "Type a colleague's name" });
  const res = h("div", { style: { marginTop: "10px" } });
  const show = list => res.replaceChildren(...(list.length ? list.map(p => h("button", { class: "btn", type: "button", style: { display: "flex", gap: "8px", alignItems: "center", width: "100%", marginBottom: "4px" }, onclick: () => { nameCache[p.id] = p.name; onPick(p.id); close(); } }, h("img", { src: p.avatarUrl, alt: "", width: 22, height: 22 }), p.name)) : [h("p", { class: "small muted" }, S.user ? "No matches. People need access to SocEnt 360 to be picked." : "People search isn't available here.")]));
  const run = async q => { if (!S.user?.search) return show([]); show(await S.user.search(q)); };
  inp.addEventListener("input", e => run(e.target.value));
  inp.addEventListener("focus", () => run(""));
  const close = modal("choose a colleague", h("div", null, inp, res), {});
}
const ASSOC = [["active", "currently active"], ["advisor", "advisor or board member"], ["left", "has left"]];
function secPeople(ov, admin, team) {
  const e = ov.e;
  const owner = e.ownerId;
  const nameLink = (v, r) => r.linkedin ? h("a", { href: r.linkedin, target: "_blank", rel: "noopener" }, v) : v;
  return psec("people", "people: who are the key people?", null,
    subH("founders"),
    rowEditor({ title: "founder", rows: e.founders || [], canEdit: team, addLabel: "add founder", onSave: rows => saveKey("edit", ov.id, "founders", rows, "people"),
      cols: [{ k: "name", label: "Name", required: true, render: nameLink }, { k: "gender", label: "Gender", type: "select", options: [["woman", "woman"], ["man", "man"], ["other", "other / prefers not to say"]] }, { k: "education", label: "Education" }, { k: "role", label: "Role" },
        { k: "association", label: "Current association", type: "select", options: ASSOC, get: r => r.association || (r.active === false ? "left" : r.active === true ? "active" : ""), render: v => ASSOC.find(a => a[0] === v)?.[1] || "–" },
        { k: "leftOn", label: "Left on", type: "date", hideInTable: true }, { k: "linkedin", label: "LinkedIn profile", type: "url", hideInTable: true }, { k: "src", label: "Source", hideInTable: true }] }),
    subH("leadership"),
    kvRows([["Head of organisation", [val(ov.f.headName), val(ov.f.headRole)].filter(Boolean).join(" · "), team ? h("button", { class: "btn ghost", type: "button", onclick: () => {
      const { node, read } = formFields([{ k: "headName", label: "Name" }, { k: "headRole", label: "Role" }], { headName: val(ov.f.headName), headRole: val(ov.f.headRole) });
      modal("head of organisation", node, { onSave: saveWith(async () => { await saveFields(ov.id, "people", read()); toast("Saved"); }) });
    } }, "edit") : null]]),
    h("div", { style: { height: "8px" } }),
    rowEditor({ title: "leadership member", rows: e.leaders || [], canEdit: team, addLabel: "add leadership member", empty: "No other key leadership recorded.", onSave: rows => saveKey("edit", ov.id, "leaders", rows, "people"),
      cols: [{ k: "name", label: "Name", required: true, render: nameLink }, { k: "role", label: "Role" }, { k: "gender", label: "Gender", type: "select", options: [["woman", "woman"], ["man", "man"], ["other", "other / prefers not to say"]] }, { k: "since", label: "Since", type: "date" }, { k: "linkedin", label: "LinkedIn profile", type: "url", hideInTable: true }] }),
    subH("contact information"),
    rowEditor({ title: "contact", rows: e.contacts || [], canEdit: team, addLabel: "add contact", onSave: rows => saveKey("edit", ov.id, "contacts", rows, "people"),
      cols: [{ k: "name", label: "Name", required: true }, { k: "role", label: "Role" }, { k: "email", label: "Email", type: "email", render: v => v ? h("a", { href: "mailto:" + v }, v) : "" }, { k: "phone", label: "Phone" }, { k: "whatsappNo", label: "WhatsApp", get: r => r.whatsappNo ?? (r.whatsapp === true ? "same as phone" : "") },
        { k: "consent", label: "Consent to store and use", type: "tri", render: v => v === true ? "given" : v === false ? h("span", { style: { color: "var(--red-ink)" } }, "not given") : h("span", { class: "muted" }, "not recorded") }, { k: "consentOn", label: "Consent recorded on", type: "date", hideInTable: true }, { k: "src", label: "Source", hideInTable: true }] }),
    subH("the^delta relationship"),
    kvRows([["Relationship owner", owner ? personName(owner) : "", team ? h("button", { class: "btn ghost", type: "button", onclick: () => pickPerson(async pid => { try { await saveKey("edit", ov.id, "ownerId", pid, "people"); toast("Relationship owner set"); } catch (er) { toast(explainErr(er), true); } }) }, owner ? "change" : "choose") : null]]));
}

/* 4 · journey */
function secJourney(ov, admin, team) {
  const parts = orgParts(ov);
  const cohortOpts = () => Object.entries(S.cohorts).sort((a, b) => String(a[1].start).localeCompare(String(b[1].start))).map(([id, c]) => [id, (S.programmes[c.programmeId]?.name ? S.programmes[c.programmeId].name + " · " : "") + c.name]);
  const rdTxt = x => numOr(x) != null ? fmtN(+x, 1) : "–";
  const short = t => !t ? h("span", { class: "muted" }, "–") : t.length > 90 ? t.slice(0, 88) + "…" : t;
  const table = parts.length ? h("div", { class: "tw" }, h("table", null,
    h("thead", null, h("tr", null, ["Programme", "Cohort", "Start", "End", "Status", "Grant received", "Readiness at entry", "Readiness at completion", "Goals set", "Goals achieved", ""].map((t, i) => h("th", { class: i >= 5 && i <= 7 ? "r" : null }, t)))),
    h("tbody", null, parts.map(p => h("tr", null,
      h("td", null, h("b", null, p.prog?.name || "–")), h("td", null, p.c?.name || "(cohort removed)"),
      h("td", { class: "small" }, fmtDate(p.startD)), h("td", { class: "small" }, fmtDate(p.endD)),
      h("td", null, p.status || "–", p.statusNote ? h("span", { class: "sub" }, p.statusNote) : null),
      h("td", { class: "r num" }, p.disbursed ? fmtINR(p.disbursed) : "–", p.approvedV != null ? h("span", { class: "sub" }, "approved " + fmtINR(p.approvedV)) : null),
      h("td", { class: "r num" }, rdTxt(p.readiness?.start)), h("td", { class: "r num" }, rdTxt(p.readiness?.end)),
      h("td", { class: "small", style: { minWidth: "160px" } }, short(p.goals)), h("td", { class: "small", style: { minWidth: "160px" } }, short(p.goalsAchieved)),
      h("td", null, admin ? h("button", { class: "btn ghost", type: "button", onclick: () => editPart(ov, p.id) }, "edit") : team ? h("button", { class: "btn ghost", type: "button", onclick: () => {
        const { node, read } = formFields([{ k: "status", label: "Participation status", type: "select", options: PART_STATUS }, { k: "note", label: "Note", type: "textarea" }], { status: p.status, note: p.statusNote });
        modal("participation status · " + (p.c?.name || ""), node, { onSave: saveWith(async () => { const r = read(); await saveKey("edit", ov.id, "partStatus", { ...(ov.e.partStatus || {}), [p.id]: { ...r, by: S.me?.id || null, at: nowISO() } }, "journey"); toast("Saved"); }) });
      } }, "edit status") : null)))))) : h("p", { class: "muted small" }, "Not linked to a programme yet.");
  /* chronological timeline */
  const ev = [];
  for (const p of parts) {
    if (p.startD) ev.push({ d: p.startD, t: "Joined " + (p.prog?.name || "") + " · " + (p.c?.name || ""), k: "programme" });
    for (const g of (p.grants || [])) if (g.date) ev.push({ d: g.date, t: "the^delta grant " + fmtINR(numOr(g.amt)) + (g.tranche ? " (tranche " + g.tranche + ")" : "") + " · " + (p.prog?.name || ""), k: "grant" });
    if (p.graduated) ev.push({ d: p.graduated, t: "Graduated from " + (p.c?.name || "the programme"), k: "programme" });
    else if (p.status === "completed" && p.endD) ev.push({ d: p.endD, t: "Completed " + (p.c?.name || "the programme"), k: "programme" });
    else if (p.status === "left early") ev.push({ d: p.endD || p.startD, t: "Left " + (p.c?.name || "the programme") + " early", k: "programme" });
  }
  for (const a of (ov.o.awards || [])) ev.push({ d: a.date || (a.year ? a.year + "-12-31" : ""), t: "Award: " + a.name, k: "award", yearOnly: !a.date });
  for (const m of (ov.o.milestones || [])) ev.push({ d: m.date, t: m.text, k: "milestone" });
  ev.sort((a, b) => String(a.d).localeCompare(String(b.d)));
  return psec("journey", "journey: what has the organisation's journey with the^delta been?", admin ? h("button", { class: "btn", type: "button", onclick: () => editPart(ov, null) }, "+ Add programme participation") : null,
    table,
    subH("timeline"),
    ev.length ? h("div", { class: "tw" }, h("table", null, h("tbody", null, ev.map(e => h("tr", null, h("td", { class: "small muted", style: { whiteSpace: "nowrap", width: "110px" } }, e.yearOnly ? String(e.d).slice(0, 4) : fmtMonth(e.d)), h("td", null, e.t), h("td", { class: "r" }, h("span", { class: "tag" + (e.k === "grant" || e.k === "award" ? " red" : "") }, e.k)))))))
      : h("p", { class: "muted small" }, "No dated events yet."),
    subH("important milestones"),
    rowEditor({ title: "milestone", rows: (ov.o.milestones || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date))), canEdit: admin, addLabel: "add milestone", cols: [{ k: "date", label: "Date", type: "date", required: true }, { k: "text", label: "Milestone", required: true, wide: true }, { k: "src", label: "Source" }], onSave: rows => saveKey("orgs", ov.id, "milestones", rows, "journey") }),
    subH("awards and recognitions"),
    rowEditor({ title: "award", rows: ov.o.awards || [], canEdit: admin, addLabel: "add award", cols: [{ k: "name", label: "Award or recognition", required: true }, { k: "date", label: "Date", type: "date" }, { k: "year", label: "Year (if no date)", type: "number", fmt: v => v || "" }, { k: "src", label: "Source" }], onSave: rows => saveKey("orgs", ov.id, "awards", rows, "journey") }));
}
function editPart(ov, partId) {
  const raw = clone(ov.o.parts || []);
  const idx = partId ? raw.findIndex(p => p.id === partId) : -1;
  const row = idx >= 0 ? raw[idx] : {};
  const eff = idx >= 0 ? (ov.e.partStatus?.[partId]?.status || row.status || "") : "";
  const cohortOpts = Object.entries(S.cohorts).sort((a, b) => String(a[1].start).localeCompare(String(b[1].start))).map(([id, c]) => [id, (S.programmes[c.programmeId]?.name ? S.programmes[c.programmeId].name + " · " : "") + c.name]);
  const cols = [
    { k: "cohortId", label: "Programme and cohort", type: "select", options: cohortOpts, required: true },
    { k: "status", label: "Participation status", type: "select", options: PART_STATUS },
    { k: "start", label: "Start date (if not the cohort's)", type: "date" },
    { k: "end", label: "End date (if not the cohort's)", type: "date" },
    { k: "graduated", label: "Graduated on", type: "date" },
    { k: "approved", label: "Grant approved (₹)", type: "number" },
    { k: "rs", label: "Readiness at entry", type: "number" },
    { k: "re", label: "Readiness at completion", type: "number" },
    { k: "base", label: "External funds raised the year before (₹)", type: "number", help: "Leave blank to work it out from funding records." },
    { k: "post", label: "External funds raised the year after (₹)", type: "number", help: "Leave blank to work it out from funding records." },
    { k: "goals", label: "Goals set", type: "textarea" },
    { k: "goalsAchieved", label: "Goals achieved", type: "textarea" }
  ];
  const init = { ...row, status: eff, rs: row.readiness?.start ?? "", re: row.readiness?.end ?? "", base: val(row.baseFunds) ?? "", post: val(row.postFunds) ?? "" };
  const { node, read } = formFields(cols, init);
  modal((idx >= 0 ? "edit" : "add") + " programme participation", node, {
    onSave: saveWith(async () => {
      const r = read();
      if (!r.cohortId) { toast("Choose a programme and cohort.", true); return false; }
      const next = { ...row, id: row.id || uid(), cohortId: r.cohortId, start: r.start, end: r.end, graduated: r.graduated, approved: r.approved, goals: r.goals, goalsAchieved: r.goalsAchieved,
        readiness: { start: r.rs, end: r.re },
        baseFunds: r.base === "" ? null : (numOr(val(row.baseFunds)) === r.base ? row.baseFunds : { v: r.base, ...stampV() }),
        postFunds: r.post === "" ? null : (numOr(val(row.postFunds)) === r.post ? row.postFunds : { v: r.post, ...stampV() }),
        grants: row.grants || [], by: S.me?.id || null, at: nowISO() };
      let psNext = null;
      if (idx >= 0 && ov.e.partStatus?.[row.id] && r.status !== eff) psNext = { ...(ov.e.partStatus || {}), [row.id]: { ...ov.e.partStatus[row.id], status: r.status, by: S.me?.id || null, at: nowISO() } };
      else next.status = r.status;
      const all = raw.slice(); if (idx >= 0) all[idx] = next; else all.push(next);
      await saveKey("orgs", ov.id, "parts", all, "journey");
      if (psNext) await saveKey("edit", ov.id, "partStatus", psNext, "journey");
      toast("Saved");
    }),
    extra: idx >= 0 ? h("button", { class: "btn ghost", type: "button", onclick: async ev => {
      if ((row.grants || []).length && !confirm("This participation has grant tranches. Remove it with its grants? It stays in the update history.")) return;
      if (!(row.grants || []).length && !confirm("Remove this participation? It stays in the update history.")) return;
      try { await saveKey("orgs", ov.id, "parts", raw.filter(p => p.id !== row.id), "journey"); toast("Removed"); ev.target.closest(".modal-wrap").querySelector(".actions .btn:not(.primary):not(.ghost)").click(); } catch (e) { toast(explainErr(e), true); }
    } }, "remove") : null
  });
}

/* 5 · funding */
function secFunding(ov, admin) {
  const parts = orgParts(ov);
  const grants = deltaGrants(ov);
  const ext = ov.ext;
  const progs = programmesOrdered();
  const firstStart = parts.map(p => p.startD).filter(Boolean).sort()[0] || "";
  const deltaTotal = sum(grants.map(g => g.amt));
  const dated = ext.filter(r => r.date || r.fy);
  const before = dated.filter(r => firstStart && (r.date ? r.date < firstStart : fyStart(r.fy) < fyStart(toFY(firstStart))));
  const after = dated.filter(r => firstStart && !before.includes(r));
  const undated = ext.filter(r => !r.date && !r.fy);
  const beforeT = sum(before.map(r => r.amt)), afterT = sum(after.map(r => r.amt));
  const helped = ext.filter(r => r.deltaHelped === "yes" || r.deltaHelped === true);
  const partly = ext.filter(r => r.deltaHelped === "partly");
  const mult = deltaTotal > 0 && after.length ? afterT / deltaTotal : null;
  /* A · by programme */
  const byProg = progs.map(p => {
    const ps = parts.filter(x => x.c?.programmeId === p.id);
    const gs = grants.filter(g => g.progId === p.id);
    const appr = ps.map(x => x.approvedV).filter(x => x != null);
    return { p, approved: appr.length ? sum(appr) : null, disbursed: gs.length ? sum(gs.map(g => g.amt)) : null, n: gs.length, last: gs.map(g => g.date).filter(Boolean).sort().pop() || "" };
  });
  const tranches = grants.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const saveGrants = rows => {
    const next = clone(ov.o.parts || []);
    for (const p of next) p.grants = rows.filter(r => r.partId === p.id).map(({ partId, progId, prog, cohort, fy, ...g }) => g);
    return saveKey("orgs", ov.id, "parts", next, "funding");
  };
  /* C · movement by financial year */
  const fys = uniq([...ext.map(r => r.fy), ...grants.map(g => g.fy)].filter(Boolean)).sort();
  if (fys.length) { const a = fyStart(fys[0]), b = fyStart(fys[fys.length - 1]); fys.length = 0; for (let y = a; y <= b; y++) fys.push(fyOf(y)); }
  const extA = fys.map(fy => sum(ext.filter(r => r.fy === fy).map(r => r.amt)));
  const delA = fys.map(fy => sum(grants.filter(g => g.fy === fy).map(g => g.amt)));
  let c1 = 0, c2 = 0; const extC = extA.map(v => (c1 += v)), delC = delA.map(v => (c2 += v));
  const mode = UI.fundView;
  const chart = mode === "annual"
    ? groupBars({ xs: fys.map(fyShort), series: [{ name: "External funding", color: "var(--dark)", values: extA }, { name: "the^delta funding", color: "var(--red)", values: delA }], fmt: fmtINR })
    : lineChart({ xs: fys.map(fyShort), series: [{ name: "Cumulative external", color: "var(--dark)", values: extC }, { name: "Cumulative the^delta", color: "var(--red)", values: delC }], fmt: fmtINR });
  const outcomes = parts.map(p => {
    const kind = p.prog?.kind; const g = p.disbursed;
    let txt = "—";
    if (kind === "incubator" && g > 0 && p.postV != null) txt = fmtINR(p.postV) + " raised in the year after ÷ " + fmtINR(g) + " grant = " + fmtX(p.postV / g);
    else if ((kind === "accelerator" || kind === "pragati") && p.baseV > 0 && p.postV != null) txt = "(" + fmtINR(p.postV) + " − " + fmtINR(p.baseV) + ") ÷ " + fmtINR(p.baseV) + " = " + (p.postV >= p.baseV ? "+" : "") + fmtPct((p.postV - p.baseV) / p.baseV);
    return { p, kind, txt, how: [kind !== "incubator" && p.baseHow ? "year before: " + p.baseHow : "", p.postHow ? "year after: " + p.postHow : ""].filter(Boolean).join(" · ") };
  });
  return psec("funding", "funding: how has the organisation raised money?", null,
    h("div", { class: "tilegrid" },
      tile("the^delta funding", grants.length ? fmtINR(deltaTotal) : "–", grants.length ? grants.length + " grant" + (grants.length > 1 ? "s" : "") + ", " + uniq(grants.map(g => g.progId)).length + " programme" + (uniq(grants.map(g => g.progId)).length > 1 ? "s" : "") : "no tranches recorded"),
      tile("External raised (cumulative)", ext.length ? fmtINR(ov.extTotal) : "–", ov.extLast ? "as of " + (toFY(ov.extLast) === ov.extLast ? "FY" + ov.extLast : fmtDate(ov.extLast)) : "no funding records"),
      tile("Raised since joining", firstStart && after.length ? fmtINR(afterT) : "–", firstStart ? "since " + fmtMonth(firstStart) : "no programme dates"),
      tile("Grant multiplier", mult != null ? fmtX(mult) : "–", mult != null ? fmtINR(afterT) + " raised ÷ " + fmtINR(deltaTotal) + " grant" : "needs grants and later funding"),
      tile("Facilitated by the^delta", helped.length ? fmtINR(sum(helped.map(r => r.amt))) : "–", helped.length + " of " + ext.length + " rounds" + (partly.length ? " · " + partly.length + " partly" : ""))),
    subH("a · the^delta funding by programme"),
    h("div", { class: "tw" }, h("table", null,
      h("thead", null, h("tr", null, h("th", null, "Programme"), h("th", { class: "r" }, "Grant approved"), h("th", { class: "r" }, "Grant disbursed"), h("th", { class: "r" }, "Tranches"), h("th", null, "Last disbursement"))),
      h("tbody", null, byProg.map(r => h("tr", null, h("td", null, h("b", null, r.p.name)), h("td", { class: "r num" }, fmtINR(r.approved)), h("td", { class: "r num" }, fmtINR(r.disbursed)), h("td", { class: "r num" }, r.n || "–"), h("td", null, r.last ? fmtDate(r.last) : "–")))),
      h("tfoot", null, h("tr", null, h("td", null, "Total"), h("td", { class: "r num" }, fmtINR(sum(byProg.map(r => r.approved)) || null)), h("td", { class: "r num" }, fmtINR(deltaTotal || null)), h("td", { class: "r num" }, grants.length || "–"), h("td", null, ""))))),
    h("p", { class: "foot" }, "Approved amounts are set on each participation in Journey. Disbursed amounts are the sum of the tranches below."),
    h("div", { style: { height: "10px" } }),
    parts.length ? rowEditor({ title: "grant tranche", rows: tranches, canEdit: admin, addLabel: "add grant tranche", onSave: saveGrants,
      cols: [{ k: "partId", label: "Programme and cohort", type: "select", options: () => parts.map(p => [p.id, (p.prog?.name || "") + " · " + (p.c?.name || "")]), required: true, render: (v, r) => [h("b", null, r.prog), " · " + r.cohort] }, { k: "tranche", label: "Tranche", placeholder: "e.g. 1 of 2" }, { k: "amt", label: "Amount disbursed (₹)", type: "number", required: true, fmt: fmtINR }, { k: "date", label: "Disbursement date", type: "date", required: true }, { k: "entity", label: "Paid by (entity)" }, { k: "src", label: "Source" }] })
      : h("p", { class: "muted small" }, "Add a programme participation in Journey before recording grants."),
    subH("b · external funding"),
    rowEditor({ title: "external funding", rows: (ov.o.rounds || []).slice().sort((a, b) => String(b.date || b.fy).localeCompare(String(a.date || a.fy))), canEdit: admin, addLabel: "add external funding", onSave: rows => saveKey("orgs", ov.id, "rounds", rows, "funding"),
      cols: [{ k: "date", label: "Date received", type: "date", render: (v, r) => v ? fmtMonth(v) : (r.fy ? "FY" + r.fy : "–") }, { k: "fy", label: "Financial year (if no date)", placeholder: "e.g. 2024-25", hideInTable: true }, { k: "funder", label: "Funder", required: true }, { k: "type", label: "Type", type: "select", options: ["grant", "CSR", "equity", "debt", "prize", "donation", "other"] }, { k: "amt", label: "Amount (₹)", type: "number", required: true, fmt: fmtINR },
        { k: "deltaHelped", label: "the^delta helped", type: "select", options: [["yes", "yes"], ["partly", "partly"], ["no", "no"]], render: v => v === true ? "yes" : v || "–" }, { k: "src", label: "Source" }] }),
    undated.length ? h("p", { class: "foot", style: { color: "var(--red-ink)" } }, undated.length + " funding record" + (undated.length > 1 ? "s have" : " has") + " no date or financial year, so " + (undated.length > 1 ? "they are" : "it is") + " left out of the trend.") : null,
    subH("c · funding movement over time", segToggle([["annual", "Annual"], ["cumulative", "Cumulative"]], mode, v => UI.fundView = v)),
    chart,
    h("p", { class: "foot" }, mode === "annual" ? "Funding received in each financial year, not cumulative." : "Total received up to the end of each financial year."),
    fys.length ? h("div", { class: "tw", style: { marginTop: "10px" } }, h("table", null,
      h("thead", null, h("tr", null, ["Financial year", "External", "the^delta", "Total", "Cumulative external", "Cumulative the^delta", "Total raised to date"].map((t, i) => h("th", { class: i ? "r" : null }, t)))),
      h("tbody", null, fys.map((fy, i) => h("tr", null, h("td", null, h("b", null, "FY" + fy)), h("td", { class: "r num" }, extA[i] ? fmtINR(extA[i]) : "–"), h("td", { class: "r num" }, delA[i] ? fmtINR(delA[i]) : "–"), h("td", { class: "r num" }, extA[i] + delA[i] ? fmtINR(extA[i] + delA[i]) : "–"), h("td", { class: "r num" }, fmtINR(extC[i])), h("td", { class: "r num" }, fmtINR(delC[i])), h("td", { class: "r num" }, h("b", null, fmtINR(extC[i] + delC[i])))))))) : null,
    subH("d · funding growth and multiplier"),
    firstStart ? kvRows([
      ["First support from the^delta", fmtDate(firstStart)],
      ["External funding before support", before.length ? fmtINR(beforeT) : "₹0 recorded", h("span", { class: "prov" }, before.length + " record" + (before.length === 1 ? "" : "s"))],
      ["External funding after support", after.length ? fmtINR(afterT) : "₹0 recorded", h("span", { class: "prov" }, after.length + " record" + (after.length === 1 ? "" : "s"))],
      ["Increase in external funds raised", after.length ? fmtINR(afterT - beforeT) + (beforeT > 0 ? " (" + (afterT >= beforeT ? "+" : "") + fmtPct((afterT - beforeT) / beforeT) + ")" : "") : "–"],
      ["Grant multiplier", mult != null ? fmtX(mult) : "–"],
      ["Calculation", mult != null ? fmtINR(afterT) + " external funding after support ÷ " + fmtINR(deltaTotal) + " the^delta funding disbursed = " + fmtX(mult) : "Needs the^delta grants and external funding dated after " + fmtDate(firstStart) + "."]
    ]) : h("p", { class: "muted small" }, "Add a programme participation with dates to compare funding before and after the^delta's support."),
    subH("programme outcomes used on Overview"),
    outcomes.length ? h("div", { class: "tw" }, h("table", null, h("thead", null, h("tr", null, h("th", null, "Participation"), h("th", null, "Measure"), h("th", null, "Calculation"), h("th", null, "Where the figures come from"))),
      h("tbody", null, outcomes.map(o => h("tr", null, h("td", null, h("b", null, o.p.prog?.name || ""), " · " + (o.p.c?.name || "")), h("td", { class: "small" }, o.kind === "incubator" ? "grant multiplier" : o.kind === "accelerator" || o.kind === "pragati" ? "increase in funds raised" : "—"), h("td", { class: "small" }, o.txt), h("td", { class: "small muted" }, o.how || "–")))))) : h("p", { class: "muted small" }, "–"),
    h("p", { class: "foot" }, "Overview uses funds raised in the financial year after a programme (and the year before, for Accelerator and Pragati). Recorded figures take priority; otherwise they are worked out from the funding records above."));
}

/* 6 · team & finances */
function secTeam(ov, admin) {
  const t = ov.teamSeries;
  const tl = t[t.length - 1], t0 = t[0];
  const fin = (ov.o.fin || []).slice().sort((a, b) => String(a.fy).localeCompare(String(b.fy)) || String(a.period || "").localeCompare(String(b.period || "")));
  const full = fin.filter(r => !r.period || r.period === "full year");
  const lastF = full[full.length - 1];
  const runway = (ov.o.runway || []).slice().sort((a, b) => String(a.asOf).localeCompare(String(b.asOf)));
  const rw = runway[runway.length - 1];
  const totalStaff = tl ? (numOr(tl.ft) || 0) + (numOr(tl.pt) || 0) : 0;
  const ftChange = tl && t0 && tl !== t0 && numOr(t0.ft) ? (numOr(tl.ft) - numOr(t0.ft)) : null;
  return psec("team", "team & finances: how has the organisation grown internally?", null,
    h("div", { class: "tilegrid" },
      tile("Full-time team", tl && numOr(tl.ft) != null ? fmtN(+tl.ft) : "–", tl ? (ftChange != null ? (ftChange >= 0 ? "up " : "down ") + Math.abs(ftChange) + " from " + numOr(t0.ft) + " (" + fmtMonth(t0.asOf) + ")" : "as of " + fmtDate(tl.asOf)) : "not recorded"),
      tile("Part-time team", tl && numOr(tl.pt) != null ? fmtN(+tl.pt) : "–", tl ? "as of " + fmtDate(tl.asOf) : ""),
      tile("Women employees", tl && numOr(tl.women) != null ? fmtN(+tl.women) + (totalStaff ? " (" + fmtPct(+tl.women / totalStaff) + ")" : "") : "–", tl ? "as of " + fmtDate(tl.asOf) : ""),
      tile("Revenue " + (lastF ? "FY" + lastF.fy : ""), lastF && numOr(lastF.revenue) != null ? fmtINR(+lastF.revenue) : "–", lastF?.audited === true ? "audited" : lastF?.audited === false ? "not audited" : ""),
      tile("Grant income " + (lastF ? "FY" + lastF.fy : ""), lastF && numOr(lastF.grantIncome) != null ? fmtINR(+lastF.grantIncome) : "–", lastF && numOr(lastF.revenue) > 0 && numOr(lastF.grantIncome) != null ? fmtPct(+lastF.grantIncome / +lastF.revenue) + " of total income" : ""),
      tile("Runway", rw ? (rw.text || (numOr(rw.months) != null ? rw.months + " months" : "–")) : "–", rw ? "as of " + fmtDate(rw.asOf) : "not recorded")),
    h("div", { class: "grid2" },
      h("div", null, subH("team size over time"), lineChart({ xs: t.map(r => fmtMonth(r.asOf)), series: [{ name: "Full-time", color: "var(--red)", values: t.map(r => numOr(r.ft)) }, { name: "Part-time", color: "var(--slate)", values: t.map(r => numOr(r.pt)) }, { name: "Women", color: "var(--chart-3)", values: t.map(r => numOr(r.women)) }], height: 220, labels: false })),
      h("div", null, subH("revenue compared with grant income"), groupBars({ xs: full.map(r => fyShort(r.fy)), series: [{ name: "Total income", color: "var(--dark)", values: full.map(r => numOr(r.revenue)) }, { name: "Grant income", color: "var(--red)", values: full.map(r => numOr(r.grantIncome)) }], fmt: fmtINR, height: 220 }))),
    subH("team history"),
    rowEditor({ title: "team size", rows: t.slice().reverse(), canEdit: admin, addLabel: "add team size", onSave: rows => saveKey("orgs", ov.id, "team", rows, "team"), empty: "No team sizes recorded. Each new figure is added with its date; earlier figures are kept.",
      cols: [{ k: "asOf", label: "As of", type: "date", required: true }, { k: "ft", label: "Full-time", type: "number", fmt: v => fmtN(v) }, { k: "pt", label: "Part-time", type: "number", fmt: v => fmtN(v) }, { k: "women", label: "Women employees", type: "number", fmt: v => fmtN(v) }, { k: "src", label: "Source" }] }),
    subH("finances by period"),
    rowEditor({ title: "financial figures", rows: fin.slice().reverse(), canEdit: admin, addLabel: "add financial figures", onSave: rows => saveKey("orgs", ov.id, "fin", rows, "team"),
      cols: [{ k: "fy", label: "Financial year (e.g. 2025-26)", required: true, render: v => "FY" + v }, { k: "period", label: "Period", type: "select", options: [["full year", "full year"], ["H1", "first half (Apr–Sep)"], ["H2", "second half (Oct–Mar)"]], render: v => v === "H1" ? "first half" : v === "H2" ? "second half" : "full year" }, { k: "revenue", label: "Total income (₹)", type: "number", fmt: fmtINR }, { k: "grantIncome", label: "Grant income (₹)", type: "number", fmt: fmtINR }, { k: "earned", label: "Share earned", hideInForm: true, get: r => (numOr(r.revenue) > 0 && numOr(r.grantIncome) != null) ? fmtPct((+r.revenue - +r.grantIncome) / +r.revenue) : "–" }, { k: "audited", label: "Audited", type: "tri" }, { k: "src", label: "Source" }] }),
    h("p", { class: "foot" }, "Share earned = (total income − grant income) ÷ total income. Half-year rows sit beside full-year rows and are not added to them."),
    subH("financial runway"),
    rowEditor({ title: "runway", rows: runway.slice().reverse(), canEdit: admin, addLabel: "add runway", onSave: rows => saveKey("orgs", ov.id, "runway", rows, "team"),
      cols: [{ k: "asOf", label: "As of", type: "date", required: true }, { k: "text", label: "Runway (as the organisation describes it)", placeholder: "e.g. 6–12 months" }, { k: "months", label: "Months (if a single number)", type: "number", fmt: v => v ?? "" }, { k: "src", label: "Source" }] }));
}

/* 7 · readiness */
function secReadiness(ov, admin) {
  const r = readinessSummary(ov);
  const mv = r.latest != null && r.initial != null ? r.latest - r.initial : null;
  const editLink = admin ? h("button", { class: "btn", type: "button", onclick: () => {
    const { node, read } = formFields([{ k: "matrixLink", label: "Readiness Matrix link", type: "url" }], { matrixLink: ov.o.matrixLink || "" });
    modal("readiness matrix link", node, { onSave: saveWith(async () => { await saveKey("orgs", ov.id, "matrixLink", read().matrixLink, "readiness"); toast("Saved"); }) });
  } }, "Set matrix link") : null;
  const parts = orgParts(ov).filter(p => numOr(p.readiness?.start) != null || numOr(p.readiness?.end) != null);
  return psec("readiness", "readiness: how prepared is the organisation?", editLink,
    h("div", { class: "tilegrid" },
      tile("Initial readiness", r.initial != null ? fmtN(r.initial, 1) : "–", r.initialD ? fmtDate(r.initialD) : ""),
      tile("Latest readiness", r.latest != null ? fmtN(r.latest, 1) : "–", r.latestD ? fmtDate(r.latestD) : ""),
      tile("Overall movement", mv != null ? (mv >= 0 ? "+" : "") + fmtN(mv, 1) : "–", mv != null ? (mv > 0 ? "improved" : mv < 0 ? "declined" : "no change") : ""),
      tile("Assessments", r.dates.length ? fmtN(r.dates.length) : "–", r.dates.length ? fmtDate(r.dates[0]) + " to " + fmtDate(r.dates[r.dates.length - 1]) : ""),
      h("div", { class: "fig" }, h("span", { class: "k" }, "Readiness Matrix"), h("b", null, r.link ? h("a", { href: r.link, target: "_blank", rel: "noopener" }, "View matrix ›") : "–"), h("span", { class: "d" }, r.source === "matrix" ? "source of truth" : r.source === "programme" ? "only programme scores recorded" : "not linked"))),
    r.dims.length ? [subH("before and after, by dimension"),
      h("div", { class: "tw" }, h("table", null, h("thead", null, h("tr", null, h("th", null, "Dimension"), h("th", { class: "r" }, "Initial"), h("th", { class: "r" }, "Latest"), h("th", { class: "r" }, "Change"), h("th", null, "Assessed"))),
        h("tbody", null, r.dims.map(d => { const c = d.last - d.first; return h("tr", null, h("td", null, h("b", null, d.d)), h("td", { class: "r num" }, fmtN(d.first, 1)), h("td", { class: "r num" }, fmtN(d.last, 1)), h("td", { class: "r num" }, h("span", { class: "chg " + (c >= 0 ? "up" : "dn") }, d.firstD === d.lastD ? "–" : (c > 0 ? "▲ +" : c < 0 ? "▼ " : "") + fmtN(c, 1))), h("td", { class: "small muted" }, fmtDate(d.firstD) + (d.firstD !== d.lastD ? " → " + fmtDate(d.lastD) : ""))); }))))] : null,
    r.dates.length > 1 ? [subH("overall readiness over time"), lineChart({ xs: r.dates.map(fmtMonth), series: [{ name: "Overall readiness", color: "var(--red)", values: r.series }], fmt: v => fmtN(v, 1), height: 200 })] : null,
    parts.length ? [subH("readiness at programme entry and completion"),
      h("div", { class: "tw" }, h("table", null, h("thead", null, h("tr", null, h("th", null, "Programme"), h("th", { class: "r" }, "Entry"), h("th", { class: "r" }, "Completion"), h("th", { class: "r" }, "Movement"))),
        h("tbody", null, parts.map(p => { const s0 = numOr(p.readiness?.start), e0 = numOr(p.readiness?.end); return h("tr", null, h("td", null, h("b", null, p.prog?.name || ""), " · " + (p.c?.name || "")), h("td", { class: "r num" }, fmtN(s0, 1)), h("td", { class: "r num" }, fmtN(e0, 1)), h("td", { class: "r num" }, s0 != null && e0 != null ? h("span", { class: "chg " + (e0 - s0 >= 0 ? "up" : "dn") }, (e0 - s0 >= 0 ? "+" : "") + fmtN(e0 - s0, 1)) : "–")); }))))] : null,
    subH("scores from the Readiness Matrix"),
    rowEditor({ title: "readiness score", rows: (ov.o.readiness || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(a.dimension).localeCompare(String(b.dimension))), canEdit: admin, addLabel: "add score", onSave: rows => saveKey("orgs", ov.id, "readiness", rows, "readiness"), empty: "No scores copied from the matrix yet.",
      cols: [{ k: "date", label: "Assessment date", type: "date", required: true }, { k: "stage", label: "Assessment", type: "select", options: ["entry", "mid-point", "completion", "follow-up"] }, { k: "dimension", label: "Dimension (use “Overall” for the total)", required: true }, { k: "score", label: "Score", type: "number", required: true, fmt: v => fmtN(v, 1) }, { k: "link", label: "Matrix link", type: "url", linkText: "matrix" }] }),
    h("p", { class: "foot" }, "Scores are copied from the Readiness Matrix with their date. A row named “Overall” is used as the overall score; otherwise it is the average of the dimensions."));
}

/* 8 · impact */
function secImpact(ov, admin) {
  const M = S.config.metrics?.std || DEFAULT_METRICS;
  const label = k => M.find(m => m.key === k)?.label || String(k).replace(/^own:/, "");
  const imp = orgImpact(ov, null);
  const keys = Object.keys(imp);
  const lv = ov.o.livelihoods || {};
  const entries = ov.o.impact || [];
  const fysAll = uniq(entries.filter(e => e.kind !== "cumulative").map(e => e.fy).filter(Boolean)).sort();
  const sel = UI.prMetric && keys.includes(UI.prMetric) ? UI.prMetric : (keys.includes("reach") ? "reach" : keys[0]);
  const mode = UI.impTrend;
  const annVals = fysAll.map(fy => imp[sel]?.ann?.[fy] ?? null);
  let run = 0; const cumVals = annVals.map(v => v == null ? (run || null) : (run += v));
  const reportedCum = entries.filter(e => e.metric === sel && e.kind === "cumulative" && e.fy);
  const repVals = fysAll.map(fy => { const x = reportedCum.find(e => e.fy === fy); return x ? numOr(x.value) : null; });
  const series = mode === "annual" ? [{ name: label(sel) + " (each year)", color: "var(--red)", values: annVals }]
    : [{ name: "Running total of yearly figures", color: "var(--red)", values: cumVals }, ...(repVals.some(v => v != null) ? [{ name: "Cumulative as reported", color: "var(--dark)", values: repVals }] : [])];
  const growth = (k) => { const a = imp[k]?.ann || {}; const f = Object.keys(a).sort(); return f.length > 1 ? chg(a[f[f.length - 1]], a[f[f.length - 2]]) : null; };
  const metricsWithYears = keys.filter(k => Object.keys(imp[k].ann || {}).length);
  const cov = M.map(m => ({ m, has: !!imp[m.key], via: imp[m.key]?.viaOwn }));
  const fig = k => imp[k] ? fmtN(imp[k].cum) : "–";
  const figD = k => imp[k] ? (imp[k].cumFromAnn ? "sum of yearly figures to FY" : "cumulative to FY") + (imp[k].cumFy || "") : "not recorded";
  return psec("impact", "impact: what difference has the organisation created?", null,
    h("div", { class: "tilegrid" },
      tile("People reached", fig("reach"), figD("reach")),
      tile("Women reached", fig("women"), figD("women")),
      tile("Livelihoods supported", fig("livelihoods"), figD("livelihoods")),
      tile("Income enabled", numOr(lv.totalIncome) != null ? fmtINR(+lv.totalIncome) : "–", numOr(lv.people) != null ? fmtN(+lv.people) + " people" + (lv.fy ? " · FY" + lv.fy : "") : "not recorded"),
      tile("Metrics reported", fmtN(keys.length), cov.filter(c => c.has).length + " of " + M.length + " standard metrics")),
    subH("c · impact movement over time",
      keys.length ? h("select", { "aria-label": "Metric", onchange: e => { UI.prMetric = e.target.value; render(); } }, keys.map(k => h("option", { value: k, selected: k === sel }, label(k)))) : null,
      segToggle([["annual", "Annual"], ["cumulative", "Cumulative"]], mode, v => UI.impTrend = v)),
    keys.length ? [lineChart({ xs: fysAll.map(fyShort), series, fmt: fmtC, height: 230, labels: series.length === 1 }),
      h("p", { class: "foot" }, mode === "annual" ? "People reached in each financial year. Cumulative figures are shown separately to avoid counting the same people twice." : "The running total adds yearly figures, so it can count returning beneficiaries more than once; the organisation's own cumulative figure is shown separately where it reported one.")] : h("p", { class: "muted small" }, "No impact figures yet."),
    metricsWithYears.length ? [subH("every metric, by financial year"),
      h("div", { class: "tw" }, h("table", null, h("thead", null, h("tr", null, h("th", null, "Metric"), fysAll.map(fy => h("th", { class: "r" }, fyShort(fy))), h("th", { class: "r" }, "Latest change"), h("th", { class: "r" }, "Cumulative"))),
        h("tbody", null, metricsWithYears.map(k => { const g = growth(k); return h("tr", { class: "click", onclick: () => { UI.prMetric = k; render(); } }, h("td", null, h("b", null, label(k))), fysAll.map(fy => h("td", { class: "r num" }, imp[k].ann?.[fy] != null ? fmtN(imp[k].ann[fy]) : "–")), h("td", { class: "r num" }, g != null ? h("span", { class: "chg " + (g >= 0 ? "up" : "dn") }, (g >= 0 ? "▲ " : "▼ ") + fmtPct(Math.abs(g))) : "–"), h("td", { class: "r num" }, fmtN(imp[k].cum))); }))))] : null,
    subH("a · b · impact figures and how they were measured"),
    rowEditor({ title: "impact figure", rows: entries.slice().sort((a, b) => String(a.metric).localeCompare(String(b.metric)) || String(b.fy).localeCompare(String(a.fy))), canEdit: admin, addLabel: "add impact figure", onSave: rows => saveKey("orgs", ov.id, "impact", rows, "impact"),
      cols: [{ k: "fy", label: "Financial year (e.g. 2025-26)", required: true, render: v => v ? "FY" + v : "–" }, { k: "metric", label: "Metric", type: "select", options: () => [...M.map(m => [m.key, m.label]), ...(ov.o.own || []).map(m => ["own:" + m.name, "own: " + m.name])], required: true, render: v => label(v) },
        { k: "kind", label: "Figure is", type: "select", options: [["annual", "for that year only"], ["cumulative", "cumulative to date"]], render: v => v === "cumulative" ? "cumulative" : "yearly" }, { k: "value", label: "Value", type: "number", required: true, fmt: v => fmtN(v) },
        { k: "method", label: "Measurement method", type: "select", options: Object.entries(METHODS).filter(([k]) => k), render: v => METHODS[v || ""] }, { k: "src", label: "Source" },
        { k: "verified", label: "Verification status", type: "select", options: Object.entries(VERIFY), render: v => v ? VERIFY[v] : h("span", { class: "muted" }, "not set") }, { k: "women", label: "Of which women and girls", type: "number", fmt: v => fmtN(v), hideInTable: true }] }),
    subH("livelihoods and income enabled for beneficiaries"),
    kvRows([["People with increased income", fmtN(numOr(lv.people))], ["Average increase per person", fmtINR(numOr(lv.avgIncrease))], ["Total extra income enabled", fmtINR(numOr(lv.totalIncome))], ["Year and source", [lv.fy ? "FY" + lv.fy : "", lv.src].filter(Boolean).join(" · ")]]),
    admin ? h("button", { class: "btn", type: "button", style: { marginTop: "8px" }, onclick: () => {
      const { node, read } = formFields([{ k: "people", label: "People with increased income", type: "number" }, { k: "avgIncrease", label: "Average increase per person (₹ a year)", type: "number" }, { k: "totalIncome", label: "Total extra income enabled (₹)", type: "number" }, { k: "fy", label: "Financial year" }, { k: "src", label: "Source" }], lv);
      modal("livelihoods and income", node, { onSave: saveWith(async () => { await saveKey("orgs", ov.id, "livelihoods", read(), "impact"); toast("Saved"); }) });
    } }, "Edit livelihoods and income") : null,
    subH("d · the 12 standard the^delta impact metrics"),
    h("div", null, cov.map(c => h("span", { class: "tag" + (c.has ? " solid" : ""), title: c.via ? "from own measure: " + c.via : "" }, c.m.label + (c.via ? " (via own measure)" : "")))),
    h("p", { class: "foot" }, "Filled tags are reported by this organisation."),
    subH("the organisation's own metrics"),
    rowEditor({ title: "own metric", rows: ov.o.own || [], canEdit: admin, addLabel: "add own metric", onSave: rows => saveKey("orgs", ov.id, "own", rows, "impact"),
      cols: [{ k: "name", label: "Metric (in their words)", required: true }, { k: "unit", label: "Unit" }, { k: "linkedTo", label: "Counts towards standard metric", type: "select", options: () => M.map(m => [m.key, m.label]), placeholder: "not linked", render: v => v ? label(v) : h("span", { class: "muted" }, "not linked") }, { k: "notes", label: "Notes", type: "textarea", hideInTable: true }] }),
    h("p", { class: "foot" }, "Record yearly values for own metrics as impact figures above. All organisations' own metrics are listed in Impact › Own-metrics library."),
    subH("e · evaluations"),
    rowEditor({ title: "evaluation finding", rows: ov.o.findings || [], canEdit: admin, addLabel: "add evaluation finding", onSave: rows => saveKey("orgs", ov.id, "findings", rows, "impact"),
      cols: [{ k: "report", label: "Evaluation", type: "select", options: ["Sattva", "Deloitte", "Other"], required: true }, { k: "year", label: "Year", type: "number", fmt: v => v || "" }, { k: "title", label: "Finding", required: true }, { k: "text", label: "Detail", type: "textarea", hideInTable: true }, { k: "link", label: "Report link", type: "url", linkText: "report" }] }),
    subH("stories, case studies and media"),
    rowEditor({ title: "story or media", rows: ov.o.stories || [], canEdit: admin, addLabel: "add story or media", onSave: rows => saveKey("orgs", ov.id, "stories", rows, "impact"),
      cols: [{ k: "type", label: "Type", type: "select", options: ["beneficiary story", "case study", "photograph", "testimonial"], required: true }, { k: "title", label: "Title", required: true }, { k: "text", label: "Story", type: "textarea", hideInTable: true },
        { k: "consent", label: "Consent to use", type: "select", options: [["given", "given"], ["pending", "pending"], ["not given", "not given"]], get: r => r.consent === true ? "given" : r.consent === false ? "not given" : r.consent, render: v => v === "given" ? "given" : v ? h("span", { style: { color: "var(--red-ink)" } }, v) : h("span", { class: "muted" }, "not recorded") }, { k: "consentOn", label: "Consent date", type: "date" }, { k: "link", label: "Link", type: "url" }] }));
}

/* 9 · ecosystem support */
function secEcosystem(ov, admin, team) {
  const rows = (ov.e.support || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const of = t => rows.filter(r => r.type === t);
  const hours = sum(rows.map(r => numOr(r.hours)));
  const rated = rows.filter(r => numOr(r.rating) != null);
  const byType = SUPPORT_TYPES.map(t => ({ label: t, value: sum(of(t).map(r => numOr(r.hours))), sub: "· " + of(t).length })).filter(x => x.value || x.sub !== "· 0");
  return psec("ecosystem", "ecosystem support: what additional support has the organisation received?", null,
    h("div", { class: "tilegrid" },
      tile("Sessions and workshops", fmtN(of("session or workshop").length), rated.length ? "average rating " + fmtN(sum(rated.map(r => +r.rating)) / rated.length, 1) + " / 5" : "attended"),
      tile("Introductions", fmtN(of("introduction to a funder or partner").length), "to funders and partners"),
      tile("Mentoring sessions", fmtN(of("mentoring").length), ""),
      tile("Office hours", fmtN(of("office hours").length), ""),
      tile("Total support hours", fmtN(hours, 1), rows.length + " records")),
    byType.length ? [subH("support hours by type"), hBars(byType, { grey: true, fmt: v => fmtN(v, 1) + " h" })] : null,
    subH("support record"),
    rowEditor({ title: "support", rows, canEdit: team, addLabel: "add support", onSave: next => saveKey("edit", ov.id, "support", next, "ecosystem"), empty: "No support recorded yet.",
      cols: [{ k: "date", label: "Date", type: "date", required: true }, { k: "type", label: "Type of support", type: "select", options: SUPPORT_TYPES, required: true }, { k: "title", label: "Session, introduction or topic", required: true }, { k: "with", label: "With (speaker, mentor, funder)" }, { k: "hours", label: "Hours", type: "number", fmt: v => fmtN(v, 1) }, { k: "rating", label: "Rating (1–5)", type: "number", fmt: v => v ?? "" }, { k: "feedback", label: "Feedback", type: "textarea", hideInTable: true }] }),
    h("div", { class: "later-box" }, "Sessions with speakers and feedback are recorded automatically from Phase 3, and mentoring and office-hour bookings from Phase 4. Until then, add them here."));
}

/* 10 · notes & follow-ups */
function secNotes(ov, admin, team) {
  const e = ov.e;
  const notes = (e.notes || []).slice().sort((a, b) => String(b.date || b.at).localeCompare(String(a.date || a.at)));
  const follow = (e.follow || []).slice();
  const open = follow.filter(f => !f.done).sort((a, b) => String(a.due || "9999").localeCompare(String(b.due || "9999")));
  const next = open.find(f => f.due);
  const overdue = open.filter(f => f.due && f.due < today());
  const respName = f => f.ownerId ? personName(f.ownerId) : (f.owner || "");
  return psec("notes", "notes & follow-ups: what has been discussed and what needs attention?", null,
    h("div", { class: "tilegrid" },
      tile("Interactions recorded", fmtN(notes.length), notes[0] ? "latest " + fmtDate(notes[0].date || notes[0].at) : ""),
      tile("Pending follow-ups", fmtN(open.length), overdue.length ? overdue.length + " overdue" : "none overdue"),
      tile("Next follow-up", next ? fmtDate(next.due) : "–", next ? (respName(next) ? respName(next) + " · " : "") + next.text.slice(0, 40) : "")),
    subH("interactions"),
    rowEditor({ title: "interaction", rows: notes, canEdit: team, addLabel: "add interaction", onSave: rows => saveKey("edit", ov.id, "notes", rows, "notes"),
      cols: [{ k: "date", label: "Date", type: "date", required: true, get: r => r.date || (r.at ? String(r.at).slice(0, 10) : today()) }, { k: "type", label: "Type", type: "select", options: NOTE_TYPES }, { k: "text", label: "What was discussed", type: "textarea", required: true, render: v => v && v.length > 160 ? v.slice(0, 158) + "…" : v }, { k: "promised", label: "Actions promised", type: "textarea", render: v => v || "" }, { k: "by", label: "Recorded by", hideInForm: true, render: v => personName(v) }] }),
    subH("challenges and support requested"),
    kvRows([["Challenges faced", val(ov.f.challenges), provOf(ov.f.challenges)], ["Support requested", val(ov.f.supportRequested), provOf(ov.f.supportRequested)]]),
    team ? h("button", { class: "btn", type: "button", style: { marginTop: "8px" }, onclick: () => {
      const { node, read } = formFields([{ k: "challenges", label: "Challenges faced", type: "textarea" }, { k: "supportRequested", label: "Support requested", type: "textarea" }], { challenges: val(ov.f.challenges), supportRequested: val(ov.f.supportRequested) });
      modal("challenges and support requested", node, { onSave: saveWith(async () => { await saveFields(ov.id, "notes", read()); toast("Saved"); }) });
    } }, "Edit challenges and support") : null,
    subH("follow-ups",
      team ? h("button", { class: "btn ghost", type: "button", onclick: () => {
        const { node, read, els } = formFields([{ k: "text", label: "Follow-up", required: true, wide: true }, { k: "due", label: "Due", type: "date" }], { due: today() });
        let ownerId = S.me?.id || null;
        const who = h("button", { class: "btn", type: "button", onclick: () => pickPerson(pid => { ownerId = pid; who.textContent = "Responsible: " + personName(pid); }) }, "Responsible: " + personName(ownerId));
        modal("add a follow-up", h("div", null, node, h("div", { style: { marginTop: "10px" } }, who)), { saveLabel: "add follow-up", onSave: saveWith(async () => { const r = read(); if (!r.text) { toast("Describe the follow-up.", true); return false; } await saveKey("edit", ov.id, "follow", [...follow, { id: uid(), ...r, ownerId, done: false, by: S.me?.id || null, at: nowISO() }], "notes"); toast("Follow-up added"); }) });
      } }, "+ add follow-up with a colleague") : null),
    rowEditor({ title: "follow-up", rows: follow.sort((a, b) => Number(!!a.done) - Number(!!b.done) || String(a.due).localeCompare(String(b.due))), canEdit: team, addLabel: "add follow-up", onSave: rows => saveKey("edit", ov.id, "follow", rows, "notes"),
      rowClass: r => !r.done && r.due && r.due < today() ? "warn" : "",
      cols: [{ k: "text", label: "Follow-up", required: true, wide: true }, { k: "owner", label: "Person responsible", get: r => respName(r) }, { k: "due", label: "Due", type: "date" }, { k: "done", label: "Done", type: "bool" }] }),
    h("p", { class: "foot" }, "Overdue follow-ups are shaded."));
}

/* 11 · data & sources */
function secSources(ov, admin, team, flags) {
  const F = ov.f;
  const checks = profileChecks(ov);
  const missing = checks.filter(c => !c[1]).map(c => c[0]);
  const provRows = Object.entries(F).map(([k, x]) => ({ k, label: IDENTITY_COLS.find(c => c.k === k)?.label || k, x })).filter(r => r.x && typeof r.x === "object" && "v" in r.x);
  const hist = [...(ov.e.history || []), ...(ov.o.history || [])].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const lastH = hist[0];
  const lastAt = [ov.e.updatedAt, ov.o.updatedAt].filter(Boolean).sort().pop() || lastH?.at;
  /* sources by section */
  const sections = [
    ["Journey and funding", [...(ov.o.parts || []).flatMap(p => [...(p.grants || []), p.baseFunds, p.postFunds].filter(Boolean)), ...(ov.o.rounds || [])]],
    ["Team & finances", [...(ov.o.team || []), ...(ov.o.fin || []), ...(ov.o.runway || [])]],
    ["Readiness", ov.o.readiness || []],
    ["Impact", [...(ov.o.impact || []), ...(ov.o.findings || []).map(f => ({ src: f.report }))]],
    ["Identity and people", [...provRows.map(r => r.x), ...(ov.e.founders || []), ...(ov.e.contacts || [])]]
  ].map(([n, arr]) => { const src = {}; for (const x of arr) { const s0 = x?.src || "not recorded"; src[s0] = (src[s0] || 0) + 1; } return { n, count: arr.length, src }; });
  const consents = [...(ov.e.contacts || []).map(c => ({ what: "Contact: " + c.name, state: c.consent === true ? "given" : c.consent === false ? "not given" : "not recorded", d: c.consentOn })),
    ...(ov.o.stories || []).map(s0 => ({ what: (s0.type || "story") + ": " + s0.title, state: s0.consent === true ? "given" : s0.consent === false ? "not given" : (s0.consent || "not recorded"), d: s0.consentOn }))];
  const resolve = async f => {
    const note = prompt("How was this checked? (kept with the record)", "checked, value is correct");
    if (note == null) return;
    try { await saveKey("orgs", ov.id, "flagsRes", { ...(ov.o.flagsRes || {}), [f.key + ":" + f.msg]: { status: "resolved", note, by: S.me?.id || null, at: nowISO() } }, "sources"); toast("Flag marked as checked"); }
    catch (e) { toast(explainErr(e), true); }
  };
  const resolved = Object.entries(ov.o.flagsRes || {});
  const kindOf = k => k === "outdated" ? "outdated" : k === "inconsistent" || k === "bigGrant" || k === "bigMultiplier" || k === "impactJump" || k === "negative" || k === "duplicateName" ? "inconsistent" : "missing";
  return psec("sources", "data & sources: how reliable is the information?", null,
    h("div", { class: "tilegrid" },
      tile("Data completeness", fmtPct(completeness(ov)), (checks.length - missing.length) + " of " + checks.length + " items"),
      tile("Missing information", fmtN(missing.length), missing.length ? "items to fill in" : "nothing missing"),
      tile("Last updated", lastAt ? fmtDate(lastAt) : "–", lastH ? "by " + personName(lastH.by) : ""),
      tile("Open data flags", fmtN(flags.length), flags.length ? uniq(flags.map(f => kindOf(f.key))).join(", ") : "none")),
    missing.length ? [subH("missing information"), h("ul", { class: "miss" }, missing.map(m => h("li", null, m)))] : null,
    subH("system flags: missing, outdated or inconsistent data"),
    flags.length ? h("div", { class: "tw" }, h("table", null, h("tbody", null, flags.map(f => h("tr", null, h("td", { style: { width: "110px" } }, h("span", { class: "tag flag" }, kindOf(f.key))), h("td", null, f.label, f.msg ? h("span", { class: "sub" }, f.msg) : null), h("td", { class: "r" }, admin ? h("button", { class: "btn ghost", type: "button", onclick: () => resolve(f) }, "mark as checked") : null))))))
      : h("p", { class: "muted small" }, "No open flags."),
    resolved.length ? h("details", { style: { marginTop: "8px" } }, h("summary", { class: "small" }, resolved.length + " resolved flag" + (resolved.length > 1 ? "s" : "")),
      h("div", { class: "tw" }, h("table", { class: "hist" }, h("tbody", null, resolved.map(([k, r]) => h("tr", null, h("td", null, k.replace(":", " · ")), h("td", null, r.note), h("td", { class: "muted" }, fmtDate(r.at) + " · " + personName(r.by)))))))) : null,
    subH("source of each figure"),
    h("div", { class: "tw" }, h("table", null, h("thead", null, h("tr", null, h("th", null, "Section"), h("th", { class: "r" }, "Records"), h("th", null, "Sources"))),
      h("tbody", null, sections.map(s0 => h("tr", null, h("td", null, h("b", null, s0.n)), h("td", { class: "r num" }, s0.count), h("td", { class: "small" }, Object.entries(s0.src).sort((a, b) => b[1] - a[1]).map(([k, n]) => k + " (" + n + ")").join(", ") || "–")))))),
    h("p", { class: "foot" }, "Each row in Funding, Team & finances, Readiness and Impact shows its own source. Identity fields are listed below."),
    provRows.length ? h("details", { style: { marginTop: "8px" } }, h("summary", { class: "small" }, "Identity and people fields: value, source and date"),
      h("div", { class: "tw" }, h("table", { class: "hist" }, h("thead", null, h("tr", null, ["Field", "Value", "Source", "Refers to", "Changed by"].map(t => h("th", null, t)))),
        h("tbody", null, provRows.map(r => h("tr", null, h("td", null, r.label), h("td", null, (() => { const v = r.x.v; const t = Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "yes" : "no") : String(v ?? ""); return t.length > 80 ? t.slice(0, 77) + "…" : t; })()), h("td", null, r.x.src || ""), h("td", null, fmtDate(r.x.asOf)), h("td", { class: "muted" }, r.x.by ? personName(r.x.by) + " · " + fmtDate(r.x.at) : "loaded"))))))) : null,
    subH("consent records"),
    consents.length ? h("div", { class: "tw" }, h("table", null, h("thead", null, h("tr", null, h("th", null, "For"), h("th", null, "Consent"), h("th", null, "Recorded on"))),
      h("tbody", null, consents.map(c => h("tr", null, h("td", null, c.what), h("td", null, c.state === "given" ? "given" : h("span", { style: { color: "var(--red-ink)" } }, c.state)), h("td", { class: "small" }, c.d ? fmtDate(c.d) : "–")))))) : h("p", { class: "muted small" }, "No contacts or stories recorded yet."),
    subH("documents and links"),
    rowEditor({ title: "document link", rows: ov.e.docs || [], canEdit: team, addLabel: "add document link", onSave: rows => saveKey("edit", ov.id, "docs", rows, "documents"),
      cols: [{ k: "type", label: "Type", type: "select", options: DOC_TYPES, required: true }, { k: "title", label: "Title", required: true, render: (v, r) => r.url ? h("a", { href: r.url, target: "_blank", rel: "noopener" }, v) : v }, { k: "url", label: "Drive link", type: "url", required: true, hideInTable: true }, { k: "at", label: "Added", hideInForm: true, render: (v, r) => (v ? fmtDate(v) : "") + (r.by ? " · " + personName(r.by) : "") }] }),
    subH("historical changes"),
    hist.length ? h("div", { class: "tw", style: { maxHeight: "360px", overflow: "auto" } }, h("table", { class: "hist" }, h("thead", null, h("tr", null, ["When", "Who", "Section", "What", "Was", "Now"].map(t => h("th", null, t)))),
      h("tbody", null, hist.slice(0, 200).map(x => h("tr", null, h("td", { style: { whiteSpace: "nowrap" } }, fmtDate(x.at)), h("td", null, personName(x.by)), h("td", null, x.sec), h("td", null, IDENTITY_COLS.find(c => c.k === x.field)?.label || x.field), h("td", { class: "muted" }, x.old), h("td", null, x.new)))))) : h("p", { class: "muted small" }, "No changes yet."));
}
