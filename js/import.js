// Prototype P4: import a scheme of work into a class's lessons.
//
// Paste a table from Word, Excel, Google Sheets or Google Docs, upload a
// .csv or saved web page, or fetch a web page. Three shapes are understood:
//   - one row per lesson (title, plan, links, homework, unit columns)
//   - a delivery calendar: one row per week, lessons across the columns
//   - a curriculum document with a numbered list of lessons under each unit
// Rows (or cells) go into the class's lessons Rows go into the class's lessons in timetable order from a start
// from a start date. Weekends, holidays, disrupted days and lessons already pushed on are
// skipped. You see a preview first, and every import can be undone later from
// the same page, on any device.

const ROLES = [
  ["title", "Lesson title"],
  ["plan", "Plan (add to the plan text)"],
  ["links", "Links / resources"],
  ["homework", "Homework"],
  ["unit", "Unit"],
  ["skip", "Don't import"],
];
const WEEK_ROLES = [
  ["lesson", "Lessons (one per cell)"],
  ["unit", "Unit"],
  ["skip", "Don't import"],
];

// What the import page is working on. Kept in memory until it's applied.
let sow = null;
const blankSow = (cls) => ({ cls, rows: [], head: -1, layout: "row", roles: [], start: "", mode: "fill", per: 1, hwGap: 1, off: new Set(), source: "", alts: null, using: "" });

// ---------- reading tables ----------
const URL_RE = /\bhttps?:\/\/[^\s<>"')\]]+|\b(?:docs|drive|classroom)\.google\.com\/[^\s<>"')\]]+/gi;
const cleanLines = (s) => s.replace(/ /g, " ").split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim()).filter(Boolean).join("\n");
const HAS_URL = new RegExp(URL_RE.source, "i");
const cell = (text, links = []) => ({ text: cleanLines(text || ""), links });

// Plain text: tab-separated (a paste from a spreadsheet) or a CSV file.
function parseDelimited(text) {
  const first = text.split(/\r?\n/).find((l) => l.trim()) || "";
  const delim = first.includes("\t") ? "\t" : (first.split(";").length > first.split(",").length ? ";" : ",");
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === delim) { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.map((r) => r.map((t) => cell(t)));
}

// Text of a table cell, keeping line breaks from paragraphs and lists.
function cellText(td) {
  const c = td.cloneNode(true);
  c.querySelectorAll("br").forEach((b) => b.replaceWith("\n"));
  c.querySelectorAll("li").forEach((li) => { li.prepend("• "); li.append("\n"); });
  c.querySelectorAll("p,div,h1,h2,h3,h4,h5,h6,tr").forEach((p) => p.append("\n"));
  return c.textContent;
}

// HTML from the clipboard (Word, Excel, Sheets, Docs) or a saved web page.
// Merged cells are filled in, so a unit name spanning rows reaches each row.
function parseHtmlTable(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const tables = [...doc.querySelectorAll("table")];
  if (!tables.length) return null;
  const table = tables.reduce((a, b) => (b.rows.length * (b.rows[0] ? b.rows[0].cells.length : 1) > a.rows.length * (a.rows[0] ? a.rows[0].cells.length : 1) ? b : a));
  const grid = [];
  [...table.rows].forEach((tr, r) => {
    grid[r] ||= [];
    let c = 0;
    for (const td of tr.cells) {
      while (grid[r][c]) c++;
      const links = [...td.querySelectorAll("a[href]")]
        .map((a) => ({ url: a.getAttribute("href"), label: cleanLines(a.textContent).replace(/\n/g, " ") }))
        .filter((l) => /^https?:\/\//i.test(l.url));
      const v = cell(cellText(td), links);
      const rs = Math.min(Number(td.rowSpan) || 1, 200), cs = Math.min(Number(td.colSpan) || 1, 50);
      for (let i = 0; i < rs; i++) for (let j = 0; j < cs; j++) {
        // A cell merged down (rowspan) repeats on each row, like a unit name.
        // A cell merged across (colspan) only counts once.
        (grid[r + i] ||= [])[c + j] = j > 0 ? cell("") : i === 0 ? v : { ...v, spanned: true };
      }
      c += cs;
    }
  });
  return grid.map((row) => Array.from({ length: row.length }, (_, i) => row[i] || cell("")));
}

// Text of a heading with its parts spaced: <span>7.1</span>Welcome -> "7.1 Welcome".
const spacedText = (el) => [...el.childNodes].map((n) => (n.nodeType === 1 ? spacedText(n) : n.textContent)).join(" ").replace(/\s+/g, " ").trim();

// A curriculum document: a numbered list of lesson titles under each unit
// heading. Becomes a two-column table: unit, lesson.
function parseLessonLists(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const rows = [[cell("Unit"), cell("Lesson title")]];
  let unit = "";
  for (const el of doc.body.querySelectorAll("h1,h2,h3,h4,h5,h6,ol")) {
    if (el.tagName !== "OL") { unit = spacedText(el); continue; }
    const items = [...el.children].filter((li) => li.tagName === "LI");
    if (items.length < 2 || items.some((li) => li.querySelector("ol,ul") || li.textContent.trim().length > 160)) continue;
    for (const li of items) {
      const links = [...li.querySelectorAll("a[href]")].map((a) => ({ url: a.getAttribute("href"), label: cleanLines(a.textContent) })).filter((l) => /^https?:\/\//i.test(l.url));
      rows.push([cell(unit), cell(li.textContent, links)]);
    }
  }
  return rows.length > 3 ? rows : null;
}

// Reads whatever was pasted, uploaded or fetched.
function readSource(html, text, source) {
  const table = html ? parseHtmlTable(html) : null;
  const lists = html ? parseLessonLists(html) : null;
  const plain = !table && !lists && text ? parseDelimited(text) : null;
  if (!table && !lists && !(plain && plain.length)) { toast("Couldn't find a table or a list of lessons there. Copy the table itself and try again."); return; }
  sow.alts = table && lists ? { table, lists } : null;
  // A page with lesson lists and a few small tables: the lists are the plan.
  const useLists = lists && (!table || lists.length >= table.length);
  sow.using = useLists ? "lists" : "table";
  setRows(useLists ? lists : table || plain, source);
}

function setRows(rows, source) {
  rows = rows.filter((r) => r.some((c) => c.text || c.links.length));
  const width = Math.max(0, ...rows.map((r) => r.length));
  rows = rows.map((r) => Array.from({ length: width }, (_, i) => r[i] || cell("")));
  // Drop columns that are empty all the way down.
  const keep = [...Array(width).keys()].filter((i) => rows.some((r) => r[i].text || r[i].links.length));
  sow.rows = rows.map((r) => keep.map((i) => r[i]));
  sow.source = source;
  sow.head = sow.rows.slice(0, 10).findIndex(looksLikeHeader);
  sow.layout = looksLikeWeekGrid() ? "week" : "row";
  sow.roles = guessRoles(sow.rows);
  sow.off = defaultOff();
  render();
}

// A delivery calendar has a "Lessons" heading over several columns, with
// one week per row.
function looksLikeWeekGrid() {
  if (sow.head < 0) return false;
  const h = sow.rows[sow.head];
  return h.some((c, i) => /^lessons?$/i.test(c.text) && h[i + 1] && !h[i + 1].text);
}

// ---------- working out the columns ----------
const HEAD_RE = /lesson|title|topic|objective|outcome|activit|homework|resource|link|week|unit|content|plan|focus|assessment|question/i;
function looksLikeHeader(row) {
  if (!row.length) return false;
  const hits = row.filter((c) => c.text && c.text.length < 60 && HEAD_RE.test(c.text) && !c.links.length).length;
  return hits >= Math.min(2, row.length);
}

function guessRole(head, values) {
  const h = (head || "").toLowerCase();
  const filled = values.filter((v) => v.text);
  const short = filled.length && filled.every((v) => v.text.length <= 12);
  if (/home ?work|home learning|^hw\b|independent study/.test(h)) return "homework";
  if (/link|url|resource|slides|powerpoint|ppt|files?\b/.test(h)) return "links";
  if (/^(week|wk|date|w\/?c|w\.b|term|no\.?|#|number|lesson ?(no|number|#))/.test(h) || (short && filled.every((v) => /^(\d+|week \d+|wk ?\d+|l\d+|lesson \d+)$/i.test(v.text)))) return "skip";
  if (/unit|module|half.?term|scheme|theme|topic area|strand/.test(h)) return "unit";
  if (/title|lesson|topic|focus|key question|learning question|big question|content|enquiry/.test(h)) return "title";
  return "plan";
}

function guessRoles(rows) {
  const width = (rows[0] || []).length;
  const heads = sow.head >= 0 ? rows[sow.head].map((c) => c.text) : [];
  const body = rows.slice(sow.head + 1);
  if (sow.layout === "week") {
    // The first "Lessons" block is the lessons; side-by-side blocks (another
    // year group or version) are left out until you pick them.
    const roles = Array(width).fill("skip");
    const start = heads.findIndex((h) => /^lessons?$/i.test(h));
    if (start >= 0) for (let i = start; i < width && (i === start || !heads[i]); i++) roles[i] = "lesson";
    heads.forEach((h, i) => { if (i < start && /unit|module|topic/i.test(h)) roles[i] = "unit"; });
    return roles;
  }
  const roles = [...Array(width).keys()].map((i) => guessRole(heads[i], body.map((r) => r[i])));
  // Only one title column: a second one goes into the plan.
  let seen = false;
  roles.forEach((r, i) => { if (r === "title") { if (seen) roles[i] = "plan"; seen = true; } });
  // No title column found: use the first column that isn't skipped.
  if (!seen) { const i = roles.findIndex((r) => r === "plan" || r === "unit"); if (i >= 0) roles[i] = "title"; }
  // A column that is mostly links becomes the links column.
  roles.forEach((r, i) => {
    if (r !== "plan") return;
    const vals = body.map((row) => row[i]).filter((c) => c.text || c.links.length);
    if (vals.length && vals.filter((c) => c.links.length || HAS_URL.test(c.text)).length / vals.length > 0.6) roles[i] = "links";
  });
  return roles;
}

const bodyRows = () => sow.rows.slice(sow.head + 1);
// A column's heading. A blank heading next to "Lessons" reads "Lessons (2)".
function heading(i) {
  if (sow.head < 0) return `Column ${i + 1}`;
  const h = sow.rows[sow.head];
  if (h[i] && h[i].text) return h[i].text;
  let j = i;
  while (j > 0 && !(h[j] && h[j].text)) j--;
  return h[j] && h[j].text ? `${h[j].text} (${i - j + 1})` : `Column ${i + 1}`;
}

// Side-by-side blocks in a delivery calendar: each "Lessons" heading and the
// blank-headed columns after it. Named from the title above the block.
function weekBlocks() {
  if (sow.head < 0) return [];
  const h = sow.rows[sow.head];
  const starts = h.map((c, i) => (/^lessons?$/i.test(c.text) ? i : -1)).filter((i) => i >= 0);
  return starts.map((start, k) => {
    let end = start + 1;
    while (end < h.length && !h[end].text) end++;
    const from = k ? starts[k - 1] + 1 : 0;
    let title = "";
    for (let r = sow.head - 1; r >= 0 && !title; r--) {
      const c = sow.rows[r].slice(from, end).find((x) => x.text && x.text.length < 80);
      if (c) title = c.text.replace(/\s+/g, " ");
    }
    const first = bodyRows().map((row) => row[start] && row[start].text).find((t) => t && !isGap(t)) || "";
    return { start, end, label: `${k + 1}. ${title || "Calendar"}${first ? `, starting "${first.slice(0, 40)}"` : ""}` };
  });
}
const HOLIDAY_RE = /^(half[ -]?term|holiday|christmas|easter|summer|inset|bank holiday|break|exams?|mock exams?|assessment week|no lessons?)\b[^\n]{0,30}$/i;
const EVENT_RE = /\b(exam (week|period)|mock exam week|exam season|inset)\b/i;
const isGap = (t) => HOLIDAY_RE.test(t) || EVENT_RE.test(t);

// One lesson's worth of content from a row.
function rowContent(row) {
  const pick = (role) => row.map((c, i) => (sow.roles[i] === role ? c : null)).filter(Boolean);
  const title = pick("title").map((c) => c.text.split("\n")[0]).find(Boolean) || "";
  const extraTitle = pick("title").map((c) => c.text.split("\n").slice(1).join("\n")).filter(Boolean);
  const planCols = row.map((c, i) => (sow.roles[i] === "plan" && c.text ? (sow.head >= 0 ? `${heading(i)}:\n${c.text}` : c.text) : null)).filter(Boolean);
  const plan = [...extraTitle, ...planCols].join("\n\n");
  const links = [];
  const add = (url, label) => {
    url = url.replace(/[.,;]+$/, "");
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    try { new URL(url); } catch { return; }
    if (!links.some((l) => l.url === url)) links.push({ url, label: label && label !== url ? label.slice(0, 80) : "" });
  };
  row.forEach((c, i) => {
    if (sow.roles[i] === "skip") return;
    c.links.forEach((l) => add(l.url, l.label));
    if (sow.roles[i] === "links") (c.text.match(URL_RE) || []).forEach((u) => add(u));
  });
  const homework = pick("homework").map((c) => c.text).filter(Boolean).join("\n").replace(/\n/g, " · ");
  const unit = pick("unit").map((c) => c.text.split("\n")[0]).find(Boolean) || "";
  return { title, plan, links, homework, unit };
}

// Rows that hold nothing, or just say "Half term", are left out by default.
function defaultOff() {
  const off = new Set();
  bodyRows().forEach((row, i) => {
    if (sow.layout === "week") {
      const cells = row.filter((c, j) => sow.roles[j] === "lesson" && c.text).map((c) => c.text);
      if (!cells.length || cells.every(isGap)) off.add(i);
      return;
    }
    const texts = row.filter((c) => c.text && !c.spanned && !/^\d+$/.test(c.text)).map((c) => c.text);
    const c = rowContent(row);
    if (!c.title && !c.plan && !c.links.length && !c.homework) off.add(i);
    else if (texts.length && texts.every(isGap)) off.add(i);
  });
  return off;
}

// ---------- placing rows into lessons ----------
// What gets placed, in order: one entry per row, or one per lesson cell
// (read left to right, then down) in a delivery calendar.
function entries() {
  const out = [];
  bodyRows().forEach((row, i) => {
    if (sow.off.has(i)) return;
    if (sow.layout !== "week") { out.push({ i, c: rowContent(row), n: sow.per }); return; }
    const unit = row.map((c, j) => (sow.roles[j] === "unit" ? c.text.split("\n")[0] : "")).find(Boolean) || "";
    row.forEach((c, j) => {
      if (sow.roles[j] !== "lesson" || !c.text || isGap(c.text)) return;
      const [title, ...rest] = c.text.split("\n");
      out.push({ i, n: 1, c: { title, plan: rest.join("\n"), links: c.links.map((x) => ({ ...x })), homework: "", unit } });
    });
  });
  return out;
}
const hasOwnPlan = (key) => { const n = state.notes[key]; return !!(n && ((n.title || "").trim() || (n.plan || "").trim() || (n.links || []).length)); };

function placement() {
  const all = classLessonsFrom(sow.cls, parseIso(sow.start), 2000);
  const skipped = { disrupted: 0, moved: 0, kept: 0 };
  const free = all.filter((l) => {
    if (dayInfo(l.date)) { skipped.disrupted++; return false; }
    if ((state.notes[l.key] || {}).moved) { skipped.moved++; return false; }
    if (sow.mode === "fill" && hasOwnPlan(l.key)) { skipped.kept++; return false; }
    return true;
  });
  // Only lessons that are not in a gap count for homework due dates.
  const teachable = all.filter((l) => !dayInfo(l.date) && !(state.notes[l.key] || {}).moved);
  const items = [];
  let k = 0;
  for (const e of entries()) {
    const lessons = [];
    for (let p = 0; p < e.n && k < free.length; p++) lessons.push(free[k++]);
    items.push({ i: e.i, c: e.c, lessons });
  }
  for (const it of items) {
    const last = it.lessons[it.lessons.length - 1];
    if (!it.c.homework || !last) continue;
    const at = teachable.findIndex((l) => l.key === last.key);
    it.due = at >= 0 ? teachable[at + sow.hwGap] : null;
  }
  return { items, skipped, fitted: items.filter((x) => x.lessons.length).length };
}

// ---------- applying and undoing ----------
function applyImport() {
  const { items } = placement();
  const id = `imp-${Date.now().toString(36)}-${newId()}`;
  const before = {};
  const hw = [];
  const t = Date.now();
  let lessons = 0;
  for (const it of items) {
    it.lessons.forEach((l, p) => {
      if (!(l.key in before)) before[l.key] = state.notes[l.key] ? structuredClone(state.notes[l.key]) : null;
      const part = it.lessons.length > 1 ? ` (${p + 1} of ${it.lessons.length})` : "";
      const old = state.notes[l.key] || {};
      const n = { ...old, title: it.c.title ? it.c.title + part : "", plan: it.c.plan, links: it.c.links.map((x) => ({ ...x })), cls: sow.cls, imp: id, t };
      if (it.c.unit) n.unit = it.c.unit; else delete n.unit;
      delete n.moved;
      state.notes[l.key] = n;
      lessons++;
    });
    const last = it.lessons[it.lessons.length - 1];
    if (it.c.homework && last && it.due) {
      const h = { id: `hw-${Date.now().toString(36)}-${newId()}`, cls: sow.cls, text: it.c.homework, setKey: last.key, dueKey: it.due.key, handed: [], closed: false, imp: id, t };
      state.homework.push(h);
      hw.push(h.id);
    }
  }
  if (!lessons) { toast("Nothing to import: no lessons left to fill from that date."); return; }
  const first = items.find((x) => x.lessons.length).lessons[0];
  const lastL = [...items].reverse().find((x) => x.lessons.length).lessons.slice(-1)[0];
  state.imports[id] = { cls: sow.cls, at: t, lessons, rows: items.filter((x) => x.lessons.length).length, from: iso(first.date), to: iso(lastL.date), hw, before, t };
  save();
  const cls = sow.cls;
  sow = null;
  go(`#/class/${encodeURIComponent(cls)}`);
  toast(`Imported ${lessons} lesson${lessons === 1 ? "" : "s"} into ${cls}, ${shortDate(first.date)} to ${shortDate(lastL.date)}.`, () => undoImport(id));
}

function undoImport(id) {
  const rec = state.imports[id];
  if (!rec || rec.undone) return;
  const t = Date.now();
  let restored = 0;
  for (const [key, old] of Object.entries(rec.before || {})) {
    const now = state.notes[key];
    if (!now || now.imp !== id) continue; // re-planned since, by a later import
    state.notes[key] = old ? { ...old, t } : { t };
    restored++;
  }
  for (const h of state.homework) if (h.imp === id && !h.deleted) { h.deleted = true; h.t = t; }
  state.imports[id] = { ...rec, undone: true, before: {}, t };
  save();
  route();
  toast(`Import undone: ${restored} lesson${restored === 1 ? "" : "s"} put back as they were.`);
}

// ---------- the page ----------
function renderImport(cls) {
  if (!classNames().includes(cls)) { view.innerHTML = `<div class="empty"><p>That class isn't on your timetable.</p><a class="btn" href="#/classes">Your classes</a></div>`; return; }
  if (!sow || sow.cls !== cls) {
    sow = blankSow(cls);
    const next = classLessonsFrom(cls, today(), 1)[0];
    sow.start = iso(next ? next.date : today());
  }
  render();
}

function render() {
  const cls = sow.cls;
  const past = Object.entries(state.imports || {}).filter(([, r]) => r.cls === cls).sort((a, b) => b[1].at - a[1].at);
  const has = sow.rows.length > 0;
  const n = bodyRows().length;
  view.innerHTML = `
    <header class="pagehead lessonhead" style="--c:${colourFor(cls)}">
      <div><p class="eyebrow"><a href="#/classes">Classes</a> · <a href="#/class/${encodeURIComponent(cls)}">${esc(cls)}</a></p>
      <h1>Import a scheme of work</h1>
      <p class="muted">Fill ${esc(cls)}'s lessons in order from a scheme of work, skipping holidays and disrupted days.</p></div>
      <a class="btn ghost" href="#/class/${encodeURIComponent(cls)}">Back to class</a>
    </header>
    <section class="panel sowsrc">
      <h3>1. Paste, upload or fetch your scheme of work</h3>
      <p class="muted small">Select the table in Word, Excel, Google Sheets or Google Docs (or the whole page of a curriculum document), copy it, then click in the box and paste. Links come across too. A table with one row per lesson, a delivery calendar with one row per week, and a document with a list of lessons under each unit all work.</p>
      <textarea id="sowPaste" rows="${has ? 2 : 5}" placeholder="Paste here (Ctrl+V)"></textarea>
      <form class="urlform" data-sow-url>
        <input name="url" type="url" inputmode="url" placeholder="Or a web address, such as your curriculum page" aria-label="Web address of the scheme of work" />
        <button class="btn ghost">Fetch</button>
      </form>
      <div class="btnrow">
        <label class="btn ghost">Upload a .csv or web page<input type="file" accept=".csv,.tsv,.txt,.htm,.html,text/csv,text/plain,text/html" data-sow-file hidden /></label>
        ${has ? `<button class="btn ghost" data-action="sow-clear">Start again</button>` : ""}
      </div>
      ${has ? `<p class="small">${esc(sow.source)}: ${sow.using === "lists" ? `${n} lesson${n === 1 ? "" : "s"} in lists under unit headings` : `${n} row${n === 1 ? "" : "s"}, ${sow.rows[0].length} column${sow.rows[0].length === 1 ? "" : "s"}`}.
        ${sow.alts ? `<button class="linkbtn" data-action="sow-alt">${sow.using === "lists" ? "Use the table on the page instead" : "Use the lesson lists instead"}</button>` : ""}</p>` : ""}
    </section>
    ${has ? columnsPanel() + unitsPanel() + optionsPanel() + previewPanel() : ""}
    ${past.length ? `<section class="panel"><h3>Earlier imports into ${esc(cls)}</h3><ul class="checks">${past.map(([id, r]) => `<li class="improw"><span>${esc(new Date(r.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }))}: ${r.lessons} lessons, ${esc(longDate(r.from))} to ${esc(longDate(r.to))}${r.hw && r.hw.length ? `, ${r.hw.length} homework` : ""}${r.undone ? ` <span class="muted">(undone)</span>` : ""}</span>${r.undone ? "" : `<button class="btn ghost small" data-action="sow-undo" data-id="${esc(id)}">Undo this import</button>`}</li>`).join("")}</ul></section>` : ""}`;
  setActiveNav("classes");
}

function columnsPanel() {
  const body = bodyRows();
  const sampleOf = (i) => (body.find((r, k) => !sow.off.has(k) && r[i] && r[i].text) || [])[i];
  const roles = sow.layout === "week" ? WEEK_ROLES : ROLES;
  const headOpts = sow.rows.slice(0, 10).map((r, i) => `<option value="${i}" ${sow.head === i ? "selected" : ""}>Row ${i + 1}: ${esc(r.map((c) => c.text).filter(Boolean).join(", ").slice(0, 50))}</option>`).join("");
  return `<section class="panel">
    <h3>2. How is it laid out?</h3>
    <div class="rollform">
      <label class="field"><span>Each row is</span><select data-sow-layout><option value="row" ${sow.layout === "row" ? "selected" : ""}>One lesson</option><option value="week" ${sow.layout === "week" ? "selected" : ""}>One week, lessons across the columns</option></select></label>
      <label class="field"><span>Headings are on</span><select data-sow-head><option value="-1" ${sow.head < 0 ? "selected" : ""}>No heading row</option>${headOpts}</select></label>
    </div>
    ${blockPicker()}
    <p class="muted small">${sow.layout === "week" ? "Each filled cell in the lesson columns becomes one lesson, read across then down." : "Say what each column holds. Several plan columns are combined, each under its heading."}</p>
    <details ${sow.layout === "week" && weekBlocks().length > 1 ? "" : "open"}><summary class="small">Columns</summary>
    <div class="sowcols">${sow.rows[0].map((_, i) => `<label class="field"><span>${esc(heading(i))}</span>
      <select data-sow-role="${i}">${roles.map(([v, l]) => `<option value="${v}" ${sow.roles[i] === v ? "selected" : ""}>${l}</option>`).join("")}</select>
      <em class="muted small">${esc(((sampleOf(i) || {}).text || "").slice(0, 70)) || "(empty)"}</em></label>`).join("")}</div></details>
  </section>`;
}

function blockPicker() {
  if (sow.layout !== "week") return "";
  const blocks = weekBlocks();
  if (blocks.length < 2) return "";
  const cur = blocks.findIndex((b) => sow.roles[b.start] === "lesson");
  return `<label class="field"><span>Which calendar?</span><select data-sow-block>${blocks.map((b, k) => `<option value="${k}" ${k === cur ? "selected" : ""}>${esc(b.label)}</option>`).join("")}</select></label>`;
}

// Units found in the unit column, so a whole-key-stage document can be cut
// down to one year's units.
const unitOf = (row) => row.map((c, j) => (sow.roles[j] === "unit" ? c.text.split("\n")[0] : "")).find(Boolean) || "";
function unitList() {
  const seen = new Map();
  bodyRows().forEach((row, i) => { const u = unitOf(row); if (!u) return; if (!seen.has(u)) seen.set(u, []); seen.get(u).push(i); });
  return [...seen.entries()];
}
function unitsPanel() {
  const units = unitList();
  if (units.length < 2) return "";
  return `<section class="panel">
    <h3>Which units?</h3>
    <div class="btnrow"><button class="btn ghost small" data-action="sow-units" data-on="1">All</button><button class="btn ghost small" data-action="sow-units" data-on="0">None</button></div>
    <ul class="checks unitchecks">${units.map(([u, rows], k) => `<li><label><input type="checkbox" data-sow-unit="${k}" ${rows.some((i) => !sow.off.has(i)) ? "checked" : ""} /><span>${esc(u)} <span class="muted small">(${rows.length})</span></span></label></li>`).join("")}</ul>
  </section>`;
}

function optionsPanel() {
  const hasHw = sow.layout === "row" && sow.roles.includes("homework");
  return `<section class="panel">
    <h3>3. Where should it go?</h3>
    <div class="rollform">
      <label class="field"><span>Class</span><select data-sow-opt="cls">${classNames().map((n) => `<option ${n === sow.cls ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></label>
      <label class="field"><span>First lesson on or after</span><input type="date" data-sow-opt="start" value="${esc(sow.start)}" /></label>
      ${sow.layout === "row" ? `<label class="field"><span>Each row fills</span><select data-sow-opt="per">${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${sow.per === n ? "selected" : ""}>${n} lesson${n === 1 ? "" : "s"}</option>`).join("")}</select></label>` : ""}
      <label class="field"><span>Lessons that already have a plan</span><select data-sow-opt="mode"><option value="fill" ${sow.mode === "fill" ? "selected" : ""}>Keep them, fill around them</option><option value="replace" ${sow.mode === "replace" ? "selected" : ""}>Replace them</option></select></label>
      ${hasHw ? `<label class="field"><span>Homework is due</span><select data-sow-opt="hwGap">${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${sow.hwGap === n ? "selected" : ""}>${n === 1 ? "next lesson" : `${n} lessons later`}</option>`).join("")}</select></label>` : ""}
    </div>
  </section>`;
}

function previewPanel() {
  const { items, skipped } = placement();
  const placed = items.filter((x) => x.lessons.length);
  const lessons = placed.reduce((a, x) => a + x.lessons.length, 0);
  const left = items.length - placed.length;
  const hw = items.filter((x) => x.c.homework && x.lessons.length && x.due).length;
  const notes = [
    skipped.disrupted && `${skipped.disrupted} lesson${skipped.disrupted === 1 ? "" : "s"} on disrupted days`,
    skipped.moved && `${skipped.moved} pushed on`,
    skipped.kept && `${skipped.kept} that already have a plan`,
  ].filter(Boolean);
  const replaces = sow.mode === "replace" ? placed.flatMap((x) => x.lessons).filter((l) => hasOwnPlan(l.key)).length : 0;
  const week = sow.layout === "week";
  const byRow = new Map();
  for (const it of items) { if (!byRow.has(it.i)) byRow.set(it.i, []); byRow.get(it.i).push(it); }
  const whenOf = (it) => (it.lessons.length ? it.lessons.map((l) => `${esc(lessonLabel(l))}${hasOwnPlan(l.key) ? ` <span class="warn">replaces a plan</span>` : ""}`).join("<br>") : `<span class="warn">Doesn't fit this year</span>`);
  const rowsHtml = bodyRows().map((row, i) => {
    const its = byRow.get(i) || [];
    const off = sow.off.has(i);
    const first = row.find((x) => x.text && !/^[\d\/.\s-]+$/.test(x.text)) || row.find((x) => x.text);
    if (off || !its.length) {
      return `<tr class="off"><td><input type="checkbox" data-sow-row="${i}" ${off ? "" : "checked"} aria-label="Import row ${i + 1}" /></td><td class="when"><span class="muted">${off ? "Left out" : "Nothing to import"}</span></td><td colspan="3"><span class="muted">${esc(((first || {}).text || "Empty row").replace(/\n/g, " · ").slice(0, 120))}</span></td></tr>`;
    }
    const c = its[0].c;
    const titleCol = week
      ? (c.unit ? `<span class="muted small">${esc(c.unit)}</span><br>` : "") + its.map((it) => esc(it.c.title)).join("<br>")
      : `${c.unit ? `<span class="muted small">${esc(c.unit)}</span><br>` : ""}<b>${esc(c.title) || `<span class="muted">No title</span>`}</b>${c.plan ? `<br><span class="muted small">${esc(c.plan.replace(/:\n/g, ": ").replace(/\n+/g, " · ").slice(0, 140))}${c.plan.length > 140 ? "…" : ""}</span>` : ""}`;
    const links = its.reduce((a, it) => a + it.c.links.length, 0);
    const it0 = its[0];
    return `<tr>
      <td><input type="checkbox" data-sow-row="${i}" checked aria-label="Import row ${i + 1}" /></td>
      <td class="when">${its.map(whenOf).join("<br>")}</td>
      <td>${titleCol}</td>
      <td>${links ? `${links} link${links === 1 ? "" : "s"}` : ""}</td>
      <td>${c.homework ? `${esc(c.homework.slice(0, 80))}${it0.lessons.length ? `<br><span class="muted small">${it0.due ? `due ${esc(lessonLabel(it0.due))}` : "no later lesson to be due in"}</span>` : ""}` : ""}</td>
    </tr>`;
  }).join("");
  const firstL = placed.length && placed[0].lessons[0];
  const lastL = placed.length && placed[placed.length - 1].lessons.slice(-1)[0];
  const what = week ? `${placed.length} lesson${placed.length === 1 ? "" : "s"}` : `${placed.length} row${placed.length === 1 ? "" : "s"} into ${lessons} lesson${lessons === 1 ? "" : "s"}`;
  return `<section class="panel">
    <h3>4. Check and import</h3>
    <p>${placed.length ? `<b>${what} of ${esc(sow.cls)}</b>, ${esc(shortDate(firstL.date))} ${firstL.date.getFullYear()} to ${esc(shortDate(lastL.date))} ${lastL.date.getFullYear()}${hw ? `, with ${hw} homework` : ""}.` : `<b>No lessons to fill from ${esc(longDate(sow.start))}.</b>`}
      ${notes.length ? ` Skips ${notes.join(", ")}.` : ""} Holidays are skipped automatically, and rows like "Half term" or "Mock exam week" are left out: mark those days as disrupted in the planner instead.
      ${left ? `<span class="warn">${left} ${week ? "lesson" : "row"}${left === 1 ? "" : "s"} won't fit before the end of the year (${esc(longDate(setup().end))}).</span>` : ""}
      ${replaces ? `<span class="warn">${replaces} existing plan${replaces === 1 ? "" : "s"} will be replaced.</span>` : ""}</p>
    <div class="btnrow"><button class="btn" data-action="sow-apply" ${placed.length ? "" : "disabled"}>Import ${lessons} lesson${lessons === 1 ? "" : "s"}</button></div>
    <p class="muted small">You can undo the whole import afterwards from this page.</p>
    <div class="weekwrap"><table class="sowprev"><thead><tr><th></th><th>Lesson</th><th>${week ? "Lessons" : "Title and plan"}</th><th>Links</th><th>Homework</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
  </section>`;
}

// ---------- events ----------
function handleImportAction(act, el) {
  switch (act) {
    case "sow-clear": { const c = sow.cls; sow = null; renderImport(c); return true; }
    case "sow-apply": applyImport(); return true;
    case "sow-undo": undoImport(el.dataset.id); return true;
    case "sow-alt": {
      sow.using = sow.using === "lists" ? "table" : "lists";
      const alts = sow.alts;
      setRows(alts[sow.using], sow.source);
      sow.alts = alts;
      render();
      return true;
    }
    case "sow-units": {
      const on = el.dataset.on === "1";
      for (const [, rows] of unitList()) for (const i of rows) { if (on) sow.off.delete(i); else sow.off.add(i); }
      if (on) { const keep = defaultOff(); for (const i of keep) sow.off.add(i); }
      render();
      return true;
    }
  }
  return false;
}

function handleImportChange(el) {
  if (!sow) return false;
  if (el.matches("[data-sow-file]")) {
    const f = el.files[0];
    el.value = "";
    if (!f) return true;
    if (/\.(xlsx|xls|docx|doc|ods|odt)$/i.test(f.name)) { toast("Open that file, select the table, copy it and paste it into the box instead."); return true; }
    const r = new FileReader();
    r.onload = () => {
      const text = String(r.result);
      if (/<(table|ol)\b/i.test(text)) readSource(text, "", f.name); else readSource("", text, f.name);
    };
    r.readAsText(f);
    return true;
  }
  if (el.matches("[data-sow-head]")) { sow.head = Number(el.value); sow.roles = guessRoles(sow.rows); sow.off = defaultOff(); render(); return true; }
  if (el.matches("[data-sow-block]")) {
    const b = weekBlocks()[Number(el.value)];
    sow.roles = sow.roles.map((r) => (r === "lesson" ? "skip" : r));
    for (let i = b.start; i < b.end; i++) sow.roles[i] = "lesson";
    sow.off = defaultOff();
    render();
    return true;
  }
  if (el.matches("[data-sow-layout]")) { sow.layout = el.value; sow.roles = guessRoles(sow.rows); sow.off = defaultOff(); render(); return true; }
  if (el.dataset.sowRole) { sow.roles[Number(el.dataset.sowRole)] = el.value; sow.off = defaultOff(); render(); return true; }
  if (el.dataset.sowRow) { const i = Number(el.dataset.sowRow); if (el.checked) sow.off.delete(i); else sow.off.add(i); render(); return true; }
  if (el.dataset.sowUnit) {
    const [, rows] = unitList()[Number(el.dataset.sowUnit)] || [, []];
    const gaps = defaultOff();
    for (const i of rows) { if (el.checked && !gaps.has(i)) sow.off.delete(i); else sow.off.add(i); }
    render();
    return true;
  }
  if (el.dataset.sowOpt) {
    const k = el.dataset.sowOpt;
    if (k === "start" && !validIso(el.value)) return true;
    sow[k] = k === "per" || k === "hwGap" ? Number(el.value) : el.value;
    if (k === "cls") { history.replaceState(null, "", `#/import/${encodeURIComponent(el.value)}`); }
    render();
    return true;
  }
  return false;
}

// Fetch a page or a shared Google Sheet. Pages on the planner's own site
// (such as the KS3 curriculum page) always work; other sites only if they
// allow it, otherwise copy and paste.
async function fetchSow(raw) {
  let url = raw.trim();
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  const sheet = url.match(/docs\.google\.com\/spreadsheets\/d\/([\w-]+)/);
  if (sheet) url = `https://docs.google.com/spreadsheets/d/${sheet[1]}/export?format=csv`;
  toast("Fetching…");
  try {
    const res = await fetch(url, { credentials: "omit" });
    if (!res.ok) throw new Error(res.status);
    const text = await res.text();
    const name = sheet ? "Google Sheet" : new URL(url).pathname.split("/").pop() || "Web page";
    if (/<(table|ol)\b/i.test(text)) readSource(text, "", name); else readSource("", text, name);
  } catch {
    toast(sheet ? "Couldn't open that sheet from here. Open it, select the cells, copy and paste them into the box instead." : "Couldn't fetch that page. Open it, select everything (Ctrl+A), copy and paste it into the box instead.");
  }
}

function handleImportSubmit(e) {
  const f = e.target;
  if (!sow || !f.matches("[data-sow-url]")) return false;
  e.preventDefault();
  if (f.url.value.trim()) fetchSow(f.url.value);
  return true;
}

document.addEventListener("paste", (e) => {
  if (!sow || e.target.id !== "sowPaste") return;
  e.preventDefault();
  readSource(e.clipboardData.getData("text/html"), e.clipboardData.getData("text/plain"), "Pasted");
});
