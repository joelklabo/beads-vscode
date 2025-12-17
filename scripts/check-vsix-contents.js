#!/usr/bin/env node
/**
 * VSIX contents audit
 *
 * Goal: prevent accidentally shipping secrets or dev-only artifacts in the Marketplace VSIX.
 *
 * To update the denylist:
 * - Prefer tightening `.vscodeignore` first (so the VSIX stays lean).
 * - If something must be shipped, add a narrow allowlist exception and document why.
 */
const { mkdtempSync, rmSync, existsSync } = require("fs");
const { tmpdir } = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const tempDir = mkdtempSync(path.join(tmpdir(), "beady-vsix-contents-"));
const packagePath = path.join(tempDir, "beady.vsix");

function log(msg) {
  // eslint-disable-next-line no-console
  console.log(msg);
}

function fail(msg, details = []) {
  // eslint-disable-next-line no-console
  console.error(`[vsix-contents] ${msg}`);
  for (const line of details) {
    // eslint-disable-next-line no-console
    console.error(line);
  }
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

function spawnOrFail(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, options);
  if (result.status !== 0) {
    fail(`Command failed: ${cmd} ${args.join(" ")}`);
  }
  return result;
}

function ensureBundle() {
  if (existsSync("dist/extension.js")) {
    return;
  }

  log("[vsix-contents] dist/extension.js missing; running `npm run bundle`...");
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  spawnOrFail(npmCmd, ["run", "bundle"], { stdio: "inherit" });

  if (!existsSync("dist/extension.js")) {
    fail("dist/extension.js still missing after bundle.");
  }
}

function packageVsix() {
  ensureBundle();
  const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
  spawnOrFail(
    npxCmd,
    ["vsce", "package", "--follow-symlinks", "--out", packagePath],
    {
      stdio: "inherit",
      env: { ...process.env, SKIP_VSCODE_PREPUBLISH: "1" },
    },
  );
}

function listZipEntries(zipPath) {
  if (process.platform === "win32") {
    const escaped = zipPath.replace(/'/g, "''");
    const ps = [
      "Add-Type -AssemblyName System.IO.Compression.FileSystem;",
      `$zip = [System.IO.Compression.ZipFile]::OpenRead('${escaped}');`,
      "$zip.Entries | ForEach-Object { $_.FullName }",
      "$zip.Dispose();",
    ].join(" ");
    const result = spawnOrFail("powershell", ["-NoProfile", "-Command", ps], {
      encoding: "utf8",
    });
    return String(result.stdout || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  const result = spawnOrFail("unzip", ["-Z1", zipPath], { encoding: "utf8" });
  return String(result.stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

const forbiddenDirPrefixes = [
  "extension/.git/",
  "extension/.beads/",
  "extension/.github/",
  "extension/.vscode/",
  "extension/.vscode-test/",
  "extension/node_modules/",
  "extension/src/",
  "extension/out/",
  "extension/packages/",
  "extension/scripts/",
  "extension/tmp/",
  "extension/test/",
  "extension/docs/",
  "extension/web/",
  "extension/tui/",
];

const forbiddenFilePatterns = [
  /(^|\/)\.env[^\/]*$/i,
  /(^|\/)\.npmrc$/i,
  /(^|\/)id_rsa(\.pub)?$/i,
  /\.(pem|key|pfx|p12|crt|der)$/i,
];

packageVsix();

const entries = listZipEntries(packagePath).map((p) => p.replace(/\\/g, "/"));

const violations = [];
for (const entry of entries) {
  const normalized = entry.replace(/\\/g, "/");

  if (forbiddenDirPrefixes.some((prefix) => normalized.startsWith(prefix))) {
    violations.push(`Forbidden path in VSIX: ${normalized}`);
    continue;
  }

  if (forbiddenFilePatterns.some((re) => re.test(normalized))) {
    violations.push(`Forbidden file in VSIX: ${normalized}`);
  }
}

cleanup();

if (violations.length > 0) {
  fail("VSIX contents audit failed.", violations);
}

log(`[vsix-contents] ✅ VSIX contents audit passed (${entries.length} entries)`);
