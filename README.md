# Teacher Planner

A timetable-driven planner for teachers that runs in the browser on a phone, laptop, home desktop or school PC, with nothing to install.

Built in Rapid Application Development cycles: each prototype is used in real school weeks and reviewed before the next one starts.

## Prototype P1: timetable core (current)

Your timetable, term dates, lesson plans and tasks are saved in the browser on the device you use. Syncing between devices arrives in P2.

- **Welcome**: import a `timetable-setup.json` saved from the [Timetable to Calendar](https://mxcoad.github.io/timetable-to-calendar.html) tool, start from scratch, or try demo data
- **Setup**: first and last day of teaching, holidays and days off, day patterns (which weekdays use which bell times), bell times, the timetable grid with class and room, and class colours
- **Today and Week**: built from the timetable; weekends, holidays and days outside term show as days off
- **Lesson**: a title and plan for each lesson, saved as you type
- **Classes**: every lesson of a class from last week to four weeks ahead
- **To do**: tasks saved on the device
- **Backup**: download everything as one file, and restore it with Import

P0 (the clickable mock-up) is in the history of this repository.

## Running it

Plain HTML, CSS and JavaScript, with no build step. Serve the folder with any static server, for example:

```
python3 -m http.server 8000
```

then open http://localhost:8000. It is installable from Chrome ("Install app" or "Add to home screen") and works offline after the first visit.
