/* ---------- toast, modal, drawer ---------- */
let toastT = null;
function toast(msg, err) {
  document.querySelectorAll(".toast").forEach(x => x.remove());
  const t = h("div", { class: "toast" + (err ? " err" : ""), role: "status" }, msg);
  document.body.appendChild(t);
  clearTimeout(toastT); toastT = setTimeout(() => t.remove(), err ? 7000 : 3200);
}
function endEditing() {
  UI.editing = Math.max(0, UI.editing - 1);
  if (!UI.editing && UI.pendingRender) { UI.pendingRender = false; render(); if (S.role !== "viewer" && S.ready) schedulePublish(); }
}
function modal(title, body, { onSave, saveLabel = "save changes", danger, extra } = {}) {
  UI.editing++;
  let closed = false;
  const close = () => { if (closed) return; closed = true; wrap.remove(); document.removeEventListener("keydown", esc); endEditing(); };
  const esc = e => { if (e.key === "Escape") close(); };
  const saveBtn = onSave ? h("button", { class: "btn primary", type: "button" }, saveLabel) : null;
  if (saveBtn) saveBtn.addEventListener("click", async () => {
    saveBtn.disabled = true;
    try { const r = await onSave(); if (r !== false) close(); else saveBtn.disabled = false; }
    catch (e) { console.warn(e); toast(explainErr(e), true); saveBtn.disabled = false; }
  });
  const box = h("div", { class: "modal", role: "dialog", "aria-modal": "true", "aria-label": title },
    h("h2", null, title), body,
    h("div", { class: "actions" }, extra, h("span", { class: "spacer" }), h("button", { class: "btn", type: "button", onclick: close }, onSave ? "cancel" : "close"), saveBtn));
  if (danger) box.style.borderTopColor = "var(--ink)";
  const wrap = h("div", { class: "modal-wrap", onclick: e => { if (e.target === wrap) close(); } }, box);
  document.body.appendChild(wrap);
  document.addEventListener("keydown", esc);
  setTimeout(() => { const f = box.querySelector("input,select,textarea"); if (f) f.focus(); }, 30);
  return close;
}
function drawer(title, sub, content) {
  const close = () => { wrap.remove(); document.removeEventListener("keydown", esc); };
  const esc = e => { if (e.key === "Escape") close(); };
  const wrap = h("div", { class: "scrim", onclick: e => { if (e.target === wrap) close(); } },
    h("aside", { class: "drawer", role: "dialog", "aria-modal": "true", "aria-label": title },
      h("div", { class: "drawer-h" }, h("div", { style: { flex: 1 } }, h("h2", { class: "nc" }, title), sub ? h("div", { class: "small muted" }, sub) : null),
        h("button", { class: "btn", type: "button", onclick: close }, "close")),
      content));
  document.body.appendChild(wrap);
  document.addEventListener("keydown", esc);
  setTimeout(() => wrap.querySelector(".drawer button")?.focus(), 30);
  return close;
}

/* click-through list of organisations behind a number */
function orgListDrawer(title, rows, opts = {}) {
  // rows: [{o, n, v?, sub?}]
  const staff = S.role !== "viewer";
  const sorted = rows.slice().sort((a, b) => (isNum(b.sortV) ? b.sortV : -Infinity) - (isNum(a.sortV) ? a.sortV : -Infinity) || String(a.n).localeCompare(String(b.n)));
  const body = rows.length ? h("div", { class: "tw" }, h("table", null,
    h("thead", null, h("tr", null, h("th", null, "organisation"), opts.valueLabel ? h("th", { class: "r" }, opts.valueLabel) : null, opts.subLabel ? h("th", null, opts.subLabel) : null)),
    h("tbody", null, sorted.map(r => h("tr", null,
      h("td", null, staff ? h("a", { href: "#org-" + r.o, class: "oname", onclick: () => document.querySelector(".scrim")?.remove() }, r.n) : h("span", { class: "oname" }, r.n)),
      opts.valueLabel ? h("td", { class: "r num" }, r.v ?? "–") : null,
      opts.subLabel ? h("td", { class: "small muted" }, r.sub ?? "") : null)))))
    : h("p", { class: "muted" }, "No organisations match this number with the current view and filters.");
  drawer(title, (rows.length + " organisation" + (rows.length === 1 ? "" : "s")) + (opts.note ? " · " + opts.note : ""), [
    opts.def ? h("p", { class: "small muted", style: { marginTop: 0 } }, opts.def) : null,
    body,
    opts.exportable !== false && rows.length ? h("div", { class: "actions" }, h("button", { class: "btn", type: "button", onclick: () => exportCSV(title, ["organisation", opts.valueLabel || "", opts.subLabel || ""], sorted.map(r => [r.n, r.v ?? "", r.sub ?? ""]), opts.context) }, "export list")) : null
  ]);
}

/* ---------- generic form + row editor ---------- */
function input(col, value) {
  const t = col.type || "text";
  let el;
  if (t === "select") {
    el = h("select", null, h("option", { value: "" }, col.placeholder || "–"), (typeof col.options === "function" ? col.options() : col.options).map(o => {
      const [v, l] = Array.isArray(o) ? o : [o, o];
      return h("option", { value: v, selected: String(value ?? "") === String(v) }, l);
    }));
  } else if (t === "bool") {
    el = h("input", { type: "checkbox" }); el.checked = value === true;
  } else if (t === "tri") {
    el = h("select", null, h("option", { value: "" }, "not recorded"), h("option", { value: "yes", selected: value === true }, "yes"), h("option", { value: "no", selected: value === false }, "no"));
  } else if (t === "textarea") {
    el = h("textarea", null); el.value = value ?? "";
  } else if (t === "list") {
    el = h("input", { type: "text", placeholder: col.placeholder || "separate with commas" }); el.value = (value || []).join(", ");
  } else {
    el = h("input", { type: t === "number" ? "number" : t === "date" ? "date" : t === "url" ? "url" : t === "email" ? "email" : "text", step: t === "number" ? "any" : null, placeholder: col.placeholder || null });
    el.value = value ?? "";
  }
  el.dataset.k = col.k;
  return el;
}
function readInput(col, el) {
  const t = col.type || "text";
  if (t === "bool") return el.checked;
  if (t === "tri") return el.value === "yes" ? true : el.value === "no" ? false : null;
  if (t === "number") return el.value === "" ? "" : +el.value;
  if (t === "list") return el.value.split(",").map(x => x.trim()).filter(Boolean);
  return el.value.trim();
}
function formFields(cols, row) {
  const els = {};
  const node = h("div", { class: "form" }, cols.filter(c => !c.hideInForm).map(c => {
    const el = input(c, c.get ? c.get(row) : row?.[c.k]);
    els[c.k] = el;
    if (c.type === "bool") return h("label", { class: "chk" + (c.wide ? " wide" : "") }, el, c.label);
    return h("label", { class: c.wide || c.type === "textarea" ? "wide" : null }, c.label, el, c.help ? h("span", { class: "tiny muted", style: { fontWeight: 400 } }, c.help) : null);
  }));
  const read = base => {
    const out = { ...(base || {}) };
    for (const c of cols) if (els[c.k]) { const v = readInput(c, els[c.k]); if (c.set) c.set(out, v); else out[c.k] = v; }
    return out;
  };
  return { node, read, els };
}
/* rowEditor: a table of records with add / edit / remove */
function rowEditor({ cols, rows, canEdit, onSave, title, empty, addLabel = "add", stamp = true, show, rowClass }) {
  rows = rows || [];
  const visible = cols.filter(c => !c.hideInTable);
  const openForm = (idx) => {
    const isNew = idx == null;
    const row = isNew ? {} : rows[idx];
    const { node, read } = formFields(cols, row);
    modal((isNew ? addLabel : "edit") + " · " + title, node, {
      onSave: async () => {
        const r = read(row);
        if (stamp) { r.by = S.me?.id || null; r.at = nowISO(); }
        if (isNew && !r.id) r.id = uid();
        for (const c of cols) if (c.required && (r[c.k] === "" || r[c.k] == null)) { toast(c.label + " is needed.", true); return false; }
        const next = rows.slice();
        if (isNew) next.push(r); else next[idx] = r;
        await onSave(next);
        toast(isNew ? "Added" : "Saved");
      },
      extra: !isNew ? h("button", {
        class: "btn ghost", type: "button", onclick: async ev => {
          if (!confirm("Remove this entry? It stays in the update history.")) return;
          try { await onSave(rows.filter((_, i) => i !== idx)); toast("Removed"); ev.target.closest(".modal-wrap").querySelector(".actions .btn:not(.primary):not(.ghost)").click(); }
          catch (e) { toast(explainErr(e), true); }
        }
      }, "remove") : null
    });
  };
  const table = rows.length ? h("div", { class: "tw" }, h("table", null,
    h("thead", null, h("tr", null, visible.map(c => h("th", { class: c.type === "number" ? "r" : null }, c.label)), canEdit ? h("th", null, "") : null)),
    h("tbody", null, rows.map((r, i) => {
      if (show && !show(r)) return null;
      return h("tr", { class: rowClass ? rowClass(r) : null }, visible.map(c => {
        const v = c.get ? c.get(r) : r[c.k];
        return h("td", { class: c.type === "number" ? "r num" : null }, c.render ? c.render(v, r) : c.type === "bool" ? (v === true ? "yes" : v === false ? "no" : "–") : c.type === "tri" ? (v === true ? "yes" : v === false ? "no" : "–") : c.type === "number" ? (c.fmt ? c.fmt(v) : fmtN(v, 2)) : c.type === "url" ? (v ? h("a", { href: v, target: "_blank", rel: "noopener" }, c.linkText || "open") : "") : c.type === "list" ? (v || []).join(", ") : c.type === "date" ? fmtDate(v) : (v ?? ""));
      }), canEdit ? h("td", { class: "r" }, h("button", { class: "btn ghost", type: "button", onclick: () => openForm(i) }, "edit")) : null);
    }))))
    : h("p", { class: "muted small" }, empty || "Nothing recorded yet.");
  return h("div", null, table, canEdit ? h("div", { style: { marginTop: "8px" } }, h("button", { class: "btn", type: "button", onclick: () => openForm(null) }, "+ " + addLabel)) : null);
}

/* ---------- charts (inline SVG) ---------- */
const W = 640;
function noData(msg) { return h("div", { class: "empty-chart" }, msg || "Not enough data to draw this yet."); }
/* vertical bars with an optional reference line */
function barChart({ cats, ref, refLabel, fmt = v => fmtN(v, 1), height = 230, onClick, color = "var(--red)" }) {
  const vals = cats.map(c => c.value).filter(isNum);
  if (!vals.length) return noData();
  const H = height, pl = 44, pr = 12, pt = 16, pb = 52;
  const max = Math.max(...vals, isNum(ref) ? ref : 0) * 1.12 || 1;
  const iw = W - pl - pr, ih = H - pt - pb;
  const bw = Math.min(46, iw / cats.length * 0.62);
  const y = v => pt + ih - (v / max) * ih;
  const g = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart", role: "img", "aria-label": cats.map(c => c.label + " " + fmt(c.value)).join(", ") });
  for (let i = 0; i <= 4; i++) {
    const v = max / 4 * i;
    g.appendChild(s("line", { x1: pl, x2: W - pr, y1: y(v), y2: y(v), class: "ax", "stroke-opacity": i ? .35 : 1 }));
    g.appendChild(s("text", { x: pl - 6, y: y(v) + 4, "text-anchor": "end" }, fmt(v)));
  }
  cats.forEach((c, i) => {
    const cx = pl + iw / cats.length * (i + .5);
    if (isNum(c.value)) {
      const r = s("rect", { x: cx - bw / 2, y: y(c.value), width: bw, height: Math.max(1, pt + ih - y(c.value)), fill: c.color || color, style: onClick ? "cursor:pointer" : null });
      r.appendChild(s("title", null, c.label + ": " + fmt(c.value) + (c.note ? " · " + c.note : "")));
      if (onClick) r.addEventListener("click", () => onClick(c));
      g.appendChild(r);
      g.appendChild(s("text", { x: cx, y: y(c.value) - 4, "text-anchor": "middle", style: "fill:var(--ink);font-weight:700" }, fmt(c.value)));
    } else {
      g.appendChild(s("text", { x: cx, y: pt + ih - 4, "text-anchor": "middle" }, "–"));
    }
    const lab = c.label.length > 14 ? c.label.slice(0, 13) + "…" : c.label;
    g.appendChild(s("text", { x: cx, y: H - pb + 16, "text-anchor": "middle" }, lab));
    if (c.sub) g.appendChild(s("text", { x: cx, y: H - pb + 30, "text-anchor": "middle" }, c.sub));
  });
  if (isNum(ref)) g.appendChild(s("line", { x1: pl, x2: W - pr, y1: y(ref), y2: y(ref), class: "ref" }));
  return isNum(ref) ? h("div", null, g, h("div", { class: "legend" }, h("span", null, h("i", { style: { background: "none", borderTop: "2px dashed var(--ink)", height: "0", width: "16px" } }), (refLabel || "portfolio") + ": " + fmt(ref)))) : g;
}
/* dot plot: one column per category, several series as dots */
function dotChart({ cats, series, ref, refLabel, fmt = v => fmtN(v, 1), height = 230 }) {
  const vals = cats.flatMap(c => series.map(se => c.values[se.key])).filter(isNum);
  if (!vals.length) return noData();
  const H = height, pl = 48, pr = 12, pt = 16, pb = 44;
  const lo = Math.min(0, ...vals), hi = Math.max(...vals, isNum(ref) ? ref : 0);
  const span = (hi - lo) * 1.15 || 1;
  const iw = W - pl - pr, ih = H - pt - pb;
  const y = v => pt + ih - ((v - lo) / span) * ih;
  const g = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart", role: "img" });
  for (let i = 0; i <= 4; i++) {
    const v = lo + span / 4 * i;
    g.appendChild(s("line", { x1: pl, x2: W - pr, y1: y(v), y2: y(v), class: "ax", "stroke-opacity": i ? .35 : 1 }));
    g.appendChild(s("text", { x: pl - 6, y: y(v) + 4, "text-anchor": "end" }, fmt(v)));
  }
  cats.forEach((c, i) => {
    const cx = pl + iw / cats.length * (i + .5);
    series.forEach((se, j) => {
      const v = c.values[se.key]; if (!isNum(v)) return;
      const x = cx + (j - (series.length - 1) / 2) * 12;
      const shape = se.shape === "square" ? s("rect", { x: x - 6, y: y(v) - 6, width: 12, height: 12, fill: se.color }) : s("polygon", { points: `${x},${y(v) - 7} ${x + 7},${y(v) + 6} ${x - 7},${y(v) + 6}`, fill: se.color });
      shape.appendChild(s("title", null, c.label + " · " + se.name + ": " + fmt(v)));
      g.appendChild(shape);
    });
    const lab = c.label.length > 14 ? c.label.slice(0, 13) + "…" : c.label;
    g.appendChild(s("text", { x: cx, y: H - pb + 18, "text-anchor": "middle" }, lab));
  });
  if (isNum(ref)) g.appendChild(s("line", { x1: pl, x2: W - pr, y1: y(ref), y2: y(ref), class: "ref" }));
  return h("div", null, g, h("div", { class: "legend" }, isNum(ref) ? h("span", null, h("i", { style: { background: "none", borderTop: "2px dashed var(--ink)", height: "0", width: "16px" } }), (refLabel || "portfolio") + ": " + fmt(ref)) : null, series.map(se => h("span", null, h("i", { style: { background: se.color, clipPath: se.shape === "square" ? null : "polygon(50% 0,100% 100%,0 100%)" } }), se.name))));
}
/* 100% split bars: share of a part in each category */
function splitBars({ cats, fmtPart = v => fmtPct(v), partLabel, restLabel, onClick }) {
  if (!cats.some(c => c.total > 0)) return noData();
  const H = Math.max(120, cats.length * 26 + 40), pl = 130, pr = 50, pt = 8;
  const iw = W - pl - pr;
  const g = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart", role: "img" });
  cats.forEach((c, i) => {
    const y = pt + i * 26;
    const share = c.total ? c.part / c.total : 0;
    g.appendChild(s("text", { x: pl - 8, y: y + 14, "text-anchor": "end" }, c.label.length > 20 ? c.label.slice(0, 19) + "…" : c.label));
    const bg = s("rect", { x: pl, y, width: iw, height: 18, fill: "var(--chart-3)" });
    const fg = s("rect", { x: pl, y, width: iw * share, height: 18, fill: "var(--red)", style: onClick ? "cursor:pointer" : null });
    fg.appendChild(s("title", null, c.label + ": " + c.part + " of " + c.total));
    if (onClick) fg.addEventListener("click", () => onClick(c));
    g.appendChild(bg); g.appendChild(fg);
    g.appendChild(s("text", { x: W - pr + 6, y: y + 14, style: "fill:var(--ink);font-weight:700" }, c.total ? fmtPart(share) : "–"));
  });
  return h("div", null, g, h("div", { class: "legend" }, h("span", null, h("i", { style: { background: "var(--red)" } }), partLabel), h("span", null, h("i", { style: { background: "var(--chart-3)" } }), restLabel)));
}
/* line chart by financial year */
function lineChart({ xs, series, fmt = v => fmtN(v), height = 220, labels = true }) {
  const vals = series.flatMap(se => se.values).filter(isNum);
  if (xs.length < 1 || !vals.length) return noData("No yearly figures yet for this measure.");
  const H = height, pl = 64, pr = 34, pt = 24, pb = 34;
  const max = Math.max(...vals) * 1.12 || 1;
  const iw = W - pl - pr, ih = H - pt - pb;
  const x = i => pl + (xs.length === 1 ? iw / 2 : iw * i / (xs.length - 1));
  const y = v => pt + ih - (v / max) * ih;
  const g = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart", role: "img" });
  for (let i = 0; i <= 4; i++) {
    const v = max / 4 * i;
    g.appendChild(s("line", { x1: pl, x2: W - pr, y1: y(v), y2: y(v), class: "ax", "stroke-opacity": i ? .35 : 1 }));
    g.appendChild(s("text", { x: pl - 6, y: y(v) + 4, "text-anchor": "end" }, fmt(v)));
  }
  const step = Math.ceil(xs.length / 10);
  xs.forEach((l, i) => { if (i % step === 0 || i === xs.length - 1) g.appendChild(s("text", { x: x(i), y: H - 12, "text-anchor": "middle" }, l)); });
  for (const se of series) {
    const pts = se.values.map((v, i) => isNum(v) ? [x(i), y(v)] : null).filter(Boolean);
    if (pts.length > 1) g.appendChild(s("polyline", { points: pts.map(p => p.join(",")).join(" "), fill: "none", stroke: se.color, "stroke-width": 2.5 }));
    se.values.forEach((v, i) => {
      if (!isNum(v)) return;
      const r = s("rect", { x: x(i) - 4, y: y(v) - 4, width: 8, height: 8, fill: se.color });
      r.appendChild(s("title", null, xs[i] + " · " + se.name + ": " + fmt(v)));
      g.appendChild(r);
      if (labels && xs.length <= 10 && series.length <= 2) g.appendChild(s("text", { x: x(i), y: y(v) - 9, "text-anchor": "middle", style: "fill:var(--ink);font-weight:700" }, fmt(v)));
    });
  }
  return h("div", null, g, series.length > 1 ? h("div", { class: "legend" }, series.map(se => h("span", null, h("i", { style: { background: se.color } }), se.name))) : null);
}
/* horizontal bars (HTML) with clickable labels */
function hBars(items, { fmt = v => fmtN(v), grey, onClick, track, max: maxIn } = {}) {
  const max = maxIn || Math.max(0, ...items.map(i => i.value).filter(isNum));
  if (!items.length || !max) return noData();
  return h("div", { class: "bars-h" }, items.map(it => h("div", { class: "bh" },
    onClick && !it.noClick ? h("button", { type: "button", onclick: () => onClick(it), title: it.label }, it.label) : h("span", { class: it.light ? "" : "lab" }, it.label),
    h("div", { class: "tr" + (track ? " track" : "") }, h("div", { class: "fl" + (it.light ? " l" : grey ? " g" : ""), style: { width: (isNum(it.value) ? Math.min(100, it.value / max * 100) : 0) + "%" } })),
    h("span", { class: "r" }, fmt(it.value), it.sub ? h("span", { class: "tiny muted", style: { fontWeight: 400 } }, " " + it.sub) : null))));
}
/* grouped bars by period, several series side by side */
function groupBars({ xs, series, fmt = v => fmtN(v), height = 240 }) {
  const vals = series.flatMap(se => se.values).filter(isNum);
  if (!xs.length || !vals.length) return noData("No dated figures yet.");
  const H = height, pl = 60, pr = 12, pt = 20, pb = 30;
  const max = Math.max(...vals) * 1.15 || 1;
  const iw = W - pl - pr, ih = H - pt - pb;
  const y = v => pt + ih - (v / max) * ih;
  const g = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart", role: "img" });
  for (let i = 0; i <= 4; i++) { const v = max / 4 * i; g.appendChild(s("line", { x1: pl, x2: W - pr, y1: y(v), y2: y(v), class: "ax", "stroke-opacity": i ? .35 : 1 })); g.appendChild(s("text", { x: pl - 6, y: y(v) + 4, "text-anchor": "end" }, fmt(v))); }
  const gw = iw / xs.length, bw = Math.min(26, gw * .7 / series.length);
  xs.forEach((x, i) => {
    const cx = pl + gw * (i + .5);
    series.forEach((se, j) => {
      const v = se.values[i]; if (!isNum(v) || v <= 0) return;
      const bx = cx + (j - series.length / 2) * bw;
      const r = s("rect", { x: bx, y: y(v), width: bw - 2, height: pt + ih - y(v), fill: se.color });
      r.appendChild(s("title", null, x + " · " + se.name + ": " + fmt(v)));
      g.appendChild(r);
    });
    g.appendChild(s("text", { x: cx, y: H - 10, "text-anchor": "middle" }, x));
  });
  return h("div", null, g, h("div", { class: "legend" }, series.map(se => h("span", null, h("i", { style: { background: se.color } }), se.name))));
}
/* India tile map: one square per state, shaded by value */
function tileMap(values, { fmt = v => fmtN(v), onClick, label = "organisations" } = {}) {
  const max = Math.max(0, ...Object.values(values).filter(isNum));
  const cols = 8, rows = 7;
  const grid = h("div", { class: "tiles", style: { gridTemplateColumns: `repeat(${cols},1fr)` } });
  const cells = {};
  for (const [c, n, x, y] of STATES) cells[x + "," + y] = [c, n];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const cell = cells[x + "," + y];
    if (!cell) { grid.appendChild(h("div", null)); continue; }
    const [c, n] = cell, v = values[c];
    const has = isNum(v) && v > 0;
    const t = has ? Math.max(.18, v / max) : 0;
    const bg = has ? `color-mix(in srgb, var(--red) ${Math.round(t * 100)}%, var(--surface))` : null;
    const el = h(has ? "button" : "div", { class: "tile" + (has ? " has" + (t < .45 ? " lite" : "") : ""), type: has ? "button" : null, title: n + (has ? ": " + fmt(v) + " " + label : ": none"), style: bg ? { background: bg } : null, onclick: has && onClick ? () => onClick(c) : null },
      c, has ? h("span", null, fmt(v)) : null);
    grid.appendChild(el);
  }
  return h("div", null, grid, h("div", { class: "legend" }, h("span", null, "Each square is a state or union territory, placed roughly where it sits. Darker means more ", label, ".")));
}
const caretSVG = (fill = "var(--red)") => { const g = s("svg", { viewBox: "0 0 90 63", "aria-hidden": "true" }); g.appendChild(s("polygon", { points: "30,0 60,0 90,63 69,63 45,22 21,63 0,63", fill })); return g; };
const chev = () => { const g = s("svg", { viewBox: "0 0 10 10", width: 10, height: 10, "aria-hidden": "true" }); g.appendChild(s("polygon", { points: "2,0 9,5 2,10", fill: "currentColor" })); return g; };
function wedge() {
  const g = s("svg", { viewBox: "0 0 220 100", preserveAspectRatio: "none", class: "wedge", "aria-hidden": "true" });
  g.appendChild(s("polygon", { points: "220,0 220,100 120,100", fill: "var(--red)", opacity: ".9" }));
  g.appendChild(s("polygon", { points: "150,0 220,0 220,46", fill: "var(--line-2)", opacity: ".6" }));
  return g;
}
