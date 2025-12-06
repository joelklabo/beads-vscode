import fs from 'fs';
import path from 'path';

export const RECOMMENDED_ID = '4UtopiaInc.beady';

function ensureArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function formatJson(obj: unknown): string {
  return JSON.stringify(obj, null, 2) + '\n';
}

export interface AddRecommendationResult {
  updatedPath: string;
  recommendations: string[];
  skipped: boolean;
}

export async function addRecommendation(workspaceRoot: string): Promise<AddRecommendationResult> {
  const root = workspaceRoot || process.cwd();
  const beadsDir = path.join(root, '.beads');

  if (!fs.existsSync(beadsDir) || !fs.statSync(beadsDir).isDirectory()) {
    throw new Error(`No .beads directory found at ${root}. Pass a workspace path as the first argument or set WORKSPACE_ROOT.`);
  }

  const vscodeDir = path.join(root, '.vscode');
  const extensionsPath = path.join(vscodeDir, 'extensions.json');

  await fs.promises.mkdir(vscodeDir, { recursive: true });

  let current: any = { recommendations: [], unwantedRecommendations: [] };
  if (fs.existsSync(extensionsPath)) {
    const raw = await fs.promises.readFile(extensionsPath, 'utf8');
    try {
      current = JSON.parse(raw);
    } catch (err) {
      throw new Error(`Failed to parse existing extensions.json: ${(err as Error).message}`);
    }
  }

  const recommendations = ensureArray(current.recommendations);
  const unwanted = ensureArray(current.unwantedRecommendations);

  if (unwanted.includes(RECOMMENDED_ID)) {
    // Respect user intent; skip adding recommendation.
    return { updatedPath: extensionsPath, recommendations, skipped: true };
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
  return { updatedPath: extensionsPath, recommendations, skipped: false };
}
