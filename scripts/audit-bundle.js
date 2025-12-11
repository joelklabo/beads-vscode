#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { builtinModules } = require("module");

const META_PATH = path.join(__dirname, "..", "dist", "extension.meta.json");
const BUNDLE_PATH = path.join(__dirname, "..", "dist", "extension.js");
const SIZE_BUDGET = parseInt(process.env.BUNDLE_MAX_BYTES || "1500000", 10);
const VIEW_BUDGET = parseInt(
  process.env.BUNDLE_MAX_VIEW_BYTES || "1200000",
  10,
);
const WARN_VIEW_BUDGET = parseInt(
  process.env.BUNDLE_WARN_VIEW_BYTES || "1000000",
  10,
);
const ALLOWED_DYNAMIC = new Set(["./extension.main"]);
const EVAL_ALLOW_PATTERNS = [/SortTemplate/];

const allowedExternal = new Set(["vscode", "@vscode/test-electron"]);
for (const mod of builtinModules) {
  allowedExternal.add(mod);
  if (mod.startsWith("node:")) {
    allowedExternal.add(mod.slice("node:".length));
  } else {
    allowedExternal.add(`node:${mod}`);
  }
}
const allowedExternalList = Array.from(allowedExternal).sort();

function exitWithError(message) {
  console.error(`[bundle-audit] ${message}`);
  process.exit(1);
}

if (!fs.existsSync(META_PATH)) {
  exitWithError(
    "Missing dist/extension.meta.json. Run `npm run bundle` first.",
  );
}
if (!fs.existsSync(BUNDLE_PATH)) {
  exitWithError("Missing dist/extension.js. Run `npm run bundle` first.");
}

const metafile = JSON.parse(fs.readFileSync(META_PATH, "utf8"));
const outputMeta = metafile.outputs?.["dist/extension.js"];

if (!outputMeta) {
  exitWithError(
    "Metafile is missing output information for dist/extension.js.",
  );
}

function isAllowedExternal(specifier) {
  return allowedExternal.has(specifier);
}

function isRelative(specifier) {
  return (
    specifier.startsWith("./") ||
    specifier.startsWith("../") ||
    specifier.startsWith("/")
  );
}

function snippetAround(source, index, radius = 80) {
  const start = Math.max(0, index - radius);
  const end = Math.min(source.length, index + radius);
  return source.slice(start, end).replace(/\s+/g, " ").trim();
}

const outputImports = outputMeta.imports || [];
const unexpectedExternals = [];
for (const imp of outputImports) {
  if (!imp.external) continue;
  if (isRelative(imp.path)) continue;
  if (isAllowedExternal(imp.path)) continue;
  unexpectedExternals.push(imp.path);
}

const dynamicEntries = outputImports.filter(
  (imp) => imp.kind === "dynamic-import" || imp.kind === "require-resolve",
);
const unexpectedDynamic = dynamicEntries.filter(
  (imp) => !ALLOWED_DYNAMIC.has(imp.path),
);

const source = fs.readFileSync(BUNDLE_PATH, "utf8");
const evalFindings = [];

const evalRegex = /\beval\s*\(/g;
let match;
while ((match = evalRegex.exec(source))) {
  const snippet = snippetAround(source, match.index);
  evalFindings.push(`eval() detected: ${snippet}`);
}

const newFunctionRegex = /\bnew Function\s*\(/g;
while ((match = newFunctionRegex.exec(source))) {
  const snippet = snippetAround(source, match.index);
  const allowed = EVAL_ALLOW_PATTERNS.some((re) => re.test(snippet));
  if (!allowed) {
    evalFindings.push(`new Function detected: ${snippet}`);
  }
}

const errors = [];

if (unexpectedExternals.length > 0) {
  const uniq = Array.from(new Set(unexpectedExternals)).sort();
  errors.push(
    "Unexpected externals detected (allowed externals are Node built-ins, vscode, @vscode/test-electron):",
  );
  for (const ext of uniq) {
    errors.push(`  ${ext}`);
  }
}

if (unexpectedDynamic.length > 0) {
  errors.push("Dynamic imports/requires detected:");
  for (const imp of unexpectedDynamic) {
    errors.push(`  ${imp.path || "<unknown>"}`);
  }
}

if (evalFindings.length > 0) {
  errors.push(...evalFindings);
}

const bundleBytes = outputMeta.bytes || 0;
if (Number.isFinite(bundleBytes) && bundleBytes > SIZE_BUDGET) {
  errors.push(
    `Bundle size ${formatBytes(bundleBytes)} exceeds budget ${formatBytes(SIZE_BUDGET)}.`,
  );
}

function checkViewBundles() {
  const viewDir = path.join(__dirname, "..", "dist", "views");
  if (!fs.existsSync(viewDir)) {
    return; // views are optional for some builds; skip gracefully
  }
  const entries = fs.readdirSync(viewDir).filter((f) => f.endsWith(".js"));
  for (const file of entries) {
    const full = path.join(viewDir, file);
    const { size } = fs.statSync(full);
    if (size > VIEW_BUDGET) {
      errors.push(
        `View bundle ${file} size ${formatBytes(size)} exceeds budget ${formatBytes(VIEW_BUDGET)}.`,
      );
    } else if (size > WARN_VIEW_BUDGET) {
      console.warn(
        `[bundle-audit] ⚠ View bundle ${file} size ${formatBytes(size)} above warn threshold ${formatBytes(WARN_VIEW_BUDGET)}`,
      );
    }
  }
}

checkViewBundles();

if (errors.length > 0) {
  console.error("[bundle-audit] ❌ Bundle audit failed:");
  errors.forEach((line) => console.error(line));
  process.exit(1);
}

console.log("[bundle-audit] ✅ Bundle audit passed");
console.log(`  entry: dist/extension.js`);
console.log(
  `  size: ${formatBytes(bundleBytes)} (budget ${formatBytes(SIZE_BUDGET)})`,
);
console.log(`  externals: ${allowedExternalList.join(", ")}`);
if (dynamicEntries.length > 0) {
  const allowed = dynamicEntries.filter((imp) => ALLOWED_DYNAMIC.has(imp.path));
  if (allowed.length > 0) {
    console.log(
      `  dynamic requires (allowed): ${allowed.map((imp) => imp.path).join(", ")}`,
    );
  }
}

function formatBytes(bytes) {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const display =
    value >= 10 || value === Math.floor(value)
      ? value.toFixed(0)
      : value.toFixed(1);
  return `${display} ${units[unit]}`;
}
