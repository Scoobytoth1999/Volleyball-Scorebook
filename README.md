# Volleyball Scorebook

Offline volleyball game book that keeps score rally by rally and prints the official scoresheet as a PDF.
There are two versions, kept separate on purpose:

| Folder | What it is | Who uses it | Status |
|---|---|---|---|
| `cranbrook/` | Hosted iPad web app (PWA) | Mike / Cranbrook 7th grade | Live, v4 |
| `retail/` | Single HTML file for Chrome/Edge on laptops | TpT buyers ("Digital Volleyball Scorebook") | Released build, no in-game lineup edit yet |

Both share the same design: an event-sourced scorer (`core.js`, the `SB` module) plus a UI layer (`ui.js`).
Each set stores a lineup and a list of events, and `SB.replay(game, setIndex)` rebuilds the score,
rotation, server, subs, notes and sanctions from them. Undo, the editable log and the lineup editor all work by
changing the events or the lineup and replaying.

## Repo layout

```
cranbrook/
  hosted/        exact files served at /sb/ on Macaly (index.html, sw.js, core.js, ui.js, style.css, jspdf, icons, manifest)
  src/           source: core.js, ui.js, style.css, shell.html
  build.py       builds Volleyball_Scorebook.html (single-file copy for local testing; git-ignored)
retail/
  src/           retail source (forked from Cranbrook v3; generic branding, laptop layout)
  build.py       builds dist/Digital_Volleyball_Scorebook.html
  dist/          the built product file
  package/       what's uploaded to TpT: the zip, product/ (HTML, Quick-Start Guide, sample sheets),
                 listing/ (thumbnails, preview video, Preview.pdf) and Listing_Text.txt
vendor/
  jspdf.umd.min.js   jsPDF 2.5.1, inlined by both builds
tools/
  guide/         Quick-Start Guide source (guide.html + screenshots) and render_guide.py
  listing/       TpT thumbnail source (thumbs.html + screenshots)
  video/         video.py: records the captioned preview video with Playwright
  tests/         Playwright and Node scripts used for testing and seeding sample matches
```

Tool scripts were written during development and use absolute paths under
`/home/claude/volleyball-scorebook/`. Clone there, or update the paths. They expect Playwright with Chromium.

## Building

```
python3 cranbrook/build.py   # -> cranbrook/Volleyball_Scorebook.html
python3 retail/build.py      # -> retail/dist/Digital_Volleyball_Scorebook.html
```

## Hosting the Cranbrook version

The app runs from two places. Saved games stay in the browser, so each address keeps its own games.

- **GitHub Pages** (for school iPads; GitHub sites are approved by the school filter):
  https://scoobytoth1999.github.io/Volleyball-Scorebook/ redirects to `cranbrook/hosted/index.html`.
  Pages serves `main` from the repo root, so pushing to `main` deploys. `.nojekyll` turns off Jekyll processing.
- **Macaly** (the original host, used by the existing iPad icon). Details below.

### Deploying to Macaly

- App: chat ID `rsf4asx7j0a1xrwl5svy1jfx`, live at https://rsf4asx7j0a1xrwl5svy1jfx.macaly.app/sb/index.html
- Static files live in `public/sb/` in the Macaly project; the root route redirects there.
- For a new version N:
  1. Copy `cranbrook/src/{core.js,ui.js,style.css}` to `cranbrook/hosted/`.
  2. In `hosted/index.html`, bump the `?v=N` query strings.
  3. In `hosted/sw.js`, bump `VERSION = 'scorebook-vN'` and the `?v=N` entries in `FILES`.
  4. Copy the files into the Macaly project's `public/sb/`, commit with a file write, publish, and check the live files.
  5. Commit to `main`, and add the version and its commit to the list below.
- On the iPad: open the Scorebook icon on Wi-Fi, close it fully, and reopen it to pick up the new version.

## Versions

Each version's commit holds the hosted files exactly as deployed:

- **v1** (`a3bc83b`): offline PWA, MHSAA scoring, PDF output, saved games
- **v2** (`b6a6766`): level presets (4th grade to college), set 3 to 15, number keypad, Copy from set, live log, team colors, Start new match
- **v3** (`d67135f`): MHSAA or AAU scoresheet style, More menu (replay, penalty, card), captain, court-position lineup entry (I–VI)
- **v4** (`561ff0b`): **Edit lineup** button next to Undo, so the current set's lineup, libero and captain can be fixed mid-game.
  Mistyped numbers are renamed in that set's subs and cards, and the sheet notes "Lineup corrected at X–Y".

To roll the hosted app back: `git checkout <commit> -- cranbrook/hosted`, then deploy those files.

## Retail product

- Seller: Mike Toth. Support: oaklandballistics@gmail.com
- Chrome or Edge on Windows, Mac or Chromebook. Not for iPad.
- Pricing notes are in the Claude project doc `digital-volleyball-scorebook-tpt-launch.md`.
- After a retail change: rebuild, re-render the guide and thumbnails if screens changed, then rebuild `package/Digital_Volleyball_Scorebook.zip`.

Note: this repo is public, and `retail/` contains the product sold on TpT.
