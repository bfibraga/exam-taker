# Portable ServiceNow Certification Exam Taker — Design

Date: 2026-10-05
Status: Approved in conversation, pending written review

## Problem

Certification practice needs an environment that mimics the real ServiceNow
Employee Certification exam: same scoring rules, same question wording, same
"choose N of M" behaviour, same countdown. The real thing is gated behind a
corporate instance with SSO and internal assessment policies.

## Goal

A single self-contained web app plus a question bank. The recipient unzips it
and double-clicks `index.html`. No server, no install, no build step, no network
access, no account.

Success means a candidate can run a full 60-question / 90-minute timed attempt,
have every answer persisted across a browser restart, and get scored results
identical to the real exam's rules.

## Constraints

- Runs from `file://` in a modern desktop browser, offline.
- No runtime dependencies, no bundler, no framework.
- No CI, no test framework. One validation script and a manual pass.
- The question bank is the app author's responsibility, not generated at runtime.
- No domain, topic, difficulty, or explanation metadata. The source payload has
  none, and inventing it means hand-tagging hundreds of questions.

## Approach Chosen

Three options were considered for delivering the app to a colleague.

1. **Recommended — zipped folder of static files.** `index.html` reads
   `questions.json` beside it. Verifiable by the recipient, trivially editable,
   survives email and Teams as a zip.
2. Single `.html` with questions inlined. One file to send, but a 400-question
   bank inlined makes the file awkward to edit and any typo means re-sending.
3. Static host with the bank as a separate download. Rejected — needs hosting
   and a network dependency, which defeats offline use.

Option 1 with a `file://`-compatible loading strategy is the design below.

### The `file://` loading problem

Browsers block `fetch()` against `file://` URLs, so the obvious approach of
`fetch('./questions.json')` fails when the app is opened by double-click. That
pushes the app toward an HTTP server, which the recipient does not have.

Solution: try `fetch` first, and fall back to a classic `<script src>` that sets
`window.QUESTIONS`. A script tag is not subject to the same-origin restriction,
so this works from `file://`.

The shipped bundle therefore contains three files:

- `index.html` — the app, all styles and logic inline
- `questions.json` — the question bank, the canonical editable format
- `questions.js` — generated wrapper, `window.QUESTIONS = {...}`, the `file://`
  fallback

`questions.js` is generated from `questions.json` by the converter, in the same
run that writes the JSON. Slight redundancy, accepted because it removes the
server requirement entirely. When served over HTTP the JSON path is used and the
fallback script is never fetched.

The fallback `<script src="./questions.js">` sits in the markup at all times,
not injected conditionally, so reaching the fallback needs no DOM mutation. It
executes during parse, setting `window.QUESTIONS`, before the app's own script
runs. That ordering is harmless: `SN.Loader` tries `fetch` first and only consults
`window.QUESTIONS` if the fetch failed, so over HTTP the global is simply never
read.

Architecture is deliberately flat: one HTML file, one IIFE, a single `SN`
namespace, no ES modules (which also fail on `file://`), no framework. Internal
modules are plain objects with clear boundaries, listed under Components.

## Data Formats

### `questions.json`

Readable, hand-editable. Letter ids, not the instance's 32-character sys_ids.

```json
{
  "version": 1,
  "exam": {
    "id": "csa-2019",
    "title": "Certified System Administrator",
    "passPercent": 70,
    "questionCount": 60,
    "durationMinutes": 90
  },
  "questions": [
    {
      "id": "q-001",
      "type": "multi",
      "stem": "What are the different Notification methods? (Choose three.)",
      "choices": [
        { "id": "A", "text": "Meeting Invitation" },
        { "id": "B", "text": "Browser Pop ups" },
        { "id": "C", "text": "SMS Message" }
      ],
      "correct": ["A", "B", "C"]
    }
  ]
}
```

`single` questions set `"correct": ["B"]` — always an array, so scoring has one
code path.

`selectCount` is deliberately absent. A multi-select question requires exactly
`correct.length` selections, which reproduces the real exam's "Choose three"
behaviour without a redundant field that could disagree with `correct`.

Absent by decision: `domain`, `topic`, `difficulty`, `explanation`. The
consequences are accepted rather than worked around:

- No per-domain breakdown on the results screen.
- No weak-topic targeting; there is no topic to be weak on.
- The review screen marks the right answer but gives no rationale.
- Stats are per-question accuracy (times seen, times correct) keyed by `id`.

Domain mixing survives indirectly: file order is under the author's control, so
interleaving topics in `questions.json` and drawing shuffled produces a mixed
exam with no metadata required. Documented in the README.

### Source payload → `questions.json`

The ServiceNow Employee Center portal returns the bank inside a bootstrap
response, at:

```
result.containers[0].rows[0].columns[0].widgets[1].widget.data.questions
```

There is no `data` level between `result` and `containers`; `result` holds
`containers` directly. Verified against `questions-response.json`, which also
carries `examId` and `isReview` as siblings of `questions`.

Each entry in that array is:

```json
{
  "sys_id": "02feb716fb7c0f547ff9fc666eefdc2b",
  "single_choice": false,
  "correct_count": 3,
  "text": "What are the different Notification methods? (Choose three.)",
  "answers": [
    { "sys_id": "30cf...", "correct": true,  "text": "Meeting Invitation" },
    { "sys_id": "b0cf...", "correct": false, "text": "Browser Pop ups" }
  ]
}
```

`tools/convert.js` reads a saved payload file, walks to the array above, and
emits both `questions.json` and its `questions.js` wrapper. Mapping: `sys_id` →
generated `id` (`q-001`, `q-002`, … by position, not derived from the sys_id so
ids stay short and stable across re-conversions), `single_choice` → `type`,
`text` → `stem`, `answers[]` → `choices[]` in source order with ids assigned
`A`, `B`, `C`, …, and every answer with `correct: true` → its letter in
`correct`.

`correct_count` is read and cross-checked against the number of `correct: true`
answers, not carried into the output. A mismatch is a converter error rather
than something to encode, since the output derives the required selection count
from `correct.length`.

The verified bank: 423 questions, 341 single and 82 multi, with
`correct_count` distributed 1×341, 2×29, 3×35, 4×16, 5×2, and answer counts from
3 to 11. No duplicate sys_ids, no duplicate stems, no question with zero correct
answers.

The converter reads only that array, so the portal payload's user email,
federated id, session token, theme CSS, and internal instance sys_ids never
reach the output. This is also the answer to "can I send this over Teams" — no,
but the converted bank is safe to send.

### Validation

`tools/validate.js`, plain Node, no dependencies:

```
node tools/validate.js questions.json
```

Exit 0 when valid, 1 when not. Reports a question id and field path per failure,
not a line number, since JSON has none:

```
questions[42].choices[2]: unknown key "texts"
questions[7].correct: id "F" is not among the question's choices
```

Rules: known keys only; `id` unique within the bank; `stem` non-empty; at least
two choices; choice ids unique within a question; every `correct` id present in
`choices`; single has exactly one correct, multi has two or more; `passPercent`
in 1–100; `questionCount` and `durationMinutes` at least 1.

Rejecting unknown keys is the point. A typo like `correct_choice` would otherwise
be silently ignored, producing a question with no answer key that scores zero
for every candidate.

## Exam Session

### Setup

Shows bank size, the previous attempt's score, and four editable fields
defaulting from the `exam` block: question count (capped at bank size),
duration in minutes, shuffle on/off, pass mark. Settings persist, so a repeat
attempt is one click.

Question draw: shuffle on, a Fisher-Yates sample of the bank; shuffle off, the
first N in file order.

### During

One question per screen. Stem plus choices as radios for `single`, checkboxes
for `multi`. Multi shows a "Select 3" hint. Explicit Prev/Next rather than
auto-advance, because auto-advance on a partially answered multi question loses
marks silently.

A numbered palette below the question shows every position: current highlighted,
answered filled, flagged marked, all clickable for jumping. The header reads:

```
Question 12 of 60 · 34 answered · 2 flagged · 38:12 remaining
```

Every answer and flag change writes to `localStorage` immediately. The deadline
is stored as an absolute timestamp (`deadlineAt`), never as a countdown, so
remaining time is recomputed from the clock after a reload.

Reloading mid-exam offers resume-or-restart. Resuming keeps the original
deadline.

### Submit and timeout

Submit opens a confirmation dialog stating how many questions are unanswered and
how many are flagged, with confirm and go-back. At zero the exam auto-submits
with a banner saying so, and lands on the same results screen as a manual
submit.

### Scoring

Matches the real exam's rules:

- Single: exact match.
- Multi: exact set match, order irrelevant. All or nothing, no partial credit,
  no penalty for extra selections.
- No negative marking.
- Unanswered is incorrect. A multi question left short of the required count
  scores incorrect rather than being flagged incomplete.
- Pass when `percent >= passPercent`.

Percentage is computed as `correct / total * 100` at full precision and only
rounded for display. Rounding the stored value would make a 69.6 percent result
display as 70 and pass against a 70 percent mark, which is not what the real
exam does.

### Results

Pass or fail, percentage, time used, correct / incorrect / unanswered counts.
Below, every question with the candidate's answer beside the correct one,
filtered by all / wrong / flagged. Correct answers are revealed here, as in the
real exam's review mode. Review is also reachable later from the history tab, so
peeking immediately is optional.

## Components

One file, one IIFE, no ES modules. Internal objects:

- `SN.Loader` — resolves the question bank, `fetch` then `<script>` fallback,
  surfaces load failures with a useful message
- `SN.Questions` — lookup by id, draw a selection, Fisher-Yates shuffle
- `SN.Settings` — setup fields, defaults from the `exam` block, persistence
- `SN.ExamSession` — current attempt state, answer and flag mutations, deadline
  math, resume
- `SN.Scorer` — single and multi comparison, percentage, pass determination
- `SN.Stats` — per-question seen/correct tallies
- `SN.Store` — all `localStorage` access, in-memory fallback
- `SN.UI` — rendering per view
- `SN.Router` — hash routes

One plain state object holds the current attempt. Modules read and mutate it
through named functions; no module reaches into another's internals.

## UI Shell

Header with title, tab links, and the timer during an exam. Main content region.
Footer. Hash routes, no router library:

```
#/home  #/setup  #/exam  #/results  #/history  #/stats
```

A route change re-renders main and resets scroll. Tabs are keyboard reachable,
the timer is an `aria-live="polite"` region, and palette numbers are real
buttons so their state is announced.

## Storage

Four keys under an `sn.` prefix:

| Key | Contents |
|---|---|
| `sn.exam.settings.v1` | count, minutes, shuffle, pass mark |
| `sn.exam.active.v1` | question ids, per-question picks and flags, start time, `deadlineAt` |
| `sn.exam.history.v1` | finished attempts: score, pass mark, counts, time used, timestamp; capped at 50, oldest evicted |
| `sn.exam.stats.v1` | per-question seen/correct tallies, updated on submit |

Stats are keyed by question `id`, so a question removed from the bank leaves a
harmless orphan entry rather than a broken reference. Clearing stats is an
explicit action behind a confirmation.

## Error Handling

- Missing or malformed `questions.json` — error screen naming the file and the
  parse position. Never a blank page.
- Bank smaller than the requested count — the setup field caps and says why.
- `localStorage` unavailable (private browsing, some `file://` contexts) — fall
  back to in-memory, show a dismissible warning, and let the exam run to
  completion so in-progress work is not lost.
- A key holding unexpected JSON — drop that key, keep the rest, note it in the
  warning strip instead of throwing.
- Two tabs running the same attempt — last write wins, no merge. Accepted
  rather than solved; a cross-tab lock is complexity a single-exam app doesn't
  earn.
- Clock skew across a reload — the deadline is an absolute timestamp compared
  against `Date.now()`, so a changed clock shows as odd remaining time instead
  of silently extending the exam.

## Testing

No test framework. One script and a manual pass.

`node tools/validate.js questions.json` must pass on the real bank before
anything else, and `questions.js` must be regenerated from the current JSON
whenever the JSON is hand-edited. A stale wrapper means the `file://` path runs
an old question set while the HTTP path runs the new one, which is a confusing
bug to chase. Then, by hand:

1. Fresh attempt, shuffle off
2. Fresh attempt, shuffle on — confirm order and membership change
3. Answer change, reload, resume — answers and remaining time intact
4. Deadline expiry — auto-submit with banner
5. Submit with unanswered and flagged — confirmation counts are correct
6. Multi-select scoring — exact set, plus an extra selection, plus one short
7. Results review filters
8. History and stats persist across a full browser restart
9. Delete `questions.json`, reload — readable error screen
10. `localStorage` blocked — warning shown, exam still completable

## Files

```
index.html                      app: markup, styles, logic
questions.json                  question bank
questions.js                    generated: window.QUESTIONS = {...}
tools/convert.js                payload → questions.json
tools/validate.js               schema validation
README.md                       how to convert, validate, regenerate, and send
```

## Out of Scope

- Per-domain and per-topic analytics, and any question tagging to enable them.
- Explanations or remediation text in the review screen.
- Negative marking and partial credit.
- Multiple simultaneous exams, cross-tab locking, cloud sync, accounts.
- Question import from an LMS other than the portal payload shape above.