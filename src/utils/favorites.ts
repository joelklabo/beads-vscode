import * as vscode from 'vscode';
import { isValidBeadId } from '../littleGlen/validation';
import { BeadItemData } from './beads';
import { redactLogContent } from './fs';

const LOCAL_FAVORITES_KEY = 'beads.favorites.local';
const FAVORITE_LABEL_REGEX = /^[A-Za-z0-9 .:_-]{1,64}$/;

function buildLabelFavorites(items: BeadItemData[], favoriteLabel: string): Set<string> {
  const favorites = new Set<string>();

  for (const item of items) {
    const labels: string[] = Array.isArray((item.raw as any)?.labels) ? (item.raw as any).labels : [];
    if (labels.includes(favoriteLabel) && isValidBeadId(item.id)) {
      favorites.add(item.id);
    }
  }

  return favorites;
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const value of a) {
    if (!b.has(value)) {
      return false;
    }
  }
  return true;
}

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

export interface FavoriteSyncOptions {
  context: vscode.ExtensionContext;
  items: BeadItemData[];
  favoriteLabel: string;
  useLabelStorage: boolean;
}

/**
 * Synchronize the local favorites cache with the current data source.
 * When label storage is enabled, labels are treated as the source of truth
 * and the local cache is updated to match. When disabled, the local cache
 * is preserved (after basic id validation).
 */
export async function syncFavoritesState(options: FavoriteSyncOptions): Promise<Set<string>> {
  const { context, items, favoriteLabel, useLabelStorage } = options;
  const local = getLocalFavorites(context);
  const normalizedLocal = new Set(Array.from(local).filter((id) => isValidBeadId(id)));

  if (!useLabelStorage) {
    if (!setsEqual(local, normalizedLocal)) {
      await saveLocalFavorites(context, normalizedLocal);
    }
    return normalizedLocal;
  }

  const labelFavorites = buildLabelFavorites(items, favoriteLabel);
  if (!setsEqual(labelFavorites, normalizedLocal)) {
    await saveLocalFavorites(context, labelFavorites);
  }

  return labelFavorites;
}
