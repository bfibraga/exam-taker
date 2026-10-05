# ServiceNow Exam Taker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a zero-dependency, offline web app that runs a 423-question ServiceNow CSA bank as a timed exam from a double-clicked `index.html`.

**Architecture:** One `index.html` holding markup, styles, and all application code in a single IIFE under an `SN` namespace. The question bank lives in `questions.json` (canonical, hand-editable) with a generated `questions.js` wrapper for the `file://` fallback, since `fetch` is blocked on `file://`. Two plain-Node CLI tools convert the portal payload and validate the bank.

**Tech Stack:** Vanilla JS, no dependencies. Node 24 for the two CLI tools. `SN` is exposed on `window` so logic can be exercised from the browser console.

**Verification approach:** No test framework, per the approved spec. Every task ends with a concrete manual check. Scoring is verifiable from the console via `SN.Scorer.score(...)`.

**Source of truth:** `questions-response.json` — the ServiceNow portal bootstrap response, 423 questions at `result.containers[0].rows[0].columns[0].widgets[1].widget.data.questions`.

---

## File Structure

| File | Responsibility |
|---|---|
| `index.html` | Markup, CSS, and all app code in one IIFE exposing `SN` |
| `questions.json` | Generated canonical bank. The only file to hand-edit |
| `questions.js` | Generated `window.QUESTIONS` wrapper for `file://` |
| `tools/convert.js` | Reads `questions-response.json`, writes both bank files |
| `tools/validate.js` | Validates `questions.json` against the schema |
| `README.md` | Regenerating, validating, and sending the bundle |

**Do not commit `questions-response.json` contents beyond its local use.** It is the raw portal response containing a personal name, a federated account id, and session tokens. It stays in the working tree as a conversion input; it must not be pushed or shared. Add it to `.gitignore` in Task 1.

---

## Task 1: Converter — portal payload to question bank

**Files:**
- Create: `tools/convert.js`
- Create: `.gitignore`
- Generate (do not hand-edit): `questions.json`, `questions.js`

- [ ] **Step 1: Create `.gitignore`**

```
questions-response.json
node_modules/
```

- [ ] **Step 2: Untrack the raw payload**

```bash
git rm --cached questions-response.json
git add .gitignore
git commit -m "chore: keep portal payload out of version control"
```

- [ ] **Step 3: Write `tools/convert.js`**

```js
#!/usr/bin/env node
'use strict';

const fs = require('fs');

const PAYLOAD = 'questions-response.json';

// Verified against the real response: result.containers[0].rows[0]
// .columns[0].widgets[1].widget.data.questions
const QUESTION_PATH = [
  ['result'], ['containers', 0], ['rows', 0], ['columns', 0],
  ['widgets', 1], ['widget'], ['data'], ['questions']
];

function die(msg) {
  console.error('convert: ' + msg);
  process.exit(1);
}

function arg(name, fallback) {
  const hit = process.argv.find(a => a.indexOf('--' + name + '=') === 0);
  if (!hit) return fallback;
  return hit.slice(name.length + 3);
}

function walk(root) {
  let node = root;
  for (const [key, index] of QUESTION_PATH) {
    if (node == null) die('path broke at "' + key + '" — is this the exam payload?');
    node = node[key];
    if (index !== undefined) {
      if (!Array.isArray(node)) die('"' + key + '" is not an array');
      node = node[index];
    }
  }
  return node;
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

function letterFor(i) {
  if (i >= LETTERS.length) die('a question has more than 26 choices');
  return LETTERS[i];
}

const raw = fs.readFileSync(PAYLOAD, 'utf8');

let payload;
try {
  payload = JSON.parse(raw);
} catch (e) {
  die('cannot parse ' + PAYLOAD + ': ' + e.message);
}

const source = walk(payload);
if (!Array.isArray(source) || source.length === 0) {
  die('found no questions at the expected path');
}

const questions = source.map((q, qi) => {
  const label = 'question ' + (qi + 1);

  if (typeof q.sys_id !== 'string' || !q.sys_id) die(label + ' has no sys_id');
  if (typeof q.text !== 'string' || !q.text.trim()) die(label + ' has no text');
  if (!Array.isArray(q.answers) || q.answers.length < 2) {
    die(label + ' has fewer than 2 answers');
  }

  const flaggedCorrect = q.answers.filter(a => a.correct === true).length;

  if (typeof q.correct_count === 'number' && q.correct_count !== flaggedCorrect) {
    die(label + ': correct_count is ' + q.correct_count +
        ' but ' + flaggedCorrect + ' answers are flagged correct');
  }
  if (flaggedCorrect === 0) die(label + ' has no correct answer');

  const choices = q.answers.map((a, ai) => {
    if (typeof a.text !== 'string' || !a.text.trim()) {
      die(label + ' answer ' + (ai + 1) + ' has no text');
    }
    return { id: letterFor(ai), text: a.text };
  });

  const correct = q.answers
    .map((a, ai) => (a.correct === true ? LETTERS[ai] : null))
    .filter(Boolean);

  const isSingle = q.single_choice === true || correct.length === 1;

  return {
    id: 'q-' + String(qi + 1).padStart(3, '0'),
    type: isSingle ? 'single' : 'multi',
    stem: q.text,
    choices: choices,
    correct: correct
  };
});

const requested = parseInt(arg('count', '60'), 10);
if (isNaN(requested) || requested < 1) die('--count must be a positive integer');
const count = Math.min(requested, questions.length);

const bank = {
  version: 1,
  exam: {
    id: arg('id', 'servicenow-exam'),
    title: arg('title', 'ServiceNow Certification Exam'),
    passPercent: parseInt(arg('pass', '70'), 10),
    questionCount: count,
    durationMinutes: parseInt(arg('minutes', '90'), 10)
  },
  questions: questions
};

fs.writeFileSync('questions.json', JSON.stringify(bank, null, 2) + '\n');
fs.writeFileSync(
  'questions.js',
  'window.QUESTIONS = ' + JSON.stringify(bank, null, 2) + ';\n'
);

const singles = questions.filter(q => q.type === 'single').length;
const multis = questions.length - singles;

console.log('Wrote questions.json and questions.js');
console.log('  questions: ' + questions.length +
            ' (' + singles + ' single, ' + multis + ' multi)');
console.log('  defaults:  ' + count + ' questions, ' +
            bank.exam.durationMinutes + ' min, pass at ' +
            bank.exam.passPercent + '%');
if (requested > questions.length) {
  console.log('  note:      --count ' + requested + ' exceeded the bank, capped at ' +
              questions.length);
}
```

- [ ] **Step 4: Run the converter**

```bash
node tools/convert.js
```

Expected:

```
Wrote questions.json and questions.js
  questions: 423 (341 single, 82 multi)
  defaults:  60 questions 90 min, pass at 70%
```

Any other count means the path or shape assumption is wrong. Stop and re-probe rather than editing the output.

- [ ] **Step 5: Verify the conversion mechanically**

```bash
node -e '
const b = require("./questions.json");
const ids = new Set(b.questions.map(q => q.id));
console.log("unique ids:", ids.size === b.questions.length);
console.log("all letters valid:", b.questions.every(q =>
  q.correct.every(c => q.choices.some(ch => ch.id === c))));
console.log("multi have 2+ correct:", b.questions.every(q =>
  q.type !== "multi" || q.correct.length >= 2));
console.log("single have 1 correct:", b.questions.every(q =>
  q.type !== "single" || q.correct.length === 1));
console.log("wrapper matches:", require("fs").readFileSync("questions.js","utf8")
  === "window.QUESTIONS = " + JSON.stringify(b,null,2) + ";\n");
'
```

Expected: four `true` lines. The last line confirms the `file://` wrapper is not stale.

- [ ] **Step 6: Confirm the output is free of portal internals**

```bash
node -e '
const s = require("fs").readFileSync("questions.json","utf8");
// Structural markers only. Deliberately excludes words that legitimately
// appear in exam content: "template" (form templates) and "sys_id"
// (a question asks what a sys_id is).
const probes = ["deloitte","federated","sessionID","@","sp_widget","client_script",
                "css_variables","userName","escNavigation","loginWidget",
                "metastack","ng-if","pageURI"];
const hits = probes.filter(p => s.includes(p));
console.log(hits.length ? "LEAKED: " + hits.join(", ") : "clean: no portal internals");
'
```

Expected: `clean: no portal internals`. If anything is listed, the converter is copying too much — fix the mapping, do not hand-edit `questions.json`.

- [ ] **Step 7: Commit**

```bash
git add .gitignore tools/convert.js questions.json questions.js
git commit -m "feat: convert portal payload into a readable question bank"
```

---

## Task 2: Validator

**Files:**
- Create: `tools/validate.js`

Rejects unknown keys. This is the point of the tool: a typo like `correct_choice` is otherwise silently ignored, producing a question with no answer key that scores zero for every candidate.

- [ ] **Step 1: Write `tools/validate.js`**

```js
#!/usr/bin/env node
'use strict';

const fs = require('fs');

const FILE = process.argv[2] || 'questions.json';
const problems = [];

const EXAM_KEYS = ['id', 'title', 'passPercent', 'questionCount', 'durationMinutes'];
const QUESTION_KEYS = ['id', 'type', 'stem', 'choices', 'correct'];
const CHOICE_KEYS = ['id', 'text'];

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function checkKeys(obj, allowed, where) {
  for (const k of Object.keys(obj)) {
    if (allowed.indexOf(k) === -1) {
      problems.push(where + ': unknown key "' + k + '"');
    }
  }
}

function isFilledString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function isPositiveInt(v) {
  return Number.isInteger(v) && v >= 1;
}

let raw;
try {
  raw = fs.readFileSync(FILE, 'utf8');
} catch (e) {
  console.error('validate: cannot read ' + FILE + ': ' + e.message);
  process.exit(1);
}

let bank;
try {
  bank = JSON.parse(raw);
} catch (e) {
  console.error('validate: cannot parse ' + FILE + ': ' + e.message);
  process.exit(1);
}

if (!isPlainObject(bank)) {
  console.error('validate: top level must be a JSON object');
  process.exit(1);
}

checkKeys(bank, ['version', 'exam', 'questions'], 'root');

if (bank.version !== 1) problems.push('root.version: must be 1');

if (!isPlainObject(bank.exam)) {
  problems.push('root.exam: must be an object');
} else {
  const e = bank.exam;
  checkKeys(e, EXAM_KEYS, 'root.exam');
  if (!isFilledString(e.id)) problems.push('root.exam.id: must be a non-empty string');
  if (!isFilledString(e.title)) problems.push('root.exam.title: must be a non-empty string');
  if (!Number.isInteger(e.passPercent) || e.passPercent < 1 || e.passPercent > 100) {
    problems.push('root.exam.passPercent: must be an integer from 1 to 100');
  }
  if (!isPositiveInt(e.questionCount)) {
    problems.push('root.exam.questionCount: must be an integer of at least 1');
  }
  if (!isPositiveInt(e.durationMinutes)) {
    problems.push('root.exam.durationMinutes: must be an integer of at least 1');
  }
}

if (!Array.isArray(bank.questions) || bank.questions.length === 0) {
  problems.push('root.questions: must be a non-empty array');
} else {
  const seenIds = new Set();

  bank.questions.forEach((q, i) => {
    const at = 'questions[' + i + ']';

    if (!isPlainObject(q)) {
      problems.push(at + ': must be an object');
      return;
    }

    checkKeys(q, QUESTION_KEYS, at);

    if (!isFilledString(q.id)) {
      problems.push(at + '.id: must be a non-empty string');
    } else if (seenIds.has(q.id)) {
      problems.push(at + '.id: duplicate id "' + q.id + '"');
    } else {
      seenIds.add(q.id);
    }

    if (q.type !== 'single' && q.type !== 'multi') {
      problems.push(at + '.type: must be "single" or "multi", got ' + JSON.stringify(q.type));
    }

    if (!isFilledString(q.stem)) problems.push(at + '.stem: must be a non-empty string');

    const choiceIds = new Set();

    if (!Array.isArray(q.choices) || q.choices.length < 2) {
      problems.push(at + '.choices: must be an array of at least 2 choices');
    } else {
      q.choices.forEach((c, ci) => {
        const cat = at + '.choices[' + ci + ']';
        if (!isPlainObject(c)) {
          problems.push(cat + ': must be an object');
          return;
        }
        checkKeys(c, CHOICE_KEYS, cat);
        if (!isFilledString(c.id)) problems.push(cat + '.id: must be a non-empty string');
        else if (choiceIds.has(c.id)) problems.push(cat + '.id: duplicate "' + c.id + '"');
        else choiceIds.add(c.id);
        if (!isFilledString(c.text)) problems.push(cat + '.text: must be a non-empty string');
      });
    }

    if (!Array.isArray(q.correct) || q.correct.length === 0) {
      problems.push(at + '.correct: must be a non-empty array');
    } else {
      const seenCorrect = new Set();
      q.correct.forEach((cid, ki) => {
        const kat = at + '.correct[' + ki + ']';
        if (!isFilledString(cid)) {
          problems.push(kat + ': must be a non-empty string');
        } else if (seenCorrect.has(cid)) {
          problems.push(kat + ': duplicate "' + cid + '"');
        } else {
          seenCorrect.add(cid);
          if (!choiceIds.has(cid)) {
            problems.push(kat + ': "' + cid + '" is not among the choices');
          }
        }
      });

      if (q.type === 'single' && q.correct.length !== 1) {
        problems.push(at + '.correct: single questions need exactly 1, got ' + q.correct.length);
      }
      if (q.type === 'multi' && q.correct.length < 2) {
        problems.push(at + '.correct: multi questions need 2 or more, got ' + q.correct.length);
      }
    }
  });

  if (isPlainObject(bank.exam) && isPositiveInt(bank.exam.questionCount) &&
      bank.exam.questionCount > bank.questions.length) {
    problems.push('root.exam.questionCount: ' + bank.exam.questionCount +
                  ' exceeds the ' + bank.questions.length + ' questions in the bank');
  }
}

if (problems.length === 0) {
  const qn = bank.questions.length;
  const singles = bank.questions.filter(q => q.type === 'single').length;
  console.log('OK  ' + FILE + ': ' + qn + ' questions valid (' +
              singles + ' single, ' + (qn - singles) + ' multi)');
  process.exit(0);
}

console.error('FAIL  ' + FILE + ': ' + problems.length + ' problem' +
              (problems.length === 1 ? '' : 's'));
for (const p of problems) console.error('  ' + p);
process.exit(1);
```

- [ ] **Step 2: Run it against the real bank**

```bash
node tools/validate.js questions.json
```

Expected:

```
OK  questions.json: 423 questions valid (341 single, 82 multi)
```

- [ ] **Step 3: Prove it rejects the failure modes it exists for**

```bash
node -e '
const fs=require("fs");
const b=JSON.parse(fs.readFileSync("questions.json","utf8"));
b.questions[0].correct_choice=["A"];
b.questions[1].correct=["Z"];
b.questions[2].id=b.questions[3].id;
b.questions[4].choices[0].texts="typo";
b.questions[5].type="multi";
fs.writeFileSync("/tmp/bad.json",JSON.stringify(b,null,2));
'
node tools/validate.js /tmp/bad.json; echo "exit=$?"
rm /tmp/bad.json
```

Expected: six problems and `exit=1`:

```
FAIL  /tmp/bad.json: 6 problems
  questions[0]: unknown key "correct_choice"
  questions[1].correct[0]: "Z" is not among the choices
  questions[1].correct: multi questions need 2 or more, got 1
  questions[3].id: duplicate id "q-004"
  questions[4].choices[0]: unknown key "texts"
  questions[5].correct: multi questions need 2 or more, got 1
```

Six rather than five because `questions[1]` is a multi whose only correct entry
was replaced with `"Z"`, so it is genuinely both an unknown letter and a
multi-select with too few correct answers. Both are true violations.

If the exit code is 0 the validator is not doing its job.

- [ ] **Step 4: Commit**

```bash
git add tools/validate.js
git commit -m "feat: add question bank validator"
```

---

## Task 3: App shell, storage, and routing

**Files:**
- Create: `index.html`

Builds the frame every later task fills in: `SN.Store`, `SN.Loader`, `SN.Router`, the header/nav, and the `file://` loading strategy. Ends with a page that loads the bank and shows its size, which is the first proof that both load paths work.

- [ ] **Step 1: Write `index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Exam Runner</title>
<style>
  :root {
    --ink: #10171a;
    --muted: #4f5c62;
    --line: #d9d9d9;
    --bg: #ffffff;
    --panel: #f5f6f7;
    --brand: #004f65;
    --good: #1c6b3c;
    --good-bg: #e4f2ea;
    --bad: #a4262c;
    --bad-bg: #fbeaeb;
    --warn-bg: #fdf3d8;
    --warn-ink: #6b5310;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font: 16px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: var(--ink);
    background: var(--bg);
  }
  header {
    border-bottom: 1px solid var(--line);
    padding: 1rem 1.5rem;
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    align-items: baseline;
  }
  header h1 { font-size: 1.2rem; margin: 0; }
  nav { display: flex; gap: 1rem; flex-wrap: wrap; }
  nav a { color: var(--muted); text-decoration: none; padding: .2rem 0; }
  nav a.active { color: var(--brand); border-bottom: 2px solid var(--brand); font-weight: 600; }
  #timer {
    margin-left: auto;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }
  #timer.urgent { color: var(--bad); }
  main { max-width: 46rem; margin: 0 auto; padding: 1.5rem; }
  footer {
    border-top: 1px solid var(--line);
    padding: 1rem 1.5rem;
    color: var(--muted);
    font-size: .85rem;
  }
  h2 { font-size: 1.1rem; margin-top: 0; }
  label { display: block; margin: .9rem 0 .25rem; font-weight: 600; }
  input[type=number], input[type=text], select {
    font: inherit;
    padding: .45rem .55rem;
    border: 1px solid var(--line);
    border-radius: 4px;
    min-width: 8rem;
  }
  .hint { color: var(--muted); font-size: .85rem; margin: .2rem 0 0; }
  button {
    font: inherit;
    padding: .5rem 1rem;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--panel);
    cursor: pointer;
  }
  button.primary { background: var(--brand); color: #fff; border-color: var(--brand); }
  button:disabled { opacity: .5; cursor: default; }
  .row { display: flex; gap: .6rem; flex-wrap: wrap; align-items: center; }
  .card {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 1rem;
    margin: 1rem 0;
  }
  #notice { display: none; margin: 0; padding: .7rem 1.5rem; background: var(--warn-bg); color: var(--warn-ink); }
  #notice.show { display: block; }
  .stem { font-size: 1.05rem; margin-bottom: 1rem; }
  .choice { display: flex; gap: .6rem; align-items: flex-start; padding: .5rem; border-radius: 4px; }
  .choice:hover { background: var(--panel); }
  .palette { display: flex; flex-wrap: wrap; gap: .35rem; margin: 1.25rem 0; }
  .palette button { min-width: 2.3rem; padding: .35rem; font-variant-numeric: tabular-nums; }
  .palette button.current { outline: 2px solid var(--brand); outline-offset: 1px; font-weight: 700; }
  .palette button.answered { background: var(--brand); color: #fff; border-color: var(--brand); }
  .palette button.flagged { border-color: var(--brand); border-width: 2px; }
  .result-row { border-top: 1px solid var(--line); padding: .9rem 0; }
  .verdict { font-weight: 700; }
  .verdict.ok { color: var(--good); }
  .verdict.no { color: var(--bad); }
  .pill { display: inline-block; padding: .1rem .5rem; border-radius: 999px; font-size: .8rem; }
  .pill.ok { background: var(--good-bg); color: var(--good); }
  .pill.no { background: var(--bad-bg); color: var(--bad); }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: .5rem; border-bottom: 1px solid var(--line); }
  dialog { border: 1px solid var(--line); border-radius: 8px; padding: 1.25rem; max-width: 26rem; }
  dialog::backdrop { background: rgba(16,23,26,.35); }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
</style>
</head>
<body>

<header>
  <h1 id="title">Exam Runner</h1>
  <nav id="nav"></nav>
  <span id="timer" aria-live="polite" hidden></span>
</header>

<p id="notice" role="status"></p>

<main id="main">
  <p>Loading question bank&hellip;</p>
</main>

<footer>
  <span id="footer-note"></span>
</footer>

<!-- Present at all times: on file:// the fetch below fails and SN.Loader
     reads window.QUESTIONS instead. Over HTTP it loads harmlessly and is
     never consulted. -->
<script src="./questions.js"></script>

<script>
(function () {
  'use strict';

  var SN = {};
  window.SN = SN;

  // ---------------------------------------------------------------- Store

  SN.Store = (function () {
    var PREFIX = 'sn.';
    var memory = {};
    var available = (function () {
      try {
        var k = PREFIX + '__probe';
        window.localStorage.setItem(k, '1');
        window.localStorage.removeItem(k);
        return true;
      } catch (e) {
        return false;
      }
    })();

    function read(name) {
      if (available) {
        try { return window.localStorage.getItem(PREFIX + name); }
        catch (e) { return null; }
      }
      return Object.prototype.hasOwnProperty.call(memory, name) ? memory[name] : null;
    }

    function write(name, value) {
      if (available) {
        try { window.localStorage.setItem(PREFIX + name, value); return true; }
        catch (e) { available = false; }
      }
      memory[name] = value;
      return false;
    }

    function drop(name) {
      if (available) {
        try { window.localStorage.removeItem(PREFIX + name); } catch (e) {}
      }
      delete memory[name];
    }

    return {
      isPersistent: function () { return available; },
      getJSON: function (name) {
        var raw = read(name);
        if (raw === null) return null;
        try { return JSON.parse(raw); }
        catch (e) {
          drop(name);
          SN.UI.warn('Stored "' + name + '" was unreadable and has been reset.');
          return null;
        }
      },
      setJSON: function (name, value) { return write(name, JSON.stringify(value)); },
      drop: drop
    };
  })();

  // --------------------------------------------------------------- Loader

  SN.Loader = (function () {
    var FAILED_JSON = null;

    function viaFetch() {
      if (typeof window.fetch !== 'function') return Promise.reject(new Error('no fetch'));
      return window.fetch('./questions.json', { cache: 'no-store' })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        });
    }

    function viaScript() {
      if (!window.QUESTIONS) throw new Error('questions.js did not load');
      return window.QUESTIONS;
    }

    function load() {
      return viaFetch().catch(function (err) {
        // file:// blocks fetch; that is expected, not an error to shout about.
        if (window.location.protocol === 'file:') FAILED_JSON = err;
        try { return viaScript(); }
        catch (e2) {
          throw new Error(
            'Could not read the question bank.\n\n' +
            'Tried fetch("./questions.json"): ' + err.message + '\n' +
            'Tried window.QUESTIONS: ' + e2.message + '\n\n' +
            'Make sure questions.json and questions.js sit in the same folder ' +
            'as index.html, then regenerate them with:\n' +
            '  node tools/convert.js'
          );
        }
      });
    }

    return { load: load, jsonError: function () { return FAILED_JSON; } };
  })();

  // ------------------------------------------------------------------ UI

  SN.UI = (function () {
    var main = null;

    function warn(msg) {
      var el = document.getElementById('notice');
      if (!el) return;
      el.textContent = msg;
      el.className = 'show';
    }

    function clearWarn() {
      var el = document.getElementById('notice');
      if (el) { el.textContent = ''; el.className = ''; }
    }

    function render(html) {
      main.innerHTML = html;
      window.scrollTo(0, 0);
    }

    function escape(s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }

    return {
      init: function () { main = document.getElementById('main'); },
      render: render,
      warn: warn,
      clearWarn: clearWarn,
      escape: escape
    };
  })();

  // --------------------------------------------------------------- Router

  SN.Router = (function () {
    var routes = {};
    var current = '';

    function parse() {
      var h = window.location.hash.replace(/^#/, '');
      var slash = h.indexOf('/');
      return {
        name: slash === -1 ? (h || 'home') : h.slice(0, slash),
        arg: slash === -1 ? null : h.slice(slash + 1)
      };
    }

    function go(name, arg) {
      window.location.hash = '#/' + name + (arg ? '/' + arg : '');
    }

    function run() {
      var r = parse();
      current = r.name;
      var fn = routes[r.name];
      if (!fn) { SN.UI.render('<h2>Not found</h2><p>No view named "' +
        SN.UI.escape(r.name) + '".</p>'); return; }
      fn(r.arg);
      var links = document.querySelectorAll('#nav a');
      for (var i = 0; i < links.length; i++) {
        var on = links[i].getAttribute('href') === '#/' + r.name;
        links[i].className = on ? 'active' : '';
        if (on) links[i].setAttribute('aria-current', 'page');
        else links[i].removeAttribute('aria-current');
      }
    }

    return {
      add: function (name, fn) { routes[name] = fn; },
      go: go,
      start: function () {
        window.addEventListener('hashchange', run);
        run();
      },
      current: function () { return current; }
    };
  })();

  // ----------------------------------------------------------------- boot

  SN.UI.init();

  if (!SN.Store.isPersistent()) {
    SN.UI.warn('This browser is blocking local storage, so nothing will be saved ' +
               'between visits. The exam still works for this session.');
  }

  SN.Loader.load().then(function (bank) {
    SN.bank = bank;
    document.getElementById('title').textContent = bank.exam.title;
    document.getElementById('footer-note').textContent =
      bank.questions.length + ' questions in this bank.';

    var nav = document.getElementById('nav');
    nav.innerHTML = ['home', 'setup', 'history', 'stats']
      .map(function (n) {
        return '<a href="#/' + n + '">' + n.charAt(0).toUpperCase() + n.slice(1) + '</a>';
      }).join('');

    SN.Router.add('home', function () {
      SN.UI.render(
        '<h2>' + SN.UI.escape(SN.bank.exam.title) + '</h2>' +
        '<div class="card"><p>' + SN.bank.questions.length + ' questions loaded. ' +
        'Default exam: <strong>' + SN.bank.exam.questionCount + ' questions</strong>, ' +
        '<strong>' + SN.bank.exam.durationMinutes + ' minutes</strong>, pass at <strong>' +
        SN.bank.exam.passPercent + '%</strong>.</p>' +
        '<p><button class="primary" id="go-setup">Start</button></p></div>'
      );
      document.getElementById('go-setup').addEventListener('click', function () {
        SN.Router.go('setup');
      });
    });

    SN.Router.start();
  }).catch(function (err) {
    SN.UI.render('<h2>Question bank unavailable</h2><pre style="white-space:pre-wrap">' +
                SN.UI.escape(err.message) + '</pre>');
  });

})();
</script>
</body>
</html>
```

- [ ] **Step 2: Verify over HTTP, then over `file://`**

```bash
python3 -m http.server 8765 &
```

Open `http://localhost:8765/` — expect the exam title, four nav links, "423 questions loaded", and no warning strip.

Then open `index.html` by double-click (`file://`) — expect the identical page. If `file://` fails, `questions.js` is missing or stale; rerun `node tools/convert.js`.

Press F12, confirm `SN` is defined and `SN.bank.questions.length` is 423:

```js
SN.Store.isPersistent()
SN.bank.questions[0].id
```

- [ ] **Step 3: Stop the server**

```bash
kill %1
```

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: add app shell with dual-path bank loading"
```

---

## Task 4: Setup and question drawing

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add `SN.Settings` and `SN.Questions` inside the IIFE**

Insert after the `SN.Loader` block, before `SN.UI`:

```js
  // ------------------------------------------------------------- Settings

  SN.Settings = (function () {
    var KEY = 'exam.settings.v1';

    function defaults() {
      return {
        questionCount: SN.bank.exam.questionCount,
        durationMinutes: SN.bank.exam.durationMinutes,
        shuffle: true,
        passPercent: SN.bank.exam.passPercent
      };
    }

    function load() {
      var d = defaults();
      var saved = SN.Store.getJSON(KEY);
      if (!saved) return d;
      // Re-clamp: the bank may have shrunk since these were saved.
      return {
        questionCount: Math.min(Number(saved.questionCount) || d.questionCount, SN.bank.questions.length),
        durationMinutes: Number(saved.durationMinutes) || d.durationMinutes,
        shuffle: saved.shuffle !== false,
        passPercent: Number(saved.passPercent) || d.passPercent
      };
    }

    function save(s) { SN.Store.setJSON(KEY, s); }

    return { defaults: defaults, load: load, save: save };
  })();

  // ------------------------------------------------------------ Questions

  SN.Questions = (function () {
    var byId = {};
    SN.bank.questions.forEach(function (q) { byId[q.id] = q; });

    function get(id) { return byId[id]; }
    function all() { return SN.bank.questions; }
    function count() { return SN.bank.questions.length; }

    function draw(n, shuffle) {
      var pool = SN.bank.questions.slice();
      if (shuffle) {
        for (var i = pool.length - 1; i > 0; i--) {
          var j = Math.floor(Math.random() * (i + 1));
          var t = pool[i]; pool[i] = pool[j]; pool[j] = t;
        }
      }
      return pool.slice(0, Math.min(n, pool.length)).map(function (q) { return q.id; });
    }

    return { get: get, all: all, count: count, draw: draw };
  })();
```

- [ ] **Step 2: Add the setup view inside the load handler**

Replace the `SN.Router.add('home', ...)` block with the home view above plus this setup route:

```js
    SN.Router.add('setup', function () {
      var s = SN.Settings.load();
      var max = SN.Questions.count();

      SN.UI.render(
        '<h2>New attempt</h2>' +
        '<label for="f-count">Questions</label>' +
        '<input type="number" id="f-count" min="1" max="' + max + '" value="' + s.questionCount + '">' +
        '<p class="hint">' + max + ' available. With shuffle off, the first N in file order are used.</p>' +
        '<label for="f-minutes">Minutes</label>' +
        '<input type="number" id="f-minutes" min="1" max="600" value="' + s.durationMinutes + '">' +
        '<label for="f-pass">Pass mark (%)</label>' +
        '<input type="number" id="f-pass" min="1" max="100" value="' + s.passPercent + '">' +
        '<div class="row" style="margin-top:1rem">' +
        '<label style="font-weight:400;margin:0">' +
        '<input type="checkbox" id="f-shuffle"' + (s.shuffle ? ' checked' : '') + '> Shuffle questions</label>' +
        '</div>' +
        '<p class="row" style="margin-top:1.25rem">' +
        '<button class="primary" id="start">Begin</button> ' +
        '<button id="cancel">Cancel</button></p>'
      );

      document.getElementById('cancel').addEventListener('click', function () {
        SN.Router.go('home');
      });

      document.getElementById('start').addEventListener('click', function () {
        var settings = {
          questionCount: Math.min(
            Math.max(1, parseInt(document.getElementById('f-count').value, 10) || 1), max),
          durationMinutes: Math.max(1, parseInt(document.getElementById('f-minutes').value, 10) || 1),
          shuffle: document.getElementById('f-shuffle').checked,
          passPercent: Math.min(100, Math.max(1,
            parseInt(document.getElementById('f-pass').value, 10) || SN.bank.exam.passPercent))
        };
        SN.Settings.save(settings);
        SN.view.pendingSettings = settings;
        SN.Router.go('exam');
      });
    });
```

Setup stashes its values in `SN.view.pendingSettings` and routes to `exam`. The
`exam` route itself arrives in Task 5, so clicking Begin here lands on the
"Not found" view. That is expected at this stage.

- [ ] **Step 3: Verify**

Reload. Setup opens with 60, 90, 70, shuffle on. Set count to 999 — it clamps to 423 on Begin. Reload the page: your last values persist. Untick shuffle, Begin, and confirm the clamp and the draw in the console:

```js
SN.Questions.draw(5, false).map(id => id)
```

Expect `['q-001','q-002','q-003','q-004','q-005']` every time.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: add setup screen and question drawing"
```

---

## Task 5: Exam session, persistence, and timer

**Files:**
- Modify: `index.html`

The largest piece. State lives in one object; every mutation writes through to storage so a reload can resume.

- [ ] **Step 1: Add `SN.ExamSession` before `SN.UI`**

```js
  // ---------------------------------------------------------- ExamSession

  SN.ExamSession = (function () {
    var KEY = 'exam.active.v1';
    var state = null;
    var timerHandle = null;
    var onTick = null;

    function blank() {
      return { ids: [], picks: {}, flags: {}, startedAt: null, deadlineAt: null, settings: null };
    }

    function persist() { if (state) SN.Store.setJSON(KEY, state); }

    function start(settings) {
      var now = Date.now();
      state = {
        ids: SN.Questions.draw(settings.questionCount, settings.shuffle),
        picks: {},
        flags: {},
        startedAt: now,
        deadlineAt: now + settings.durationMinutes * 60000,
        settings: settings
      };
      persist();
    }

    function restore() {
      var saved = SN.Store.getJSON(KEY);
      if (!saved || !Array.isArray(saved.ids) || !saved.ids.length) return false;
      var missing = saved.ids.filter(function (id) { return !SN.Questions.get(id); });
      if (missing.length) {
        // The bank changed underneath us. Drop it rather than render holes.
        SN.Store.drop(KEY);
        return false;
      }
      state = saved;
      return true;
    }

    function has() { return !!state; }
    function get() { return state; }

    function index() { return SN.Router.current() === 'exam' ? SN.view.index : 0; }
    function setIndex(i) {
      var max = state.ids.length - 1;
      SN.view.index = Math.min(max, Math.max(0, i));
    }
    function currentId() { return state.ids[SN.view.index]; }
    function currentQuestion() { return SN.Questions.get(currentId()); }

    function picksFor(id) { return state.picks[id] || []; }
    function isFlagged(id) { return !!state.flags[id]; }

    function toggleFlag(id) {
      if (state.flags[id]) delete state.flags[id];
      else state.flags[id] = true;
      persist();
    }

    function answerCount() {
      return state.ids.filter(function (id) {
        return (state.picks[id] || []).length > 0;
      }).length;
    }

    function flagCount() {
      return state.ids.filter(function (id) { return state.flags[id]; }).length;
    }

    function remainingMs() {
      if (!state || !state.deadlineAt) return Infinity;
      return Math.max(0, state.deadlineAt - Date.now());
    }

    function submit(expired) {
      stopTimer();
      SN.Store.drop(KEY);
      var result = SN.Scorer.score(state);
      result.expired = !!expired;
      result.durationMinutes = state.settings.durationMinutes;
      result.passPercent = state.settings.passPercent;
      SN.Stats.record(result);
      SN.History.add(result);
      SN.lastResult = result;
      state = null;
      return result;
    }

    function startTimer(fn) {
      onTick = fn;
      stopTimer();
      timerHandle = setInterval(function () {
        if (onTick) onTick();
        if (remainingMs() <= 0) {
          stopTimer();
          if (state) {
            var r = submit(true);
            SN.Router.go('results', r.expired ? 'expired' : null);
          }
        }
      }, 1000);
    }

    function stopTimer() {
      if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }
      onTick = null;
    }

    function setPick(id, letter) {
      var q = SN.Questions.get(id);
      if (!q) return;
      var cur = picksFor(id).slice();
      var at = cur.indexOf(letter);
      if (q.type === 'single') {
        cur = [letter];
      } else if (at === -1) {
        // Multi-select stops at the required count, which is what "Choose 3"
        // means. Unchecking first is the only way to swap a choice.
        if (cur.length >= q.correct.length) return;
        cur.push(letter);
      } else {
        cur.splice(at, 1);
      }
      state.picks[id] = cur;
      persist();
    }

    return {
      start: start, restore: restore, has: has, get: get,
      index: index, setIndex: setIndex,
      currentId: currentId, currentQuestion: currentQuestion,
      picksFor: picksFor, isFlagged: isFlagged, toggleFlag: toggleFlag,
      answerCount: answerCount, flagCount: flagCount,
      remainingMs: remainingMs, setPick: setPick,
      startTimer: startTimer, stopTimer: stopTimer, submit: submit
    };
  })();
```

- [ ] **Step 2: Add `SN.view` near the boot code, before `SN.UI.init()`**

```js
  SN.view = { index: 0 };
```

`SN.view.index` is the single place the current question position lives, so a reload inside the exam restores the exact question too.

- [ ] **Step 3: Add the exam view inside the load handler**

```js
    SN.Router.add('exam', function () {
      // Set up by Task 4's setup screen.
      if (SN.view.pendingSettings) {
        SN.ExamSession.start(SN.view.pendingSettings);
        SN.view.pendingSettings = null;
        SN.view.index = 0;
      }
      if (!SN.ExamSession.has() && !SN.ExamSession.restore()) {
        SN.Router.go('setup');
        return;
      }
      SN.UI.clearWarn();
      drawQuestion();
      SN.ExamSession.startTimer(paintTimer);
    });

    function fmtMs(ms) {
      var s = Math.floor(ms / 1000);
      var m = Math.floor(s / 60);
      return m + ':' + String(s % 60).padStart(2, '0');
    }

    function paintTimer() {
      var el = document.getElementById('timer');
      var ms = SN.ExamSession.remainingMs();
      el.hidden = false;
      el.textContent = fmtMs(ms);
      el.className = ms <= 60000 ? 'urgent' : '';
    }

    function drawQuestion() {
      var st = SN.ExamSession.get();
      var i = SN.ExamSession.index();
      var id = SN.ExamSession.currentId();
      var q = SN.ExamSession.currentQuestion();
      var picked = SN.ExamSession.picksFor(id);
      var multi = q.type === 'multi';

      var choices = q.choices.map(function (c) {
        var on = picked.indexOf(c.id) !== -1;
        return '<label class="choice"><input type="' + (multi ? 'checkbox' : 'radio') +
          '" name="pick" value="' + c.id + '"' + (on ? ' checked' : '') + '> ' +
          '<span>' + SN.UI.escape(c.text) + '</span></label>';
      }).join('');

      var palette = st.ids.map(function (qid, idx) {
        var cls = [];
        if (idx === i) cls.push('current');
        if ((st.picks[qid] || []).length) cls.push('answered');
        if (st.flags[qid]) cls.push('flagged');
        var label = 'Question ' + (idx + 1) +
          ((st.picks[qid] || []).length ? ', answered' : ', not answered') +
          (st.flags[qid] ? ', flagged' : '');
        return '<button class="' + cls.join(' ') + '" data-i="' + idx +
          '" aria-label="' + label + '">' + (idx + 1) + '</button>';
      }).join('');

      SN.UI.render(
        '<h2>' + SN.UI.escape(SN.bank.exam.title) + '</h2>' +
        '<p class="hint">Question ' + (i + 1) + ' of ' + st.ids.length + ' &middot; ' +
        SN.ExamSession.answerCount() + ' answered &middot; ' +
        SN.ExamSession.flagCount() + ' flagged' +
        (multi ? ' &middot; choose ' + q.correct.length : '') + '</p>' +
        '<div class="stem">' + SN.UI.escape(q.stem) + '</div>' +
        '<div id="choices">' + choices + '</div>' +
        '<div class="palette">' + palette + '</div>' +
        '<div class="row">' +
        '<button id="prev"' + (i === 0 ? ' disabled' : '') + '>Previous</button>' +
        '<button id="next"' + (i === st.ids.length - 1 ? ' disabled' : '') + '>Next</button>' +
        '<button id="flag">' + (SN.ExamSession.isFlagged(id) ? 'Unflag' : 'Flag') + '</button>' +
        '<button class="primary" id="submit">Submit exam</button>' +
        '</div>'
      );

      Array.prototype.forEach.call(
        document.querySelectorAll('#choices input'),
        function (input) {
          input.addEventListener('change', function () {
            SN.ExamSession.setPick(id, input.value);
            drawQuestion();
          });
        }
      );

      Array.prototype.forEach.call(
        document.querySelectorAll('.palette button'),
        function (b) {
          b.addEventListener('click', function () {
            SN.ExamSession.setIndex(parseInt(b.getAttribute('data-i'), 10));
            drawQuestion();
          });
        }
      );

      document.getElementById('prev').addEventListener('click', function () {
        SN.ExamSession.setIndex(i - 1); drawQuestion();
      });
      document.getElementById('next').addEventListener('click', function () {
        SN.ExamSession.setIndex(i + 1); drawQuestion();
      });
      document.getElementById('flag').addEventListener('click', function () {
        SN.ExamSession.toggleFlag(id); drawQuestion();
      });
      document.getElementById('submit').addEventListener('click', confirmSubmit);

      paintTimer();
    }

    function confirmSubmit() {
      var st = SN.ExamSession.get();
      var unanswered = st.ids.length - SN.ExamSession.answerCount();
      var dlg = document.getElementById('dlg');
      dlg.innerHTML =
        '<h2>Submit this attempt?</h2>' +
        '<p>' + SN.ExamSession.answerCount() + ' of ' + st.ids.length + ' answered. ' +
        SN.ExamSession.flagCount() + ' flagged.</p>' +
        (unanswered > 0
          ? '<p><strong>' + unanswered + ' unanswered</strong> will be scored as incorrect.</p>'
          : '') +
        '<div class="row" style="justify-content:flex-end">' +
        '<button id="dlg-no">Keep going</button>' +
        '<button class="primary" id="dlg-yes">Submit</button></div>';
      dlg.showModal();
      dlg.querySelector('#dlg-no').addEventListener('click', function () { dlg.close(); });
      dlg.querySelector('#dlg-yes').addEventListener('click', function () {
        dlg.close();
        SN.ExamSession.submit(false);
        SN.Router.go('results');
      });
    }
```

- [ ] **Step 4: Add the dialog element before `</body>`**

```html
<dialog id="dlg"></dialog>
```

- [ ] **Step 5: Verify persistence, resume, and the timer**

Start an exam, answer three questions, flag two, note the timer, then reload the page.

Expect: back on the same question index, three answers still selected, two flags still marked, and remaining time lower than before — not reset. Confirm from the console that the deadline is absolute:

```js
SN.Store.getJSON('exam.active.v1').deadlineAt
```

Then set a one-minute exam, reload to resume, and edit the stored deadline to force expiry:

```js
var s = SN.Store.getJSON('exam.active.v1');
s.deadlineAt = Date.now() - 1000;
SN.Store.setJSON('exam.active.v1', s);
location.reload();
```

Expect auto-submit within a second. The results screen arrives via a route that does not exist yet, so at this stage expect `Not found`; that is the next task, not a bug.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: add exam session with persistence and deadline"
```

---

## Task 6: Scoring and results

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add `SN.Scorer` before `SN.UI`**

```js
  // --------------------------------------------------------------- Scorer

  SN.Scorer = (function () {
    function setsMatch(a, b) {
      if (a.length !== b.length) return false;
      var x = a.slice().sort();
      var y = b.slice().sort();
      for (var i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
      return true;
    }

    function score(state) {
      var rows = state.ids.map(function (id) {
        var q = SN.Questions.get(id);
        var picked = state.picks[id] || [];
        return {
          id: id,
          stem: q.stem,
          type: q.type,
          choices: q.choices,
          picked: picked,
          correct: q.correct,
          // Exact set match: order irrelevant, no partial credit, no penalty
          // for extra selections. This mirrors the real exam.
          isCorrect: setsMatch(picked, q.correct),
          flagged: !!state.flags[id]
        };
      });

      var correct = rows.filter(function (r) { return r.isCorrect; }).length;
      var total = rows.length;
      var percent = total ? (correct / total) * 100 : 0;

      return {
        rows: rows,
        correct: correct,
        incorrect: rows.filter(function (r) { return !r.isCorrect && r.picked.length; }).length,
        unanswered: rows.filter(function (r) { return r.picked.length === 0; }).length,
        total: total,
        percent: percent,
        at: Date.now()
      };
    }

    return { score: score, setsMatch: setsMatch };
  })();
```

`percent` stays at full precision and is only rounded for display. Rounding before the pass comparison would let a 69.6 display as 70 and pass a 70% mark.

- [ ] **Step 2: Add `SN.History` before `SN.UI`**

```js
  // -------------------------------------------------------------- History

  SN.History = (function () {
    var KEY = 'exam.history.v1';
    var CAP = 50;

    function all() { return SN.Store.getJSON(KEY) || []; }

    function add(result) {
      var list = all();
      list.unshift({
        at: result.at,
        total: result.total,
        correct: result.correct,
        percent: result.percent,
        passPercent: result.passPercent,
        durationMinutes: result.durationMinutes,
        expired: !!result.expired
      });
      while (list.length > CAP) list.pop();
      SN.Store.setJSON(KEY, list);
    }

    return { all: all, add: add };
  })();
```

- [ ] **Step 3: Add the results view inside the load handler**

```js
    SN.Router.add('results', function (arg) {
      SN.ExamSession.stopTimer();
      document.getElementById('timer').hidden = true;

      var r = SN.lastResult;
      if (!r) { SN.Router.go('home'); return; }

      var passed = r.percent >= r.passPercent;
      var pct = r.percent.toFixed(1);

      var head = (arg === 'expired'
        ? '<div class="card" style="background:var(--bad-bg);color:var(--bad)">' +
          '<strong>Time expired.</strong> This attempt was submitted automatically.</div>'
        : '') +
        '<h2>' + (passed ? 'Passed' : 'Not passed') + '</h2>' +
        '<div class="card"><p style="font-size:1.6rem;margin:.2rem 0"><strong>' + pct +
        '%</strong> <span class="pill ' + (passed ? 'ok' : 'no') + '">pass mark ' +
        r.passPercent + '%</span></p>' +
        '<p>' + r.correct + ' correct of ' + r.total + ' &middot; ' +
        r.incorrect + ' incorrect &middot; ' + r.unanswered + ' unanswered</p>' +
        '<div class="row"><button class="primary" id="again">Same settings</button>' +
        '<button id="new-setup">Change settings</button>' +
        '<button id="leave">Done</button></div></div>';

      var filter = SN.view.reviewFilter || 'all';
      var rows = r.rows.filter(function (row) {
        if (filter === 'wrong') return !row.isCorrect;
        if (filter === 'flagged') return row.flagged;
        return true;
      });

      var body = rows.map(function (row, idx) {
        var choices = row.choices.map(function (c) {
          var picked = row.picked.indexOf(c.id) !== -1;
          var right = row.correct.indexOf(c.id) !== -1;
          var cls = right ? 'ok' : (picked ? 'no' : '');
          var mark = right ? ' &#10003;' : (picked ? ' &#10007;' : '');
          return '<li>' + SN.UI.escape(c.text) + mark +
            (right ? ' <span class="hint">(correct)</span>' : '') +
            (picked && !right ? ' <span class="hint">(you picked this)</span>' : '') + '</li>';
        }).join('');

        return '<div class="result-row">' +
          '<p class="verdict ' + (row.isCorrect ? 'ok' : 'no') + '">' +
          (row.isCorrect ? 'Correct' : 'Incorrect') + '</p>' +
          '<p>' + SN.UI.escape(row.stem) + '</p>' +
          '<ul>' + choices + '</ul></div>';
      }).join('');

      SN.UI.render(head +
        '<div class="row" style="margin:1.5rem 0 1rem">' +
        '<strong>Review</strong>' +
        [['all', 'All'], ['wrong', 'Incorrect'], ['flagged', 'Flagged']].map(function (f) {
          return '<button data-f="' + f[0] + '"' +
            (filter === f[0] ? ' class="primary"' : '') + '>' + f[1] + '</button>';
        }).join('') + '</div>' +
        (body || '<p class="hint">Nothing in this filter.</p>')
      );

      Array.prototype.forEach.call(document.querySelectorAll('[data-f]'), function (b) {
        b.addEventListener('click', function () {
          SN.view.reviewFilter = b.getAttribute('data-f');
          SN.Router.run();
        });
      });

      document.getElementById('again').addEventListener('click', function () {
        var s = SN.Settings.load();
        SN.view.pendingSettings = s;
        SN.Router.go('exam');
      });
      document.getElementById('new-setup').addEventListener('click', function () {
        SN.Router.go('setup');
      });
      document.getElementById('leave').addEventListener('click', function () {
        SN.Router.go('home');
      });
    });
```

- [ ] **Step 4: Add the `run` export to the router**

The filter buttons above call `SN.Router.run()`. Replace the router's return block, which is in Task 3's `SN.Router`, with:

```js
    return {
      add: function (name, fn) { routes[name] = fn; },
      go: go,
      run: run,
      start: function () {
        window.addEventListener('hashchange', run);
        run();
      },
      current: function () { return current; }
    };
```

The only change from Task 3 is `run: run`. Leave the rest untouched.

- [ ] **Step 5: Verify scoring three ways**

Run an exam, submit, and read the result from the console:

```js
SN.lastResult.percent, SN.lastResult.correct, SN.lastResult.total
```

Then test the rules directly, without the UI:

```js
// exact set, order irrelevant
SN.Scorer.setsMatch(['C','A'], ['A','C'])          // true
// extra selection is wrong
SN.Scorer.setsMatch(['A','B','C'], ['A','C'])     // false
// one short is wrong
SN.Scorer.setsMatch(['A'], ['A','B'])              // false
```

Confirm in a real attempt that a multi answered with exactly the right set shows 100%, that adding one more choice turns that question Incorrect, and that an untouched multi shows Incorrect rather than being skipped.

Check the rounding rule: a result of 69.6% must display `69.6%` and read Not passed against a 70 mark. If it ever displays as 70 and passes, `percent` is being rounded before comparison.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: add scoring and results review"
```

---

## Task 7: History and stats

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add `SN.Stats` before `SN.UI`**

```js
  // ---------------------------------------------------------------- Stats

  SN.Stats = (function () {
    var KEY = 'exam.stats.v1';

    function all() { return SN.Store.getJSON(KEY) || {}; }

    function record(result) {
      var s = all();
      result.rows.forEach(function (row) {
        var e = s[row.id] || { seen: 0, correct: 0 };
        e.seen++;
        if (row.isCorrect) e.correct++;
        s[row.id] = e;
      });
      SN.Store.setJSON(KEY, s);
    }

    function clear() { SN.Store.drop(KEY); }

    function rows() {
      var s = all();
      return Object.keys(s).map(function (id) {
        return { id: id, seen: s[id].seen, correct: s[id].correct };
      }).sort(function (a, b) {
        return (a.correct / a.seen) - (b.correct / b.seen);
      });
    }

    return { all: all, record: record, clear: clear, rows: rows };
  })();
```

Tallies are keyed by question `id`. A question removed from the bank leaves an orphan entry that simply never appears, which is harmless — better than a broken reference.

- [ ] **Step 2: Add the history and stats views inside the load handler**

```js
    SN.Router.add('history', function () {
      var list = SN.History.all();
      if (!list.length) {
        SN.UI.render('<h2>History</h2><p class="hint">No finished attempts yet.</p>');
        return;
      }
      SN.UI.render('<h2>History</h2><table><thead><tr><th>When</th><th>Score</th>' +
        '<th>Result</th><th>Questions</th><th>Time</th></tr></thead><tbody>' +
        list.map(function (a) {
          var passed = a.percent >= a.passPercent;
          return '<tr><td>' + new Date(a.at).toLocaleString() + '</td>' +
            '<td>' + a.percent.toFixed(1) + '%</td>' +
            '<td><span class="pill ' + (passed ? 'ok' : 'no') + '">' +
            (passed ? 'Pass' : 'Fail') + '</span></td>' +
            '<td>' + a.correct + ' / ' + a.total + '</td>' +
            '<td>' + (a.expired ? 'expired' : a.durationMinutes + ' min') + '</td></tr>';
        }).join('') + '</tbody></table>');
    });

    SN.Router.add('stats', function () {
      var rows = SN.Stats.rows();
      if (!rows.length) {
        SN.UI.render('<h2>Stats</h2><p class="hint">No answers recorded yet.</p>');
        return;
      }
      var answered = rows.reduce(function (n, r) { return n + r.seen; }, 0);
      var right = rows.reduce(function (n, r) { return n + r.correct; }, 0);
      SN.UI.render(
        '<h2>Stats</h2>' +
        '<div class="card"><p>' + rows.length + ' distinct questions seen, ' +
        answered + ' answers, ' + right + ' correct (' +
        (answered ? Math.round(right / answered * 100) : 0) + '%).</p>' +
        '<button id="clear-stats">Clear stats</button></div>' +
        '<h2>Weakest first</h2><table><thead><tr><th>Question</th><th>Seen</th>' +
        '<th>Correct</th><th>Accuracy</th></tr></thead><tbody>' +
        rows.slice(0, 25).map(function (r) {
          var pct = Math.round(r.correct / r.seen * 100);
          return '<tr><td>' + SN.UI.escape(r.id) + '</td><td>' + r.seen + '</td><td>' +
            r.correct + '</td><td>' + pct + '%</td></tr>';
        }).join('') + '</tbody></table>'
      );
      document.getElementById('clear-stats').addEventListener('click', function () {
        if (window.confirm('Delete all per-question stats? History is kept.')) {
          SN.Stats.clear();
          SN.Router.run();
        }
      });
    });
```

- [ ] **Step 3: Verify**

Run two attempts. History shows two rows, newest first, with correct percentages and Pass/Fail pills. Stats shows the distinct-question count and worst accuracy first. Clear stats, confirm the confirmation prompt appears, and the table empties while History still has both attempts.

Close the browser entirely and reopen `index.html`: history and stats survive, and no attempt is in progress.

- [ ] **Step 4: Verify the history cap**

```js
for (var i = 0; i < 60; i++) {
  var list = SN.History.all();
  list.unshift({ at: Date.now(), total: 60, correct: 40, percent: 66.6,
                passPercent: 70, durationMinutes: 90, expired: false });
  SN.Store.setJSON('exam.history.v1', list.slice(0, 50));
}
SN.History.all().length
```

Expect 50.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: add history and per-question stats"
```

---

## Task 8: README and full manual pass

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`**

````markdown
# Exam Runner

An offline, dependency-free exam runner. Unzip it, double-click `index.html`,
and it works. No server, no install, no build step, no network.

## Files

| File | What it is |
|---|---|
| `index.html` | The entire app: markup, styles, logic. |
| `questions.json` | The question bank. The only file you edit by hand. |
| `questions.js` | Generated copy of the bank for the `file://` fallback. Never edit it. |
| `tools/convert.js` | Turns the portal payload into the two bank files. |
| `tools/validate.js` | Checks the bank against the schema. |

`questions-response.json` is the raw portal response. It is not part of the
bundle and is ignored by git, because it contains a name, a federated account
id, and session tokens. It stays local and is only an input to the converter.

## Regenerating the bank

```bash
node tools/convert.js
node tools/validate.js questions.json
```

`convert.js` reads the portal payload, finds the questions, and writes both
`questions.json` and `questions.js`. Options:

```bash
node tools/convert.js --count=60 --minutes=90 --pass=70 --id=csa --title="My Exam"
```

**`SN.Questions` indexes lazily.** `SN.bank` is assigned by the loader's promise,
after these module IIFEs have already run. Building the id lookup at definition
time throws on `SN.bank.questions`. The index is built on first `get()` call
instead.

After editing `questions.json` by hand, rerun the converter so `questions.js`
stays in step. A stale wrapper means the `file://` path runs the old bank while
the HTTP path runs the new one.

## Validating

```bash
node tools/validate.js questions.json
```

Exits 0 when valid, 1 with a list of problems otherwise. It rejects unknown
keys, so a typo like `correct_choice` is caught rather than silently producing a
question with no answer key.

## Sending it to someone

Send `index.html`, `questions.json`, and `questions.js` together, zipped. Do not
send `questions-response.json`. Nothing else is needed — there is no server.

## Shuffle and topic order

`questions.json` is read top to bottom. With shuffle off, the exam takes the
first N questions, so interleaving topics in the file controls what a fixed
exam covers. With shuffle on, topics mix naturally.

## Schema

```json
{
  "version": 1,
  "exam": {
    "id": "servicenow-exam",
    "title": "ServiceNow Certification Exam",
    "passPercent": 70,
    "questionCount": 60,
    "durationMinutes": 90
  },
  "questions": [
    {
      "id": "q-001",
      "type": "multi",
      "stem": "Question text",
      "choices": [{ "id": "A", "text": "Option" }],
      "correct": ["A"]
    }
  ]
}
```

`type` is `single` or `multi`. `correct` is always an array; a single question
has exactly one entry. A multi question requires exactly `correct.length`
selections to be correct — order does not matter, extra choices are wrong, and
there is no partial credit. There is no negative marking, and unanswered
questions are incorrect.
````

- [ ] **Step 2: Run the full manual pass**

From a clean state — clear site data, then load `index.html` by double-click:

1. Home shows the exam title and 423 questions, no warning strip.
2. Setup opens with 60 / 90 / 70 and shuffle on.
3. Shuffle off, count 5: question 1 is `q-001`. Shuffle on, count 5: order differs between runs.
4. Answer a single, watch it replace the previous pick.
5. Answer a multi to its full count, then click a checked box to free a slot.
6. Multi shows "choose N" and stops accepting at N.
7. Palette: answered filled, flagged outlined, current outlined, clicking jumps.
8. Header counts update live as you answer.
9. Reload mid-exam: same question index, answers intact, timer lower.
10. Submit: dialog reports unanswered and flagged counts. Cancel changes nothing.
11. Submit with 69.6% against a 70 mark: reads Not passed.
12. Results filters All / Incorrect / Flagged each narrow the list.
13. History shows the attempt. Restart the browser: still there.
14. Stats shows distinct questions seen; Clear stats empties it, keeps history.
15. Start a 1-minute exam, wait it out: auto-submit with the expiry banner.
16. Delete `questions.json`, reload: readable error naming the file and the fix.
17. Restore it. Block local storage in devtools, reload: warning strip, exam still completable.

- [ ] **Step 3: Confirm the bundle contents**

```bash
ls -la index.html questions.json questions.js README.md
```

Four files. Nothing else is required to run the app.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: add README with regeneration and send instructions"
```

---

## Notes for the implementer

- **`questions.js` must never be hand-edited.** It is generated. If a task
  changes `questions.json`, rerun `node tools/convert.js`.
- **`percent` is never rounded before the pass comparison.** Round only for
  display. This is the one place where rounding changes behaviour rather than
  appearance.
- **`SN.view.index` is the only place the question position lives.** The `exam`
  route resets it to 0 whenever it starts a session from `pendingSettings`, so a
  second attempt never resumes mid-exam. Reset it anywhere else and an attempt
  starts on the wrong question.
- **`SN.view.pendingSettings` is consumed, not read twice.** The `exam` route
  nulls it immediately after starting a session, so a later visit to `#/exam`
  restores from storage instead of silently starting a fresh attempt.
- **`questions-response.json` stays local.** It is gitignored from Task 1 and
  must never be committed or shared.