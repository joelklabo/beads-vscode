import * as fs from 'fs';
import * as path from 'path';
import Module from 'module';

type PatchableModule = typeof Module & {
  _resolveFilename: (
    request: string,
    parent: NodeModule | undefined,
    isMain: boolean,
    options?: unknown,
  ) => string;
  __beadsResolvePatched?: boolean;
};

const mod = Module as PatchableModule;

if (!mod.__beadsResolvePatched) {
  const projectRoot = path.resolve(__dirname, '../../..');
  const distExtensionPath = path.join(projectRoot, 'dist', 'extension.js');
  const outExtensionPath = path.join(projectRoot, 'out', 'extension.js');

  const originalResolveFilename = mod._resolveFilename.bind(Module);

  mod._resolveFilename = (request, parent, isMain, options) => {
    const resolved = originalResolveFilename(request, parent, isMain, options);

    if (resolved === outExtensionPath && fs.existsSync(distExtensionPath)) {
      return distExtensionPath;
    }

    return resolved;
  };

  mod.__beadsResolvePatched = true;
}
