// Prototype P4: import a scheme of work (import.js).
// P3: classroom workflow (copy and push plans, disrupted days, homework).
// P2 added sign-in, sync between devices, and lesson links.

let state = loadState();
const setup = () => state.setup;
const save = () => saveState(state);

const TERM_START_FALLBACK = "2026-09-07";
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const PALETTE = ["#2f6fb2", "#c2410c", "#0f766e", "#7c3aed", "#b45309", "#be185d", "#15803d", "#475569", "#0e7490", "#9333ea", "#a16207", "#4d7c0f"];

// ---------- dates ----------
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseIso = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const validIso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "");
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const dow = (d) => (d.getDay() + 6) % 7; // Monday = 0
const mondayOf = (d) => addDays(d, -dow(d));
const prettyDate = (d) => `${DAY_NAMES[dow(d)]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
const shortDate = (d) => `${DAY_SHORT[dow(d)]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
const longDate = (s) => (validIso(s) ? `${parseIso(s).getDate()} ${MONTHS[parseIso(s).getMonth()]} ${parseIso(s).getFullYear()}` : "not set");
const today = () => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); };
const minutes = (hhmm) => { const [h, m] = (hhmm || "0:0").split(":").map(Number); return h * 60 + m; };

// ---------- timetable helpers ----------
const isBreak = (p) => /break|lunch/i.test(p.label);
const patternFor = (d) => setup().patterns.find((p) => p.days.includes(dow(d)));
const slotOf = (pat, d, period) => {
  const s = pat.grid[`${dow(d)}_${period.id}`];
  return s && s.subject && s.subject.trim() ? s : null;
};

function holidayOn(d) {
  const k = iso(d);
  return setup().holidays.find((h) => validIso(h.start) && k >= h.start && k <= (validIso(h.end) ? h.end : h.start));
}

// Why there are no lessons on a day, or null when it's a school day.
function dayOff(d) {
  if (dow(d) >= 5) return "Weekend";
  const k = iso(d), s = setup();
  if (validIso(s.start) && k < s.start) return "Before the first day of term";
  if (validIso(s.end) && k > s.end) return "After the last day of term";
  const h = holidayOn(d);
  if (h) return h.label || "Holiday";
  if (!patternFor(d)) return "No day pattern for this day";
  return null;
}

function classNames() {
  const set = new Set();
  for (const pat of setup().patterns) for (const v of Object.values(pat.grid)) if (v && v.subject && v.subject.trim()) set.add(v.subject.trim());
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function colourFor(name) {
  if (state.colours[name]) return state.colours[name];
  const i = classNames().indexOf(name);
  return PALETTE[(i < 0 ? 0 : i) % PALETTE.length];
}

function lessonsInWeek(name, monday) {
  const out = [];
  for (let i = 0; i < 5; i++) {
    const d = addDays(monday, i);
    if (dayOff(d)) continue;
    const pat = patternFor(d);
    for (const p of pat.periods) {
      const s = slotOf(pat, d, p);
      if (s && s.subject.trim() === name) out.push({ date: d, period: p, pattern: pat, slot: s });
    }
  }
  return out;
}

const lessonKey = (date, period) => `${iso(date)}_${period.id}`;

// What a lesson card shows. Your own notes win; demo mode fills gaps with sample units.
function lessonContent(name, date, period) {
  const note = state.notes[lessonKey(date, period)] || {};
  if (state.mode !== "demo") {
    return { title: note.title || "", unit: note.unit || "", number: 0, of: 0 };
  }
  if (note.unit) return { title: note.title || "", unit: note.unit, number: 0, of: 0 };
  const unit = UNITS[name] || { unit: "Unit not set yet", lessons: ["Lesson"] };
  const start = validIso(setup().start) ? mondayOf(parseIso(setup().start)) : parseIso(TERM_START_FALLBACK);
  const weekIdx = Math.max(0, Math.round((mondayOf(date) - start) / (7 * 864e5)));
  const inWeek = lessonsInWeek(name, mondayOf(date));
  const perWeek = Math.max(1, inWeek.length);
  const pos = inWeek.findIndex((l) => iso(l.date) === iso(date) && l.period.id === period.id);
  const n = weekIdx * perWeek + Math.max(0, pos);
  return {
    title: note.title ?? (note.moved ? "" : unit.lessons[n % unit.lessons.length]),
    unit: unit.unit,
    number: (n % unit.lessons.length) + 1,
    of: unit.lessons.length,
  };
}

// ---------- DOM helpers ----------
const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const view = $("#view");

// A short message at the bottom of the screen, optionally with an Undo button.
function toast(msg, undo) {
  const t = $("#toast");
  t.innerHTML = `<span>${esc(msg)}</span>${undo ? `<button type="button" class="undo">Undo</button>` : ""}`;
  t.classList.toggle("has-undo", !!undo);
  if (undo) t.querySelector(".undo").onclick = () => { t.classList.remove("show"); undo(); };
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), undo ? 10000 : 3600);
}

function setActiveNav(name) {
  document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === name));
}

function renderBanner() {
  const b = $("#banner");
  const label = syncLabel();
  if (state.mode === "demo") {
    b.innerHTML = `Demo data, not synced. <a href="#/setup">Use your own timetable</a>`;
  } else if (state.mode === "mine" && sync.status === "signed-out") {
    b.innerHTML = `Saved on this device. <a href="#/account">Sign in</a> to sync your other devices.`;
  } else if (state.mode === "mine" && label) {
    b.textContent = label;
  } else if (state.mode === "mine") {
    b.textContent = "Saved on this device.";
  } else {
    b.textContent = "Teacher Planner";
  }
  b.dataset.status = state.mode === "mine" ? sync.status : "";
}

function download(filename, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ---------- welcome ----------
function renderWelcome() {
  view.innerHTML = `
    <header class="pagehead"><div><p class="eyebrow">Welcome</p><h1>Let's set up your timetable</h1></div></header>
    <p class="lead">Set your timetable up once, and the day and week views build themselves from it. Sign in to keep it in step on your phone, laptop and school PC.</p>
    <div class="choices">
      <section class="panel choice">
        <h3>Import from Timetable to Calendar</h3>
        <p>Choose the <b>timetable-setup.json</b> file from "Save setup". Your term dates, holidays, day patterns and classes come across.</p>
        <label class="btn">Choose file<input type="file" accept=".json,application/json" data-upload hidden /></label>
      </section>
      <section class="panel choice">
        <h3>Set up by hand</h3>
        <p>Start with a plain Monday-to-Friday day of six periods, then change the times and add your classes.</p>
        <button class="btn ghost" data-action="start-blank">Start from scratch</button>
      </section>
      <section class="panel choice">
        <h3>Look around first</h3>
        <p>Load demo classes with real bell times. You can switch to your own timetable from Setup at any time.</p>
        <button class="btn ghost" data-action="start-demo">Try demo data</button>
      </section>
      ${syncConfigured() ? `<section class="panel choice">
        <h3>Already set up on another device?</h3>
        <p>Sign in and your planner comes down from your account.</p>
        <a class="btn ghost" href="#/account">Sign in</a>
      </section>` : ""}
    </div>
    <p class="status" id="uploadStatus"></p>`;
  setActiveNav("");
}

// ---------- today ----------
function renderToday(dateStr) {
  const d = dateStr && validIso(dateStr) ? parseIso(dateStr) : today();
  const prev = addDays(d, dow(d) === 0 ? -3 : dow(d) === 6 ? -2 : -1);
  const next = addDays(d, dow(d) === 4 ? 3 : dow(d) === 5 ? 2 : 1);
  const isToday = iso(d) === iso(today());
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const off = dayOff(d);

  let body;
  if (off) {
    let nextDay = addDays(d, 1);
    for (let i = 0; i < 120 && dayOff(nextDay); i++) nextDay = addDays(nextDay, 1);
    const hasNext = !dayOff(nextDay);
    body = `<div class="empty"><p class="offlabel">${esc(off)}</p><p>No lessons on ${esc(prettyDate(d))}.</p>${hasNext ? `<a class="btn" href="#/today/${iso(nextDay)}">Next school day: ${esc(shortDate(nextDay))}</a>` : ""}</div>`;
  } else {
    const pat = patternFor(d);
    const items = pat.periods.map((p) => {
      const s = slotOf(pat, d, p);
      const now = isToday && nowMin >= minutes(p.start) && nowMin < minutes(p.end);
      const time = `<span class="time">${esc(p.start)}<br><span class="muted">${esc(p.end)}</span></span>`;
      if (s) {
        const name = s.subject.trim();
        const key = lessonKey(d, p);
        const note = state.notes[key] || {};
        const c = lessonContent(name, d, p);
        const nLinks = (note.links || []).length;
        const meta = [p.label, !note.moved && c.unit && `${c.unit} ${c.number}/${c.of}`, nLinks && `${nLinks} link${nLinks === 1 ? "" : "s"}`].filter(Boolean).map(esc).join(" · ");
        const due = hwList().filter((h) => h.dueKey === key);
        const setHere = hwList().filter((h) => h.setKey === key);
        const hw = [due.length && `<span class="hw">Homework due (${due.map((h) => `${handedCount(h)}/${classSize(h.cls)}`).join(", ")})</span>`, setHere.length && `Homework set`].filter(Boolean).join(" · ");
        const title = c.title ? esc(c.title) : note.moved ? `Moved on: ${esc(note.moved)}` : "No plan yet";
        return `<a class="slot lesson ${now ? "now" : ""} ${note.moved && !c.title ? "moved" : ""}" href="#/lesson/${iso(d)}/${encodeURIComponent(p.id)}" style="--c:${colourFor(name)}">
          ${time}
          <span class="card">
            <span class="row1"><span class="cls">${esc(name)}</span><span class="room">${esc(s.room || "")}</span></span>
            <span class="title ${c.title ? "" : "muted"}">${title}</span>
            <span class="meta">${meta}${hw ? ` · ${hw}` : ""}</span>
          </span>
          ${now ? `<span class="nowtag">Now</span>` : ""}
        </a>`;
      }
      if (isBreak(p) || /reg/i.test(p.label)) return `<div class="slot divider ${now ? "now" : ""}">${time}<span class="label">${esc(p.label)}</span></div>`;
      return `<div class="slot free ${now ? "now" : ""}">${time}<span class="card"><span class="cls">${esc(p.label)}</span><span class="meta">Free period</span></span></div>`;
    }).join("");
    const todayTodos = state.todos.filter((t) => t.when === "today" && !t.done && !t.deleted);
    const dueToday = hwList().filter((h) => !h.closed && hwDue(h) === iso(d));
    body = `
      <div class="daygrid">
        <section class="timeline" aria-label="Lessons">${items}</section>
        <aside class="side">
          <div class="panel">
            <h3>To do today</h3>
            ${todayTodos.length ? `<ul class="mini">${todayTodos.map((t) => `<li>${esc(t.text)}</li>`).join("")}</ul>` : `<p class="muted">Nothing left for today.</p>`}
            <a href="#/todo" class="link">All tasks</a>
          </div>
          ${dueToday.length ? `<div class="panel"><h3>Homework due</h3><div class="hwmini">${dueToday.map(hwCard).join("")}</div></div>` : ""}
          ${disruptPanel(d, pat)}
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
    ${off ? "" : disruptNotice(d)}
    ${body}`;
  setActiveNav("today");
}

// ---------- week ----------
function renderWeek(dateStr) {
  const mon = mondayOf(dateStr && validIso(dateStr) ? parseIso(dateStr) : today());
  const days = [0, 1, 2, 3, 4].map((i) => addDays(mon, i));
  const labels = [];
  for (const pat of setup().patterns) for (const p of pat.periods) if (!isBreak(p) && !labels.includes(p.label)) labels.push(p.label);
  const head = days.map((d) => `<th class="${iso(d) === iso(today()) ? "is-today" : ""}"><a href="#/today/${iso(d)}">${esc(DAY_SHORT[dow(d)])} <span>${d.getDate()} ${MONTHS[d.getMonth()]}</span>${dayInfo(d) ? `<em class="dis">${esc(dayInfo(d).reason || "Disrupted")}</em>` : ""}</a></th>`).join("");
  const rows = labels.map((label, ri) => {
    const cells = days.map((d) => {
      const off = dayOff(d);
      if (off) return ri === 0 ? `<td class="off" rowspan="${labels.length}"><span>${esc(off)}</span></td>` : "";
      const pat = patternFor(d);
      const p = pat.periods.find((x) => x.label === label);
      if (!p) return `<td class="none"></td>`;
      const s = slotOf(pat, d, p);
      if (!s) return `<td class="freecell"><span class="t">${esc(p.start)}</span></td>`;
      const name = s.subject.trim();
      const c = lessonContent(name, d, p);
      const moved = (state.notes[lessonKey(d, p)] || {}).moved;
      return `<td><a class="wk ${moved && !c.title ? "moved" : ""}" href="#/lesson/${iso(d)}/${encodeURIComponent(p.id)}" style="--c:${colourFor(name)}">
        <span class="t">${esc(p.start)}${s.room ? ` · ${esc(s.room)}` : ""}</span>
        <span class="cls">${esc(name)}</span>
        ${c.title ? `<span class="title">${esc(c.title)}</span>` : moved ? `<span class="title muted">Moved on</span>` : ""}
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
    ${labels.length ? `<div class="weekwrap"><table class="week"><thead><tr><th></th>${head}</tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="empty"><p>No periods set up yet.</p><a class="btn" href="#/setup">Go to Setup</a></div>`}`;
  setActiveNav("week");
}

// ---------- lesson ----------
function linkKind(url) {
  let h = "", path = "";
  try { const u = new URL(url); h = u.hostname; path = u.pathname; } catch {}
  if (h === "docs.google.com" && path.startsWith("/presentation")) return { cls: "slides", icon: "▣", name: "Google Slides" };
  if (h === "docs.google.com" && path.startsWith("/spreadsheets")) return { cls: "sheets", icon: "▦", name: "Google Sheets" };
  if (h === "docs.google.com" && path.startsWith("/forms")) return { cls: "forms", icon: "☰", name: "Google Form" };
  if (h === "docs.google.com") return { cls: "docs", icon: "≡", name: "Google Doc" };
  if (h === "drive.google.com") return { cls: "drive", icon: "▲", name: "Google Drive" };
  if (h === "classroom.google.com") return { cls: "drive", icon: "◆", name: "Google Classroom" };
  if (/(^|\.)youtube\.com$|^youtu\.be$/.test(h)) return { cls: "yt", icon: "▶", name: "YouTube" };
  return { cls: "web", icon: "↗", name: h || "Link" };
}

function renderLesson(dateStr, periodId) {
  const d = validIso(dateStr) ? parseIso(dateStr) : today();
  const pat = patternFor(d);
  const p = pat && pat.periods.find((x) => x.id === periodId);
  const s = p && slotOf(pat, d, p);
  if (!s) { view.innerHTML = `<div class="empty"><p>That lesson isn't on the timetable.</p><a class="btn" href="#/today">Back to today</a></div>`; return; }
  const name = s.subject.trim();
  const c = lessonContent(name, d, p);
  const key = lessonKey(d, p);
  const note = state.notes[key] || {};
  const demo = state.mode === "demo";
  const plan = note.plan ?? (demo && !note.moved ? demoPlan(c.title) : "");
  const here = { date: d, period: p, key, cls: name };
  const others = classNames().map((n) => {
    const ls = classLessonsFrom(n, d, 12).filter((x) => x.key !== key && (n !== name || isAfter(x, d, p))).slice(0, 8);
    return ls.length ? `<optgroup label="${esc(n)}">${ls.map((x) => `<option value="${esc(x.key)}">${esc(n)} · ${esc(lessonLabel(x))}${isEmptyPlan(planOf(x)) ? "" : " (has a plan)"}</option>`).join("")}</optgroup>` : "";
  }).join("");
  view.innerHTML = `
    <header class="pagehead lessonhead" style="--c:${colourFor(name)}">
      <div>
        <p class="eyebrow"><a href="#/class/${encodeURIComponent(name)}">${esc(name)}</a> · ${esc(shortDate(d))} · ${esc(p.label)} ${esc(p.start)}–${esc(p.end)}${s.room ? ` · Room ${esc(s.room)}` : ""}</p>
        <h1>${c.title ? esc(c.title) : "Plan this lesson"}</h1>
        ${note.moved ? `<p class="warn">This lesson's plan was moved on (${esc(note.moved)}). Anything you plan here stays here.</p>` : ""}
        ${c.unit ? `<p class="muted">${esc(c.unit)}${c.of ? `, lesson ${c.number} of ${c.of}` : ""}</p>` : ""}
      </div>
      <a class="btn ghost" href="#/today/${iso(d)}">Back to day</a>
    </header>
    <div class="lessongrid">
      <section class="panel">
        <h3>Lesson plan</h3>
        <label class="field"><span>Title</span><input data-note="${esc(key)}" data-cls="${esc(name)}" data-field="title" value="${esc(note.title ?? (demo ? c.title : ""))}" placeholder="What is this lesson about?" /></label>
        <label class="field"><span>Plan</span><textarea rows="8" data-note="${esc(key)}" data-cls="${esc(name)}" data-field="plan" placeholder="Starter, main, plenary...">${esc(plan)}</textarea></label>
        <p class="muted small" id="savedNote">Saved as you type.</p>
      </section>
      <aside>
        <section class="panel">
          <h3>Resources</h3>
          ${(note.links || []).length ? `<ul class="links">${note.links.map((l, i) => {
            const k = linkKind(l.url);
            return `<li><a href="${esc(l.url)}" target="_blank" rel="noopener"><span class="ico ${k.cls}">${k.icon}</span><span class="ltext">${esc(l.label || k.name)}</span></a><button class="x" data-link-del="${i}" data-key="${esc(key)}" aria-label="Remove link">×</button></li>`;
          }).join("")}</ul>` : `<p class="muted">No links yet. Paste a Google Slides, Docs or Drive link, or any web address.</p>`}
          <form class="linkform" data-link="${esc(key)}" data-cls="${esc(name)}">
            <input name="url" type="url" inputmode="url" placeholder="Paste a link" aria-label="Link address" required />
            <input name="label" placeholder="Name (optional)" aria-label="Link name" />
            <button class="btn ghost">Add link</button>
          </form>
        </section>
        ${homeworkPanel(here)}
        <section class="panel actions">
          <h3>Move or reuse this plan</h3>
          ${others ? `<label class="field"><span>Copy this plan to</span><select id="copyTarget">${others}</select></label>
          <button class="btn" data-action="copy" data-key="${esc(key)}">Copy plan</button>` : ""}
          <button class="btn ghost" data-action="push-on" data-key="${esc(key)}">Push on to the next lesson</button>
          <p class="muted small">Pushing on moves this plan, and the ones after it, on by one lesson of ${esc(name)}. Both can be undone.</p>
        </section>
      </aside>
    </div>`;
  setActiveNav("");
}

// ---------- classes ----------
function renderClasses() {
  const names = classNames();
  const cards = names.map((n) => {
    let perWeek = 0, room = "";
    for (const pat of setup().patterns) for (const [k, v] of Object.entries(pat.grid)) {
      if (v && v.subject && v.subject.trim() === n && pat.days.includes(Number(k.split("_")[0]))) { perWeek++; room = room || v.room || ""; }
    }
    return `<a class="classcard" href="#/class/${encodeURIComponent(n)}" style="--c:${colourFor(n)}">
      <span class="cls">${esc(n)}</span>
      <span class="meta">${perWeek} lesson${perWeek === 1 ? "" : "s"} a week${room ? ` · ${esc(room)}` : ""}</span>
      ${state.mode === "demo" ? `<span class="meta">${esc((UNITS[n] || {}).unit || "")}</span>` : ""}
    </a>`;
  }).join("");
  view.innerHTML = `
    <header class="pagehead"><div><p class="eyebrow">Classes</p><h1>Your classes</h1></div></header>
    <p class="muted">Classes come from your timetable. Pupil lists arrive later, after you've checked with your Data Protection Officer. To fill a class's lessons from a scheme of work, open the class and choose Import scheme of work.</p>
    ${names.length ? `<div class="classgrid">${cards}</div>` : `<div class="empty"><p>No classes on your timetable yet.</p><a class="btn" href="#/setup">Add them in Setup</a></div>`}`;
  setActiveNav("classes");
}

function renderClass(name) {
  const start = mondayOf(today());
  const openHw = hwList().filter((h) => h.cls === name && !h.closed).sort((a, b) => hwDue(a).localeCompare(hwDue(b)));
  const rows = [];
  for (let w = -1; w < 4; w++) {
    for (const l of lessonsInWeek(name, addDays(start, 7 * w))) {
      const c = lessonContent(name, l.date, l.period);
      const past = l.date < today();
      const key = lessonKey(l.date, l.period);
      const moved = (state.notes[key] || {}).moved;
      const due = hwList().filter((h) => h.dueKey === key).length;
      const meta = [!moved && c.of && `${c.number}/${c.of}`, due && "homework due", past && "taught"].filter(Boolean).join(" · ");
      rows.push(`<li class="${past ? "past" : ""}"><a href="#/lesson/${iso(l.date)}/${encodeURIComponent(l.period.id)}">
        <span class="when">${esc(shortDate(l.date))} · ${esc(l.period.label)}</span>
        <span class="title ${c.title ? "" : "muted"}">${c.title ? esc(c.title) : moved ? `Moved on: ${esc(moved)}` : "No plan yet"}</span>
        <span class="meta">${esc(meta)}</span>
      </a></li>`);
    }
  }
  view.innerHTML = `
    <header class="pagehead lessonhead" style="--c:${colourFor(name)}">
      <div><p class="eyebrow"><a href="#/classes">Classes</a></p><h1>${esc(name)}</h1><p class="muted">Last week to four weeks ahead</p></div>
      <span class="btnrow"><a class="btn ghost" href="#/import/${encodeURIComponent(name)}">Import scheme of work</a><button class="btn ghost" data-action="roll-open">Roll lessons on</button></span>
    </header>
    ${rollPanel(name)}
    <div class="classcols">
      <ol class="lessonlist">${rows.join("") || `<li class="muted">No lessons in these weeks.</li>`}</ol>
      <aside>
        <section class="panel">
          <h3>Homework</h3>
          ${openHw.length ? `<div class="hwmini">${openHw.map(hwCard).join("")}</div>` : `<p class="muted">No open homework. Set it from a lesson.</p>`}
        </section>
        <section class="panel">
          <h3>Class size</h3>
          <label class="field"><span>Pupils (for hand-in ticks)</span><input type="number" min="1" max="60" data-class-size="${esc(name)}" value="${classSize(name)}" /></label>
          <p class="muted small">Ticks use register numbers, so no names are stored.</p>
        </section>
      </aside>
    </div>`;
  setActiveNav("classes");
}

// ---------- to do ----------
const GROUPS = [["today", "Today"], ["week", "This week"], ["month", "This month"], ["someday", "Someday"]];
function renderTodo() {
  const groups = GROUPS.map(([k, label]) => {
    const items = state.todos.filter((t) => t.when === k && !t.deleted);
    return `<section class="panel todo">
      <h3>${label}</h3>
      <ul>${items.map((t) => `<li><label><input type="checkbox" data-todo="${t.id}" ${t.done ? "checked" : ""}/> <span>${esc(t.text)}</span></label><button class="x" data-todo-del="${t.id}" aria-label="Delete task">×</button></li>`).join("") || `<li class="muted">Nothing here.</li>`}</ul>
      <form data-add="${k}" class="addrow"><input placeholder="Add a task" aria-label="Add a task to ${label}" /><button class="btn ghost">Add</button></form>
    </section>`;
  }).join("");
  view.innerHTML = `<header class="pagehead"><div><p class="eyebrow">To do</p><h1>Tasks</h1></div></header><div class="todogrid">${groups}</div>`;
  setActiveNav("todo");
}

// ---------- routing ----------
function route() {
  renderBanner();
  const parts = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  const [page, a, b] = parts;
  if (state.mode === "new" && page !== "setup" && page !== "account") return renderWelcome();
  switch (page) {
    case "week": return renderWeek(a);
    case "lesson": return renderLesson(a, b);
    case "classes": return renderClasses();
    case "class": return renderClass(a);
    case "import": return renderImport(a);
    case "todo": return renderTodo();
    case "homework": return renderHomework(a);
    case "setup": return renderSetup();
    case "account": return renderAccount(a);
    default: return renderToday(page === "today" ? a : undefined);
  }
}
function go(hash) {
  if (location.hash === hash) route(); else location.hash = hash;
  window.scrollTo(0, 0);
}

// ---------- starting points ----------
function blankPattern() {
  const times = [["Period 1", "09:00", "10:00"], ["Period 2", "10:00", "11:00"], ["Break", "11:00", "11:20"], ["Period 3", "11:20", "12:20"], ["Period 4", "12:20", "13:20"], ["Lunch", "13:20", "14:10"], ["Period 5", "14:10", "15:10"], ["Period 6", "15:10", "16:10"]];
  return { id: newId(), name: "Every day", days: [0, 1, 2, 3, 4], grid: {}, periods: times.map(([label, start, end]) => ({ id: newId(), label, start, end })) };
}
function newId() { return Math.random().toString(36).slice(2, 9); }

function startDemo() {
  state = { ...freshState(), mode: "demo", setup: demoSetup(), todos: structuredClone(TODOS_SEED), stamps: { setup: Date.now() } };
  save();
  go("#/today");
  toast("Demo data loaded. Switch to your own timetable from Setup.");
}
function startBlank() {
  const t = today();
  const year = t.getMonth() >= 7 ? t.getFullYear() : t.getFullYear() - 1;
  state = { ...freshState(), mode: "mine", setup: { start: `${year}-09-01`, end: `${year + 1}-07-20`, patterns: [blankPattern()], holidays: [] }, stamps: { setup: Date.now() } };
  save();
  go("#/setup");
  toast("Set your bell times, then type your classes into the grid.");
}

function handleUpload(file, statusEl) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const res = readUploadedFile(r.result);
      if (res.kind === "backup") {
        state = res.state;
        save();
        go("#/today");
        toast("Backup restored.");
      } else {
        const mine = state.mode === "mine";
        state = { ...freshState(), ...(mine ? { todos: state.todos, notes: state.notes, homework: state.homework, days: state.days, classes: state.classes, imports: state.imports } : {}), mode: "mine", setup: res.setup, stamps: { setup: Date.now() } };
        save();
        go("#/today");
        toast(`Imported ${res.setup.patterns.length} day pattern${res.setup.patterns.length === 1 ? "" : "s"} and ${classNames().length} classes.`);
      }
    } catch (err) {
      if (statusEl) statusEl.textContent = err.message || "That file couldn't be read.";
    }
  };
  r.readAsText(file);
}

// ---------- events ----------
document.addEventListener("click", (e) => {
  if (handleWorkflowClick(e)) return;
  const a = e.target.closest("[data-action]");
  if (a) {
    const act = a.dataset.action;
    if (act === "start-demo") return startDemo();
    if (act === "start-blank") return startBlank();
    if (handleWorkflowAction(act, a)) return;
    if (handleImportAction(act, a)) return;
    if (handleSetupAction(act, a)) return;
    handleAccountAction(act);
    return;
  }
  const ld = e.target.closest("[data-link-del]");
  if (ld) {
    const n = state.notes[ld.dataset.key];
    if (n && n.links) {
      const removed = n.links.splice(Number(ld.dataset.linkDel), 1)[0];
      const i = Number(ld.dataset.linkDel);
      n.t = Date.now(); save(); route();
      toast("Link removed.", () => { n.links.splice(i, 0, removed); n.t = Date.now(); save(); route(); });
    }
    return;
  }
  const del = e.target.closest("[data-todo-del]");
  if (del) {
    const t = state.todos.find((x) => String(x.id) === del.dataset.todoDel);
    if (t) { t.deleted = true; t.t = Date.now(); }
    save();
    renderTodo();
  }
});

document.addEventListener("change", (e) => {
  const el = e.target;
  if (el.dataset.todo) {
    const t = state.todos.find((x) => String(x.id) === el.dataset.todo);
    if (t) { t.done = el.checked; t.t = Date.now(); save(); }
    return;
  }
  if (el.matches("[data-upload]")) {
    if (el.files[0]) handleUpload(el.files[0], $("#uploadStatus"));
    el.value = "";
    return;
  }
  if (handleWorkflowChange(el)) return;
  if (handleImportChange(el)) return;
  handleSetupChange(el);
});

let noteTimer;
document.addEventListener("input", (e) => {
  const el = e.target;
  if (!el.dataset.note) return;
  const n = (state.notes[el.dataset.note] ||= {});
  n[el.dataset.field] = el.value;
  if (el.dataset.cls) n.cls = el.dataset.cls;
  n.t = Date.now();
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => {
    save();
    const s = $("#savedNote");
    if (s) s.textContent = `Saved at ${new Date().toTimeString().slice(0, 5)}.`;
  }, 400);
});

document.addEventListener("submit", (e) => {
  const auth = e.target.closest("[data-auth]");
  if (auth) { e.preventDefault(); handleAuthSubmit(auth, e.submitter); return; }
  if (handleWorkflowSubmit(e)) return;
  if (handleImportSubmit(e)) return;
  const lf = e.target.closest("[data-link]");
  if (lf) {
    e.preventDefault();
    let url = lf.url.value.trim();
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    try { new URL(url); } catch { toast("That doesn't look like a web address."); return; }
    const n = (state.notes[lf.dataset.link] ||= {});
    (n.links ||= []).push({ url, label: lf.label.value.trim() });
    if (lf.dataset.cls) n.cls = lf.dataset.cls;
    n.t = Date.now();
    save();
    route();
    return;
  }
  const f = e.target.closest("[data-add]");
  if (!f) return;
  e.preventDefault();
  const input = f.querySelector("input");
  const text = input.value.trim();
  if (!text) return;
  state.todos.push({ id: Date.now(), text, when: f.dataset.add, done: false, t: Date.now() });
  save();
  renderTodo();
  const again = document.querySelector(`[data-add="${f.dataset.add}"] input`);
  if (again) again.focus();
});

window.addEventListener("hashchange", () => { route(); window.scrollTo(0, 0); });
initSync();
route();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
