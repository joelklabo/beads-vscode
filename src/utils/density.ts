import * as vscode from 'vscode';

export type DensityMode = 'default' | 'compact';

const STATE_KEY = 'beady:viewDensity';

export function loadDensity(context: vscode.ExtensionContext): DensityMode {
  const saved = context.workspaceState.get<DensityMode>(STATE_KEY);
  if (saved === 'compact' || saved === 'default') {
    return saved;
  }
  const configValue = vscode.workspace.getConfiguration('beady').get<string>('density', 'default');
  return configValue === 'compact' ? 'compact' : 'default';
}

export async function saveDensity(context: vscode.ExtensionContext, density: DensityMode): Promise<void> {
  await context.workspaceState.update(STATE_KEY, density);
}

export function nextDensity(current: DensityMode): DensityMode {
  return current === 'compact' ? 'default' : 'compact';
}
