#!/usr/bin/env node
'use strict';
// Builds docs/index.html: a single static page that runs the library in the browser.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const danger = fs.readFileSync(path.join(root, 'data/danger-signs.json'), 'utf8');
const meds = fs.readFileSync(path.join(root, 'data/pregnancy-medicines.json'), 'utf8');
const src = fs.readFileSync(path.join(root, 'src/index.js'), 'utf8')
  .replace("require('../data/danger-signs.json')", 'window.__DANGER')
  .replace("require('../data/pregnancy-medicines.json')", 'window.__MEDS');
if (/require\(/.test(src)) throw new Error('src/index.js has an unexpected require()');
const version = JSON.parse(danger).version;
const html = fs.readFileSync(path.join(__dirname, 'demo-template.html'), 'utf8')
  .replace('__DANGER__', () => danger.trim()).replace('__MEDS__', () => meds.trim())
  .replace('__SRC__', () => src).replace('__VERSION__', version);
fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
fs.writeFileSync(path.join(root, 'docs/index.html'), html);
console.log('wrote docs/index.html', html.length, 'bytes');
