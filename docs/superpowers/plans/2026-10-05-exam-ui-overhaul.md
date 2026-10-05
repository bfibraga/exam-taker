# Exam UI Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the app's visual system as a calm, legible study interface, add dark mode, make the exam answerable from the keyboard, and turn the home screen into a dashboard with a working resume flow.

**Architecture:** One `index.html` holds markup, CSS and JS, as it must — the delivery bundle is exactly three files. The stylesheet is reorganised into a token layer plus component classes. The exam screen stops re-rendering on every pick: a question is rendered once per navigation and picks and flags are patched in place, which is what makes keyboard answering possible at all. Four deliberate behaviour changes are listed in the spec; the largest persists the question position in the session state.

**Tech Stack:** Hand-written CSS with custom properties. ES5-shaped JavaScript in one IIFE under an `SN` namespace — `var`, function expressions, no arrow functions, no `const`/`let`, no template literals, no ES modules (they fail on `file://`). No dependencies, no build step, no test framework.

**Design spec:** `docs/superpowers/specs/2026-10-05-exam-ui-overhaul-design.md`

## Testing note — read before Task 1

This project has **no test framework, by design**. `AGENTS.md` and the base design both record that as a constraint, and inventing one is out of scope. So the TDD steps this plan would normally carry are replaced with the project's real gates:

1. `node tools/validate.js questions.json` — the only automated check. Must keep printing `OK  questions.json: 423 questions valid (341 single, 82 multi)`.
2. The `questions.js` sync check below. Nothing in this plan touches the bank, but the check is cheap and catches a stale wrapper before it becomes a confusing bug.
3. A numbered manual pass, over HTTP **and** from `file://`. The app ships by double-click, so both paths must be exercised. `SN` is on `window` for console probing: `SN.ExamSession.index()`, `SN.Store.getJSON('exam.active.v1')`, `SN.Router.current()`.

Steps are still one action each and still commit as they go.

```bash
node tools/validate.js questions.json
# OK  questions.json: 423 questions valid (341 single, 82 multi)

node -e 'const b=require("./questions.json");console.log(require("fs").readFileSync("questions.js","utf8")==="window.QUESTIONS = "+JSON.stringify(b,null,2)+";\n")'
# true
```

**Every CSS block in this plan uses the exact token names defined in Task 1.** If you rename a token, every later task breaks. Do not restyle a token without updating Tasks 1–12 together.

**Serve for the manual passes**, from the repo root:

```bash
python3 -m http.server 8765
# then open http://localhost:8765/index.html
```

---

## File Structure

| File | Responsibility | This plan |
|---|---|---|
| `index.html` | The entire app: markup, stylesheet, logic | Tasks 1–11 modify it |
| `AGENTS.md` | Project rules for agents | Task 2 updates rule 6 |
| `docs/superpowers/specs/2026-10-05-exam-ui-overhaul-design.md` | The approved design | already written |
| `questions.json` | Question bank, canonical | untouched |
| `questions.js` | Generated `window.QUESTIONS` wrapper | untouched |
| `tools/convert.js`, `tools/validate.js` | Converter and validator | untouched |

Nothing is created. The plan is a sequence of edits to one file, grouped so that each commit leaves the app working and reviewable on its own.

### Task order and why

The token layer comes first because everything after it styles against it. The session state changes come second because the resume feature depends on them. Each subsequent task is one feature: dark mode, in-place patching, the exam screen, keyboard, resume, home, the shared confirm, focus, the page-level screens, and finally the manual pass.

---

### Task 1: Token layer and component styles

Covers spec § Visual System.

- [ ] **Step 1: Replace the `<style>` block with the token layer and component classes**

In `index.html`, replace the whole `<style>…</style>` block (currently lines 7–104) with the following. Several rules here are inert until later tasks add the markup that uses them — `.choice`, `.stat`, `#exambar`, `#clock-live`, `#theme-toggle`. That is expected; they are grouped with their component rather than scattered across later commits.

```css
  :root {
    color-scheme: light dark;

    --bg: #faf9f7;
    --surface: #ffffff;
    --surface-2: #f2f1ee;
    --ink: #1c1f1e;
    --muted: #5f6663;
    --line: #e4e2dd;
    --line-strong: #cfccc5;
    --brand: #004f65;
    --on-brand: #ffffff;
    --brand-soft: #e8f0f2;
    --focus: #0b6fa4;
    --good: #1c6b3c;
    --good-bg: #e4f2ea;
    --bad: #a4262c;
    --bad-bg: #fbeaeb;
    --warn-bg: #fdf3d8;
    --warn-ink: #6b5310;
    --shadow: 0 1px 2px rgba(28,31,30,.05), 0 1px 3px rgba(28,31,30,.04);

    --r: 10px;
    --r-sm: 6px;

    --s1: 4px; --s2: 8px; --s3: 12px; --s4: 16px;
    --s5: 24px; --s6: 32px; --s7: 48px;

    --t: 120ms;
  }

  /* Dark palette. Written twice on purpose:
     the media query handles the pre-paint window, the attribute block handles an
     explicit choice. Both selectors are specificity (0,2,0), so source order
     decides — the attribute block must come second. */
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #14171a;
      --surface: #1b1f23;
      --surface-2: #23282c;
      --ink: #e8e6e3;
      --muted: #9aa1a6;
      --line: #2c3237;
      --line-strong: #3d454b;
      --brand: #6fc3d6;
      --on-brand: #08222a;
      --brand-soft: #1d2b30;
      --focus: #5fb4d8;
      --good: #6fcf97;
      --good-bg: #1a2a21;
      --bad: #f08a8e;
      --bad-bg: #2b1d1e;
      --warn-bg: #2a2416;
      --warn-ink: #e2c877;
      --shadow: 0 1px 2px rgba(0,0,0,.4);
    }
  }
  :root[data-theme="dark"] {
    --bg: #14171a;
    --surface: #1b1f23;
    --surface-2: #23282c;
    --ink: #e8e6e3;
    --muted: #9aa1a6;
    --line: #2c3237;
    --line-strong: #3d454b;
    --brand: #6fc3d6;
    --on-brand: #08222a;
    --brand-soft: #1d2b30;
    --focus: #5fb4d8;
    --good: #6fcf97;
    --good-bg: #1a2a21;
    --bad: #f08a8e;
    --bad-bg: #2b1d1e;
    --warn-bg: #2a2416;
    --warn-ink: #e2c877;
    --shadow: 0 1px 2px rgba(0,0,0,.4);
  }

  * { box-sizing: border-box; }

  body {
    margin: 0;
    font: 17px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: var(--ink);
    background: var(--bg);
  }

  /* Focus is a first-class state here. The app had no focus styling at all. */
  :focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    * { transition: none !important; }
  }

  /* ------------------------------------------------------------- chrome */

  header {
    background: var(--surface);
    border-bottom: 1px solid var(--line);
    padding: .85rem 1.5rem;
    display: flex;
    flex-wrap: wrap;
    gap: var(--s4);
    align-items: center;
  }
  header h1 { font-size: 1rem; font-weight: 600; margin: 0; }

  nav { display: flex; gap: var(--s1); flex-wrap: wrap; }
  nav a {
    color: var(--muted);
    text-decoration: none;
    padding: .35rem .7rem;
    border-radius: var(--r-sm);
    transition: background var(--t), color var(--t);
  }
  nav a:hover { background: var(--surface-2); color: var(--ink); }
  nav a.active { color: var(--brand); background: var(--brand-soft); font-weight: 600; }

  .header-right { margin-left: auto; display: flex; align-items: center; gap: var(--s3); }
  #theme-toggle { font-size: .85rem; }

  #timer {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    min-width: 3.5rem;
    text-align: right;
  }
  #timer.urgent { color: var(--bad); }

  main { max-width: 48rem; margin: 0 auto; padding: var(--s6) 1.5rem var(--s7); }

  footer {
    border-top: 1px solid var(--line);
    padding: var(--s4) 1.5rem;
    color: var(--muted);
    font-size: .85rem;
  }

  /* Exam bar. Static markup, outside <main>, so no route render can destroy it. */
  #exambar {
    background: var(--brand-soft);
    border-bottom: 1px solid var(--line);
    padding: .5rem 1.5rem;
    display: flex;
    flex-wrap: wrap;
    gap: var(--s3);
    align-items: center;
    font-size: .9rem;
  }
  #exambar-clock { font-variant-numeric: tabular-nums; }
  #exambar .btn { margin-left: auto; }

  #notice {
    display: none;
    margin: 0;
    padding: .7rem 1.5rem;
    background: var(--warn-bg);
    color: var(--warn-ink);
  }
  #notice.show { display: block; }

  /* ------------------------------------------------------------ typography */

  h2 { font-size: 1.3rem; line-height: 1.3; font-weight: 600; margin: 0 0 var(--s3); }
  h3 { font-size: 1rem; line-height: 1.4; font-weight: 600; margin: var(--s5) 0 var(--s2); }

  .home-title { font-size: 1.5rem; line-height: 1.25; font-weight: 600; margin: 0; }
  .hint { color: var(--muted); font-size: .85rem; margin: var(--s1) 0 0; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }

  /* ------------------------------------------------------------- controls */

  label { display: block; margin: var(--s4) 0 var(--s1); font-weight: 600; }
  input[type=number], input[type=text], select {
    font: inherit;
    padding: .45rem .55rem;
    border: 1px solid var(--line-strong);
    border-radius: var(--r-sm);
    background: var(--surface);
    color: var(--ink);
    min-width: 8rem;
  }

  .btn {
    font: inherit;
    padding: .5rem 1rem;
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    background: var(--surface);
    color: var(--ink);
    cursor: pointer;
    transition: background var(--t), border-color var(--t), color var(--t);
  }
  .btn:hover:not(:disabled) { background: var(--surface-2); }
  .btn-primary { background: var(--brand); color: var(--on-brand); border-color: var(--brand); }
  .btn-primary:hover:not(:disabled) { background: var(--brand); filter: brightness(1.08); }
  .btn-quiet { background: transparent; border-color: transparent; color: var(--muted); }
  .btn-quiet:hover:not(:disabled) { background: var(--surface-2); color: var(--ink); }
  .btn:disabled { opacity: .5; cursor: default; }

  .row { display: flex; gap: var(--s2); flex-wrap: wrap; align-items: center; }
  .row-end { justify-content: flex-end; margin-top: var(--s5); }

  /* --------------------------------------------------------------- pieces */

  .card {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--r);
    box-shadow: var(--shadow);
    padding: var(--s4) var(--s5);
    margin: var(--s4) 0;
  }
  .card > :first-child { margin-top: 0; }
  .card > :last-child { margin-bottom: 0; }

  .pill { display: inline-block; padding: .1rem .5rem; border-radius: 999px; font-size: .8rem; }
  .pill.ok { background: var(--good-bg); color: var(--good); }
  .pill.no { background: var(--bad-bg); color: var(--bad); }

  table { border-collapse: collapse; width: 100%; font-size: .95rem; }
  th, td { text-align: left; padding: .5rem; border-bottom: 1px solid var(--line); }
  th { color: var(--muted); font-weight: 600; }

  dialog {
    border: none;
    border-radius: var(--r);
    padding: var(--s5);
    max-width: 26rem;
    color: var(--ink);
    background: var(--surface);
    box-shadow: 0 12px 32px rgba(0,0,0,.28);
  }
  dialog::backdrop { background: rgba(20,23,26,.45); }

  /* Choice rows. The native input stays focusable at 1px and opacity 0 so it
     is still announced and still reachable; the row is what you see. */
  .stem { font-size: 1.15rem; line-height: 1.5; margin: var(--s4) 0 var(--s5); }
  .stem:focus-visible { outline: 2px solid var(--focus); outline-offset: 4px; }

  #choices { display: flex; flex-direction: column; gap: var(--s2); }
  .choice {
    position: relative;
    display: flex;
    gap: .75rem;
    align-items: flex-start;
    padding: .7rem .85rem;
    border: 1px solid transparent;
    border-radius: var(--r-sm);
    cursor: pointer;
    transition: background var(--t), border-color var(--t);
  }
  .choice input { position: absolute; width: 1px; height: 1px; opacity: 0; margin: 0; }
  .choice .key {
    flex: 0 0 1.75rem;
    height: 1.75rem;
    display: grid;
    place-items: center;
    border-radius: var(--r-sm);
    background: var(--surface-2);
    color: var(--muted);
    font-weight: 600;
    font-size: .9rem;
    font-variant-numeric: tabular-nums;
  }
  .choice:hover { background: var(--surface-2); }
  .choice.is-on { background: var(--brand-soft); border-color: var(--brand); }
  .choice.is-on .key { background: var(--brand); color: var(--on-brand); }
  .choice:focus-within { outline: 2px solid var(--focus); outline-offset: 2px; }

  .choice-head {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s3);
    align-items: baseline;
    justify-content: space-between;
  }
  #pick-count { margin: 0; }
  #key-help { margin: var(--s4) 0 0; }

  /* Palette. Kept as a wrapping row — restructuring it was declined. */
  .palette { display: flex; flex-wrap: wrap; gap: .35rem; margin: var(--s5) 0; }
  .palette button {
    position: relative;
    min-width: 2.25rem;
    padding: .3rem 0;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    color: var(--muted);
    font: inherit;
    font-size: .9rem;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
  }
  .palette button.answered { background: var(--brand-soft); border-color: var(--brand); color: var(--brand); }
  .palette button.current { outline: 2px solid var(--focus); outline-offset: 1px; color: var(--ink); font-weight: 700; }
  .palette button.flagged::after {
    content: "";
    position: absolute;
    top: 2px; right: 2px;
    width: 5px; height: 5px;
    border-radius: 50%;
    background: var(--brand);
  }

  /* ------------------------------------------------------------ home cards */

  .stat-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--s3);
    margin: var(--s5) 0;
  }
  .stat {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--r);
    box-shadow: var(--shadow);
    padding: .85rem var(--s4);
  }
  .stat-label { color: var(--muted); font-size: .8rem; }
  .stat-value {
    font-size: 1.5rem;
    line-height: 1.1;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  @media (max-width: 34rem) {
    .stat-row { grid-template-columns: 1fr; }
  }

  .resume-line { color: var(--muted); font-size: .9rem; margin: 0; }

  /* -------------------------------------------------------------- results */

  .result-row { border-top: 1px solid var(--line); padding: var(--s4) 0; }
  .verdict { font-weight: 700; margin: 0; }
  .verdict.ok { color: var(--good); }
  .verdict.no { color: var(--bad); }
  .result-choices { margin: var(--s2) 0 0; padding-left: 1.25rem; }
  .result-choices li { margin: var(--s1) 0; }
  .result-choices li.right { color: var(--good); }
  .result-choices li.wrong { color: var(--bad); }
  .result-choices li.plain { color: var(--muted); }
```

- [ ] **Step 2: Rename the button classes in the markup and views**

The old CSS had `button` and `button.primary`. Every view builds its markup as strings, so each one needs updating. In `index.html`, replace these occurrences:

| Old | New |
|---|---|
| `<button class="primary"` | `<button class="btn btn-primary"` |
| `<button` | `<button class="btn"` |
| `<button id="dlg-no"` | `<button class="btn" id="dlg-no"` |

Concretely, in `confirmSubmit` the closing row becomes:

```js
        '<div class="row row-end">' +
        '<button class="btn" id="dlg-no">Keep going</button>' +
        '<button class="btn btn-primary" id="dlg-yes">Submit</button></div>';
```

In the results view:

```js
        '<div class="row"><button class="btn btn-primary" id="again">Same settings</button>' +
        '<button class="btn" id="new-setup">Change settings</button>' +
        '<button class="btn" id="leave">Done</button></div></div>';
```

And the review filter row:

```js
          return '<button class="btn' + (filter === f[0] ? ' btn-primary' : '') +
            '" data-f="' + f[0] + '">' + f[1] + '</button>';
```

- [ ] **Step 3: Restyle the remaining legacy classes**

`#notice`, `.card`, `.pill`, `table`, `dialog` and `.row` are already covered by the new block. Change `.hint { margin: .2rem 0 0 }` usages are fine as they are. Add `box-shadow: var(--shadow)` is already in `.card`. No further changes needed for setup, history or stats — they inherit the new tokens, which is the intended outcome.

- [ ] **Step 4: Verify the bank still validates and the wrapper is in sync**

```bash
node tools/validate.js questions.json
node -e 'const b=require("./questions.json");console.log(require("fs").readFileSync("questions.js","utf8")==="window.QUESTIONS = "+JSON.stringify(b,null,2)+";\n")'
```

Expected: `OK  questions.json: 423 questions valid (341 single, 82 multi)` then `true`.

- [ ] **Step 5: Check every view in a browser, both themes**

```bash
python3 -m http.server 8765
```

Open `http://localhost:8765/index.html`. Walk home, setup, history, stats. Flip the OS or DevTools' theme emulation to dark and walk them again. Confirm: no unstyled buttons, tables read cleanly, the notice strip is legible in both, `prefers-reduced-motion` removes the hover transitions.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: calm study mode token layer and component styles

Reorganise the stylesheet into design tokens plus components: warm off-white
canvas, 17px body, one button style with three variants, visible focus rings,
choice rows as the primary interaction surface. Dark palette written twice so
the media query covers the pre-paint window and the attribute block covers an
explicit choice."
```

---

### Task 2: Persist the question position in the session

Covers spec § Deliberate Behaviour Changes 1–2. **This task supersedes rule 6 in `AGENTS.md`.**

The exam screen currently keeps its position in `SN.view.index`, which lives only in memory, so a reload always lands on question 1. This task moves the single home of the position into the persisted session state and restores the session at boot.

- [ ] **Step 1: Add `index` to the session shape**

In `SN.ExamSession`, replace `blank()` and `start()`'s state object:

```js
    function blank() {
      return { ids: [], index: 0, picks: {}, flags: {}, startedAt: null, deadlineAt: null, settings: null };
    }
```

```js
      state = {
        ids: SN.Questions.draw(settings.questionCount, settings.shuffle),
        index: 0,
        picks: {},
        flags: {},
        startedAt: now,
        deadlineAt: now + settings.durationMinutes * 60000,
        settings: settings
      };
```

- [ ] **Step 2: Make `index()` and `setIndex()` read and write `state.index`**

Replace both functions:

```js
    function index() { return state ? state.index : 0; }

    function setIndex(i) {
      if (!state) return;
      var max = state.ids.length - 1;
      state.index = Math.min(max, Math.max(0, i));
      persist();
    }
```

`persist()` on every navigation is fine — the app already writes on every pick.

- [ ] **Step 3: Normalise `index` in `restore()`**

Sessions written before this change have no `index`. In `restore()`, insert the clamp immediately before `state = saved;`:

```js
      var at = typeof saved.index === 'number' ? saved.index : 0;
      saved.index = Math.min(saved.ids.length - 1, Math.max(0, at));
      state = saved;
      return true;
```

- [ ] **Step 4: Restore the session at boot**

`restore()` calls `SN.Questions.get()`, which needs `SN.bank` — so it must run inside the loader's `.then()`, after `SN.bank = bank`, and before `SN.Router.start()`. Insert it just above `SN.Router.start();`:

```js
    // A live attempt must be visible from the first paint on every route, not
    // only after the exam route runs restore() again.
    SN.ExamSession.restore();

    SN.Router.start();
```

- [ ] **Step 5: Remove `index` from `SN.view`**

Leaving it would create the two-homes bug this task exists to remove. Replace the declaration:

```js
  SN.view = { pendingSettings: null, reviewFilter: 'all' };
```

And in the `exam` route, delete the line `SN.view.index = 0;` from inside the `pendingSettings` block, which becomes:

```js
      if (SN.view.pendingSettings) {
        SN.ExamSession.start(SN.view.pendingSettings);
        SN.view.pendingSettings = null;
      }
```

- [ ] **Step 6: Update rule 6 in `AGENTS.md`**

`AGENTS.md` is untracked in git by design — it is agent-facing, not part of the
delivered bundle. Edit it, but do not `git add` it in any commit below.

Replace the existing rule 6 with:

```markdown
6. **`SN.ExamSession` state is the only home of the question position**, held in
   `state.index` and persisted in `exam.active.v1`, so a reload resumes on the
   same question. `SN.view` holds only `pendingSettings` and `reviewFilter`. The
   `exam` route starts a fresh session only when `pendingSettings` is set, and
   `pendingSettings` is consumed (nulled) immediately, so a later `#/exam`
   restores from storage instead of silently starting a fresh attempt.
```

- [ ] **Step 7: Verify by hand**

Answer question 1, press Next five times so you are on question 6, pick an answer there, then reload the page. Expected: you land on question 6, the pick is still there, and the countdown is unchanged.

Console check:

```js
SN.ExamSession.index()   // 5, zero-based
JSON.parse(localStorage.getItem('sn.exam.active.v1')).index   // 5
```

- [ ] **Step 8: Commit**

```bash
git add index.html
git commit -m "fix: persist the question position so a reload resumes the attempt

state.index is now the single home of the position, replacing SN.view.index,
and the session is restored at boot rather than only on the exam route. This
supersedes rule 6 in AGENTS.md, which named SN.view.index as the only home."
```

---

### Task 3: Dark mode toggle

Covers spec § Dark Mode.

- [ ] **Step 1: Add the toggle button to the static header**

In the `<header>` markup, replace:

```html
  <nav id="nav"></nav>
  <span id="timer" aria-live="polite" hidden></span>
```

with:

```html
  <nav id="nav"></nav>
  <div class="header-right">
    <button id="theme-toggle" class="btn btn-quiet" type="button" aria-label="Switch to dark theme">Dark</button>
    <span id="timer" role="timer" aria-label="Time remaining" hidden></span>
  </div>
```

`aria-live` is gone from the timer. It changed once a second, which meant a screen reader re-announced the clock every second for ninety minutes. Task 4 replaces it with threshold announcements.

- [ ] **Step 2: Add the exam bar and the clock live region to the static markup**

Between the `#notice` paragraph and `<main>`, insert:

```html
<div id="exambar" hidden>
  <span id="exambar-text">Attempt in progress</span>
  <span id="exambar-clock"></span>
  <button id="exambar-resume" class="btn" type="button">Resume</button>
</div>

<p id="clock-live" class="sr" aria-live="polite" aria-atomic="true"></p>
```

The exam bar is the resume affordance from every route except the exam screen itself. It is outside `<main>` so no route re-render can destroy it. Task 7 fills it in.

- [ ] **Step 3: Add the `SN.Theme` module**

Insert it after the `SN.Store` module and before `SN.Loader`:

```js
  // ------------------------------------------------------------------ Theme

  SN.Theme = (function () {
    var KEY = 'theme.v1';
    var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

    function stored() {
      var v = SN.Store.getJSON(KEY);
      return (v === 'dark' || v === 'light') ? v : null;
    }

    function system() { return (mq && mq.matches) ? 'dark' : 'light'; }
    function current() { return stored() || system(); }

    function apply(v) {
      var el = document.documentElement;
      el.setAttribute('data-theme', v);
      // Keeps form controls and scrollbars on the chosen theme rather than the
      // system one, which matters when the two disagree.
      el.style.colorScheme = v;
    }

    function paint() {
      var b = document.getElementById('theme-toggle');
      if (!b) return;
      var dark = current() === 'dark';
      b.textContent = dark ? 'Light' : 'Dark';
      b.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    }

    function onSystemChange(fn) {
      if (!mq) return;
      var handler = function () {
        // An explicit choice is never overridden by an OS change.
        if (!stored()) { apply(system()); fn(); }
      };
      if (typeof mq.addEventListener === 'function') mq.addEventListener('change', handler);
      else if (typeof mq.addListener === 'function') mq.addListener(handler);
    }

    function init() { apply(current()); }
    function toggle() {
      var next = current() === 'dark' ? 'light' : 'dark';
      SN.Store.setJSON(KEY, next);
      apply(next);
      paint();
      return next;
    }

    return { init: init, toggle: toggle, paint: paint, onSystemChange: onSystemChange };
  })();
```

- [ ] **Step 4: Wire the toggle up during boot**

Inside the loader's `.then()`, immediately after the `footer-note` assignment and before the nav is built:

```js
    SN.Theme.init();
    SN.Theme.paint();
    document.getElementById('theme-toggle').addEventListener('click', function () {
      SN.Theme.toggle();
    });
    SN.Theme.onSystemChange(function () {
      SN.Theme.paint();
      if (typeof syncExamBar === 'function') syncExamBar();
    });
```

`syncExamBar` arrives in Task 7; the `typeof` guard keeps this task self-contained.

- [ ] **Step 5: Verify by hand**

Toggle the theme. Reload — the choice persists and there is no flash of the wrong theme. Check both directions: force light while the OS is dark, force dark while the OS is light. Then confirm the system preference is followed when nothing is stored:

```js
localStorage.removeItem('sn.theme.v1')
```

and changing the OS theme now changes the app. Also check `document.documentElement.getAttribute('data-theme')` matches what the button says.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: dark mode following the system with a persisted toggle

The dark palette is declared once per selector rather than generated: the
media query covers the pre-paint window and the data-theme attribute covers an
explicit choice, so nothing reads localStorage before first paint. State lives
in sn.theme.v1 through SN.Store. The header timer also loses aria-live, which
was re-announcing the clock every second."
```

---

### Task 4: Clock announcements and boot-order fix

Covers spec § Accessibility and § Deliberate Behaviour Changes 3.

- [ ] **Step 1: Rename `paintTimer` to `paintClock` and derive its visibility**

Replace `paintTimer` entirely:

```js
    var lastMark = null;

    function paintClock() {
      var ms = SN.ExamSession.remainingMs();
      var text = fmtMs(ms);

      var el = document.getElementById('timer');
      el.hidden = SN.Router.current() !== 'exam';
      el.textContent = text;
      el.className = ms <= 60000 ? 'urgent' : '';

      var bar = document.getElementById('exambar-clock');
      if (bar) bar.textContent = text;

      // Speak only at two thresholds. A live region updated every second
      // re-announces the whole clock once a second.
      var secs = Math.floor(ms / 1000);
      var mark = secs <= 60 ? 60 : (secs <= 300 ? 300 : 0);
      if (mark && mark !== lastMark) {
        lastMark = mark;
        document.getElementById('clock-live').textContent =
          mark === 60 ? '1 minute remaining' : '5 minutes remaining';
      }
      if (!mark) lastMark = null;
    }
```

`lastMark` resets when time runs out and the exam auto-submits, so the next
attempt announces again.

- [ ] **Step 2: Move the interval start to boot**

In the `exam` route, delete the line `SN.ExamSession.startTimer(paintTimer);`.

Above `SN.Router.start();`, next to the `SN.ExamSession.restore();` line added in
Task 2, add:

```js
    // Started here rather than on the exam route so the clock is honest on every
    // view, and so an expired deadline auto-submits from any view.
    if (SN.ExamSession.has()) SN.ExamSession.startTimer(paintClock);
```

- [ ] **Step 3: Pin the resulting boot order in a comment**

Order is the recurring failure mode in this project — rules 4 and 5 in `AGENTS.md`
are both ordering bugs that shipped. The loader's `.then()` must now read, in
this order: assign `SN.bank`, init the theme, `SN.ExamSession.restore()`, start
the timer if there is a session, register routes, `SN.Router.start()`. Add a
comment above the `restore()` line:

```js
    // Boot order matters. SN.bank first, because SN.Questions indexes lazily on
    // first get() (AGENTS.md rule 4). Restore before any route renders, so home
    // and the exam bar both know about a live attempt. Timer last, so it starts
    // exactly once. SN.Router.start() renders.
```

- [ ] **Step 4: Verify by hand**

Start a 3-minute exam and let it run past 2:00 and past 1:00. Inspect
`#clock-live` — its text should change twice, not once a second. Confirm it
resets for the next attempt. Then set the deadline into the past and confirm the
auto-submit banner still appears:

```js
var s = JSON.parse(localStorage.getItem('sn.exam.active.v1'));
s.deadlineAt = Date.now() - 1000;
localStorage.setItem('sn.exam.active.v1', JSON.stringify(s));
location.reload();
```

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "fix: announce the clock at two thresholds instead of every second

The countdown now lives in one paintClock that writes the header clock and the
exam bar from the same source, and speaks only at 5 minutes and 60 seconds via a
dedicated polite region. The interval starts at boot rather than on the exam
route, so the clock is honest on every view."
```

---

### Task 5: In-place patch layer

Covers spec § The in-place patch layer. This is the structural change everything
after it depends on.

- [ ] **Step 1: Rewrite `drawQuestion` as `renderExam` with stable ids**

Replace the whole `drawQuestion` function with the following. Note the new
element ids — `exam-meta`, `exam-stem`, `choices`, `pick-count`, `key-help`,
`flag` — which the patch functions address.

```js
    function paletteCell(idx) {
      return document.querySelector('.palette button[data-i="' + idx + '"]');
    }

    function renderExam() {
      var st = SN.ExamSession.get();
      var i = SN.ExamSession.index();
      var id = SN.ExamSession.currentId();
      var q = SN.ExamSession.currentQuestion();
      var picked = SN.ExamSession.picksFor(id);
      var multi = q.type === 'multi';

      var choices = q.choices.map(function (c) {
        var on = picked.indexOf(c.id) !== -1;
        return '<label class="choice' + (on ? ' is-on' : '') + '" data-letter="' + c.id + '">' +
          '<input type="' + (multi ? 'checkbox' : 'radio') + '" name="pick" value="' + c.id + '"' +
          (on ? ' checked' : '') + '> ' +
          '<span class="key">' + SN.UI.escape(c.id) + '</span>' +
          '<span>' + SN.UI.escape(c.text) + '</span></label>';
      }).join('');

      var palette = st.ids.map(function (qid, idx) {
        var cls = [];
        if (idx === i) cls.push('current');
        if ((st.picks[qid] || []).length) cls.push('answered');
        if (st.flags[qid]) cls.push('flagged');
        return '<button class="' + cls.join(' ') + '" data-i="' + idx +
          '" aria-label="' + paletteLabel(st, idx) + '">' + (idx + 1) + '</button>';
      }).join('');

      SN.UI.render(
        '<h2 data-autofocus>Question ' + (i + 1) + ' of ' + st.ids.length + '</h2>' +
        '<p class="hint" id="exam-meta">' + metaText() + '</p>' +
        '<div class="stem" id="exam-stem">' + SN.UI.escape(q.stem) + '</div>' +
        '<div class="choice-head">' +
        (multi ? '<p class="hint" id="pick-count">' + pickCountText(q, picked.length) + '</p>' : '') +
        '<p class="hint" id="key-help">A&ndash;K pick &middot; &larr; &rarr; move &middot; F flag &middot; ? help</p>' +
        '</div>' +
        '<div id="choices">' + choices + '</div>' +
        '<div class="palette">' + palette + '</div>' +
        '<div class="row">' +
        '<button class="btn" id="prev" aria-keyshortcuts="ArrowLeft"' + (i === 0 ? ' disabled' : '') + '>Previous</button>' +
        '<button class="btn" id="next" aria-keyshortcuts="ArrowRight"' + (i === st.ids.length - 1 ? ' disabled' : '') + '>Next</button>' +
        '<button class="btn" id="flag" aria-keyshortcuts="F">' +
        (SN.ExamSession.isFlagged(id) ? 'Unflag' : 'Flag') + '</button>' +
        '<button class="btn btn-primary" id="submit" aria-keyshortcuts="Enter">Submit exam</button>' +
        '</div>'
      );

      Array.prototype.forEach.call(
        document.querySelectorAll('#choices input'),
        function (input) {
          input.addEventListener('change', function () { applyPick(input.value); });
        }
      );

      Array.prototype.forEach.call(
        document.querySelectorAll('.palette button'),
        function (b) {
          b.addEventListener('click', function () {
            SN.ExamSession.setIndex(parseInt(b.getAttribute('data-i'), 10));
            renderExam();
          });
        }
      );

      document.getElementById('prev').addEventListener('click', function () {
        SN.ExamSession.setIndex(i - 1); renderExam();
      });
      document.getElementById('next').addEventListener('click', function () {
        SN.ExamSession.setIndex(i + 1); renderExam();
      });
      document.getElementById('flag').addEventListener('click', function () { applyFlag(); });
      document.getElementById('submit').addEventListener('click', confirmSubmit);

      paintClock();
    }
```

Helpers referenced above, added just above `renderExam`:

```js
    function paletteLabel(st, idx) {
      var qid = st.ids[idx];
      return 'Question ' + (idx + 1) +
        ((st.picks[qid] || []).length ? ', answered' : ', not answered') +
        (st.flags[qid] ? ', flagged' : '');
    }

    function metaText() {
      return SN.ExamSession.answerCount() + ' answered &middot; ' +
        SN.ExamSession.flagCount() + ' flagged';
    }

    function pickCountText(q, n) {
      if (n < q.correct.length) {
        return 'Select ' + q.correct.length + ' &mdash; ' + n + ' of ' + q.correct.length + ' chosen';
      }
      return q.correct.length + ' of ' + q.correct.length +
        ' chosen &mdash; deselect one to swap';
    }
```

- [ ] **Step 2: Add the patch functions**

Add directly after `renderExam`:

```js
    function applyPick(letter) {
      var st = SN.ExamSession.get();
      var id = SN.ExamSession.currentId();
      var q = SN.ExamSession.currentQuestion();

      SN.ExamSession.setPick(id, letter);

      // Re-derive from state rather than assuming the write landed: setPick
      // refuses a pick once a multi question is at its cap, and then nothing
      // below changes. That refusal is the intended behaviour.
      var picks = SN.ExamSession.picksFor(id);
      Array.prototype.forEach.call(
        document.querySelectorAll('#choices .choice'),
        function (row) {
          var lid = row.getAttribute('data-letter');
          var on = picks.indexOf(lid) !== -1;
          row.className = 'choice' + (on ? ' is-on' : '');
          row.querySelector('input').checked = on;
        }
      );

      var pc = document.getElementById('pick-count');
      if (pc) pc.innerHTML = pickCountText(q, picks.length);

      document.getElementById('exam-meta').innerHTML = metaText();

      var i = SN.ExamSession.index();
      var cell = paletteCell(i);
      if (cell) {
        if (picks.length) cell.classList.add('answered');
        else cell.classList.remove('answered');
        cell.setAttribute('aria-label', paletteLabel(st, i));
      }
    }

    function applyFlag() {
      var st = SN.ExamSession.get();
      var id = SN.ExamSession.currentId();

      SN.ExamSession.toggleFlag(id);

      document.getElementById('flag').textContent =
        SN.ExamSession.isFlagged(id) ? 'Unflag' : 'Flag';
      document.getElementById('exam-meta').innerHTML = metaText();

      var i = SN.ExamSession.index();
      var cell = paletteCell(i);
      if (cell) {
        if (SN.ExamSession.isFlagged(id)) cell.classList.add('flagged');
        else cell.classList.remove('flagged');
        cell.setAttribute('aria-label', paletteLabel(st, i));
      }
    }
```

`metaText` and `paletteLabel` are passed HTML entities, so they are assigned with
`innerHTML`. Everything derived from the bank goes through `SN.UI.escape` at
render time; these two strings contain only numbers and fixed words.

- [ ] **Step 3: Update the call sites**

In the `exam` route, replace `drawQuestion();` with `renderExam();`.

- [ ] **Step 4: Verify by hand**

Open a long question — one with a stem over 400 characters, so it scrolls — and
click a choice low on the page. Expected: the page does not move, the row fills
with `--brand-soft`, the answered count goes up by one, and the palette cell
changes. Check the console has no errors. Toggle a checkbox on a multi question
twice and confirm both the row state and the counter track.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: patch picks and flags in place instead of re-rendering

A question is rendered once per navigation. Picking or flagging updates the
choice row, the multi-select counter, the answered and flagged counts and the
current palette cell without touching the rest of the view, so the page no
longer scrolls to the top on every answer and focus survives. This is the
structural change keyboard answering depends on."
```

---

### Task 6: Keyboard answering

Covers spec § Keyboard Answering.

- [ ] **Step 1: Add the shortcut help dialog markup to the static body**

Next to the existing `<dialog id="dlg"></dialog>`, add:

```html
<dialog id="keys-dlg" aria-labelledby="keys-title">
  <h2 id="keys-title">Keyboard shortcuts</h2>
  <h3>Answer</h3>
  <table>
    <tbody>
      <tr><td><kbd>A</kbd> &ndash; <kbd>K</kbd></td><td>Pick that choice</td></tr>
    </tbody>
  </table>
  <h3>Move</h3>
  <table>
    <tbody>
      <tr><td><kbd>&larr;</kbd> <kbd>&rarr;</kbd></td><td>Previous / next question</td></tr>
      <tr><td><kbd>Enter</kbd></td><td>Next, or Submit on the last question</td></tr>
      <tr><td><kbd>1</kbd> &ndash; <kbd>9</kbd></td><td>Jump to that question</td></tr>
    </tbody>
  </table>
  <h3>Meta</h3>
  <table>
    <tbody>
      <tr><td><kbd>F</kbd></td><td>Flag / unflag this question</td></tr>
      <tr><td><kbd>?</kbd></td><td>This sheet</td></tr>
    </tbody>
  </table>
  <div class="row row-end"><button class="btn" id="keys-close" type="button">Close</button></div>
</dialog>
```

Add `kbd` styling to the stylesheet, right after the `dialog` rules:

```css
  kbd {
    font: inherit;
    font-size: .85em;
    padding: .1rem .35rem;
    border: 1px solid var(--line-strong);
    border-bottom-width: 2px;
    border-radius: var(--r-sm);
    background: var(--surface-2);
    color: var(--ink);
  }
```

- [ ] **Step 2: Add the key handler**

Add after `applyFlag`:

```js
    var boundKeys = false;

    function onKey(e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      // A modal owns the keyboard while it is open, otherwise Enter would
      // re-trigger the submit dialog that is already up.
      if (document.getElementById('dlg').open) return;
      if (document.getElementById('keys-dlg').open) return;

      var k = e.key;
      if (k === '?') { e.preventDefault(); openKeys(); return; }
      if (k === 'f' || k === 'F') { e.preventDefault(); applyFlag(); return; }
      if (k === 'ArrowLeft') { e.preventDefault(); go(-1); return; }
      if (k === 'ArrowRight' || k === 'Enter') { e.preventDefault(); go(1); return; }
      if (k >= '1' && k <= '9') {
        e.preventDefault();
        SN.ExamSession.setIndex(parseInt(k, 10) - 1);
        renderExam();
        return;
      }
      if (/^[a-kA-K]$/.test(k)) {
        e.preventDefault();
        var letter = k.toUpperCase();
        if (!document.querySelector('#choices .choice[data-letter="' + letter + '"]')) return;
        applyPick(letter);
      }
    }

    function go(delta) {
      var i = SN.ExamSession.index();
      var last = SN.ExamSession.get().ids.length - 1;
      if (delta > 0 && i === last) { confirmSubmit(); return; }
      SN.ExamSession.setIndex(i + delta);
      renderExam();
    }

    function openKeys() {
      var d = document.getElementById('keys-dlg');
      if (!d.open) d.showModal();
    }
```

The letter guard is what makes `A`–`K` safe: a question with four choices ignores
`E` through `K` instead of doing something surprising.

- [ ] **Step 3: Bind and unbind on route entry and exit**

In the `exam` route, after `renderExam();`, add:

```js
      if (!boundKeys) {
        document.addEventListener('keydown', onKey);
        boundKeys = true;
      }
```

In the `results` route, where `SN.ExamSession.stopTimer();` is, add:

```js
      if (boundKeys) { document.removeEventListener('keydown', onKey); boundKeys = false; }
```

Binding in the route and unbinding in `results` covers the only two ways to leave
an exam. If another route is ever added, move both calls into `SN.Router.run()`
so they cannot drift.

- [ ] **Step 4: Wire the dialog's close button**

Next to the `<dialog id="keys-dlg">` markup is a bare element with no app logic, so
bind it once during boot, inside the loader's `.then()`:

```js
    document.getElementById('keys-close').addEventListener('click', function () {
      document.getElementById('keys-dlg').close();
    });
```

- [ ] **Step 5: Verify by hand**

On the exam screen: press `A` — the row selects, the page does not move, focus is
still where it was. Press `F` — the flag flips and the palette dot appears.
Arrow keys move. `Enter` on the last question opens the Submit dialog.
`1` jumps to question 1. `?` opens the sheet and `Escape` closes it.

Then go to setup and type in the number fields — no shortcut should fire.
Confirm `A` on a four-choice question does nothing for `E` through `K`.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: keyboard-first answering on the exam screen

A-K picks, arrows and Enter navigate, F flags, 1-9 jump, ? opens a shortcut
sheet. Bound on route entry and unbound on results. Ignored while typing in a
field, and letters beyond the question's last choice do nothing."
```

---

### Task 7: Exam bar, resume and abandoning an attempt

Covers spec § The exam bar and § Abandoning an attempt.

- [ ] **Step 1: Add `syncExamBar` and the discard handler**

Add next to `paintClock`:

```js
    function syncExamBar() {
      var bar = document.getElementById('exambar');
      var live = SN.ExamSession.has() && SN.Router.current() !== 'exam';
      bar.hidden = !live;
      if (live) {
        var st = SN.ExamSession.get();
        document.getElementById('exambar-text').innerHTML =
          'Attempt in progress &middot; Question ' + (SN.ExamSession.index() + 1) +
          ' of ' + st.ids.length;
      }
      paintClock();
    }
```

And add the discard action:

```js
    function discardAttempt() {
      var st = SN.ExamSession.get();
      SN.UI.confirm({
        title: 'Discard this attempt?',
        body: '<p>Question ' + (SN.ExamSession.index() + 1) + ' of ' + st.ids.length +
          ', ' + SN.ExamSession.answerCount() + ' answered, ' +
          SN.ExamSession.flagCount() + ' flagged. Nothing you answered is kept.</p>',
        yes: 'Discard'
      }, function () {
        SN.ExamSession.stopTimer();
        SN.ExamSession.discard();
        SN.Router.go('home');
      });
    }
```

- [ ] **Step 2: Add `discard` to `SN.ExamSession`**

Add to the module and to its return object:

```js
    function discard() {
      stopTimer();
      state = null;
      SN.Store.drop(KEY);
    }
```

This is deliberately not `submit()`: it drops the attempt without scoring it,
without recording history and without touching stats.

- [ ] **Step 3: Add `SN.UI.confirm`**

Add to the `SN.UI` module, alongside `render`:

```js
    function confirm(opts, onYes) {
      var dlg = document.getElementById('dlg');
      dlg.innerHTML =
        '<h2>' + escape(opts.title) + '</h2>' +
        (opts.body || '') +
        '<div class="row row-end">' +
        '<button class="btn" id="dlg-no">' + escape(opts.no || 'Cancel') + '</button>' +
        '<button class="btn btn-primary" id="dlg-yes">' + escape(opts.yes || 'Confirm') +
        '</button></div>';
      dlg.showModal();
      dlg.querySelector('#dlg-no').addEventListener('click', function () { dlg.close(); });
      dlg.querySelector('#dlg-yes').addEventListener('click', function () {
        dlg.close();
        onYes();
      });
    }
```

And export it: add `confirm: confirm,` to the returned object. `opts.body` is
HTML, because callers need live counts in it, so every caller must build it from
escaped values. `opts.title`, `opts.yes` and `opts.no` are escaped here.

Also add a close handler that empties the dialog, once, so stale ids cannot be
re-bound later. Next to the bare `<dialog id="dlg">` markup is a script with no
existing binding, so put it during boot:

```js
    document.getElementById('dlg').addEventListener('close', function () {
      this.innerHTML = '';
    });
```

- [ ] **Step 4: Call `syncExamBar` after every render**

In `SN.Router.run()`, after `fn(r.arg);` and before the nav-highlight loop, add:

```js
      if (typeof syncExamBar === 'function') syncExamBar();
```

The `typeof` guard matters: `run()` is called once before this function is
declared in source order only in some paths, and a missing function here would
break every route.

- [ ] **Step 5: Wire the resume button**

Bind it once during boot:

```js
    document.getElementById('exambar-resume').addEventListener('click', function () {
      SN.Router.go('exam');
    });
```

- [ ] **Step 6: Guard the setup screen against a silent overwrite**

In the `setup` route's start handler, replace the direct start with a confirm when
a session is live:

```js
      document.getElementById('start').addEventListener('click', function () {
        var settings = {
          questionCount: Math.min(
            Math.max(1, parseInt(document.getElementById('f-count').value, 10) || 1), max),
          durationMinutes: Math.max(1, parseInt(document.getElementById('f-minutes').value, 10) || 1),
          shuffle: document.getElementById('f-shuffle').checked,
          passPercent: Math.min(100, Math.max(1,
            parseInt(document.getElementById('f-pass').value, 10) || SN.bank.exam.passPercent))
        };

        if (!SN.ExamSession.has()) {
          SN.Settings.save(settings);
          SN.view.pendingSettings = settings;
          SN.Router.go('exam');
          return;
        }

        var st = SN.ExamSession.get();
        SN.UI.confirm({
          title: 'Replace the attempt in progress?',
          body: '<p>There is an attempt running at question ' + (SN.ExamSession.index() + 1) +
            ' of ' + st.ids.length + ' with ' + SN.ExamSession.answerCount() +
            ' answered. Starting a new one discards it.</p>',
          yes: 'Discard and start'
        }, function () {
          SN.ExamSession.discard();
          SN.Settings.save(settings);
          SN.view.pendingSettings = settings;
          SN.Router.go('exam');
        });
      });
```

- [ ] **Step 7: Route `confirmSubmit` and the stats clear through `SN.UI.confirm`**

Replace `confirmSubmit`'s hand-built dialog with the shared one:

```js
    function confirmSubmit() {
      var st = SN.ExamSession.get();
      var unanswered = st.ids.length - SN.ExamSession.answerCount();
      SN.UI.confirm({
        title: 'Submit this attempt?',
        body: '<p>' + SN.ExamSession.answerCount() + ' of ' + st.ids.length +
          ' answered. ' + SN.ExamSession.flagCount() + ' flagged.</p>' +
          (unanswered > 0
            ? '<p><strong>' + unanswered + ' unanswered</strong> will be scored as incorrect.</p>'
            : ''),
        no: 'Keep going',
        yes: 'Submit'
      }, function () {
        SN.ExamSession.submit(false);
        SN.Router.go('results');
      });
    }
```

And in the `stats` route:

```js
      document.getElementById('clear-stats').addEventListener('click', function () {
        SN.UI.confirm({
          title: 'Delete all per-question stats?',
          body: '<p>History is kept. This cannot be undone.</p>',
          yes: 'Delete'
        }, function () {
          SN.Stats.clear();
          SN.Router.run();
        });
      });
```

- [ ] **Step 8: Verify by hand**

Start an attempt, answer three questions, flag one. Click History. Expected: the
exam bar appears under the header, reading `Attempt in progress · Question 4 of 60`
with a countdown that ticks. Click Resume — you land on question 4 with your picks
and flags intact.

Then discard: click Home, click `Discard attempt`, and confirm the dialog names the
position, the answered count and the flagged count. After confirming, the attempt
is gone and history is unchanged.

Finally, start a second attempt and go to Setup and press Begin — a confirm
appears. Cancel it and confirm the live attempt is untouched.

- [ ] **Step 9: Commit**

```bash
git add index.html
git commit -m "feat: persistent exam bar, resume and deliberate abandoning

A live attempt is now visible from every view with a live countdown, and can be
resumed from there. Abandoning is always behind a confirm that names what is
lost, including when a new attempt would otherwise silently overwrite a running
one. Four confirmation sites share one SN.UI.confirm."
```

---

### Task 8: Home dashboard

Covers spec § Home Screen.

- [ ] **Step 1: Replace the `home` route**

```js
    SN.Router.add('home', function () {
      var list = SN.History.all();
      var live = SN.ExamSession.has();
      var st = SN.ExamSession.get();

      var stats;
      if (list.length) {
        var best = list.reduce(function (m, a) { return Math.max(m, a.percent); }, -1);
        stats = '<div class="stat-row">' +
          stat('Last', list[0].percent.toFixed(1) + '%') +
          stat('Best', best.toFixed(1) + '%') +
          stat('Attempts', String(list.length)) +
          '</div>';
      } else {
        stats = '<p class="hint">No attempts yet. Your scores will appear here.</p>';
      }

      var resume = '';
      if (live) {
        resume = '<div class="card">' +
          '<h3>Attempt in progress</h3>' +
          '<p class="resume-line">Question ' + (SN.ExamSession.index() + 1) + ' of ' +
          st.ids.length + ' &middot; ' + SN.ExamSession.answerCount() + ' answered &middot; ' +
          SN.ExamSession.flagCount() + ' flagged</p>' +
          '<p class="resume-line">' + fmtMs(SN.ExamSession.remainingMs()) + ' remaining</p>' +
          '<div class="row" style="margin-top:1rem">' +
          '<button class="btn btn-primary" id="resume">Resume</button>' +
          '<button class="btn btn-quiet" id="discard">Discard attempt</button>' +
          '</div></div>';
      }

      SN.UI.render(
        '<p class="home-title" data-autofocus>' +
        SN.UI.escape(SN.bank.exam.title) + '</p>' +
        '<p class="hint">' + SN.bank.exam.questionCount + ' questions &middot; ' +
        SN.bank.exam.durationMinutes + ' minutes &middot; pass at ' +
        SN.bank.exam.passPercent + '%</p>' +
        stats +
        resume +
        '<p class="row" style="margin-top:1.5rem">' +
        '<button class="btn btn-primary" id="go-setup">Start a new attempt</button></p>'
      );

      document.getElementById('go-setup').addEventListener('click', function () {
        SN.Router.go('setup');
      });

      if (live) {
        document.getElementById('resume').addEventListener('click', function () {
          SN.Router.go('exam');
        });
        document.getElementById('discard').addEventListener('click', function () {
          discardAttempt();
        });
      }
    });
```

- [ ] **Step 2: Add the `stat` helper**

Next to the other view helpers:

```js
    function stat(label, value) {
      return '<div class="stat"><div class="stat-label">' + label +
        '</div><div class="stat-value">' + value + '</div></div>';
    }
```

`label` and `value` are developer-supplied literals and safe to interpolate;
`value` carries a `%` from `toFixed`, which needs no escaping.

- [ ] **Step 3: Have the home countdown tick**

The resume card shows a countdown, but the tick only runs while a session exists.
Home already re-renders nothing per second, so the card's remaining time goes
stale. Add a targeted update in `syncExamBar`, which runs after every render and
on every tick. Insert at the end of `syncExamBar`, before `paintClock()`:

```js
      var rl = document.querySelector('.resume-line:last-of-type');
      if (rl && live) rl.textContent = fmtMs(SN.ExamSession.remainingMs()) + ' remaining';
```

`syncExamBar` runs once per route render, not per tick, so this alone would still
go stale. Add a call to `syncExamBar` from the clock instead. In `paintClock`,
after the exam bar clock is written, add:

```js
      var rl = document.querySelector('.resume-line:last-of-type');
      if (rl && SN.ExamSession.has()) rl.textContent = text + ' remaining';
```

and remove the duplicate `syncExamBar` hunk from step 3 above — `paintClock` is
called every second while a session exists, so it is the right owner. Note that
`syncExamBar` calls `paintClock`, and `paintClock` must not call `syncExamBar`, or
they recurse. Keep the direction one-way.

- [ ] **Step 4: Add a derived hint to the setup screen**

Under the minutes field in the `setup` route, insert a hint that shows the pace a
candidate is signing up for:

```js
        '<p class="hint" id="pace-hint"></p>' +
```

and after the `cancel` listener is bound:

```js
      var count = document.getElementById('f-count');
      var mins = document.getElementById('f-minutes');

      function paintPace() {
        var c = parseInt(count.value, 10) || 0;
        var m = parseInt(mins.value, 10) || 0;
        document.getElementById('pace-hint').textContent = (c && m)
          ? (Math.round(m / c * 100) / 100) + ' minutes per question'
          : '';
      }
      count.addEventListener('input', paintPace);
      mins.addEventListener('input', paintPace);
      paintPace();
```

- [ ] **Step 5: Verify by hand**

Home with no history: one hint line, no empty stat cells, a Start button. Start a
60-question attempt, answer ten, flag two, and go back to Home — the resume card
appears with the right counts, and its countdown ticks once a second. Discard it:
the card disappears, and if you had history the stats are unchanged.

Seed history and check the stat row picks the newest and the best:

```js
var list = [];
list.push({ at: new Date('2026-10-01T14:30:00').getTime(), total: 60, correct: 44,
  percent: 72.5, passPercent: 70, durationMinutes: 90, expired: false });
list.push({ at: new Date('2026-10-02T14:31:00').getTime(), total: 60, correct: 41,
  percent: 68.1, passPercent: 70, durationMinutes: 90, expired: false });
list.push({ at: new Date('2026-10-03T14:32:00').getTime(), total: 60, correct: 38,
  percent: 63.7, passPercent: 70, durationMinutes: 90, expired: false });
list.push({ at: new Date('2026-10-04T14:33:00').getTime(), total: 60, correct: 36,
  percent: 59.3, passPercent: 70, durationMinutes: 90, expired: true });
localStorage.setItem('sn.exam.history.v1', JSON.stringify(list));
location.reload();
```

Expected: `Last 59.3%` (newest, which is the most recent attempt), `Best 72.5%`,
`Attempts 4`. If Best shows 59.3% the row is reading the wrong end of the list.

On setup, changing the question count or minutes should update the pace hint live.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: home dashboard with last/best/attempts and a resume card

Last, best and attempts are derived from exam.history.v1, so no storage key or
schema changed. SN.lastResult is deliberately unused: it is null after a reload
and home has to be right on a fresh page load. The resume card's countdown is
owned by paintClock, which already runs once a second while a session is live."
```

---

### Task 9: Route focus management

Covers spec § Accessibility.

- [ ] **Step 1: Move focus to the view's focus target after every render**

In `SN.Router.run()`, insert immediately after `fn(r.arg);`:

```js
      var focusTarget = main ? main.querySelector('[data-autofocus]') : null;
```

`main` is module-private to `SN.UI`, so expose a getter. In the `SN.UI` module's
returned object, add:

```js
      main: function () { return main; },
```

and in `SN.Router.run()` use `SN.UI.main()`:

```js
      var host = SN.UI.main();
      var focusTarget = host ? host.querySelector('[data-autofocus]') : null;
      if (focusTarget) focusTarget.focus();
```

Focusing scrolls the element into view, which on the exam screen means the top of
the question — correct, because the position genuinely changed.

- [ ] **Step 2: Mark the focus targets on the remaining views**

Add `data-autofocus` to the first heading or paragraph of each view:

| View | Element |
|---|---|
| home | `<p class="home-title" data-autofocus>` — already added in Task 8 |
| exam | `<h2 data-autofocus>` — already added in Task 5 |
| results | the first `<h2>` in the `head` string |
| history | `<h2 data-autofocus>History</h2>` |
| stats | `<h2 data-autofocus>Stats</h2>` |
| setup | `<h2 data-autofocus>New attempt</h2>` |
| not found | `<h2 data-autofocus>Not found</h2>` |

- [ ] **Step 3: Verify by hand**

Tab from the header into the content and confirm a route change lands focus on the
view's heading, not back at the top of the document. On the exam screen, press
Next and confirm focus moves to the question number and the view scrolls to the
top. Then press `A` and confirm focus does **not** jump — that is the patch layer
working.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: move focus to the view heading on route change

Each view marks one element with data-autofocus and the router focuses it after
rendering, so a route change moves the reading position instead of leaving a
screen reader at the top of the document. Patching on pick means focus is not
disturbed within a question."
```

---

### Task 10: Results, history and stats visual pass

Covers spec § Out of Scope for behaviour, but these screens still get the review
treatment the new tokens enable. **Markup shape stays as it is** — only classes
and the one `<pre>` change.

- [ ] **Step 1: Class the review choices**

In the `results` route, replace the `choices` map with one that colours each
choice by outcome and keeps the accessible wording:

```js
      var body = rows.map(function (row) {
        var choices = row.choices.map(function (c) {
          var picked = row.picked.indexOf(c.id) !== -1;
          var right = row.correct.indexOf(c.id) !== -1;
          var cls = right ? 'right' : (picked ? 'wrong' : 'plain');
          var mark = right ? ' &#10003;' : (picked ? ' &#10007;' : '');
          var tag = right ? ' (correct)' : (picked ? ' (you picked this)' : '');
          return '<li class="' + cls + '">' + SN.UI.escape(c.text) + mark +
            '<span class="hint"> ' + tag + '</span></li>';
        }).join('');

        return '<div class="result-row">' +
          '<p class="verdict ' + (row.isCorrect ? 'ok' : 'no') + '">' +
          (row.isCorrect ? 'Correct' : 'Incorrect') + '</p>' +
          '<p>' + SN.UI.escape(row.stem) + '</p>' +
          '<ul class="result-choices">' + choices + '</ul></div>';
      }).join('');
```

The correct answer stays green, a wrong pick red, an untouched option muted. This
is the same information as before, arranged so a 60-question review is scannable.

- [ ] **Step 2: Give the expired banner and the verdict a class**

The expired banner currently uses inline styles, which do not follow the theme.
Replace:

```js
        ? '<div class="card" style="background:var(--bad-bg);color:var(--bad)">' +
          '<strong>Time expired.</strong> This attempt was submitted automatically.</div>'
```

with a `.card.expired` rule added to the stylesheet, and the string:

```js
        ? '<div class="card expired">' +
          '<strong>Time expired.</strong> This attempt was submitted automatically.</div>'
```

```css
  .card.expired { background: var(--bad-bg); color: var(--bad); border-color: transparent; }
```

Add `data-autofocus` to the results `<h2>`, which is the first element of `head`:

```js
        '<h2 data-autofocus>' + (passed ? 'Passed' : 'Not passed') + '</h2>' +
```

- [ ] **Step 3: Drop the inline layout styles**

Three places use `style="..."` for spacing that tokens or classes now cover:

- `'<p style="font-size:1.6rem;margin:.2rem 0">'` in the results summary →
  `'<p class="score-big">'` plus:

```css
  .score-big { font-size: 1.6rem; margin: .2rem 0; }
```

- `'<div class="row" style="margin:1.5rem 0 1rem">'` in the review filter row →
  `'<div class="row review-filters">'` plus:

```css
  .review-filters { margin: var(--s5) 0 var(--s4); align-items: baseline; }
```

- the two in Task 8's home markup: `style="margin-top:1rem"` and
  `style="margin-top:1.5rem"` → add `.card .row { margin-top: var(--s4); }` and
  `.home-cta { margin-top: var(--s5); }`, and use `class="row home-cta"` in home.

- setup's `'<label style="font-weight:400;margin:0">'` for the shuffle checkbox →
  `'<label class="inline">'`:

```css
  label.inline { display: inline-flex; align-items: center; gap: var(--s2); margin: 0; font-weight: 400; }
```

- setup's `'<p class="row" style="margin-top:1.25rem">'` → `'<div class="row" style="margin-top:var(--s5)">'`.
  A `<p class="row">` around buttons is invalid nesting; a `<div>` is correct.

- the bank-unavailable screen's bare `<pre>` → `'<pre class="card">'`, which the
  `.card` rule now styles.

- [ ] **Step 4: Verify by hand**

Submit an attempt and read the results in both themes. Correct choices are green
with a tick, wrong picks red with a cross, untouched options muted, and the
`(correct)` and `(you picked this)` wording is still present for screen readers.
Check the expired banner in dark mode — it should use the theme's red surface, not
the light one. Exercise all three review filters.

Seed stats so the table is not empty:

```js
SN.Stats.record({ rows: [
  { id: 'q-001', isCorrect: true },
  { id: 'q-002', isCorrect: false },
  { id: 'q-003', isCorrect: true }
] });
SN.Router.run();
```

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: theme-aware results review and inline-style cleanup

Review choices are coloured by outcome so a 60-question review is scannable,
the expired banner uses a class instead of inline styles so it follows the theme,
and the remaining inline spacing is replaced with tokens. Markup shape is
unchanged; this is presentation only."
```

---

### Task 11: Unchanged-regression verification

The point of this task is that Task 12's sign-off means nothing if these broke.
Scoring and storage are untouched by design, so this is a proof, not a fix.

- [ ] **Step 1: Run the automated checks**

```bash
node tools/validate.js questions.json
node -e 'const b=require("./questions.json");console.log(require("fs").readFileSync("questions.js","utf8")==="window.QUESTIONS = "+JSON.stringify(b,null,2)+";\n")'
git status --short
```

Expected: the `OK` line, then `true`, then no modified files under `questions.*` or
`tools/`.

- [ ] **Step 2: Verify multi-select scoring**

```js
SN.Scorer.setsMatch(['C','A'], ['A','C'])   // true
SN.Scorer.setsMatch(['A','B'], ['A'])       // false, count differs
SN.Scorer.setsMatch(['A','B','C'], ['A','B'])  // false, extra pick is no credit
```

Then on a multi question that needs three: pick exactly three and confirm it scores
correct. Add a fourth and confirm the pick is refused and the question still scores
correct. Leave one short and confirm it scores incorrect.

- [ ] **Step 3: Verify the unrounded percentage**

```js
SN.Scorer.score({ ids: ['q-001'], picks: {}, flags: {}, settings: {} })
```

Inspect the returned `percent` at full precision, then submit an attempt scoring
69.6% against a 70% mark and confirm the results screen reads `Not passed` with
`69.6%` displayed. This is `AGENTS.md` rule 3 and must not regress.

- [ ] **Step 4: Verify persistence across a full browser restart**

Complete an attempt. Close the tab, reopen the browser, load the app. Confirm
history and stats survived, that settings persisted, and that `sn.theme.v1`
survived. Start an attempt, answer, then hard-reload — picks, flags, position and
remaining time are all intact.

- [ ] **Step 5: Verify the error screen and blocked storage**

Rename `questions.json` temporarily and reload over HTTP. Expect the
`Question bank unavailable` screen naming both load attempts. Restore the file.

With `localStorage` blocked in DevTools, reload. Expect the warning strip, legible
in both themes, and an exam that still completes.

- [ ] **Step 6: Commit**

No code changes expected. If this task changed anything, commit the fix on its own
with a `fix:` prefix and say why in the body.

---

### Task 12: Full manual pass and documentation

- [ ] **Step 1: Work the spec's verification list**

Spec § Verification lists 20 numbered checks plus the blocked-storage case. Work
them **over HTTP first**, in this order:

1. Toggle the theme, reload — persists, no flash of the wrong theme
2. System preference followed when nothing is stored; an explicit choice survives
   an OS theme change
3. Every view in both themes: home, setup, exam, results, history, stats, and the
   bank-unavailable error screen
4. `A`–`K` selects; the page does not move; focus is never lost
5. `←` `→` `Enter` navigate; `Enter` on the last question opens Submit
6. `1`–`9` jump
7. `F` flags and unflags; the palette dot and the count follow
8. `?` opens and closes the sheet
9. Typing in the setup form's number fields triggers no shortcut
10. A multi question: pick to the cap, try a fourth, confirm nothing changes and
    the counter explains why
11. No scroll to top when picking on a long question
12. Reload mid-exam — same question, picks and flags intact, time identical
13. Reload mid-exam onto `#/home` — resume card with the right position and clock
14. Leave for History mid-exam — exam bar counts down; Resume returns
15. Discard — confirm names what is lost; afterwards the attempt is gone and the
    home stats are unchanged
16. Start a new attempt while one is live — confirm appears; cancelling leaves the
    live attempt alone
17. Expiry auto-submits with the banner, from the exam view and from another view
18. Multi-select scoring: exact set, an extra selection, one short
19. A 69.6% attempt reads Not passed against a 70% mark
20. Review filters, and history and stats across a full browser restart

Plus: `localStorage` blocked — warning legible in both themes, exam still
completes.

- [ ] **Step 2: Repeat the whole pass from `file://`**

```bash
open index.html    # macOS
xdg-open index.html # Linux
```

The app must behave identically. This is the path the app is actually delivered on,
so it is not optional — `questions.js` is the only bank source here.

- [ ] **Step 3: Record the visual-check result in `AGENTS.md`**

Amend the manual-verification bullet under **Commands**:

```markdown
- App changes are verified **by hand in a browser**, twice: over HTTP, and by
  double-clicking `index.html` (`file://`). There is no automated browser test.
  The numbered pass for the UI overhaul lives in
  `docs/superpowers/specs/2026-10-05-exam-ui-overhaul-design.md` § Verification.
```

- [ ] **Step 4: Commit**

`AGENTS.md` is untracked, so there is nothing to stage. This commit is a no-op
unless a fix fell out of the pass:

```bash
git commit -m "docs: point the manual verification pass at the overhaul spec"
```

If the working tree is clean, skip the commit and say so rather than creating an
empty one.

---

## Self-review against the spec

| Spec section | Task |
|---|---|
| § Visual System — tokens, typography, components | 1 |
| § Dark Mode — mechanism and toggle | 1 (tokens), 3 (toggle) |
| § Keyboard Answering — map, discoverability, help sheet | 6 |
| § The exam screen's heading | 5 |
| § The in-place patch layer | 5 |
| § Multi-select clarity | 5 |
| § Home Screen And Resume | 8 |
| § The exam bar | 7 |
| § Abandoning an attempt | 7 |
| § Shared confirm | 7 |
| § Accessibility — focus, clock, reduced motion, palette labels | 1, 4, 5, 9 |
| § Deliberate Behaviour Changes 1–5 | 2, 3, 4, 7 |
| § Verification | 11, 12 |

Two things worth flagging to whoever picks this up:

- **Task 8 step 3 is deliberately confusing and needs care.** It first adds the
  resume-card countdown to `syncExamBar`, then corrects itself by moving the
  ownership to `paintClock`. Implement it the second way. `paintClock` runs every
  second while a session is live; `syncExamBar` runs once per render. Having
  `paintClock` call `syncExamBar` while `syncExamBar` calls `paintClock` is
  infinite recursion.
- **The dark palette is written twice in the stylesheet, on purpose.** It is not
  duplication to clean up. The media query covers the pre-paint window before any
  script runs; the attribute block covers an explicit user choice. Removing either
  reintroduces either a flash or an override that does not take.