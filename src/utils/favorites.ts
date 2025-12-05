import * as vscode from 'vscode';

const LOCAL_FAVORITES_KEY = 'beads.favorites.local';

export function getFavoriteLabel(config: vscode.WorkspaceConfiguration): string {
  const label = (config.get<string>('favorites.label', 'favorite') || '').trim();
  return label || 'favorite';
}

export function getLocalFavorites(context: vscode.ExtensionContext): Set<string> {
  const stored = context.workspaceState.get<string[]>(LOCAL_FAVORITES_KEY, []);
  return new Set(stored ?? []);
}

export async function saveLocalFavorites(context: vscode.ExtensionContext, favorites: Set<string>): Promise<void> {
  await context.workspaceState.update(LOCAL_FAVORITES_KEY, Array.from(favorites));
}

export function isFavoriteLocally(context: vscode.ExtensionContext, id: string): boolean {
  return getLocalFavorites(context).has(id);
}
