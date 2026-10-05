# Exam UI Overhaul — Design

Date: 2026-10-05
Status: Approved in conversation, pending written review
Supersedes: nothing. Extends `2026-10-05-servicenow-exam-taker-design.md`.

## Problem

The app is functionally correct but reads as a 2014 web form. The `index.html`
stylesheet is 100 lines of flat defaults: `1px solid #d9d9d9` borders, three
different border radii, no focus styling anywhere, and `#f5f6f7` panels doing the
work of hierarchy. On top of that, several interactions work against the person
taking the exam:

- Every pick calls `drawQuestion()`, which replaces the whole view's markup and
  calls `scrollTo(0, 0)`. Selecting an answer on a long question scrolls the page
  back to the top, on every click.
- The header timer is `aria-live="polite"` and its text changes once a second, so
  a screen reader re-announces the clock every second for ninety minutes.
- Clicking History or Stats mid-exam leaves the attempt alive and the clock
  running on a hidden view, with no way back except editing the URL.
- Starting a new attempt from Setup while one is live silently overwrites it and
  loses every answer.
- Home carries a title, one sentence and a Start button. It does not say how the
  last attempt went.
- There is no keyboard path to answering. For a timed ninety-minute exam, mouse
  work is the wrong default.
- A reload mid-exam always lands on question 1, discarding the candidate's place.

## Goal

Calm, legible, keyboard-first. The question is the only thing on screen that
should compete for attention. Four areas change: the visual system, dark mode,
keyboard answering (which forces an in-place patch layer), and the home screen
with a resume flow.

## Constraints carried forward

Unchanged from the base design and still binding: single self-contained
`index.html` for the app, ES5-shaped JS (`var`, function expressions, no arrow
functions, no `const`/`let`, no template literals), no ES modules, no
dependencies, no build step, `file://` must work, all `localStorage` through
`SN.Store`, no new question fields, no change to scoring.

The delivery bundle stays exactly three files: `index.html`, `questions.json`,
`questions.js`. This is why the CSS is not split into `app.css`.

## Out of Scope

Explicitly declined during brainstorming, and not touched by this work:

- Results, history and stats screen rework. They get the new visual system and
  nothing else — same markup shape, same content.
- Restructuring the exam screen. The question, choices, palette and button row
  stay in that order and roughly that layout. Restyling is in scope; moving
  things around is not.
- Per-domain or per-topic analytics, explanations, remediation text.
- Any change to scoring, the draw algorithm, or the four existing storage keys'
  meaning.

---

## Visual System

### Approach

The `<style>` block becomes a token layer followed by component classes. Calm
study mode: fewer edges, more air, less contrast between elements that do not
need to differ. Chosen over a neutral "clinical" treatment (which stays close to
today) and a branded high-contrast one (which fights the question text for
attention).

`font` stays on the system stack. No web fonts, nothing to download, nothing to
break offline.

### Tokens

Light values in bare `:root`. Radii, spacing and motion in the same block.

```
--bg: #faf9f7            /* warm off-white; pure white is harsh for 90 minutes */
--surface: #ffffff
--surface-2: #f2f1ee
--ink: #1c1f1e
--muted: #5f6663         /* 5.9:1 on --bg; the current #4f5c62 was fine, this is warmer */
--line: #e4e2dd
--line-strong: #cfccc5   /* inputs need to be visible, cards do not */
--brand: #004f65         /* unchanged from today */
--on-brand: #ffffff
--brand-soft: #e8f0f2
--focus: #0b6fa4
--good: #1c6b3c          /* unchanged; pass */
--good-bg: #e4f2ea       /* unchanged */
--bad: #a4262c           /* unchanged; fail */
--bad-bg: #fbeaeb        /* unchanged */
--warn-bg: #fdf3d8       /* unchanged; notice strip */
--warn-ink: #6b5310      /* unchanged */
--shadow: 0 1px 2px rgba(28,31,30,.05), 0 1px 3px rgba(28,31,30,.04)

--r: 10px               /* cards, dialog */
--r-sm: 6px             /* buttons, inputs, badges, palette cells */

--s1: 4px  --s2: 8px  --s3: 12px --s4: 16px
--s5: 24px --s6: 32px --s7: 48px

--t: 120ms              /* transition duration; see prefers-reduced-motion */
```

### Typography

| Role | Size / line-height | Weight |
|---|---|---|
| body | 17px / 1.6 | 400 |
| question stem | 1.15rem / 1.5 | 400 |
| view heading (`h2`) | 1.3rem / 1.3 | 600 |
| in-page subheading (`h3`) | 1rem / 1.4 | 600 |
| home title | 1.5rem / 1.25 | 600 |
| stat value | 1.5rem / 1.1 | 600, tabular numerals |
| hint, footer, table cells | .85rem | 400 |

Body type goes up from 16px because this is a reading task for two hours, not a
form-filling task. The smallest text is no smaller than today's `.85rem`, but at
`--muted` instead of a washed grey, so contrast improves rather than degrades.

### Components

One button style with three variants, replacing today's `button` + `.primary`:

```
.btn           surface fill, --line border, --r-sm, .5rem/1rem padding
.btn-primary   --brand fill, --on-brand text, transparent border
.btn-quiet     no fill, no border, --muted text, --ink on hover
```

All three: `font: inherit`, `cursor: pointer`, `--t` transition on
background/border/color, `opacity: .5` and default cursor when disabled.

Choice rows become the primary interaction surface, so they carry the most
styling. The letter badge is new — showing `A`, `B`, `C` makes choices scannable
and matches the keyboard map, which is meaningless without visible letters. The
native input stays in the DOM at 1px and `opacity: 0` so it remains focusable and
announced; the row is what you see.

```
.choice            flex, gap .75rem, padding .7rem/.85rem, transparent border,
                   --r-sm, cursor pointer, position relative
.choice input      position absolute, 1px, opacity 0  (focusable, invisible)
.choice .key       1.75rem square, --surface-2 fill, --muted text, 600,
                   tabular numerals, --r-sm
.choice:hover      --surface-2 fill          (declared BEFORE .is-on)
.choice.is-on      --brand-soft fill, --brand border
.choice.is-on .key --brand fill, --on-brand text
.choice:focus-within  2px --focus outline, 2px offset
```

`:hover` must be declared before `.is-on` so a selected row keeps its selected
fill on hover rather than reverting to grey.

Focus styling is `:focus-within` rather than `:has(input:focus-visible)` because
`:has()` support, while broad in current browsers, is not something to bet a
`file://` offline app on. The cost is that a mouse click on a row also shows the
focus ring; that is a cosmetic imprecision, not a defect.

The palette keeps its current wrapping row of number buttons — restructuring it
was declined. It is restyled lighter, and `flagged` gains a 5px dot in a
`::after` (with `position: relative` on the cell) so a flag is visible at a
glance rather than being a 2px border, which is the same as today's `answered`
fill and therefore ambiguous. The dot is absolutely positioned, so no layout
shift. `aria-label` on each cell already carries current/answered/flagged state
and stays the accessible source of truth.

Active nav is a tinted pill rather than an underline. In dark mode `--brand` is
light enough to read as text, so the same rule works in both themes.

---

## Dark Mode

### Mechanism

One dark token list, written twice:

```
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { ...dark tokens... }
}
:root[data-theme="dark"] { ...dark tokens... }
```

The second block comes after the first in source order. Both selectors have
specificity (0,2,0), so source order decides between them, and the explicit
attribute must win.

This shape is chosen specifically so that **nothing runs before first paint**.
With no stored preference the `data-theme` attribute is absent, so the media
query alone already renders the app dark. A script that reads storage and sets the
attribute in `<head>` would also avoid the flash, but it would have to touch
`localStorage` outside `SN.Store`, and the in-memory fallback would not apply.
Avoiding one bad frame is not worth breaking the storage invariant.

Dark values: `--bg #14171a`, `--surface #1b1f23`, `--surface-2 #23282c`,
`--ink #e8e6e3`, `--muted #9aa1a6` (~7:1 on `--bg`), `--line #2c3237`,
`--line-strong #3d454b`, `--brand #6fc3d6`, `--on-brand #08222a`,
`--brand-soft #1d2b30`, `--focus #5fb4d8`, `--good #6fcf97`, `--good-bg #1a2a21`,
`--bad #f08a8e`, `--bad-bg #2b1d1e`, `--warn-bg #2a2416`, `--warn-ink #e2c877`,
`--shadow 0 1px 2px rgba(0,0,0,.4)`.

`--brand` becomes a light teal in dark mode so it is legible as text and as a
fill; `--on-brand` becomes near-black to keep button text contrast. `--brand-soft`
is a dark tinted surface, which is what the selected-choice fill and the exam
bar use.

`color-scheme: light dark` on `:root` so form controls and scrollbars follow,
with the toggle setting `style.colorScheme` to the resolved value.

### Toggle

A `.btn-quiet` button in the header, outside `<main>`, so no route re-render
touches it. It is bound once at boot. Its label and `aria-label` both name the
theme it will switch *to* ("Switch to dark theme"), which is the less ambiguous
convention for a toggle.

State persists as `sn.theme.v1`, a new key holding the string `light` or `dark`,
written through `SN.Store.setJSON`. Resolved on boot as: stored value if present,
else the system preference. The system preference is tracked only while no
explicit choice is stored, so an explicit choice is never overridden by an OS
change.

---

## Keyboard Answering

### Map

Active only on the `exam` route, and ignored when the event target is an input,
textarea or select — the setup form must keep working normally.

| Key | Action |
|---|---|
| `A`–`K` | pick that choice (single: replace; multi: toggle) |
| `ArrowLeft` | previous question |
| `ArrowRight` | next question |
| `Enter` | next question; on the last question, open the Submit confirm |
| `F` | flag / unflag the current question |
| `1`–`9` | jump to that question |
| `?` | shortcut sheet |

`A`–`K` rather than `A`–`Z` because the bank's widest question has 11 choices
(`A`–`K`); letters past `K` do nothing, so nothing misfires. Number keys stop at
9 — jumping to question 37 needs two digits, which would mean a pending-input
state, and the palette is already there for that.

The listener is attached to `document` and removed when leaving the `exam` route.
Registered once, not per render.

### Discoverability

A single hint line under the choices: `A–K pick · ← → move · F flag · ? help`.
Plus `aria-keyshortcuts` on the previous, next, flag and submit buttons, so the
bindings are announced rather than only drawn. `?` opens the full sheet in the
existing `<dialog>`, listing exactly the map table above, grouped as
"Answer", "Move" and "Meta".

### The exam screen's heading

The exam screen currently renders the bank title as its `<h2>` above every one of
60 questions — the same heading, 60 times, in the largest type on the page. It is
removed: the header already carries the title in `#title`. `Question 12 of 60`
is promoted to the `h2` and becomes `data-autofocus` for the screen, with the
answered and flagged counts demoted to the metadata line beneath it. Nothing
moves position; the noise goes and the position information gains the emphasis.

### The in-place patch layer

This is a hard dependency, not a nicety. `drawQuestion()` rebuilds all markup and
scrolls to the top on every pick, so a keypress would select an answer and then
yank the page upward — and it would move focus to `<body>`, killing every
subsequent keypress in the chain.

Split into two functions:

- **`renderExam()`** — full markup, then rebind. Called once per navigation.
  Scrolls to top and focuses the stem, which is the correct behaviour when the
  question actually changes. Ids the patch layer depends on: `exam-meta`
  (`12 of 60 · 34 answered · 2 flagged`), `exam-stem` (the `.stem` element, and
  the screen's `data-autofocus` target), `choices`, `pick-count` (multi only),
  `key-help`, `flag`, `prev`, `next`, `submit`. Palette cells keep `data-i`.
- **`applyPick(letter)`** — no re-render, no scroll. Calls
  `SN.ExamSession.setPick`, then re-derives and patches:
  1. every choice row's `is-on` class and its input's `checked`
  2. `#pick-count`, when the question is multi
  3. the answered count in `#exam-meta`
  4. the current palette cell's `answered` class and `aria-label`

  Step 1 re-reads picks from state rather than assuming the write landed, because
  `setPick` silently refuses a pick once a multi question is at its cap. That
  refusal is then simply "nothing changed", which is correct.

- **`applyFlag()`** — no re-render. Patches the flag button's label, the current
  palette cell's `flagged` class and `aria-label`, and the flagged count in
  `#exam-meta`.

`SN.UI.render()` is unchanged and still scrolls to top; with patching in place it
is only ever called on real navigation, so a no-scroll flag is not needed.

### Multi-select clarity

"Choose 3" currently sits in the metadata line at the top of the screen, far from
where picking happens, and the cap is enforced by `setPick` refusing silently —
so a candidate who taps a fourth option gets no explanation.

The counter moves next to the choices and updates on every pick:

- below the cap: `Select 3 — 1 of 3 chosen`
- at the cap: `3 of 3 chosen — deselect one to swap`

The cap behaviour itself is unchanged. It mirrors the real exam and is called
out in the existing spec.

---

## Home Screen And Resume

### Home

```
ServiceNow Certification Exam
60 questions · 90 minutes · pass at 70%

  Last 68.3%   │  Best 75.0%  │  Attempts 4      ┌ Attempt in progress ───────────────────┐
  │ Question 12 of 60 · 34 answered · 2 flagged     │
  │ 38:12 remaining                                 │
  │ [ Resume ]  Discard attempt                     │
  └─────────────────────────────────────────────────┘

  [ Start a new attempt ]
```

A three-up stat row (last, best, attempts), then the resume card only while a
session is live, then the primary action. `max-width` on a stats cell drops to a
single column under 34rem.

Last, best and attempts are derived from `SN.History.all()`, which already stores
`percent` and `passPercent` per attempt. **No new storage key and no schema
change.** `SN.lastResult` is deliberately not used: it is null after a reload, and
home must be correct on a fresh page load.

With no history the stat row is replaced by one hint line, so the row never
renders as three empty zeros.

The bank-size line that currently sits in the body's middle moves out — the
footer already carries `N questions in this bank.` and is set once at boot.

### The exam bar

A slim strip under the header, outside `<main>`, shown on every route except
`exam` while a session is live:

```
Attempt in progress · Question 12 of 60 · 38:12   [Resume]
```

It updates from the same one-second tick, so the countdown stays honest while the
candidate steps out to History. Rendered once in the static markup, toggled with
the `hidden` attribute, so no route re-render can destroy it.

Visibility and text are set in `SN.Router.run()` after the route function
returns — one place, no per-view work, and it cannot drift out of sync with the
current route.

### Abandoning an attempt

Never silently. **Discard attempt**, quiet, under Resume in the resume card,
behind a confirm that names what is lost ("12 answered, 2 flagged"). It drops
`exam.active.v1`, stops the timer, and returns to home.

Starting a new attempt from Setup while one is live routes through the same
confirm instead of today's silent overwrite. Choosing to proceed starts the new
attempt and discards the old one; cancelling leaves the live attempt untouched.

### Shared confirm

`confirmSubmit()` hand-builds its dialog markup and the stats screen uses a bare
`window.confirm` — two different confirmation experiences, one of them native.
Both become `SN.UI.confirm(opts, onYes)` on the existing `<dialog>`, used by four
call sites: submit exam, discard attempt, start-while-live, clear stats.

`opts.body` is HTML, because callers need live counts in it; every caller builds
it from `SN.UI.escape`d values. `opts.title`, `opts.yes` and `opts.no` are
escaped by `confirm` itself. The dialog's `close` handler clears `innerHTML` so
stale ids cannot be re-bound.

---

## Accessibility

- `:focus-visible` ring on every interactive element via the `--focus` token;
  `:focus-within` for choice rows. Today there is no focus styling at all.
- The timer loses `aria-live`. It becomes `role="timer"` with
  `aria-label="Time remaining"`. A separate `.sr` `aria-live="polite"` region
  speaks only at two thresholds — 5 minutes remaining and 60 seconds remaining —
  tracked in a module-level variable reset when a session starts. The
  once-per-second live region is the defect this removes.
- `#timer` visibility is now derived rather than independent: `paintClock()` sets
  `hidden` from `SN.Router.current() === 'exam'`, so the header clock and the
  exam bar can never both be wrong about which view is showing.
- Every view marks one element with `data-autofocus` (its `h2`, or the stem on
  the exam screen). `SN.Router.run()` focuses it after rendering, so a route
  change moves the reading position and announces itself. Keyboard users
  continuing a 60-question exam do not restart from the top of the document each
  time.
- `prefers-reduced-motion: reduce` drops the `--t` transitions.
- Palette state stays available to assistive tech through each cell's
  `aria-label`, which the patch layer updates alongside the class.

## Deliberate Behaviour Changes

Each of these changes documented behaviour and is called out for review.

1. **The question position is persisted in the session, and `SN.view.index` is
   removed.** A reload mid-exam currently always lands on question 1. For a
   90-minute attempt that throws away the candidate's place, which defeats the
   point of the resume flow chosen for this work. `state.index` becomes the
   single home of the position: `index()` reads it, `setIndex()` writes and
   persists it, `start()` initialises it to 0, `blank()` includes it. Sessions
   written before this change have no `index`, so
   `if (typeof saved.index !== 'number') saved.index = 0` in `restore()`.
   `SN.view` keeps `pendingSettings` and `reviewFilter`.

   This supersedes rule 6 in `AGENTS.md`, which states `SN.view.index` is the only
   home of the question position. The intent of that rule — one source of truth,
   no divergence — is preserved by moving the single home, not by adding a second
   one. `AGENTS.md` must be updated in the same change.

2. **`SN.ExamSession.restore()` runs at boot, not only on the exam route.** A
   reload straight onto `#/home` cannot otherwise know an attempt is live, so the
   resume card and exam bar would both be missing. Restoring before
   `SN.Router.start()` makes them correct from the first paint. `restore()` is
   idempotent and the exam route's `if (!has() && !restore())` guard is unaffected.

3. **The countdown interval starts at boot when a session exists**, rather than
   when the exam route is entered, and is no longer started by that route. The
   exam bar needs a live clock from any route, and this makes deadline expiry
   auto-submit from any route too, which rule 7's absolute-`deadlineAt` design
   implies anyway. `startTimer()` still calls `stopTimer()` before assigning
   `onTick` — rule 5 stands.

   Changes 2 and 3 pin the boot order inside the loader's `.then()`, and it is
   the order that matters, because rules 4 and 5 are both ordering bugs that
   have already shipped:

   ```
   SN.bank = bank
   bind theme toggle, restore theme
   SN.ExamSession.restore()          <- needs SN.bank, before any route renders
   if (SN.ExamSession.has()) SN.ExamSession.startTimer(paintClock)
   register routes
   SN.Router.start()
   ```

   `SN.Questions` still indexes lazily on first `get()` (rule 4), which is what
   makes the `restore()` call above safe at this point.

4. **`window.confirm` in the stats screen is replaced by `SN.UI.confirm`.**
   Cosmetic consistency only; the same question is asked and the same key is
   dropped.

5. **`sn.theme.v1` is a new storage key.** Additive; no existing key changes
   meaning.

## Files

`index.html` only, for the app. Plus documentation updates: this spec,
`AGENTS.md` rule 6, and the plan.

`questions.json`, `questions.js`, `tools/convert.js` and `tools/validate.js` are
untouched. Nothing in this work depends on the question bank, so the converter and
validator need no changes and the bank is not re-converted.

## Verification

Automated, unchanged and still the only automated check:

```
node tools/validate.js questions.json
OK  questions.json: 423 questions valid (341 single, 82 multi)

node -e 'const b=require("./questions.json");console.log(require("fs").readFileSync("questions.js","utf8")==="window.QUESTIONS = "+JSON.stringify(b,null,2)+";\n")'
true
```

Everything else is by hand, over HTTP and again from `file://`. Both paths must
be exercised because the app is delivered by double-click.

Visual and dark mode:

1. Toggle the theme, reload — the choice persists and there is no flash of the
   wrong theme on load
2. Theme follows the system when no explicit choice has been made; an explicit
   choice survives an OS theme change
3. Every view, both themes: home, setup, exam, results, history, stats, plus the
   bank-unavailable error screen

Keyboard:

4. `A`–`K` selects; the page does not move; focus is never lost
5. `←` `→` `Enter` navigate; `Enter` on the last question opens Submit
6. `1`–`9` jump
7. `F` flags and unflags, and the palette dot and count follow
8. `?` opens and closes the sheet
9. Typing in the setup form's number fields never triggers a shortcut
10. A multi question: pick to the cap, try a fourth, confirm nothing changes and
    the counter explains why

Exam behaviour:

11. Pick an answer on a long question — no scroll to top
12. Reload mid-exam — the same question is showing, picks and flags intact,
    remaining time identical
13. Reload mid-exam onto `#/home` — the resume card is there with the right
    position and countdown
14. Leave for History mid-exam — the exam bar shows and counts down; Resume
    returns to the same question
15. Discard attempt — the confirm names what is lost; after confirming, the
    attempt is gone and the home stats are unchanged
16. Start a new attempt from Setup while one is live — the confirm appears;
    cancelling leaves the live attempt alone
17. Expiry still auto-submits with the banner, from the exam view and from
    another view

Unchanged regression checks:

18. Multi-select scoring: exact set, an extra selection, and one short
19. A 69.6% attempt reads Not passed against a 70% mark
20. Results review filters, and history and stats across a full browser restart

`localStorage` blocked: the warning strip is legible in both themes and the exam
still completes.