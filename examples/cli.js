#!/usr/bin/env node
'use strict';
// Usage:
//   node examples/cli.js '{"stage":"pregnant","gestational_weeks":32,"bp":"150/100","symptoms":["severe_headache"]}'
//   node examples/cli.js --text "8 mahine ki garbhvati hoon, tez sir dard aur dhundhla dikh raha hai"
const { screen, screenText } = require('../src');

const args = process.argv.slice(2);
let result;
if (args[0] === '--text') result = screenText(args.slice(1).join(' '));
else result = screen(JSON.parse(args[0] || '{"stage":"pregnant","gestational_weeks":32,"bp":"150/100","symptoms":["severe_headache"]}'));

console.log(`Level: ${result.level}`);
for (const a of result.alerts) console.log(`- [${a.level}] ${a.label}\n    ${a.action}\n    ${a.label_hi}`);
for (const m of result.medicine_alerts) console.log(`- [medicine: ${m.level}] ${m.medicine}: ${m.reason}`);
console.log(`\n${result.disclaimer}`);
