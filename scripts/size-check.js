#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const glob = require('glob');

const THRESHOLD = parseInt(process.env.SIZE_CHECK_MAX_LINES || '320', 10);
const roots = [
  'src/**/*.ts',
  'src/**/*.tsx',
  'packages/**/*.ts',
  'packages/**/*.tsx',
  'web/src/**/*.ts',
  'web/src/**/*.tsx',
  'tui/src/**/*.ts',
  'tui/src/**/*.tsx'
];

function countLines(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return content.split(/\r?\n/).length;
}

const offenders = [];
for (const pattern of roots) {
  const files = glob.sync(pattern, { nodir: true, ignore: ['**/node_modules/**', '**/out/**'] });
  for (const file of files) {
    const lines = countLines(file);
    if (lines > THRESHOLD) {
      offenders.push({ file, lines });
    }
  }
}

if (offenders.length > 0) {
  console.error(`Found ${offenders.length} file(s) exceeding ${THRESHOLD} lines:`);
  offenders
    .sort((a, b) => b.lines - a.lines)
    .forEach((o) => console.error(`  ${o.lines} lines	${o.file}`));
  process.exit(1);
}

console.log(`Size check passed: no files over ${THRESHOLD} lines.`);
