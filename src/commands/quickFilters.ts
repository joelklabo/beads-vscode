/**
 * Quick filter command handlers.
 *
 * These commands allow users to apply or clear quick filter presets:
 * - applyQuickFilterPreset: Show picker to apply a filter preset
 * - clearQuickFilters: Clear all active quick filters
 */

import { CommandDefinition } from './registry';

/**
 * Interface for provider with quick filter capabilities.
 */
export interface QuickFilterProvider {
  applyQuickFilterPreset(): Promise<void>;
  clearQuickFilter(): void;
}

/**
 * Create quick filter command definitions with bound dependencies.
 *
 * These commands delegate to the provider's quick filter methods,
 * which handle the UI and state management internally.
 */
export function createQuickFilterCommands(provider: QuickFilterProvider): CommandDefinition[] {
  return [
    {
      id: 'beady.applyQuickFilterPreset',
      handler: () => provider.applyQuickFilterPreset(),
      description: 'Apply a quick filter preset',
    },
    {
      id: 'beady.clearQuickFilters',
      handler: () => {
        provider.clearQuickFilter();
        return Promise.resolve();
      },
      description: 'Clear all quick filters',
    },
  ];
}
