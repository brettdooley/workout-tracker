# Workouts

A private workout tracker that runs as a Home Screen web app on iPhone.

- Opens to today's workout based on the weekday. Log weight and reps (or seconds), tap ✓, tap Finish.
- All data stays on the phone. Backups go to `workouts.json` in your private GitHub backup repo, or to a file you save.
- This repository contains only the app's code. It contains no workout data.

Files: `index.html`, `styles.css`, `app.js` (screens), `model.js` (data, template text format, records and progress math),
`charts.js` (SVG charts), `backup.js` (GitHub backup), `seed.js` (starting routine), `sw.js` (offline support),
`manifest.webmanifest`, `icons/`.

## Template text format

    # Program: Name
    Start: 2026-11-16
    > Program note

    ## Monday: Lower A
    > Warm-up note
    Weighted Split Squat | 3 x 8-12/leg
    Hollow-Body Hold [timed] | 3 x 20-40s
    Pull-up [bodyweight] | 3 x 3-5 | strict
    Climbing [check] | 90-120 min
    Cycling Intervals [check] | 50-75 min
    ~ Week 1 plan
    ~ Week 2 plan
    + Routine A

    ## Block: Routine A (Daily Mobility)
    Dead Bug [bodyweight] | 1 x 8/side

Tags: `[bodyweight]`, `[timed]`, `[distance]`, `[check]`; no tag means weight × reps.
`/leg` or `/side` marks per-side reps. `~` lines rotate weekly from the Start date. `+ Name` includes a block.

## Updating

Upload the changed files to the repo, wait a minute for GitHub Pages, then fully close the app
(swipe it away) and reopen it with signal. Bump `CACHE` in `sw.js` on every release.
