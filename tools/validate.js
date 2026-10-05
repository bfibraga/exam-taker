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