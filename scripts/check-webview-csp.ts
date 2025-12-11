#!/usr/bin/env tsx
/**
 * Static audit for packaged webview assets.
 * Fails on:
 *  - inline event handlers (onclick/onload/etc)
 *  - <script> or stylesheet <link> tags missing a nonce
 *  - CSP metas that allow unsafe-inline/unsafe-eval
 *
 * Run after bundling (`npm run bundle`) so dist/views exists.
 */
import * as fs from 'fs';
import * as path from 'path';

type Finding = { file: string; message: string };

const distViews = path.resolve(__dirname, '../dist/views');

function collectFiles(dir: string, exts: Set<string>): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(full, exts));
    } else if (exts.has(path.extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

function auditFile(file: string, content: string): Finding[] {
  const findings: Finding[] = [];

  // Inline event handlers like onclick=
  const inlineHandlerRe = /<[a-zA-Z][^>]*\s(on[a-zA-Z]+)\s*=/g;
  let m: RegExpExecArray | null;
  while ((m = inlineHandlerRe.exec(content))) {
    findings.push({ file, message: `Inline handler "${m[1]}" found` });
  }

  // Script tags must carry nonce
  const scriptTagRe = /<script\b[^>]*>/gi;
  while ((m = scriptTagRe.exec(content))) {
    const tag = m[0];
    if (/nonce=/i.test(tag)) {
      continue;
    }
    // Allow empty placeholder scripts (`<script></script>`)
    const tail = content.slice(m.index + tag.length, m.index + tag.length + 16);
    const isEmpty = /^<\/script>/i.test(tail.trimStart()) || /^<\\\/script>/i.test(tail.trimStart());
    if (isEmpty) {
      continue;
    }
    findings.push({ file, message: `<script> tag missing nonce: ${tag.slice(0, 80)}...` });
  }

  // Stylesheet links must carry nonce
  const linkTagRe = /<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi;
  while ((m = linkTagRe.exec(content))) {
    const tag = m[0];
    if (!/nonce=/i.test(tag)) {
      findings.push({ file, message: `<link rel="stylesheet"> tag missing nonce: ${tag.slice(0, 80)}...` });
    }
  }

  // CSP must not allow unsafe-inline/eval
  const cspMetaRe = /<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]+content=["']([^"']+)["'][^>]*>/gi;
  while ((m = cspMetaRe.exec(content))) {
    const csp = m[1];
    if (/unsafe-inline/i.test(csp) || /unsafe-eval/i.test(csp)) {
      findings.push({ file, message: `CSP allows unsafe directive: ${csp}` });
    }
  }

  return findings;
}

function main(): void {
  if (!fs.existsSync(distViews)) {
    console.error(`dist/views not found at ${distViews}. Run "npm run bundle" first.`);
    process.exit(1);
  }

  const files = collectFiles(distViews, new Set(['.html', '.js']));
  const findings: Finding[] = [];

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    findings.push(...auditFile(file, content));
  }

  if (findings.length > 0) {
    console.error(`CSP/webview audit failed with ${findings.length} issue(s):`);
    for (const f of findings) {
      console.error(` - ${path.relative(process.cwd(), f.file)}: ${f.message}`);
    }
    process.exit(1);
  }

  console.log('✅ Webview CSP audit passed (no inline handlers, missing nonces, or unsafe CSP).');
}

main();
