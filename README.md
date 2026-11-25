# Teacher Planner

A timetable-driven planner for teachers that runs in the browser on a phone, laptop, home desktop or school PC, with nothing to install.

Built in Rapid Application Development cycles: each prototype is used in real school weeks and reviewed before the next one starts.

## Prototype P0: clickable mock-up

P0 shows the main screens with demo classes and real bell times, so the layout can be judged on each device. Nothing is saved.

- **Today**: the day's lessons, registration, break and lunch in time order, with the current lesson highlighted
- **Week**: days across, periods down; Monday and Friday follow a different bell pattern to Tuesday to Thursday
- **Lesson**: plan, Google Slides, Docs and Drive links, homework
- **Classes**: each class's lessons in order
- **To do**: tasks grouped by today, this week, this month and someday
- **Setup**: the day patterns, plus import of a `timetable-setup.json` saved from the [Timetable to Calendar](https://mxcoad.github.io/timetable-to-calendar.html) tool

Buttons for later features (disrupted day, copy lesson, set homework) explain which prototype brings them.

## Running it

Plain HTML, CSS and JavaScript, with no build step. Serve the folder with any static server, for example:

```
python3 -m http.server 8000
```

then open http://localhost:8000. It is installable from Chrome ("Install app" or "Add to home screen") and works offline after the first visit.
