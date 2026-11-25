// Setup: term dates, holidays, day patterns, bell times and the timetable grid.

let confirmReset = false;

function renderSetup() {
  if (state.mode === "new") return renderWelcome();
  const s = setup();
  const names = classNames();
  const keepScroll = window.scrollY;

  const holidays = s.holidays.map((h, i) => `
    <div class="hrow">
      <input aria-label="Holiday name" data-hol="${i}" data-field="label" value="${esc(h.label)}" placeholder="e.g. October half term" />
      <input type="date" aria-label="First day off" data-hol="${i}" data-field="start" value="${esc(h.start)}" />
      <input type="date" aria-label="Last day off" data-hol="${i}" data-field="end" value="${esc(h.end)}" />
      <button class="x" data-action="hol-del" data-i="${i}" aria-label="Remove holiday">×</button>
    </div>`).join("");

  const patterns = s.patterns.map((pat, pi) => {
    const days = [0, 1, 2, 3, 4].map((d) => `<label class="daychk"><input type="checkbox" data-pat-day="${pi}" value="${d}" ${pat.days.includes(d) ? "checked" : ""}/> ${DAY_SHORT[d]}</label>`).join("");
    const periods = pat.periods.map((p, ri) => {
      const bad = p.start && p.end && minutes(p.end) <= minutes(p.start);
      return `<div class="prow ${bad ? "bad" : ""}">
        <input aria-label="Period name" data-per="${pi}:${ri}" data-field="label" value="${esc(p.label)}" />
        <input type="time" aria-label="Start" data-per="${pi}:${ri}" data-field="start" value="${esc(p.start)}" />
        <input type="time" aria-label="End" data-per="${pi}:${ri}" data-field="end" value="${esc(p.end)}" />
        <button class="x" data-action="per-del" data-i="${pi}:${ri}" aria-label="Remove period">×</button>
      </div>`;
    }).join("");
    const sortedDays = pat.days.slice().sort((a, b) => a - b);
    const gridHead = sortedDays.map((d) => `<th>${DAY_SHORT[d]}</th>`).join("");
    const gridRows = pat.periods.map((p) => {
      if (isBreak(p)) return `<tr class="brk"><th scope="row">${esc(p.label)}</th><td colspan="${sortedDays.length}"></td></tr>`;
      const cells = sortedDays.map((d) => {
        const c = pat.grid[`${d}_${p.id}`] || {};
        return `<td><input list="classList" aria-label="${DAY_SHORT[d]} ${esc(p.label)} class" data-cell="${pi}:${d}:${esc(p.id)}" data-field="subject" value="${esc(c.subject || "")}" placeholder="Free" /><input aria-label="${DAY_SHORT[d]} ${esc(p.label)} room" class="room" data-cell="${pi}:${d}:${esc(p.id)}" data-field="room" value="${esc(c.room || "")}" placeholder="Room" /></td>`;
      }).join("");
      return `<tr><th scope="row">${esc(p.label)}<span>${esc(p.start)}</span></th>${cells}</tr>`;
    }).join("");
    return `<section class="panel pattern">
      <div class="pathead">
        <input class="patname" aria-label="Pattern name" data-pat="${pi}" data-field="name" value="${esc(pat.name)}" />
        ${s.patterns.length > 1 ? `<button class="btn ghost small" data-action="pat-del" data-i="${pi}">Remove pattern</button>` : ""}
      </div>
      <div class="days"><span class="muted small">Used on</span> ${days}</div>
      <div class="pcols">
        <div>
          <h4>Bell times</h4>
          <div class="prow head"><span>Name</span><span>Start</span><span>End</span><span></span></div>
          ${periods}
          <button class="btn ghost small" data-action="per-add" data-i="${pi}">Add a period</button>
          <p class="muted small">Name a slot "Break" or "Lunch" and it shows as a divider.</p>
        </div>
        <div class="gridwrap">
          <h4>Timetable</h4>
          ${sortedDays.length ? `<table class="ttgrid"><thead><tr><th></th>${gridHead}</tr></thead><tbody>${gridRows}</tbody></table>` : `<p class="muted">Tick the days this pattern is used on.</p>`}
        </div>
      </div>
    </section>`;
  }).join("");

  const colours = names.map((n) => `<label class="colrow"><input type="color" data-colour="${esc(n)}" value="${esc(colourFor(n))}" /> ${esc(n)}</label>`).join("");
  const unassigned = [0, 1, 2, 3, 4].filter((d) => !s.patterns.some((p) => p.days.includes(d)));

  view.innerHTML = `
    <header class="pagehead"><div><p class="eyebrow">Setup</p><h1>Your timetable</h1></div></header>
    <datalist id="classList">${names.map((n) => `<option value="${esc(n)}">`).join("")}</datalist>

    <section class="panel">
      <h3>Your data</h3>
      ${state.mode === "demo"
        ? `<p>You're using <b>demo data</b>. Import your own timetable to replace it, or start from scratch.</p>`
        : `<p>Saved on this device${state.savedAt ? `, last at ${esc(new Date(state.savedAt).toTimeString().slice(0, 5))}` : ""}. ${sync.user ? `Synced to your account (${esc(sync.user.email)}).` : syncConfigured() ? `<a href="#/account">Sign in</a> to sync it to your other devices.` : ""}</p>`}
      <div class="btnrow">
        <label class="btn">Import a file<input type="file" accept=".json,application/json" data-upload hidden /></label>
        ${state.mode === "demo" ? `<button class="btn ghost" data-action="start-blank">Start from scratch</button>` : `<button class="btn ghost" data-action="backup">Download backup</button>`}
        <button class="btn ghost danger" data-action="reset">${confirmReset ? "Tap again to delete everything" : "Start again"}</button>
      </div>
      <p class="muted small">Import takes a <b>timetable-setup.json</b> from Timetable to Calendar, or a planner backup.</p>
      <p class="status" id="uploadStatus"></p>
    </section>

    <section class="panel">
      <h3>School year</h3>
      <div class="termrow">
        <label class="field"><span>First day of teaching</span><input type="date" data-term="start" value="${esc(s.start)}" /></label>
        <label class="field"><span>Last day of teaching</span><input type="date" data-term="end" value="${esc(s.end)}" /></label>
      </div>
      <h4>Holidays and days off</h4>
      ${holidays || `<p class="muted">None yet. Add half terms, holidays and INSET days.</p>`}
      <button class="btn ghost small" data-action="hol-add">Add a holiday</button>
    </section>

    <h2 class="sub">Day patterns</h2>
    <p class="muted">A pattern is one shape of school day with its own bell times. ${unassigned.length ? `<b class="warn">${unassigned.map((d) => DAY_NAMES[d]).join(", ")} ${unassigned.length === 1 ? "has" : "have"} no pattern yet.</b>` : ""}</p>
    ${patterns}
    <button class="btn ghost" data-action="pat-add">Add another day pattern</button>

    ${names.length ? `<h2 class="sub">Class colours</h2><section class="panel colours">${colours}</section>` : ""}`;
  setActiveNav("setup");
  window.scrollTo(0, keepScroll);
}

function saveSetup() { state.stamps = { ...(state.stamps || {}), setup: Date.now() }; save(); }
function rerenderSetup() { saveSetup(); renderSetup(); }

function handleSetupAction(act, el) {
  const s = setup();
  const [a, b] = String(el.dataset.i || "").split(":").map(Number);
  switch (act) {
    case "hol-add": s.holidays.push({ label: "", start: "", end: "" }); rerenderSetup(); return true;
    case "hol-del": s.holidays.splice(a, 1); rerenderSetup(); return true;
    case "per-add": {
      const ps = s.patterns[a].periods;
      const last = ps[ps.length - 1];
      const start = last ? last.end : "09:00";
      const end = `${pad(Math.min(23, Math.floor((minutes(start) + 60) / 60)))}:${pad((minutes(start) + 60) % 60)}`;
      const n = ps.filter((p) => /^period/i.test(p.label)).length + 1;
      ps.push({ id: newId(), label: `Period ${n}`, start, end });
      rerenderSetup();
      return true;
    }
    case "per-del": {
      const pat = s.patterns[a];
      const [gone] = pat.periods.splice(b, 1);
      for (const k of Object.keys(pat.grid)) if (k.endsWith(`_${gone.id}`)) delete pat.grid[k];
      rerenderSetup();
      return true;
    }
    case "pat-add": {
      const p = blankPattern();
      p.name = "New pattern";
      p.days = [];
      s.patterns.push(p);
      rerenderSetup();
      return true;
    }
    case "pat-del": s.patterns.splice(a, 1); rerenderSetup(); return true;
    case "backup": download(`planner-backup-${iso(today())}.json`, backupJson(state)); return true;
    case "reset":
      if (!confirmReset) {
        confirmReset = true;
        renderSetup();
        setTimeout(() => { if (confirmReset) { confirmReset = false; if (location.hash.startsWith("#/setup")) renderSetup(); } }, 5000);
        return true;
      }
      confirmReset = false;
      clearState();
      state = freshState();
      go("#/today");
      return true;
  }
  return false;
}

function handleSetupChange(el) {
  const s = setup();
  const d = el.dataset;
  if (d.term) { s[d.term] = el.value; saveSetup(); return; }
  if (d.hol !== undefined) { s.holidays[Number(d.hol)][d.field] = el.value; saveSetup(); return; }
  if (d.pat !== undefined && d.field) { s.patterns[Number(d.pat)][d.field] = el.value; saveSetup(); return; }
  if (d.patDay !== undefined) {
    const day = Number(el.value);
    const pat = s.patterns[Number(d.patDay)];
    if (el.checked) {
      for (const other of s.patterns) other.days = other.days.filter((x) => x !== day);
      pat.days.push(day);
    } else {
      pat.days = pat.days.filter((x) => x !== day);
    }
    rerenderSetup();
    return;
  }
  if (d.per !== undefined) {
    const [pi, ri] = d.per.split(":").map(Number);
    s.patterns[pi].periods[ri][d.field] = el.value;
    rerenderSetup();
    return;
  }
  if (d.cell !== undefined) {
    const [pi, day, ...rest] = d.cell.split(":");
    const pid = rest.join(":");
    const pat = s.patterns[Number(pi)];
    const key = `${day}_${pid}`;
    const c = (pat.grid[key] ||= { subject: "", room: "" });
    c[d.field] = el.value.trim();
    if (!c.subject && !c.room) delete pat.grid[key];
    // Fill in the room the class usually uses.
    if (d.field === "subject" && c.subject && !c.room) {
      for (const p of s.patterns) for (const v of Object.values(p.grid)) if (v !== c && v.subject === c.subject && v.room) { c.room = v.room; break; }
      const roomInput = el.parentElement.querySelector(".room");
      if (roomInput && c.room) roomInput.value = c.room;
    }
    saveSetup();
    const dl = $("#classList");
    if (dl) dl.innerHTML = classNames().map((n) => `<option value="${esc(n)}">`).join("");
    return;
  }
  if (d.colour) { state.colours[d.colour] = el.value; saveSetup(); return; }
}
