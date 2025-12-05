import { BeadItemData } from './beads';
import { isStale } from './stale';

export type QuickFilterPreset =
  | { kind: 'status'; value: 'open' | 'in_progress' | 'blocked' | 'closed' }
  | { kind: 'label'; value?: string }
  | { kind: 'stale' };

export function applyQuickFilter(items: BeadItemData[], preset?: QuickFilterPreset): BeadItemData[] {
  if (!preset) {
    return items;
  }

  switch (preset.kind) {
    case 'status':
      return items.filter((item) => (item.status || 'open') === preset.value);
    case 'label':
      return items.filter((item) => {
        const labels: string[] = Array.isArray((item.raw as any)?.labels) ? (item.raw as any).labels : [];
        return labels.length > 0;
      });
    case 'stale': {
      return items.filter((item) => isStale(item));
    }
    default:
      return items;
  }
}

export function toggleQuickFilter(current: QuickFilterPreset | undefined, selected: QuickFilterPreset): QuickFilterPreset | undefined {
  if (!current) {
    return selected;
  }

  if (current.kind === selected.kind) {
    const currentValue = 'value' in current ? current.value : undefined;
    const selectedValue = 'value' in selected ? selected.value : undefined;
    if (currentValue === selectedValue) {
      return undefined;
    }
  }

  return selected;
}
