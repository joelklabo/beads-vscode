import { strict as assert } from 'assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { addRecommendation } from '../../recommendation';

function createTmpWorkspace(withBeads = true): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'beady-rec-'));
  if (withBeads) {
    fs.mkdirSync(path.join(dir, '.beads'));
  }
  return dir;
}

describe('add-vscode-recommendation', () => {
  it('fails when .beads is missing', async () => {
    const root = createTmpWorkspace(false);
    await assert.rejects(async () => addRecommendation(root), /No \.beads directory/);
  });

  it('creates extensions.json with the recommendation', async () => {
    const root = createTmpWorkspace();
    const { updatedPath, recommendations, skipped } = await addRecommendation(root);
    const content = JSON.parse(fs.readFileSync(updatedPath, 'utf8'));

    assert.equal(skipped, false);
    assert.deepEqual(recommendations, ['4UtopiaInc.beady']);
    assert.deepEqual(content.recommendations, ['4UtopiaInc.beady']);
    assert.deepEqual(content.unwantedRecommendations, []);
  });

  it('merges existing recommendations without duplicates', async () => {
    const root = createTmpWorkspace();
    const vscodeDir = path.join(root, '.vscode');
    fs.mkdirSync(vscodeDir, { recursive: true });
    const extensionsPath = path.join(vscodeDir, 'extensions.json');
    fs.writeFileSync(
      extensionsPath,
      JSON.stringify(
        {
          recommendations: ['ms-vscode.vscode-typescript-tslint-plugin'],
          unwantedRecommendations: ['some.other.ext'],
        },
        null,
        2
      )
    );

    const result = await addRecommendation(root);
    const content = JSON.parse(fs.readFileSync(extensionsPath, 'utf8'));

    assert.equal(result.skipped, false);
    assert.deepEqual(content.recommendations, [
      'ms-vscode.vscode-typescript-tslint-plugin',
      '4UtopiaInc.beady',
    ]);
    assert.deepEqual(content.unwantedRecommendations, ['some.other.ext']);
  });

  it('skips when recommendation is in unwantedRecommendations', async () => {
    const root = createTmpWorkspace();
    const vscodeDir = path.join(root, '.vscode');
    fs.mkdirSync(vscodeDir, { recursive: true });
    const extensionsPath = path.join(vscodeDir, 'extensions.json');
    fs.writeFileSync(
      extensionsPath,
      JSON.stringify(
        {
          recommendations: ['foo.bar'],
          unwantedRecommendations: ['4UtopiaInc.beady'],
        },
        null,
        2
      )
    );

    const result = await addRecommendation(root);
    const content = JSON.parse(fs.readFileSync(extensionsPath, 'utf8'));

    assert.equal(result.skipped, true);
    assert.deepEqual(content.recommendations, ['foo.bar']);
    assert.deepEqual(content.unwantedRecommendations, ['4UtopiaInc.beady']);
  });
});
