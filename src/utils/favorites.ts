import * as vscode from 'vscode';
import { isValidBeadId } from '../littleGlen/validation';
import { BeadItemData } from './beads';
import { redactLogContent } from './fs';

const LOCAL_FAVORITES_KEY = 'beads.favorites.local';
const FAVORITE_LABEL_REGEX = /^[A-Za-z0-9 .:_-]{1,64}$/;

export function sanitizeFavoriteLabel(label: string): string {
  return (label ?? '').replace(/[\r\n\t]+/g, ' ').trim();
}

export function isValidFavoriteLabel(label: string): boolean {
  const sanitized = sanitizeFavoriteLabel(label);
  return Boolean(sanitized) && sanitized.length <= 64 && FAVORITE_LABEL_REGEX.test(sanitized);
}

export function getFavoriteLabel(config: vscode.WorkspaceConfiguration): string {
  const label = sanitizeFavoriteLabel(config.get<string>('favorites.label', 'favorite') || '');
  return label || 'favorite';
}

export function validateFavoriteTargets(beads: BeadItemData[]): {
  valid: BeadItemData[];
  invalidIds: string[];
  duplicateIds: string[];
} {
  const seen = new Set<string>();
  const valid: BeadItemData[] = [];
  const invalidIds: string[] = [];
  const duplicateIds: string[] = [];

  for (const bead of beads) {
    const id = bead?.id?.trim();
    if (!id || !isValidBeadId(id)) {
      invalidIds.push(id || '<empty>');
      continue;
    }
    if (seen.has(id)) {
      duplicateIds.push(id);
      continue;
    }
    seen.add(id);
    valid.push(bead);
  }

  return { valid, invalidIds, duplicateIds };
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

export function sanitizeFavoriteError(error: unknown, workspacePaths: string[] = []): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const redacted = redactLogContent(raw, { workspacePaths });
  return redacted.replace(/\s+/g, ' ').trim();
}
