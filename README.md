# Teacher Planner

A timetable-driven planner for teachers that runs in the browser on a phone, laptop, home desktop or school PC, with nothing to install.

Built in Rapid Application Development cycles: each prototype is used in real school weeks and reviewed before the next one starts.

## Prototype P2: sign-in, sync and links (current)

- **Account**: sign in with email and password on each device; the planner syncs between them
- **Works offline**: every change is saved on the device first and synced when you're back online; for each lesson note, task and the setup, the most recent edit wins
- **Lesson links**: paste Google Slides, Docs, Sheets, Drive, Classroom, YouTube or any web link; the day view shows how many each lesson has
- **Shared computers**: "Sign out and clear this device" removes the planner from that browser
- **Delete my planner from the server** on the Account page
- Demo data is never uploaded

### Setting up Supabase (once)

1. Create a Supabase project in the London region.
2. In **SQL Editor**, run [`supabase/setup.sql`](supabase/setup.sql). It creates one table with row-level security, so each user can only read their own planner.
3. In **Authentication → URL Configuration**, set the Site URL to the address of the planner (for example `https://mxcoad.github.io/teacher-planner/`).
4. Put the Project URL and the anon / publishable key in [`js/config.js`](js/config.js). Never put the service_role or secret key in this repository.

Without a config the planner still works, saved on the device only.

## Prototype P1: timetable core

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
