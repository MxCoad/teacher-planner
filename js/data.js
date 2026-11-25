// Prototype P0 data. Nothing here is saved: it lives in memory until the page reloads.
//
// The timetable uses the same shape as the "Save setup" file from the
// Timetable to Calendar tool, so a file saved there can be imported here:
//   { patterns: [{ id, name, days: [0..4], periods: [{ id, label, start, end }],
//                  grid: { "<day>_<periodId>": { subject, room } } }], holidays: [...] }
// Day 0 is Monday.

const P = (id, label, start, end) => ({ id, label, start, end });

// Bell times from Mike's own timetable tool. Classes are dummy data.
const tueThu = {
  id: "std",
  name: "Standard (Tue–Thu)",
  days: [1, 2, 3],
  periods: [
    P("s-amreg", "AM Reg", "08:30", "08:40"),
    P("s-p1", "Period 1", "08:40", "09:40"),
    P("s-p2", "Period 2", "09:40", "10:40"),
    P("s-break", "Break", "10:40", "11:05"),
    P("s-pmreg", "PM Reg", "11:05", "11:30"),
    P("s-p3", "Period 3", "11:30", "12:30"),
    P("s-p4", "Period 4", "12:30", "13:30"),
    P("s-lunch", "Lunch", "13:30", "14:20"),
    P("s-p5", "Period 5", "14:20", "15:20"),
    P("s-p6", "Period 6", "15:20", "16:20"),
  ],
  grid: {},
};

const monFri = {
  id: "mf",
  name: "Monday & Friday",
  days: [0, 4],
  periods: [
    P("m-amreg", "AM Reg", "08:30", "08:40"),
    P("m-p1", "Period 1", "08:40", "09:40"),
    P("m-p2", "Period 2", "09:40", "10:40"),
    P("m-break", "Break", "10:40", "11:05"),
    P("m-p3", "Period 3", "11:05", "12:05"),
    P("m-p4", "Period 4", "12:05", "13:05"),
    P("m-pmreg", "PM Reg", "13:05", "13:15"),
    P("m-lunch", "Lunch", "13:15", "14:05"),
    P("m-p5", "Period 5", "14:05", "15:05"),
    P("m-p6", "Period 6", "15:05", "16:05"),
  ],
  grid: {},
};

const ROOMS = {
  "7C1 Computing": "D14",
  "8A2 Computing": "D14",
  "9B3 Computing": "D14",
  "10B GCSE CS": "D12",
  "11A GCSE CS": "D12",
  "12A A-Level CS": "D11",
  "13 BTEC IT": "D10",
  "Tutor 10D": "D12",
};

// day -> [P1..P6] (null = free period)
const WEEK = {
  0: ["8A2 Computing", "10B GCSE CS", null, "12A A-Level CS", "7C1 Computing", null],
  1: ["7C1 Computing", "10B GCSE CS", "12A A-Level CS", null, "9B3 Computing", "11A GCSE CS"],
  2: ["11A GCSE CS", null, "13 BTEC IT", "8A2 Computing", "12A A-Level CS", null],
  3: ["9B3 Computing", "12A A-Level CS", null, "10B GCSE CS", "13 BTEC IT", "7C1 Computing"],
  4: ["8A2 Computing", "11A GCSE CS", "13 BTEC IT", null, "10B GCSE CS", null],
};

function seedTimetable() {
  const patterns = [structuredClone(tueThu), structuredClone(monFri)];
  for (const pat of patterns) {
    const teaching = pat.periods.filter((p) => /^period/i.test(p.label));
    for (const d of pat.days) {
      WEEK[d].forEach((subject, i) => {
        if (subject) pat.grid[`${d}_${teaching[i].id}`] = { subject, room: ROOMS[subject] };
      });
      const reg = pat.periods.find((p) => p.label === "AM Reg");
      pat.grid[`${d}_${reg.id}`] = { subject: "Tutor 10D", room: ROOMS["Tutor 10D"] };
    }
  }
  return { patterns, holidays: [] };
}

// Units of work per class. A slot's lesson is picked by counting how many
// lessons that class has had since the start of term.
const UNITS = {
  "7C1 Computing": {
    unit: "Algorithms and flowcharts",
    lessons: ["What is an algorithm?", "Sequencing instructions", "Drawing flowcharts", "Selection in flowcharts", "Loops in flowcharts", "Unit check-in quiz"],
  },
  "8A2 Computing": {
    unit: "Programming in Python 1",
    lessons: ["print() and input()", "Variables and data types", "If statements", "Comparison operators", "While loops", "Mini project: guessing game"],
  },
  "9B3 Computing": {
    unit: "Networks and the internet",
    lessons: ["What is a network?", "LANs and WANs", "Packets and protocols", "IP addresses", "Staying safe online", "Assessment"],
  },
  "10B GCSE CS": {
    unit: "Data representation",
    lessons: ["Binary to denary", "Binary addition", "Hexadecimal", "Characters: ASCII and Unicode", "Images and resolution", "Sound sampling", "Compression"],
  },
  "11A GCSE CS": {
    unit: "Programming techniques",
    lessons: ["Arrays and lists", "2D arrays", "String handling", "File handling", "Subroutines", "Robust programs", "Exam practice"],
  },
  "12A A-Level CS": {
    unit: "Fundamentals of data structures",
    lessons: ["Stacks", "Queues", "Linked lists", "Hash tables", "Graphs", "Trees", "Big O notation", "Past paper questions"],
  },
  "13 BTEC IT": {
    unit: "Unit 5: Data modelling",
    lessons: ["Spreadsheet formulae", "Lookups", "Conditional formatting", "What-if analysis", "Assignment drafting", "Assignment drafting (cont.)"],
  },
  "Tutor 10D": {
    unit: "Tutor time",
    lessons: ["Register and notices", "Reading programme", "Quiz of the week", "PSHE activity", "Register and notices"],
  },
};

const TODOS_SEED = [
  { id: 1, text: "Print Year 10 binary worksheets", when: "today", done: false },
  { id: 2, text: "Email IT about the planner site on the school network", when: "today", done: false },
  { id: 3, text: "Mark 11A file handling homework", when: "week", done: false },
  { id: 4, text: "Book laptops for 9B3 networks practical", when: "week", done: true },
  { id: 5, text: "Year 12 mock paper: write mark scheme", when: "month", done: false },
  { id: 6, text: "Rewrite KS3 Python unit for next year", when: "someday", done: false },
];

// Read a "Save setup" file from the Timetable to Calendar tool.
function parseTimetableSetup(text) {
  const c = JSON.parse(text);
  if (!c || !Array.isArray(c.patterns) || !c.patterns.length) {
    throw new Error("That file doesn't look like a saved setup from Timetable to Calendar.");
  }
  let n = 0;
  const id = () => `imp-${++n}`;
  return {
    start: c.start || "",
    end: c.end || "",
    patterns: c.patterns.map((p) => ({
      id: p.id || id(),
      name: p.name || "Pattern",
      days: Array.isArray(p.days) ? p.days : [],
      grid: p.grid || {},
      periods: (p.periods || []).map((pd) => ({ id: pd.id || id(), label: pd.label || "", start: pd.start || "", end: pd.end || "" })),
    })),
    holidays: (c.holidays || []).map((h) => ({ label: h.label || "", start: h.start || "", end: h.end || "" })),
  };
}
