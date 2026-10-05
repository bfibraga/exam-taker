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