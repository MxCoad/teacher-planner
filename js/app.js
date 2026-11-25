// Prototype P0: a clickable mock-up. Everything lives in memory.

const state = {
  ...seedTimetable(),
  todos: structuredClone(TODOS_SEED),
  imported: false,
  notes: {}, // lessonKey -> edited plan text (kept until reload)
};

const TERM_START = "2026-09-07"; // used only to pick which lesson in a unit comes next
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const PALETTE = ["#2f6fb2", "#c2410c", "#0f766e", "#7c3aed", "#b45309", "#be185d", "#15803d", "#475569", "#0e7490", "#9333ea"];

// ---------- dates ----------
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseIso = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const dow = (d) => (d.getDay() + 6) % 7; // Monday = 0
const mondayOf = (d) => addDays(d, -dow(d));
const prettyDate = (d) => `${DAY_NAMES[dow(d)]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
const shortDate = (d) => `${DAY_SHORT[dow(d)]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
const today = () => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); };
const minutes = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

// ---------- timetable helpers ----------
const isTeaching = (p) => !/break|lunch/i.test(p.label);
const isBreak = (p) => /break|lunch/i.test(p.label);
const patternFor = (d) => state.patterns.find((p) => p.days.includes(dow(d)));
const slotOf = (pat, d, period) => pat.grid[`${dow(d)}_${period.id}`] || null;

function classNames() {
  const set = new Set();
  for (const pat of state.patterns) for (const v of Object.values(pat.grid)) if (v && v.subject && v.subject.trim()) set.add(v.subject.trim());
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function colourFor(name) {
  const names = classNames();
  const i = names.indexOf(name);
  return PALETTE[(i < 0 ? 0 : i) % PALETTE.length];
}

// Every lesson of a class in a given week, in order.
function lessonsInWeek(name, monday) {
  const out = [];
  for (let i = 0; i < 5; i++) {
    const d = addDays(monday, i);
    const pat = patternFor(d);
    if (!pat) continue;
    for (const p of pat.periods) {
      const s = slotOf(pat, d, p);
      if (s && s.subject && s.subject.trim() === name) out.push({ date: d, period: p, pattern: pat, slot: s });
    }
  }
  return out;
}

// Which lesson of the unit falls on this slot (dummy content only).
function lessonContent(name, date, period) {
  const unit = UNITS[name] || { unit: "Unit not set yet", lessons: ["Lesson"] };
  const weekIdx = Math.max(0, Math.round((mondayOf(date) - parseIso(TERM_START)) / (7 * 864e5)));
  const inWeek = lessonsInWeek(name, mondayOf(date));
  const perWeek = Math.max(1, inWeek.length);
  const pos = inWeek.findIndex((l) => iso(l.date) === iso(date) && l.period.id === period.id);
  const n = weekIdx * perWeek + Math.max(0, pos);
  const title = unit.lessons[n % unit.lessons.length];
  const number = (n % unit.lessons.length) + 1;
  const hasHomework = n % 3 === 1;
  return { unit: unit.unit, title, number, of: unit.lessons.length, hasHomework };
}

const lessonKey = (date, period) => `${iso(date)}_${period.id}`;

// ---------- small DOM helpers ----------
const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const view = $("#view");

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 3200);
}

function setActiveNav(name) {
  document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === name));
}

// ---------- views ----------
function renderToday(dateStr) {
  let d = dateStr ? parseIso(dateStr) : today();
  const pat = patternFor(d);
  const prev = addDays(d, dow(d) === 0 ? -3 : -1);
  const next = addDays(d, dow(d) === 4 ? 3 : dow(d) === 5 ? 2 : 1);
  const isToday = iso(d) === iso(today());
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();

  let body = "";
  if (!pat) {
    const mon = dow(d) >= 5 ? addDays(d, 7 - dow(d)) : d;
    body = `<div class="empty"><p>No school on ${esc(DAY_NAMES[dow(d)])}.</p><a class="btn" href="#/today/${iso(mon)}">Go to ${esc(shortDate(mon))}</a></div>`;
  } else {
    const items = pat.periods.map((p) => {
      const s = slotOf(pat, d, p);
      const now = isToday && nowMin >= minutes(p.start) && nowMin < minutes(p.end);
      const time = `<span class="time">${esc(p.start)}<br><span class="muted">${esc(p.end)}</span></span>`;
      if (s && s.subject && s.subject.trim()) {
        const name = s.subject.trim();
        const c = lessonContent(name, d, p);
        return `<a class="slot lesson ${now ? "now" : ""}" href="#/lesson/${iso(d)}/${encodeURIComponent(p.id)}" style="--c:${colourFor(name)}">
          ${time}
          <span class="card">
            <span class="row1"><span class="cls">${esc(name)}</span><span class="room">${esc(s.room || "")}</span></span>
            <span class="title">${esc(c.title)}</span>
            <span class="meta">${esc(p.label)} · ${esc(c.unit)} ${c.number}/${c.of}${c.hasHomework ? ` · <span class="hw">Homework due</span>` : ""}</span>
          </span>
          ${now ? `<span class="nowtag">Now</span>` : ""}
        </a>`;
      }
      if (isBreak(p)) return `<div class="slot divider ${now ? "now" : ""}">${time}<span class="label">${esc(p.label)}</span></div>`;
      if (/reg/i.test(p.label)) return `<div class="slot divider ${now ? "now" : ""}">${time}<span class="label">${esc(p.label)}</span></div>`;
      return `<div class="slot free ${now ? "now" : ""}">${time}<span class="card"><span class="cls">${esc(p.label)}</span><span class="meta">Free period</span></span></div>`;
    }).join("");
    const todayTodos = state.todos.filter((t) => t.when === "today" && !t.done);
    body = `
      <div class="daygrid">
        <section class="timeline" aria-label="Lessons">${items}</section>
        <aside class="side">
          <div class="panel">
            <h3>To do today</h3>
            ${todayTodos.length ? `<ul class="mini">${todayTodos.map((t) => `<li>${esc(t.text)}</li>`).join("")}</ul>` : `<p class="muted">Nothing left for today.</p>`}
            <a href="#/todo" class="link">All tasks</a>
          </div>
          <div class="panel">
            <h3>Day pattern</h3>
            <p>${esc(pat.name)}</p>
            <button class="btn ghost" data-mock="disrupt">Mark this day as disrupted</button>
          </div>
        </aside>
      </div>`;
  }

  view.innerHTML = `
    <header class="pagehead">
      <div>
        <p class="eyebrow">${isToday ? "Today" : "Day view"}</p>
        <h1>${esc(prettyDate(d))}</h1>
      </div>
      <nav class="stepper" aria-label="Change day">
        <a class="btn ghost" href="#/today/${iso(prev)}" aria-label="Previous day">‹</a>
        <a class="btn ghost" href="#/today">Today</a>
        <a class="btn ghost" href="#/today/${iso(next)}" aria-label="Next day">›</a>
      </nav>
    </header>
    ${body}`;
  setActiveNav("today");
}

function renderWeek(dateStr) {
  const mon = mondayOf(dateStr ? parseIso(dateStr) : today());
  const days = [0, 1, 2, 3, 4].map((i) => addDays(mon, i));
  // Rows follow the teaching periods of the first pattern, matched by label on other days.
  const labels = [];
  for (const pat of state.patterns) for (const p of pat.periods) if (!isBreak(p) && !labels.includes(p.label)) labels.push(p.label);
  const head = days.map((d) => `<th class="${iso(d) === iso(today()) ? "is-today" : ""}"><a href="#/today/${iso(d)}">${esc(DAY_SHORT[dow(d)])} <span>${d.getDate()}</span></a></th>`).join("");
  const rows = labels.map((label) => {
    const cells = days.map((d) => {
      const pat = patternFor(d);
      const p = pat && pat.periods.find((x) => x.label === label);
      if (!p) return `<td class="none"></td>`;
      const s = slotOf(pat, d, p);
      if (!s || !s.subject || !s.subject.trim()) return `<td class="freecell"><span class="t">${esc(p.start)}</span></td>`;
      const name = s.subject.trim();
      const c = lessonContent(name, d, p);
      return `<td><a class="wk" href="#/lesson/${iso(d)}/${encodeURIComponent(p.id)}" style="--c:${colourFor(name)}">
        <span class="t">${esc(p.start)} · ${esc(s.room || "")}</span>
        <span class="cls">${esc(name)}</span>
        <span class="title">${esc(c.title)}</span>
      </a></td>`;
    }).join("");
    return `<tr><th scope="row">${esc(label)}</th>${cells}</tr>`;
  }).join("");

  view.innerHTML = `
    <header class="pagehead">
      <div>
        <p class="eyebrow">Week view</p>
        <h1>Week of ${esc(shortDate(mon))}</h1>
      </div>
      <nav class="stepper" aria-label="Change week">
        <a class="btn ghost" href="#/week/${iso(addDays(mon, -7))}" aria-label="Previous week">‹</a>
        <a class="btn ghost" href="#/week">This week</a>
        <a class="btn ghost" href="#/week/${iso(addDays(mon, 7))}" aria-label="Next week">›</a>
      </nav>
    </header>
    <div class="weekwrap"><table class="week"><thead><tr><th></th>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
  setActiveNav("week");
}

function renderLesson(dateStr, periodId) {
  const d = parseIso(dateStr);
  const pat = patternFor(d);
  const p = pat && pat.periods.find((x) => x.id === periodId);
  const s = p && slotOf(pat, d, p);
  if (!s) { view.innerHTML = `<div class="empty"><p>That lesson isn't on the timetable.</p><a class="btn" href="#/today">Back to today</a></div>`; return; }
  const name = s.subject.trim();
  const c = lessonContent(name, d, p);
  const key = lessonKey(d, p);
  const plan = state.notes[key] ?? `Starter (10 min): recap last lesson with three quick questions.\nMain (35 min): ${c.title}: demo, then paired practice.\nPlenary (10 min): exit ticket on mini whiteboards.`;
  view.innerHTML = `
    <header class="pagehead lessonhead" style="--c:${colourFor(name)}">
      <div>
        <p class="eyebrow"><a href="#/class/${encodeURIComponent(name)}">${esc(name)}</a> · ${esc(shortDate(d))} · ${esc(p.label)} ${esc(p.start)}–${esc(p.end)} · Room ${esc(s.room || "–")}</p>
        <h1>${esc(c.title)}</h1>
        <p class="muted">${esc(c.unit)}, lesson ${c.number} of ${c.of}</p>
      </div>
      <a class="btn ghost" href="#/today/${iso(d)}">Back to day</a>
    </header>
    <div class="lessongrid">
      <section class="panel">
        <h3>Lesson plan</h3>
        <label class="field"><span>Objective</span><input value="Students can explain ${esc(c.title.toLowerCase())}." /></label>
        <label class="field"><span>Plan</span><textarea rows="6" data-note="${esc(key)}">${esc(plan)}</textarea></label>
        <p class="muted small">Edits stay until you reload the page. Saving arrives in prototype P2.</p>
      </section>
      <aside>
        <section class="panel">
          <h3>Resources</h3>
          <ul class="links">
            <li><a href="https://slides.google.com" target="_blank" rel="noopener"><span class="ico slides">▣</span>${esc(c.title)}: slides</a></li>
            <li><a href="https://docs.google.com" target="_blank" rel="noopener"><span class="ico docs">≡</span>${esc(c.title)}: worksheet</a></li>
            <li><a href="https://drive.google.com" target="_blank" rel="noopener"><span class="ico drive">▲</span>${esc(c.unit)} folder</a></li>
          </ul>
          <button class="btn ghost" data-mock="link">Add a link</button>
        </section>
        <section class="panel">
          <h3>Homework</h3>
          ${c.hasHomework ? `<p>Due today: practice questions on the last lesson.</p>` : `<p class="muted">None set for this lesson.</p>`}
          <button class="btn ghost" data-mock="homework">Set homework</button>
        </section>
        <section class="panel actions">
          <button class="btn" data-mock="copy">Copy to another class</button>
          <button class="btn ghost" data-mock="push">Push to the next lesson</button>
        </section>
      </aside>
    </div>`;
  setActiveNav("");
}

function renderClasses() {
  const names = classNames();
  const cards = names.map((n) => {
    const lessons = lessonsInWeek(n, mondayOf(today()));
    const room = lessons[0]?.slot.room || "";
    return `<a class="classcard" href="#/class/${encodeURIComponent(n)}" style="--c:${colourFor(n)}">
      <span class="cls">${esc(n)}</span>
      <span class="meta">${lessons.length} lesson${lessons.length === 1 ? "" : "s"} a week${room ? ` · ${esc(room)}` : ""}</span>
      <span class="meta">${esc((UNITS[n] || {}).unit || "No unit yet")}</span>
    </a>`;
  }).join("");
  view.innerHTML = `
    <header class="pagehead"><div><p class="eyebrow">Classes</p><h1>Your classes</h1></div></header>
    <p class="muted">Pupil lists arrive later, after you've checked with your Data Protection Officer. For now each class shows its lessons in order.</p>
    <div class="classgrid">${cards}</div>`;
  setActiveNav("classes");
}

function renderClass(name) {
  const start = mondayOf(today());
  const rows = [];
  for (let w = -1; w < 3; w++) {
    for (const l of lessonsInWeek(name, addDays(start, 7 * w))) {
      const c = lessonContent(name, l.date, l.period);
      const past = l.date < today();
      rows.push(`<li class="${past ? "past" : ""}"><a href="#/lesson/${iso(l.date)}/${encodeURIComponent(l.period.id)}">
        <span class="when">${esc(shortDate(l.date))} · ${esc(l.period.label)}</span>
        <span class="title">${esc(c.title)}</span>
        <span class="meta">${c.number}/${c.of}${c.hasHomework ? " · homework" : ""}${past ? " · taught" : ""}</span>
      </a></li>`);
    }
  }
  view.innerHTML = `
    <header class="pagehead lessonhead" style="--c:${colourFor(name)}">
      <div><p class="eyebrow"><a href="#/classes">Classes</a></p><h1>${esc(name)}</h1><p class="muted">${esc((UNITS[name] || {}).unit || "No unit yet")}</p></div>
      <button class="btn ghost" data-mock="roll">Roll lessons on</button>
    </header>
    <ol class="lessonlist">${rows.join("") || `<li class="muted">No lessons on the timetable.</li>`}</ol>`;
  setActiveNav("classes");
}

const GROUPS = [["today", "Today"], ["week", "This week"], ["month", "This month"], ["someday", "Someday"]];
function renderTodo() {
  const groups = GROUPS.map(([k, label]) => {
    const items = state.todos.filter((t) => t.when === k);
    return `<section class="panel todo">
      <h3>${label}</h3>
      <ul>${items.map((t) => `<li><label><input type="checkbox" data-todo="${t.id}" ${t.done ? "checked" : ""}/> <span>${esc(t.text)}</span></label></li>`).join("") || `<li class="muted">Nothing here.</li>`}</ul>
      <form data-add="${k}" class="addrow"><input placeholder="Add a task" aria-label="Add a task to ${label}" /><button class="btn ghost">Add</button></form>
    </section>`;
  }).join("");
  view.innerHTML = `<header class="pagehead"><div><p class="eyebrow">To do</p><h1>Tasks</h1></div></header><div class="todogrid">${groups}</div>`;
  setActiveNav("todo");
}

function renderSetup() {
  const pats = state.patterns.map((pat) => {
    const dayNames = pat.days.slice().sort().map((d) => DAY_SHORT[d]).join(", ") || "no days";
    const rows = pat.periods.map((p) => `<tr class="${isBreak(p) ? "brk" : ""}"><td>${esc(p.label)}</td><td>${esc(p.start)}–${esc(p.end)}</td></tr>`).join("");
    return `<section class="panel"><h3>${esc(pat.name)}</h3><p class="muted">${esc(dayNames)}</p><table class="bells">${rows}</table></section>`;
  }).join("");
  view.innerHTML = `
    <header class="pagehead"><div><p class="eyebrow">Setup</p><h1>Timetable</h1></div></header>
    <section class="panel import">
      <h3>Import from Timetable to Calendar</h3>
      <p>Choose the <b>timetable-setup.json</b> file you saved with "Save setup" in your Timetable to Calendar tool. The planner will show your real classes. In this prototype nothing is uploaded or saved: it stays in this browser tab.</p>
      <label class="btn">Choose file<input type="file" accept=".json,application/json" id="importFile" hidden /></label>
      ${state.imported ? `<button class="btn ghost" id="resetDemo">Back to demo data</button>` : ""}
      <p class="status" id="importStatus">${state.imported ? "Showing your imported timetable." : "Showing demo classes with your real bell times."}</p>
    </section>
    <h2 class="sub">Day patterns</h2>
    <div class="patgrid">${pats}</div>`;
  setActiveNav("setup");
}

// ---------- routing ----------
function route() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  const [page, a, b] = parts;
  window.scrollTo(0, 0);
  switch (page) {
    case "week": return renderWeek(a);
    case "lesson": return renderLesson(a, b);
    case "classes": return renderClasses();
    case "class": return renderClass(a);
    case "todo": return renderTodo();
    case "setup": return renderSetup();
    default: return renderToday(page === "today" ? a : undefined);
  }
}

const MOCKS = {
  disrupt: "In P3, this pushes today's untaught lessons on by one slot, with undo.",
  link: "In P2, you'll paste any Google Drive, Docs or Slides link here.",
  homework: "In P3, homework goes on the calendar with a tick list for hand-ins.",
  copy: "In P3, this copies the plan to another class.",
  push: "In P3, this moves this plan and the ones after it on by one lesson.",
  roll: "In P3, this rolls lessons on to next term or next year.",
};

document.addEventListener("click", (e) => {
  const m = e.target.closest("[data-mock]");
  if (m) { toast(MOCKS[m.dataset.mock] || "Coming in a later prototype."); return; }
  if (e.target.id === "resetDemo") {
    Object.assign(state, seedTimetable(), { imported: false });
    renderSetup();
    toast("Back to demo data.");
  }
});

document.addEventListener("change", (e) => {
  if (e.target.dataset.todo) {
    const t = state.todos.find((x) => String(x.id) === e.target.dataset.todo);
    if (t) t.done = e.target.checked;
  }
  if (e.target.id === "importFile") {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const data = parseTimetableSetup(r.result);
        state.patterns = data.patterns;
        state.holidays = data.holidays;
        state.imported = true;
        renderSetup();
        toast(`Imported ${data.patterns.length} day pattern${data.patterns.length === 1 ? "" : "s"} and ${classNames().length} classes.`);
      } catch (err) {
        $("#importStatus").textContent = err.message.startsWith("That file") ? err.message : "That file couldn't be read. Is it the timetable-setup.json from Save setup?";
      }
    };
    r.readAsText(f);
  }
});

document.addEventListener("input", (e) => {
  if (e.target.dataset.note) state.notes[e.target.dataset.note] = e.target.value;
});

document.addEventListener("submit", (e) => {
  const f = e.target.closest("[data-add]");
  if (!f) return;
  e.preventDefault();
  const input = f.querySelector("input");
  const text = input.value.trim();
  if (!text) return;
  state.todos.push({ id: Date.now(), text, when: f.dataset.add, done: false });
  renderTodo();
});

window.addEventListener("hashchange", route);
route();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
