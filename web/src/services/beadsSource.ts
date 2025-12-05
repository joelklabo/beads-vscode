import { BeadItemData, BeadsDocument, WorkspaceTarget, formatCliError } from '@beads/core';
import { loadFromCli } from './cliLoader';
import { loadMockBeads } from '../mocks/beads';

export interface LoaderOptions {
  preferMock: boolean;
  onError?: (message?: string) => void;
  onModeChange?: (usingMock: boolean) => void;
}

export type LoaderResult = { items: BeadItemData[]; document: BeadsDocument };

export function createLoader(options: LoaderOptions): (target: WorkspaceTarget) => Promise<LoaderResult> {
  return async (target: WorkspaceTarget): Promise<LoaderResult> => {
    if (options.preferMock) {
      options.onModeChange?.(true);
      options.onError?.(undefined);
      return loadMockBeads();
    }

    try {
      const result = await loadFromCli(target.root);
      options.onModeChange?.(false);
      options.onError?.(undefined);
      return result;
    } catch (error) {
      const message = formatCliError('bd CLI unavailable, using mock data', error, [target.root]);
      options.onError?.(message);
      options.onModeChange?.(true);
      return loadMockBeads();
    }
  };
}
