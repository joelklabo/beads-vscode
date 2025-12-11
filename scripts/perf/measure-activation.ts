import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { runTests as runTestsBase } from "@vscode/test-electron";
import { buildTestEnv } from "../../src/test/utils/env";

const DEFAULT_EXTENSION_ID = process.env.BEADY_EXTENSION_ID || "klabo.beady";
const DEFAULT_BUDGET_MS = Number(process.env.BEADY_ACTIVATION_BUDGET_MS || "100");
const DEFAULT_RESULTS_PATH = path.resolve(
  process.env.BEADY_PERF_RESULT_PATH ||
    path.join(__dirname, "../../tmp/perf/activation.json"),
);

export interface MeasureActivationOptions {
  runTestsImpl?: typeof runTestsBase;
  resultPath?: string;
  budgetMs?: number;
  extensionId?: string;
  distPath?: string;
  now?: () => number;
  allowHeadless?: boolean;
}

async function ensureDistExists(distPath: string): Promise<void> {
  try {
    await fs.access(distPath);
  } catch {
    throw new Error(
      "dist/extension.js missing. Run `npm run bundle` before `npm run check:perf`.",
    );
  }
}

async function writeResults(resultsPath: string, result: Record<string, unknown>): Promise<void> {
  await fs.mkdir(path.dirname(resultsPath), { recursive: true });
  await fs.writeFile(resultsPath, JSON.stringify(result, null, 2));
}

async function readResults(resultsPath: string): Promise<Record<string, unknown> | undefined> {
  try {
    const raw = await fs.readFile(resultsPath, "utf8");
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

async function createTempTest(
  resultsPath: string,
  extensionId: string,
  budgetMs: number,
): Promise<{ testDir: string; cleanup: () => Promise<void> }> {
  const testDir = await fs.mkdtemp(path.join(os.tmpdir(), "beady-activation-"));
  const testFile = path.join(testDir, "index.js");

  const content = [
    "const assert = require('assert');",
    "const fs = require('fs');",
    "const path = require('path');",
    "const vscode = require('vscode');",
    "",
    "module.exports.run = async function () {",
    `  const budget = ${budgetMs};`,
    `  const resultsPath = ${JSON.stringify(resultsPath)};`,
    `  const ext = vscode.extensions.getExtension(${JSON.stringify(extensionId)});`,
    "  assert(ext, 'extension not found');",
    "  const start = Date.now();",
    "  await ext.activate();",
    "  const duration = Date.now() - start;",
    "  const payload = { activationMs: duration, budgetMs: budget, ok: duration <= budget, timestamp: Date.now() };",
    "  fs.mkdirSync(path.dirname(resultsPath), { recursive: true });",
    "  fs.writeFileSync(resultsPath, JSON.stringify(payload, null, 2));",
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

export async function measureActivation(
  options: MeasureActivationOptions = {},
): Promise<Record<string, unknown>> {
  const resultPath = options.resultPath ?? DEFAULT_RESULTS_PATH;
  const budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS;
  const extensionId = options.extensionId ?? DEFAULT_EXTENSION_ID;
  const runTestsImpl = options.runTestsImpl ?? runTestsBase;
  const now = options.now ?? Date.now;
  const distPath = options.distPath ?? path.resolve(__dirname, "../../dist/extension.js");
  const allowHeadless = options.allowHeadless ?? true;

  await ensureDistExists(distPath);

  const env = await buildTestEnv();
  const { testDir, cleanup } = await createTempTest(resultPath, extensionId, budgetMs);

  try {
    const start = now();
    await runTestsImpl({
      version: env.channel === "insiders" ? "insider" : "stable",
      extensionDevelopmentPath: path.resolve(__dirname, "../.."),
      extensionTestsPath: testDir,
      launchArgs: [
        "--disable-extensions",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--log=error",
        allowHeadless ? "--disable-renderer-backgrounding" : "",
        `--user-data-dir=${env.userDataDir}`,
        `--extensions-dir=${env.extensionsDir}`,
        ...env.extraLaunchArgs,
      ],
    });
    const harnessMs = now() - start;
    const existing = await readResults(resultPath);
    const merged = {
      ...(existing ?? {}),
      budgetMs,
      harnessMs,
    } as Record<string, unknown>;

    if (typeof merged.ok !== "boolean") {
      const activationMs = merged.activationMs as number | undefined;
      merged.ok = typeof activationMs === "number" ? activationMs <= budgetMs : true;
    }

    await writeResults(resultPath, merged);
    return merged;
  } catch (error) {
    const failure = { budgetMs, ok: false, error: String(error) } as Record<string, unknown>;
    await writeResults(resultPath, failure);
    console.error(error);
    throw error;
  } finally {
    await cleanup();
    await fs.rm(env.userDataDir, { recursive: true, force: true }).catch(() => undefined);
    await fs.rm(env.extensionsDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

if (process.env.BEADY_SKIP_PERF_MAIN !== "1") {
  measureActivation().catch(() => { process.exitCode = 1; });
}
