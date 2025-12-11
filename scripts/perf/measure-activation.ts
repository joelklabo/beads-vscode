import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { runTests } from "@vscode/test-electron";
import { buildTestEnv } from "../../src/test/utils/env";

const EXTENSION_ID = process.env.BEADY_EXTENSION_ID || "klabo.beady";
const BUDGET_MS = Number(process.env.BEADY_ACTIVATION_BUDGET_MS || "100");
const RESULTS_PATH = path.resolve(
  process.env.BEADY_PERF_RESULT_PATH ||
    path.join(__dirname, "../../tmp/perf/activation.json"),
);

async function ensureDistExists(): Promise<void> {
  const distMain = path.resolve(__dirname, "../../dist/extension.js");
  try {
    await fs.access(distMain);
  } catch {
    throw new Error(
      "dist/extension.js missing. Run `npm run bundle` before `npm run check:perf`.",
    );
  }
}

async function writeResults(result: Record<string, unknown>): Promise<void> {
  await fs.mkdir(path.dirname(RESULTS_PATH), { recursive: true });
  await fs.writeFile(RESULTS_PATH, JSON.stringify(result, null, 2));
}

async function createTempTest(): Promise<{
  testDir: string;
  cleanup: () => Promise<void>;
}> {
  const testDir = await fs.mkdtemp(path.join(os.tmpdir(), "beady-activation-"));
  const testFile = path.join(testDir, "index.js");

  const content = [
    "const assert = require('assert');",
    "const fs = require('fs');",
    "const path = require('path');",
    "const vscode = require('vscode');",
    "",
    "module.exports.run = async function () {",
    "  const budget = Number(process.env.BEADY_ACTIVATION_BUDGET_MS || 100);",
    "  const resultsPath = process.env.BEADY_PERF_RESULT_PATH;",
    `  const ext = vscode.extensions.getExtension('${EXTENSION_ID}');`,
    "  assert(ext, 'extension ${EXTENSION_ID} not found');",
    "  const start = Date.now();",
    "  await ext.activate();",
    "  const duration = Date.now() - start;",
    "  const payload = { activationMs: duration, budgetMs: budget, ok: duration <= budget, timestamp: Date.now() };",
    "  if (resultsPath) {",
    "    fs.mkdirSync(path.dirname(resultsPath), { recursive: true });",
    "    fs.writeFileSync(resultsPath, JSON.stringify(payload, null, 2));",
    "  }",
    "  if (duration > budget) {",
    "    throw new Error('Activation ' + duration + 'ms exceeds budget ' + budget + 'ms');",
    "  }",
    "};",
    "",
  ].join("\n");

  await fs.writeFile(testFile, content);

  return {
    testDir,
    cleanup: async () => {
      await fs.rm(testDir, { recursive: true, force: true });
    },
  };
}

async function main(): Promise<void> {
  await ensureDistExists();

  const env = await buildTestEnv();
  const { testDir, cleanup } = await createTempTest();

  try {
    const start = Date.now();
    await runTests({
      version: env.channel === "insiders" ? "insider" : "stable",
      extensionDevelopmentPath: path.resolve(__dirname, "../.."),
      extensionTestsPath: testDir,
      launchArgs: [
        "--disable-extensions",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--log=error",
        `--user-data-dir=${env.userDataDir}`,
        `--extensions-dir=${env.extensionsDir}`,
        ...env.extraLaunchArgs,
      ],
    });
    const totalMs = Date.now() - start;
    await writeResults({
      activationMs: undefined,
      budgetMs: BUDGET_MS,
      ok: true,
      harnessMs: totalMs,
    });
  } catch (error) {
    await writeResults({
      activationMs: undefined,
      budgetMs: BUDGET_MS,
      ok: false,
      error: String(error),
    });
    console.error(error);
    process.exitCode = 1;
  } finally {
    await cleanup();
    await fs
      .rm(env.userDataDir, { recursive: true, force: true })
      .catch(() => undefined);
    await fs
      .rm(env.extensionsDir, { recursive: true, force: true })
      .catch(() => undefined);
  }
}

void main();
