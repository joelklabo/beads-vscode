import { BeadItemData } from './beads';
import { isStale } from './stale';
import { sanitizeInlineText } from './sanitize';

export type QuickFilterPreset =
  | { kind: 'status'; value: 'open' | 'in_progress' | 'blocked' | 'closed' }
  | { kind: 'label'; value?: string }
  | { kind: 'stale' };

export function normalizeQuickFilter(preset?: QuickFilterPreset): QuickFilterPreset | undefined {
  if (!preset) {
    return undefined;
  }

  switch (preset.kind) {
    case 'status': {
      const allowed: Array<'open' | 'in_progress' | 'blocked' | 'closed'> = ['open', 'in_progress', 'blocked', 'closed'];
      return allowed.includes(preset.value) ? { kind: 'status', value: preset.value } : undefined;
    }
    case 'label': {
      const safeValue = typeof preset.value === 'string' ? sanitizeInlineText(preset.value) : undefined;
      if (safeValue && safeValue.length > 0) {
        return { kind: 'label', value: safeValue };
      }
      return { kind: 'label' };
    }
    case 'stale':
      return { kind: 'stale' };
    default:
      return undefined;
  }
}

export function applyQuickFilter(items: BeadItemData[], preset?: QuickFilterPreset): BeadItemData[] {
  const safePreset = normalizeQuickFilter(preset);
  if (!safePreset) {
    return items;
  }

  switch (safePreset.kind) {
    case 'status':
      return items.filter((item) => (item.status || 'open') === safePreset.value);
    case 'label':
      return items.filter((item) => {
        const labels: string[] = Array.isArray((item.raw as any)?.labels) ? (item.raw as any).labels : [];
        if (safePreset.value) {
          return labels.some((label) => label && sanitizeInlineText(label).toLowerCase() === safePreset.value?.toLowerCase());
        }
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
