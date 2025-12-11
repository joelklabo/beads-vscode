#!/usr/bin/env node
const { mkdtempSync, rmSync, statSync, existsSync, mkdirSync, writeFileSync } = require("fs");
const { tmpdir } = require("os");
const { join } = require("path");
const { spawnSync } = require("child_process");

const budgetBytes = parseInt(
  process.env.VSIX_MAX_BYTES || `${3 * 1024 * 1024}`,
  10,
);
const warnBytes = parseInt(
  process.env.VSIX_WARN_BYTES || `${2.7 * 1024 * 1024}`,
  10,
);
const resultPath =
  process.env.VSIX_RESULT_PATH ||
  join(__dirname, "..", "tmp", "perf", "vsix-size.json");
const tempDir = mkdtempSync(join(tmpdir(), "beady-vsix-"));
const packagePath = join(tempDir, "beady.vsix");

function log(msg) {
  // eslint-disable-next-line no-console
  console.log(msg);
}

function fail(msg) {
  // eslint-disable-next-line no-console
  console.error(msg);
  cleanup();
  process.exit(1);
}

function cleanup() {
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
}

function writeResult(result) {
  try {
    mkdirSync(join(__dirname, "..", "tmp", "perf"), { recursive: true });
    writeFileSync(resultPath, JSON.stringify(result, null, 2));
  } catch (err) {
    console.warn("Warning: unable to write VSIX size result", err);
  }
}

if (!existsSync("dist/extension.js")) {
  fail("dist/extension.js missing. Run `npm run bundle` first.");
}

const cmd = process.platform === "win32" ? "npx.cmd" : "npx";
const spawnResult = spawnSync(
  cmd,
  ["vsce", "package", "--follow-symlinks", "--out", packagePath],
  {
    stdio: "inherit",
    env: { ...process.env, SKIP_VSCODE_PREPUBLISH: "1" },
  },
);

if (spawnResult.status !== 0) {
  fail("vsce package failed");
}

const { size } = statSync(packagePath);
const sizeMb = (size / (1024 * 1024)).toFixed(2);
const result = {
  sizeBytes: size,
  sizeMB: Number(sizeMb),
  budgetBytes,
  warnBytes,
  ok: size <= budgetBytes,
  warning: size > warnBytes && size <= budgetBytes,
};
log(
  `VSIX size: ${sizeMb} MB (budget ${(budgetBytes / (1024 * 1024)).toFixed(2)} MB)`,
);

cleanup();

if (size > budgetBytes) {
  const overMb = ((size - budgetBytes) / (1024 * 1024)).toFixed(2);
  writeResult({ ...result, ok: false, warning: false });
  fail(`VSIX exceeds budget by ${overMb} MB`);
}

if (size > warnBytes) {
  log(
    `Warning: VSIX ${sizeMb} MB above warn threshold ${(warnBytes / (1024 * 1024)).toFixed(2)} MB`,
  );
}

writeResult(result);
log("VSIX size within budget.");
