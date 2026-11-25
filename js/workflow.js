// Prototype P3: the classroom workflow.
//   - copy a plan to another lesson or class
//   - push a plan (and the ones after it) on by one lesson
//   - disrupted days: push the day's lessons on, with undo
//   - roll a run of plans on into later lessons (next term, next year)
//   - homework set in one lesson, due in a later one, with hand-in ticks
//
// Hand-in ticks use register numbers (1, 2, 3...) rather than names, so no
// pupil data is stored until the school's Data Protection Officer agrees.

const DEFAULT_CLASS_SIZE = 30;

// ---------- lessons of a class, in order ----------
const keyDate = (key) => key.slice(0, 10);
const keyPeriod = (key) => key.slice(11);

// The lesson at a note key, from the current timetable (or null).
function lessonAt(key) {
  if (!validIso(keyDate(key))) return null;
  const d = parseIso(keyDate(key));
  if (dayOff(d)) return null;
  const pat = patternFor(d);
  const p = pat.periods.find((x) => x.id === keyPeriod(key));
  const s = p && slotOf(pat, d, p);
  return s ? { date: d, period: p, key, cls: s.subject.trim(), room: s.room || "" } : null;
}

// Lessons of one class from a date onwards, up to the end of term.
function classLessonsFrom(name, from, max = 500) {
  const out = [];
  const termEnd = validIso(setup().end) ? parseIso(setup().end) : null;
  const end = termEnd && termEnd >= from ? termEnd : addDays(from, 7 * 40);
  for (let d = new Date(from); d <= end && out.length < max; d = addDays(d, 1)) {
    if (dayOff(d)) continue;
    const pat = patternFor(d);
    for (const p of pat.periods) {
      const s = slotOf(pat, d, p);
      if (s && s.subject.trim() === name) out.push({ date: new Date(d), period: p, key: lessonKey(d, p), cls: name });
    }
  }
  return out;
}

// Is lesson l later than (date d, period p)?
const isAfter = (l, d, p) => iso(l.date) > iso(d) || (iso(l.date) === iso(d) && minutes(l.period.start) > minutes(p.start));
const lessonLabel = (l) => `${shortDate(l.date)} · ${l.period.label}`;

// ---------- the plan in a lesson ----------
const demoPlan = (title) => `Starter (10 min): recap last lesson with three quick questions.\nMain (35 min): ${title}: demo, then paired practice.\nPlenary (10 min): exit ticket on mini whiteboards.`;

// What a lesson holds now, including demo content that hasn't been edited.
function planOf(l) {
  const n = state.notes[l.key] || {};
  let { title, plan } = n;
  if (state.mode === "demo" && !n.moved && (title === undefined || plan === undefined)) {
    const c = lessonContent(l.cls, l.date, l.period);
    if (title === undefined) title = c.title;
    if (plan === undefined) plan = demoPlan(title);
  }
  return { title: title || "", plan: plan || "", links: (n.links || []).map((x) => ({ ...x })) };
}
const isEmptyPlan = (p) => !p.title.trim() && !p.plan.trim() && !p.links.length;
const EMPTY_PLAN = { title: "", plan: "", links: [] };

function putPlan(l, p, moved) {
  const old = state.notes[l.key] || {};
  const n = { ...old, title: p.title, plan: p.plan, links: p.links, cls: l.cls, t: Date.now() };
  if (moved) n.moved = moved; else delete n.moved;
  state.notes[l.key] = n;
}

// ---------- undo ----------
// A snapshot keeps the old value of everything a change touches.
let lastUndo = null;
const newSnap = () => ({ notes: {}, days: {} });
function remember(snap, kind, key) {
  if (key in snap[kind]) return;
  const v = state[kind][key];
  snap[kind][key] = v ? structuredClone(v) : null;
}
function offerUndo(msg, snap, extra = {}) {
  lastUndo = { snap, ...extra };
  toast(msg, () => undoLast());
}
function undoLast() {
  if (!lastUndo) return;
  const { snap } = lastUndo;
  const t = Date.now();
  // Restored values get a new time stamp so the undo syncs to other devices.
  for (const kind of ["notes", "days"]) for (const [k, v] of Object.entries(snap[kind])) state[kind][k] = v ? { ...v, t } : { t };
  lastUndo = null;
  save();
  route();
  toast("Undone.");
}

// ---------- push on ----------
// Moves the plan in `start` to the next lesson of the class, and the plan
// there to the one after, until an empty lesson takes up the slack.
function pushOn(start, reason, snap) {
  const seq = classLessonsFrom(start.cls, start.date);
  const i = seq.findIndex((l) => l.key === start.key);
  if (i < 0) return { moved: 0 };
  const run = seq.slice(i);
  let carry = planOf(run[0]);
  remember(snap, "notes", run[0].key);
  putPlan(run[0], EMPTY_PLAN, reason || "Moved on");
  if (isEmptyPlan(carry)) return { moved: 0 };
  for (let j = 1; j < run.length; j++) {
    const next = planOf(run[j]);
    remember(snap, "notes", run[j].key);
    putPlan(run[j], carry);
    if (isEmptyPlan(next)) return { moved: j };
    carry = next;
  }
  return { moved: run.length - 1, dropped: carry.title || "One plan" };
}

function pushOnMessage(res, cls) {
  if (!res.moved && !res.dropped) return `Marked as moved on. There was no plan to move.`;
  let m = `${cls}: ${res.moved} plan${res.moved === 1 ? "" : "s"} moved on by one lesson.`;
  if (res.dropped) m += ` "${res.dropped}" ran past the end of term.`;
  return m;
}

// ---------- copy ----------
function copyPlan(fromKey, toKey) {
  const from = lessonAt(fromKey), to = lessonAt(toKey);
  if (!from || !to) return;
  const snap = newSnap();
  remember(snap, "notes", toKey);
  putPlan(to, planOf(from));
  save();
  offerUndo(`Copied to ${to.cls}, ${lessonLabel(to)}.`, snap);
}

// ---------- roll on ----------
// Every planned lesson of a class between two dates, in order. Uses the
// class saved on the note, so plans survive a timetable change.
function plannedLessons(name, fromIso, toIso) {
  const out = [];
  for (const [key, n] of Object.entries(state.notes)) {
    const k = keyDate(key);
    if (!validIso(k) || k < fromIso || k > toIso || n.moved) continue;
    const here = lessonAt(key);
    const cls = n.cls || (here && here.cls);
    if (cls !== name) continue;
    const l = here || { key, cls, date: parseIso(k), period: { id: keyPeriod(key), label: "", start: "" } };
    const p = planOf({ ...l, cls });
    if (!isEmptyPlan(p)) out.push({ l, p });
  }
  // Demo lessons that were never edited count as planned too.
  if (state.mode === "demo") {
    const seen = new Set(out.map((x) => x.l.key));
    const to = parseIso(toIso);
    for (const l of classLessonsFrom(name, parseIso(fromIso))) {
      if (l.date > to) break;
      if (!seen.has(l.key) && !(state.notes[l.key] || {}).moved) out.push({ l, p: planOf(l) });
    }
  }
  return out.sort((a, b) => a.l.key.slice(0, 10).localeCompare(b.l.key.slice(0, 10)) || minutes(a.l.period.start) - minutes(b.l.period.start));
}

function rollOn(srcClass, fromIso, toIso, dstClass, startIso) {
  const src = plannedLessons(srcClass, fromIso, toIso);
  if (!src.length) { toast(`No plans for ${srcClass} between ${longDate(fromIso)} and ${longDate(toIso)}.`); return; }
  const targets = classLessonsFrom(dstClass, parseIso(startIso), src.length);
  if (!targets.length) { toast(`${dstClass} has no lessons from ${longDate(startIso)}.`); return; }
  const snap = newSnap();
  targets.forEach((l, i) => { remember(snap, "notes", l.key); putPlan(l, src[i].p); });
  save();
  rollOpen = false;
  route();
  const short = src.length > targets.length ? ` ${src.length - targets.length} didn't fit before the end of term.` : "";
  offerUndo(`Copied ${targets.length} plan${targets.length === 1 ? "" : "s"} into ${dstClass} from ${shortDate(targets[0].date)}.${short}`, snap);
}

// ---------- disrupted days ----------
let disruptOpen = null; // the date whose "disrupted" form is open
let rollOpen = false;

const dayInfo = (d) => { const x = state.days[iso(d)]; return x && x.on ? x : null; };

function disruptPanel(d, pat) {
  const k = iso(d);
  const info = dayInfo(d);
  if (disruptOpen !== k) {
    return `<div class="panel">
      <h3>Day pattern</h3>
      <p>${esc(pat.name)}</p>
      <button class="btn ghost" data-action="disrupt-open" data-day="${k}">Mark this day as disrupted</button>
      <p class="muted small">Exams, trips, snow days: push the lessons you lose on to the next lesson of each class.</p>
    </div>`;
  }
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const isToday = k === iso(today());
  const rows = pat.periods.map((p) => {
    const s = slotOf(pat, d, p);
    if (!s) return "";
    const l = { date: d, period: p, key: lessonKey(d, p), cls: s.subject.trim() };
    const moved = (state.notes[l.key] || {}).moved;
    const past = isToday && minutes(p.end) <= nowMin;
    const title = planOf(l).title;
    return `<li><label><input type="checkbox" name="k" value="${esc(l.key)}" ${moved ? "disabled" : past ? "" : "checked"} />
      <span><b>${esc(p.label)}</b> ${esc(l.cls)}${title ? `: ${esc(title)}` : ""}${moved ? ` <span class="muted">(already moved on)</span>` : ""}</span></label></li>`;
  }).join("");
  return `<div class="panel disrupt">
    <h3>Disrupted day</h3>
    <form data-disrupt="${k}">
      <label class="field"><span>What's happening?</span><input name="reason" value="${esc(info ? info.reason : "")}" placeholder="Mock exams, trip, snow day..." /></label>
      <p class="small muted">Each ticked lesson's plan moves to that class's next lesson, and the plans after it move on too, until a lesson with no plan takes up the slack.</p>
      <ul class="checks">${rows || `<li class="muted">No lessons on this day.</li>`}</ul>
      <div class="btnrow"><button class="btn">Push ticked lessons on</button><button type="button" class="btn ghost" data-action="disrupt-cancel">Cancel</button></div>
    </form>
  </div>`;
}

function disruptNotice(d) {
  const info = dayInfo(d);
  if (!info) return "";
  const canUndo = lastUndo && lastUndo.day === iso(d);
  return `<div class="notice"><span><b>Disrupted day</b>${info.reason ? `: ${esc(info.reason)}` : ""}</span>
    <span class="btnrow">${canUndo ? `<button class="btn small" data-action="undo">Undo the shuffle</button>` : ""}<button class="btn ghost small" data-action="undisrupt" data-day="${iso(d)}">Remove the label</button></span></div>`;
}

function submitDisrupt(form) {
  const k = form.dataset.disrupt;
  const reason = form.reason.value.trim();
  const keys = [...form.querySelectorAll("input[name=k]:checked")].map((x) => x.value);
  const snap = newSnap();
  remember(snap, "days", k);
  state.days[k] = { on: true, reason, t: Date.now() };
  let moved = 0;
  const notes = [];
  for (const key of keys) {
    const l = lessonAt(key);
    if (!l) continue;
    const res = pushOn(l, reason || "Disrupted day", snap);
    moved += res.moved;
    if (res.dropped) notes.push(`${l.cls}'s last plan ran past the end of term`);
  }
  save();
  disruptOpen = null;
  route();
  const msg = keys.length ? `${keys.length} lesson${keys.length === 1 ? "" : "s"} pushed on (${moved} plan${moved === 1 ? "" : "s"} moved).${notes.length ? " " + notes.join("; ") + "." : ""}` : "Day marked as disrupted.";
  offerUndo(msg, snap, { day: k });
}

// ---------- homework ----------
const classSize = (name) => ((state.classes[name] || {}).size || DEFAULT_CLASS_SIZE);
const hwList = () => state.homework.filter((h) => !h.deleted);
const hwDue = (h) => keyDate(h.dueKey || "") || "";
const handedCount = (h) => (h.handed || []).filter((n) => n <= classSize(h.cls)).length;

function hwWhen(key) {
  const l = lessonAt(key);
  if (l) return lessonLabel(l);
  return validIso(keyDate(key)) ? shortDate(parseIso(keyDate(key))) : "";
}

function hwCard(h) {
  const size = classSize(h.cls), n = handedCount(h);
  const overdue = !h.closed && hwDue(h) < iso(today()) && n < size;
  return `<a class="hwcard ${h.closed ? "closed" : ""}" href="#/homework/${encodeURIComponent(h.id)}" style="--c:${colourFor(h.cls)}">
    <span class="row1"><span class="cls">${esc(h.cls)}</span><span class="meta ${overdue ? "warn" : ""}">Due ${esc(hwWhen(h.dueKey))}</span></span>
    <span class="title">${esc(h.text)}</span>
    <span class="bar" aria-hidden="true"><span style="width:${Math.round((100 * n) / size)}%"></span></span>
    <span class="meta">${n} of ${size} handed in${h.closed ? " · finished" : ""}</span>
  </a>`;
}

// The homework panel on a lesson page.
function homeworkPanel(l) {
  const due = hwList().filter((h) => h.dueKey === l.key);
  const set = hwList().filter((h) => h.setKey === l.key);
  const later = classLessonsFrom(l.cls, l.date, 12).filter((x) => isAfter(x, l.date, l.period)).slice(0, 8);
  return `<section class="panel">
    <h3>Homework</h3>
    ${due.length ? `<p class="small muted">Due in this lesson</p><div class="hwmini">${due.map(hwCard).join("")}</div>` : ""}
    ${set.length ? `<p class="small muted">Set in this lesson</p><div class="hwmini">${set.map(hwCard).join("")}</div>` : ""}
    ${!due.length && !set.length ? `<p class="muted">None set or due in this lesson.</p>` : ""}
    ${later.length ? `<form class="hwform" data-hw-set="${esc(l.key)}">
      <input name="text" placeholder="Set homework: what should they do?" aria-label="Homework" required />
      <label class="field"><span>Due</span><select name="due">${later.map((x) => `<option value="${esc(x.key)}">${esc(lessonLabel(x))}</option>`).join("")}</select></label>
      <button class="btn ghost">Set homework</button>
    </form>` : `<p class="muted small">No later lessons this term to set it for.</p>`}
  </section>`;
}

let hwFilter = "open";
function renderHomework(id) {
  if (id) return renderHomeworkItem(id);
  const all = hwList().slice().sort((a, b) => hwDue(a).localeCompare(hwDue(b)));
  const open = all.filter((h) => !h.closed), done = all.filter((h) => h.closed).reverse();
  const list = hwFilter === "open" ? open : done;
  view.innerHTML = `
    <header class="pagehead"><div><p class="eyebrow">Homework</p><h1>Homework and hand-ins</h1></div>
      <nav class="stepper" aria-label="Show"><button class="btn ${hwFilter === "open" ? "" : "ghost"}" data-action="hw-filter" data-f="open">Open (${open.length})</button><button class="btn ${hwFilter === "done" ? "" : "ghost"}" data-action="hw-filter" data-f="done">Finished (${done.length})</button></nav>
    </header>
    <p class="muted">Set homework from a lesson page. Ticks use register numbers, not names.</p>
    ${list.length ? `<div class="hwgrid">${list.map(hwCard).join("")}</div>` : `<div class="empty"><p>${hwFilter === "open" ? "No homework waiting for hand-ins." : "Nothing finished yet."}</p><a class="btn" href="#/today">Go to today's lessons</a></div>`}`;
  setActiveNav("homework");
}

function renderHomeworkItem(id) {
  const h = hwList().find((x) => String(x.id) === String(id));
  if (!h) { view.innerHTML = `<div class="empty"><p>That homework has gone.</p><a class="btn" href="#/homework">All homework</a></div>`; return; }
  const size = classSize(h.cls);
  const handed = new Set(h.handed || []);
  const ticks = Array.from({ length: size }, (_, i) => i + 1).map((n) => `<button class="tick" data-hw-tick="${esc(h.id)}" data-n="${n}" aria-pressed="${handed.has(n)}">${n}</button>`).join("");
  const set = lessonAt(h.setKey);
  const later = set ? classLessonsFrom(h.cls, set.date, 30).filter((x) => isAfter(x, set.date, set.period)) : [];
  if (!later.some((x) => x.key === h.dueKey)) later.unshift({ key: h.dueKey, date: parseIso(hwDue(h)), period: { label: hwWhen(h.dueKey) }, cls: h.cls, odd: true });
  view.innerHTML = `
    <header class="pagehead lessonhead" style="--c:${colourFor(h.cls)}">
      <div><p class="eyebrow"><a href="#/homework">Homework</a> · <a href="#/class/${encodeURIComponent(h.cls)}">${esc(h.cls)}</a></p>
      <h1>${esc(h.text)}</h1>
      <p class="muted">Set ${esc(hwWhen(h.setKey))} · Due ${esc(hwWhen(h.dueKey))}</p></div>
      ${set ? `<a class="btn ghost" href="#/lesson/${iso(set.date)}/${encodeURIComponent(set.period.id)}">Lesson it was set in</a>` : ""}
    </header>
    <div class="lessongrid">
      <section class="panel">
        <h3>Hand-ins: <span id="hwCount">${handedCount(h)}</span> of ${size}</h3>
        <p class="muted small">Tap a register number when that pupil hands it in.</p>
        <div class="ticks">${ticks}</div>
        <div class="btnrow"><button class="btn ghost small" data-action="hw-all" data-id="${esc(h.id)}">Tick everyone</button><button class="btn ghost small" data-action="hw-none" data-id="${esc(h.id)}">Clear ticks</button></div>
      </section>
      <aside>
        <section class="panel">
          <h3>Details</h3>
          <label class="field"><span>Homework</span><input data-hw-edit="${esc(h.id)}" data-field="text" value="${esc(h.text)}" /></label>
          <label class="field"><span>Due</span><select data-hw-edit="${esc(h.id)}" data-field="dueKey">${later.map((x) => `<option value="${esc(x.key)}" ${x.key === h.dueKey ? "selected" : ""}>${esc(x.odd ? x.period.label : lessonLabel(x))}</option>`).join("")}</select></label>
          <label class="field"><span>Pupils in ${esc(h.cls)}</span><input type="number" min="1" max="60" data-class-size="${esc(h.cls)}" value="${size}" /></label>
        </section>
        <section class="panel actions">
          <button class="btn" data-action="hw-close" data-id="${esc(h.id)}">${h.closed ? "Reopen" : "Finished: stop chasing"}</button>
          <button class="btn ghost danger" data-action="hw-del" data-id="${esc(h.id)}">Delete this homework</button>
        </section>
      </aside>
    </div>`;
  setActiveNav("homework");
}

function touchHw(h) { h.t = Date.now(); save(); }

// ---------- roll-on panel on the class page ----------
function rollPanel(name) {
  if (!rollOpen) return "";
  const t = today();
  const s = setup();
  const next = classLessonsFrom(name, t, 1)[0];
  const names = classNames();
  return `<section class="panel roll">
    <h3>Roll lessons on</h3>
    <p class="muted small">Copies every planned lesson in a date range, in order, into the lessons of a class from a start date. Use it to reuse this year's plans next year, or to give a parallel class the same sequence. Lessons that already have a plan are replaced; Undo puts them back.</p>
    <form data-roll="${esc(name)}" class="rollform">
      <label class="field"><span>Plans from</span><input type="date" name="from" value="${esc(validIso(s.start) ? s.start : iso(addDays(t, -28)))}" required /></label>
      <label class="field"><span>up to</span><input type="date" name="to" value="${esc(iso(t))}" required /></label>
      <label class="field"><span>Into class</span><select name="dst">${names.map((n) => `<option ${n === name ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></label>
      <label class="field"><span>Starting from</span><input type="date" name="start" value="${esc(next ? iso(next.date) : iso(t))}" required /></label>
      <div class="btnrow"><button class="btn">Copy the plans</button><button type="button" class="btn ghost" data-action="roll-close">Cancel</button></div>
    </form>
  </section>`;
}

// ---------- events ----------
function handleWorkflowAction(act, el) {
  switch (act) {
    case "disrupt-open": disruptOpen = el.dataset.day; route(); return true;
    case "disrupt-cancel": disruptOpen = null; route(); return true;
    case "undisrupt": {
      const snap = newSnap();
      remember(snap, "days", el.dataset.day);
      state.days[el.dataset.day] = { on: false, t: Date.now() };
      save(); route();
      offerUndo("Label removed. Plans stay where they are: use Undo on the shuffle to move them back.", snap);
      return true;
    }
    case "undo": undoLast(); return true;
    case "push-on": {
      const l = lessonAt(el.dataset.key);
      if (!l) return true;
      const snap = newSnap();
      const res = pushOn(l, "Moved on", snap);
      save(); route();
      offerUndo(pushOnMessage(res, l.cls), snap);
      return true;
    }
    case "copy": {
      const sel = $("#copyTarget");
      if (sel && sel.value) { copyPlan(el.dataset.key, sel.value); }
      return true;
    }
    case "roll-open": rollOpen = true; route(); return true;
    case "roll-close": rollOpen = false; route(); return true;
    case "hw-filter": hwFilter = el.dataset.f; route(); return true;
  }
  const h = el.dataset.id && state.homework.find((x) => String(x.id) === el.dataset.id);
  if (!h) return false;
  if (act === "hw-all") { h.handed = Array.from({ length: classSize(h.cls) }, (_, i) => i + 1); touchHw(h); route(); return true; }
  if (act === "hw-none") { h.handed = []; touchHw(h); route(); return true; }
  if (act === "hw-close") { h.closed = !h.closed; touchHw(h); route(); toast(h.closed ? "Marked as finished." : "Reopened."); return true; }
  if (act === "hw-del") {
    h.deleted = true; touchHw(h); go("#/homework");
    toast("Homework deleted.", () => { h.deleted = false; touchHw(h); route(); });
    return true;
  }
  return false;
}

function handleWorkflowClick(e) {
  const tk = e.target.closest("[data-hw-tick]");
  if (!tk) return false;
  const h = state.homework.find((x) => String(x.id) === tk.dataset.hwTick);
  if (!h) return true;
  const n = Number(tk.dataset.n);
  const set = new Set(h.handed || []);
  if (set.has(n)) set.delete(n); else set.add(n);
  h.handed = [...set].sort((a, b) => a - b);
  touchHw(h);
  tk.setAttribute("aria-pressed", String(set.has(n)));
  const c = $("#hwCount");
  if (c) c.textContent = handedCount(h);
  return true;
}

function handleWorkflowSubmit(e) {
  const f = e.target;
  if (f.dataset.disrupt) { e.preventDefault(); submitDisrupt(f); return true; }
  if (f.dataset.roll) {
    e.preventDefault();
    const from = f.from.value, to = f.to.value, start = f.start.value;
    if (!validIso(from) || !validIso(to) || !validIso(start) || to < from) { toast("Check the dates: the range needs a start and an end, in order."); return true; }
    rollOn(f.dataset.roll, from, to, f.dst.value, start);
    return true;
  }
  if (f.dataset.hwSet) {
    e.preventDefault();
    const l = lessonAt(f.dataset.hwSet);
    const text = f.text.value.trim();
    if (!l || !text) return true;
    state.homework.push({ id: `hw-${Date.now().toString(36)}-${newId()}`, cls: l.cls, text, setKey: l.key, dueKey: f.due.value, handed: [], closed: false, t: Date.now() });
    save();
    route();
    toast(`Homework set for ${l.cls}, due ${hwWhen(f.due.value)}.`);
    return true;
  }
  return false;
}

function handleWorkflowChange(el) {
  if (el.dataset.classSize) {
    const n = Math.max(1, Math.min(60, Math.round(Number(el.value) || DEFAULT_CLASS_SIZE)));
    state.classes[el.dataset.classSize] = { ...(state.classes[el.dataset.classSize] || {}), size: n, t: Date.now() };
    save();
    route();
    return true;
  }
  if (el.dataset.hwEdit) {
    const h = state.homework.find((x) => String(x.id) === el.dataset.hwEdit);
    if (!h) return true;
    const v = el.value.trim();
    if (el.dataset.field === "text" && !v) { el.value = h.text; return true; }
    h[el.dataset.field] = v;
    touchHw(h);
    if (el.dataset.field === "dueKey") route();
    return true;
  }
  return false;
}
