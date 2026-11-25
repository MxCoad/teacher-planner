// Saves the planner on this device (browser localStorage).
// When signed in, sync.js merges this copy with the server copy.

const STORE_KEY = "planner.v1";

function blankSetup() {
  return { start: "", end: "", patterns: [], holidays: [] };
}

function demoSetup() {
  const t = new Date();
  const year = t.getMonth() >= 7 ? t.getFullYear() : t.getFullYear() - 1;
  return {
    ...seedTimetable(),
    start: `${year}-09-03`,
    end: `${year + 1}-07-21`,
    holidays: [
      { label: "October half term", start: `${year}-10-26`, end: `${year}-10-30` },
      { label: "Christmas holiday", start: `${year}-12-21`, end: `${year + 1}-01-01` },
      { label: "February half term", start: `${year + 1}-02-15`, end: `${year + 1}-02-19` },
      { label: "Easter holiday", start: `${year + 1}-03-29`, end: `${year + 1}-04-09` },
      { label: "May half term", start: `${year + 1}-05-31`, end: `${year + 1}-06-04` },
    ],
  };
}

function freshState() {
  return { version: 1, mode: "new", setup: blankSetup(), colours: {}, notes: {}, todos: [], homework: [], days: {}, classes: {}, imports: {}, stamps: {}, savedAt: null };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return freshState();
    const s = JSON.parse(raw);
    return { ...freshState(), ...s, setup: { ...blankSetup(), ...(s.setup || {}) } };
  } catch {
    return freshState();
  }
}

let saveWarned = false;
function saveState(state, opts = {}) {
  if (!opts.quiet && typeof scheduleSync === "function") scheduleSync();
  try {
    state.savedAt = new Date().toISOString();
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
    return true;
  } catch {
    if (!saveWarned) {
      saveWarned = true;
      toast("This browser isn't letting the planner save. Changes will be lost when you close the tab.");
    }
    return false;
  }
}

function clearState() {
  try { localStorage.removeItem(STORE_KEY); } catch {}
}

// A full backup in one JSON file.
function backupJson(state) {
  return JSON.stringify({ app: "teacher-planner", ...state }, null, 2);
}

// Accepts either a planner backup or a Timetable to Calendar "Save setup" file.
function readUploadedFile(text) {
  let c;
  try { c = JSON.parse(text); } catch { throw new Error("That file isn't valid JSON."); }
  if (c && c.app === "teacher-planner") {
    const { app, ...rest } = c;
    return { kind: "backup", state: { ...freshState(), ...rest, setup: { ...blankSetup(), ...(rest.setup || {}) } } };
  }
  return { kind: "setup", setup: parseTimetableSetup(text) };
}
