#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { globSync } = require('glob');

const ROOT = process.cwd();
const files = globSync('**/package.nls*.json', {
  cwd: ROOT,
  absolute: true,
  ignore: ['**/node_modules/**', '**/out/**']
});

const patterns = [
  { regex: /(ghp_|gho_|ghu_|ghs_|ghr_)[A-Za-z0-9]{20,}/i, reason: 'GitHub token-like value' },
  { regex: /sk-[A-Za-z0-9]{20,}/i, reason: 'API token-like value' },
  { regex: /(token|secret|password|apikey)[=:]?\s*[A-Za-z0-9\/+._-]{12,}/i, reason: 'Credential-looking substring' },
  { regex: /\b[A-Za-z]:\\[^\s]+/i, reason: 'Windows absolute path' },
  { regex: /(\/Users\/|\/home\/|\/var\/|\/tmp\/)[^\s]+/i, reason: 'POSIX absolute path' },
  { regex: /[A-Za-z0-9]{32,}/, reason: 'Long unbroken token-like value' },
];

const findings = [];

files.forEach((file) => {
  let json;
  try {
    json = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    findings.push({ file, key: '<file>', value: 'unparseable JSON', reason: err.message });
    return;
  }

  Object.entries(json).forEach(([key, value]) => {
    if (typeof value !== 'string') {
      return;
    }

    patterns.forEach(({ regex, reason }) => {
      if (regex.test(value)) {
        findings.push({ file, key, value, reason });
      }
    });
  });
});

if (findings.length > 0) {
  console.error('Localization hygiene check failed. Found potentially unsafe strings in package.nls files:');
  findings.forEach((f) => {
    console.error(`- ${path.relative(ROOT, f.file)} :: ${f.key} :: ${f.reason}`);
    console.error(`  value: ${f.value}`);
  });
  process.exit(1);
}

console.log('Localization hygiene check passed: no tokens or paths found in package.nls files.');
