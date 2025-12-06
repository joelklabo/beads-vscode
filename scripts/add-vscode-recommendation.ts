#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const RECOMMENDED_ID = '4UtopiaInc.beady';

function ensureArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function formatJson(obj: unknown): string {
  return JSON.stringify(obj, null, 2) + '\n';
}

function fail(message: string): never {
  console.error(`[recommend:add] ${message}`);
  process.exit(1);
}

async function main() {
  const workspaceRoot = process.argv[2] || process.env.WORKSPACE_ROOT || process.cwd();
  const beadsDir = path.join(workspaceRoot, '.beads');

  if (!fs.existsSync(beadsDir) || !fs.statSync(beadsDir).isDirectory()) {
    fail(`No .beads directory found at ${workspaceRoot}. Pass a workspace path as the first argument or set WORKSPACE_ROOT.`);
  }

  const vscodeDir = path.join(workspaceRoot, '.vscode');
  const extensionsPath = path.join(vscodeDir, 'extensions.json');

  await fs.promises.mkdir(vscodeDir, { recursive: true });

  let current: any = { recommendations: [], unwantedRecommendations: [] };
  if (fs.existsSync(extensionsPath)) {
    try {
      const raw = await fs.promises.readFile(extensionsPath, 'utf8');
      current = JSON.parse(raw);
    } catch (err) {
      fail(`Failed to parse existing extensions.json: ${(err as Error).message}`);
    }
  }

  const recommendations = ensureArray(current.recommendations);
  const unwanted = ensureArray(current.unwantedRecommendations);

  if (unwanted.includes(RECOMMENDED_ID)) {
    console.warn(`[recommend:add] Recommendation not added because it is listed in unwantedRecommendations.`);
    process.exit(0);
  }

  if (!recommendations.includes(RECOMMENDED_ID)) {
    recommendations.push(RECOMMENDED_ID);
  }

  const next = {
    ...current,
    recommendations,
    unwantedRecommendations: unwanted,
  };

  await fs.promises.writeFile(extensionsPath, formatJson(next), 'utf8');
  console.log(`[recommend:add] Updated ${extensionsPath} with ${RECOMMENDED_ID}.`);
}

main().catch((err) => fail((err as Error).message));
