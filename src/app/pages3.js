/* ---------- settings (admin only) ---------- */
async function saveCollection(coll, current, next, guard) {
  const curIds = Object.keys(current);
  const nextIds = next.map(r => r.id);
  for (const id of curIds) if (!nextIds.includes(id)) {
    const why = guard ? guard(id) : null;
    if (why) { toast(why, true); throw { code: "guard", message: why }; }
    await S.db.doc(coll + "/" + id).delete();
  }
  for (const r of next) {
    const { id, by, at, ...body } = r;
    const cur = current[id];
    const merged = { ...body, updatedAt: nowISO(), updatedBy: S.me?.id || null };
    if (cur && JSON.stringify({ ...cur, updatedAt: 0, updatedBy: 0 }) === JSON.stringify({ ...merged, updatedAt: 0, updatedBy: 0 })) continue;
    await S.db.doc(coll + "/" + id).set(merged);
  }
}
function settingsPage() {
  const st = UI.st;
  const tabs = [["users", "users and roles"], ["cohorts", "programmes and cohorts"], ["metrics", "metric set-up"], ["checks", "data checks"], ["import", "import data"], ["records", "organisation records"], ["activity", "activity"]];
  const head = h("div", { class: "ptitle" }, h("h1", null, "settings"), h("p", null, "Set-up that everything else reads from. Only Admins see this page."));
  const bar = h("div", { class: "subtabs", role: "tablist" }, tabs.map(([k, l]) => h("button", { type: "button", role: "tab", "aria-selected": st.tab === k, class: st.tab === k ? "on" : null, onclick: () => { st.tab = k; render(); } }, l[0].toUpperCase() + l.slice(1))));
  const body = { users: setUsers, cohorts: setCohorts, metrics: setMetrics, checks: setChecks, records: setRecords, activity: setActivity, import: () => [setImport(), setImportLog()] }[st.tab]();
  return [head, bar, body];
}
function setUsers() {
  const users = (S.users || []).slice().sort((a, b) => ({ pending: 0, admin: 1, team: 2, viewer: 3 }[a.role] - { pending: 0, admin: 1, team: 2, viewer: 3 }[b.role]) || String(a.name || a.email).localeCompare(String(b.name || b.email)));
  const roles = [["admin", "Admin", "Everything: all pages, every organisation, settings, imports and merging records."],
    ["team", "Program Team", "Overview, Impact and every organisation profile. Can change identity, people, participation status, notes, follow-ups, support and document links. Funding, team, readiness and impact figures stay read-only."],
    ["viewer", "Other Nudge and the^delta users", "Overview and Impact only, with organisation names behind each number. No profiles, contacts or finances."],
    ["pending", "Waiting for access", "Signed in, but sees nothing until an Admin chooses a role."]];
  const change = async (u, role) => {
    try { await S.user.setRole(u.id, role); toast((u.name || u.email) + " is now " + roles.find(r => r[0] === role)[1]); await loadUsers(); }
    catch (e) { toast(e.message || "The role could not be changed.", true); render(); }
  };
  const domains = S.autoDomains || [];
  const editDomains = () => {
    const { node, read } = formFields([{ k: "d", label: "Email domains let in as view-only automatically", type: "list", placeholder: "e.g. thedelta.org, nudge.org", help: "Leave empty to approve everyone by hand." }], { d: domains });
    modal("automatic access", node, { onSave: saveWith(async () => { await S.user.setAutoDomains(read().d.map(x => x.toLowerCase().replace(/^@/, ""))); await loadUsers(); toast("Saved"); }) });
  };
  const pend = users.filter(u => u.role === "pending").length;
  return h("div", null,
    pend ? h("div", { class: "notice" }, h("b", null, pend + " " + (pend === 1 ? "person is" : "people are") + " waiting for access"), "Choose a role for them below.") : null,
    h("div", { class: "panel sec" }, h("div", { class: "panel-h" }, h("h2", null, "people"), h("span", { class: "small muted" }, "Anyone can sign in with their email; they see nothing until you choose their role here. The database enforces each role."),
      h("button", { class: "btn", type: "button", onclick: loadUsers }, "Refresh")),
      users.length ? h("div", { class: "tw" }, h("table", null, h("thead", null, h("tr", null, h("th", null, "Person"), h("th", null, "Email"), h("th", null, "Role"), h("th", null, "Joined"), h("th", null, "Last opened"))),
        h("tbody", null, users.map(u => h("tr", { class: u.role === "pending" ? "warn" : null },
          h("td", null, h("b", null, u.name || "–"), u.id === S.me?.id ? h("span", { class: "sub" }, "you") : null), h("td", { class: "small" }, u.email || ""),
          h("td", null, h("select", { "aria-label": "Role for " + (u.name || u.email), onchange: e => change(u, e.target.value) }, roles.map(([v, l]) => h("option", { value: v, selected: u.role === v }, l)))),
          h("td", { class: "small" }, fmtDate(u.created_at)), h("td", { class: "small" }, u.last_seen ? fmtDate(u.last_seen) + " " + new Date(u.last_seen).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "never")))))) : h("p", { class: "muted small" }, "Loading people…")),
    h("div", { class: "panel sec" }, h("div", { class: "panel-h" }, h("h2", null, "automatic access"), h("button", { class: "btn", type: "button", onclick: editDomains }, "Edit")),
      h("p", { class: "small" }, domains.length ? "People signing in with an email at " + domains.join(", ") + " get view-only access straight away. Everyone else waits for you." : "Nobody gets access automatically. You choose a role for each person.")),
    h("div", { class: "panel sec" }, h("h2", null, "what each role can do"), h("div", { class: "tw" }, h("table", null, h("tbody", null, roles.map(r => h("tr", null, h("td", { style: { width: "220px" } }, h("b", null, r[1])), h("td", { class: "small" }, r[2]))))))));
}
function setCohorts() {
  const progRows = Object.entries(S.programmes).map(([id, p]) => ({ id, ...p })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const cohortRows = Object.entries(S.cohorts).map(([id, c]) => ({ id, ...c })).sort((a, b) => String(a.programmeId).localeCompare(String(b.programmeId)) || String(a.start).localeCompare(String(b.start)));
  const used = cid => liveOrgIds().some(o => (S.orgs[o].parts || []).some(p => p.cohortId === cid));
  const progUsed = pid => Object.values(S.cohorts).some(c => c.programmeId === pid);
  const seed = async () => {
    try { for (const [id, name, kind, order] of DEFAULT_PROGRAMMES) if (!S.programmes[id]) await S.db.doc("programmes/" + id).set({ name, kind, order, updatedAt: nowISO() }); toast("Programmes added"); }
    catch (e) { toast(explainErr(e), true); }
  };
  return h("div", null,
    h("section", { class: "sec" }, h("div", { class: "sec-h" }, h("h2", null, "programmes"), h("p", null, "The kind decides which outcome is shown: grant multiplier for Incubator, increase in funds raised for Accelerator and Pragati AI for Impact.")),
      progRows.length < DEFAULT_PROGRAMMES.length && DEFAULT_PROGRAMMES.some(([id]) => !S.programmes[id]) ? h("div", { class: "notice" }, h("b", null, progRows.length ? "Some of the^delta's programmes are missing" : "No programmes yet"), "Start with the six the^delta runs: Incubator, Accelerator, Meri Mitti, Launchpad, Pragati and AI for Impact. You can rename or add others afterwards. ", h("button", { class: "btn primary", type: "button", onclick: seed, style: { marginLeft: "8px" } }, "Add the six programmes")) : null,
      rowEditor({ title: "programme", rows: progRows, canEdit: true, stamp: false, addLabel: "add programme", onSave: next => saveCollection("programmes", S.programmes, next, id => progUsed(id) ? "This programme still has cohorts. Move or remove them first." : null),
        cols: [{ k: "name", label: "Name", required: true }, { k: "kind", label: "Kind", type: "select", options: [["incubator", "incubator (grant multiplier)"], ["accelerator", "accelerator (increase in funds raised, seed and scale)"], ["pragati", "pragati (increase in funds raised, shown as due until measured)"], ["other", "other"]], required: true }, { k: "order", label: "Order", type: "number", fmt: v => v ?? "" }] })),
    h("section", { class: "sec" }, h("div", { class: "sec-h" }, h("h2", null, "cohorts"), h("p", null, "Other labels lets every name a cohort has gone by in the source sheets match to this one cohort.")),
      rowEditor({ title: "cohort", rows: cohortRows, canEdit: true, stamp: false, addLabel: "add cohort", onSave: next => saveCollection("cohorts", S.cohorts, next, id => used(id) ? "Organisations are still linked to this cohort. Move them first." : null),
        cols: [
          { k: "name", label: "Name", required: true },
          { k: "programmeId", label: "Programme", type: "select", options: () => Object.entries(S.programmes).map(([id, p]) => [id, p.name]), required: true, render: v => S.programmes[v]?.name || "" },
          { k: "track", label: "Track (accelerator)", type: "select", options: [["seed", "seed"], ["scale", "scale"]] },
          { k: "number", label: "Cohort number", type: "number", fmt: v => v ?? "" },
          { k: "start", label: "Starts", type: "date" },
          { k: "end", label: "Ends", type: "date" },
          { k: "year", label: "Cohort year", type: "number", fmt: v => v ?? "", help: "Used by the cohort-year filter. Leave blank to use the start year." },
          { k: "aliases", label: "Other labels", type: "list", placeholder: "e.g. Cohort 9, C9, Inc-9" },
          { k: "funders", label: "Funders", type: "list" },
          { k: "outcomeDue", label: "Outcome measurable from", type: "date", hideInTable: true },
          { k: "satisfaction", label: "Satisfaction score", type: "number", hideInTable: true },
          { k: "notes", label: "Notes", type: "textarea", hideInTable: true }
        ] })));
}
function setMetrics() {
  const cfg = S.config.metrics || { std: DEFAULT_METRICS, defs: {}, defVersions: {}, signoffs: [], changes: [] };
  const app = S.config.app || {};
  const saveStd = async rows => {
    const keys = rows.map(r => r.key);
    if (new Set(keys).size !== keys.length) { toast("Each metric needs its own key.", true); throw { code: "guard" }; }
    const clean = rows.map(({ by, at, id, ...r }) => r);
    await S.db.doc("config/metrics").update({ std: clean, version: (cfg.version || 1) + 1, changes: [...(cfg.changes || []), { at: nowISO(), by: S.me?.id || null, what: "standard metrics changed" }].slice(-200) });
  };
  const editDef = k => {
    const cur = cfg.defs?.[k] || HEADLINE_DEFS[k];
    const { node, read } = formFields([{ k: "text", label: "Definition", type: "textarea" }], { text: cur });
    modal("definition · " + k, h("div", null, h("p", { class: "small muted" }, "Changing the wording records a new version. The calculation itself is fixed in SocEnt 360; ask for a change if the rule needs to change, not just the wording."), node), {
      onSave: saveWith(async () => {
        const text = read().text;
        await S.db.doc("config/metrics").update({ defs: { ...(cfg.defs || {}), [k]: text }, defVersions: { ...(cfg.defVersions || {}), [k]: ((cfg.defVersions || {})[k] || 1) + 1 }, changes: [...(cfg.changes || []), { at: nowISO(), by: S.me?.id || null, what: "definition of " + k + " changed" }].slice(-200) });
        toast("Definition saved");
      })
    });
  };
  const signoff = () => {
    const F = buildFacts();
    const R = headline(F.parts, F.orgs, F);
    const keep = ["participations", "unique", "founders", "womenFounders", "womenLed", "womenLedPct", "operating", "operatingPct", "shutdown", "forprofit", "grants", "multiplier", "multiplierN", "increase", "increaseN", "raised", "employees", "firstSupported"];
    const figures = Object.fromEntries(keep.map(k => [k, R[k] ?? null]));
    const { node, read } = formFields([{ k: "label", label: "What is being signed off", required: true }, { k: "who", label: "Signed off by", required: true }, { k: "note", label: "Notes", type: "textarea" }], { label: "Gate 1 · portfolio headline numbers" });
    modal("record a sign-off", h("div", null, h("p", { class: "small muted" }, "This keeps a copy of today's portfolio headline numbers, so later changes can be compared with what was approved."), node), {
      saveLabel: "record sign-off",
      onSave: saveWith(async () => {
        const r = read(); if (!r.label || !r.who) { toast("Fill in what is signed off and by whom.", true); return false; }
        await S.db.doc("config/metrics").update({ signoffs: [...(cfg.signoffs || []), { ...r, at: nowISO(), by: S.me?.id || null, figures }].slice(-50) });
        toast("Sign-off recorded");
      })
    });
  };
  const F = buildFacts(); const now = headline(F.parts, F.orgs, F);
  const fmtK = (k, v) => !isNum(v) ? "–" : /Pct|womenFounders|operatingPct|increase$/.test(k) ? fmtPct(v) : k === "grants" || k === "raised" ? fmtINR(v) : k === "multiplier" ? fmtX(v) : fmtN(v);
  const editApp = () => {
    const { node, read } = formFields([{ k: "brightSparkDef", label: "How a Bright Spark is defined", type: "textarea" }], app);
    modal("bright spark definition", node, { onSave: saveWith(async () => { await S.db.doc("config/app").update(read()); toast("Saved"); }) });
  };
  return h("div", null,
    h("section", { class: "sec" }, h("div", { class: "sec-h" }, h("h2", null, "headline definitions"), h("p", null, "The definition in use for each number on Overview and Impact. Everyone sees these in the lists behind each number.")),
      h("div", { class: "tw" }, h("table", null, h("thead", null, h("tr", null, h("th", null, "number"), h("th", null, "definition"), h("th", { class: "r" }, "version"), h("th", null, ""))),
        h("tbody", null, Object.keys(HEADLINE_DEFS).map(k => h("tr", null, h("td", null, h("b", null, k)), h("td", { class: "small" }, cfg.defs?.[k] || HEADLINE_DEFS[k]), h("td", { class: "r num" }, "v" + ((cfg.defVersions || {})[k] || 1)), h("td", null, h("button", { class: "btn ghost", type: "button", onclick: () => editDef(k) }, "edit")))),
          h("tr", null, h("td", null, h("b", null, "brightSpark")), h("td", { class: "small" }, app.brightSparkDef || h("span", { class: "muted" }, "not yet defined")), h("td", null, ""), h("td", null, h("button", { class: "btn ghost", type: "button", onclick: editApp }, "edit"))))))),
    h("section", { class: "sec" }, h("div", { class: "sec-h" }, h("h2", null, "standard impact metrics"), h("p", null, "The impact cards. A metric with a parent is a group within it (for example, women within people reached) and is flagged if it is ever larger.")),
      rowEditor({ title: "standard metric", rows: (cfg.std || DEFAULT_METRICS).map(m => ({ ...m, id: m.key })), canEdit: true, stamp: false, addLabel: "add metric", onSave: saveStd,
        cols: [{ k: "key", label: "Key (no spaces; don't change once data uses it)", required: true }, { k: "label", label: "Label", required: true }, { k: "desc", label: "One-line description", wide: true }, { k: "unit", label: "Unit" }, { k: "parent", label: "Group within", type: "select", options: () => (cfg.std || DEFAULT_METRICS).map(m => [m.key, m.label]) }] }),
      h("p", { class: "tiny muted" }, "Metric set-up version " + (cfg.version || 1) + ".")),
    h("section", { class: "sec" }, h("div", { class: "sec-h" }, h("h2", null, "sign-offs"), h("p", null, "Record when leadership approves the headline numbers, for example at Gate 1."), h("span", { class: "spacer" }), h("button", { class: "btn primary", type: "button", onclick: signoff }, "record a sign-off")),
      (cfg.signoffs || []).length ? h("div", { class: "tw" }, h("table", null, h("thead", null, h("tr", null, h("th", null, "signed off"), h("th", null, "number"), h("th", { class: "r" }, "then"), h("th", { class: "r" }, "now"))),
        h("tbody", null, (cfg.signoffs || []).slice().reverse().flatMap(s0 => Object.entries(s0.figures || {}).map(([k, v], i) => h("tr", null, h("td", { class: "small" }, i === 0 ? [h("b", null, s0.label), h("span", { class: "sub" }, s0.who + " · " + fmtDate(s0.at))] : ""), h("td", null, k), h("td", { class: "r num" }, fmtK(k, v)), h("td", { class: "r num" + (JSON.stringify(v) !== JSON.stringify(now[k] ?? null) ? " em" : "") }, fmtK(k, now[k])))))))) : h("p", { class: "muted small" }, "No sign-offs recorded yet.")));
}
function setChecks() {
  const rules = { ...DEFAULT_CHECKS, ...(S.config.checks?.rules || {}) };
  const flags = runChecks();
  const by = {}; for (const f of flags) (by[f.key] = by[f.key] || []).push(f);
  const edit = () => {
    const cols = Object.entries(rules).flatMap(([k, r]) => [{ k: k + ".on", label: r.label, type: "bool", wide: r.threshold == null }, r.threshold != null ? { k: k + ".threshold", label: "Threshold", type: "number" } : null]).filter(Boolean);
    const row = {}; for (const [k, r] of Object.entries(rules)) { row[k + ".on"] = r.on; if (r.threshold != null) row[k + ".threshold"] = r.threshold; }
    const { node, read } = formFields(cols, row);
    modal("data checks", node, {
      onSave: saveWith(async () => {
        const r = read(); const next = clone(rules);
        for (const k in next) { next[k].on = r[k + ".on"]; if (next[k].threshold != null && r[k + ".threshold"] !== "") next[k].threshold = r[k + ".threshold"]; }
        await S.db.doc("config/checks").set({ rules: next, updatedAt: nowISO(), updatedBy: S.me?.id || null });
        toast("Checks saved");
      })
    });
  };
  return h("div", null,
    h("section", { class: "sec" }, h("div", { class: "sec-h" }, h("h2", null, "checks applied to the data"), h("span", { class: "spacer" }), h("button", { class: "btn", type: "button", onclick: edit }, "edit checks")),
      h("div", { class: "tw" }, h("table", null, h("thead", null, h("tr", null, h("th", null, "check"), h("th", { class: "r" }, "threshold"), h("th", null, "on"), h("th", { class: "r" }, "open flags"))),
        h("tbody", null, Object.entries(rules).map(([k, r]) => h("tr", null, h("td", null, r.label), h("td", { class: "r num" }, r.threshold != null ? (k === "bigGrant" ? fmtINR(r.threshold) : fmtN(r.threshold)) : ""), h("td", null, r.on ? "yes" : "no"), h("td", { class: "r num" }, (by[k] || []).length))))))),
    h("section", { class: "sec" }, h("div", { class: "sec-h" }, h("h2", null, "open flags"), h("p", null, flags.length + " across " + uniq(flags.map(f => f.id)).length + " organisations. Open a profile to mark a flag as checked.")),
      flags.length ? h("div", { class: "tw", style: { maxHeight: "520px", overflow: "auto" } }, h("table", null, h("thead", null, h("tr", null, h("th", null, "organisation"), h("th", null, "check"), h("th", null, "detail"))),
        h("tbody", null, flags.slice(0, 500).map(f => h("tr", null, h("td", null, h("a", { class: "oname", href: "#org-" + f.id, onclick: () => { UI.ol.openSec = "sources"; } }, orgView(f.id).name)), h("td", null, f.label), h("td", { class: "small muted" }, f.msg))))))
        : h("p", { class: "muted small" }, "No open flags.")));
}
function setRecords() {
  const ids = liveOrgIds();
  const opts = ids.map(id => [id, orgView(id).name]).sort((a, b) => a[1].localeCompare(b[1]));
  const merge = () => {
    const cols = [{ k: "keep", label: "Keep this record", type: "select", options: opts, required: true }, { k: "drop", label: "Merge this one into it", type: "select", options: opts, required: true }];
    const { node, read } = formFields(cols, {});
    modal("merge two records", h("div", null, h("p", { class: "small muted" }, "Everything from the second record moves to the first. The second record's name becomes a former name, and its old link points to the kept record. This can't be undone from here, so export a backup first if unsure."), node), {
      saveLabel: "merge records", danger: true,
      onSave: saveWith(async () => {
        const r = read();
        if (!r.keep || !r.drop || r.keep === r.drop) { toast("Choose two different organisations.", true); return false; }
        if (!confirm("Merge " + orgView(r.drop).name + " into " + orgView(r.keep).name + "?")) return false;
        await mergeOrgs(r.keep, r.drop);
        toast("Merged");
      })
    });
  };
  const merged = Object.keys(S.orgs).filter(id => S.orgs[id].mergedInto);
  return h("div", null,
    h("section", { class: "sec" }, h("div", { class: "sec-h" }, h("h2", null, "organisation records"), h("p", null, ids.length + " organisations" + (merged.length ? " · " + merged.length + " merged records kept for their history" : "") + ".")),
      h("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" } },
        h("button", { class: "btn primary", type: "button", onclick: addOrgDialog }, "add organisation"),
        h("button", { class: "btn", type: "button", onclick: merge, disabled: ids.length < 2 }, "merge two records"),
        h("button", { class: "btn", type: "button", onclick: exportJSON }, "export full backup (JSON)"))),
    h("section", { class: "sec" }, h("div", { class: "sec-h" }, h("h2", null, "loading data")),
      h("p", { class: "small", style: { maxWidth: "70ch" } }, "Load the existing sources with Settings › Import data. Every organisation is matched to one record (including former names and abbreviations), cohort labels and amounts are standardised, and every value keeps its source and date. Where sources disagree, the more recent value is shown and the other is kept in the history."),
      h("button", { class: "btn primary", type: "button", onclick: () => { UI.st.tab = "import"; render(); } }, "Open import data")));
}
function setActivity() {
  const all = [];
  for (const id of Object.keys(S.orgs)) for (const x of (S.orgs[id].history || [])) all.push({ ...x, id });
  for (const id of Object.keys(S.edits)) for (const x of (S.edits[id].history || [])) all.push({ ...x, id });
  for (const x of (S.config.metrics?.changes || [])) all.push({ at: x.at, by: x.by, sec: "settings", field: x.what, old: "", new: "" });
  all.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const rows = all.slice(0, 300);
  resolveNames(rows.map(r => r.by));
  return h("section", { class: "sec" }, h("div", { class: "sec-h" }, h("h2", null, "recent changes"), h("p", null, "The latest " + rows.length + " changes across every organisation and setting.")),
    rows.length ? h("div", { class: "tw" }, h("table", { class: "hist" }, h("thead", null, h("tr", null, ["when", "who", "organisation", "section", "what", "now"].map(t => h("th", null, t)))),
      h("tbody", null, rows.map(x => h("tr", null, h("td", { style: { whiteSpace: "nowrap" } }, fmtDate(x.at)), h("td", null, personName(x.by)), h("td", null, x.id ? h("a", { href: "#org-" + x.id }, orgView(x.id).name) : "–"), h("td", null, x.sec), h("td", null, IDENTITY_COLS.find(c => c.k === x.field)?.label || x.field), h("td", { class: "muted" }, x.new)))))) : h("p", { class: "muted small" }, "No changes yet."));
}

/* ---------- start ---------- */
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
