#!/usr/bin/env node
import { addRecommendation, RECOMMENDED_ID } from '../src/recommendation';

async function main() {
  const workspaceRoot = process.argv[2] || process.env.WORKSPACE_ROOT || process.cwd();
  try {
    const result = await addRecommendation(workspaceRoot);
    if (result.skipped) {
      console.warn(`[recommend:add] Recommendation not added because it is listed in unwantedRecommendations.`);
    } else {
      console.log(`[recommend:add] Updated ${result.updatedPath} with ${RECOMMENDED_ID}.`);
    }
  } catch (err) {
    console.error(`[recommend:add] ${(err as Error).message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  main();
}
