import * as vscode from 'vscode';
import type { BeadsTreeDataProvider } from '../../providers/beads/treeDataProvider';
import type { BeadItemData } from '../../utils';
import { getInProgressPanelHtml, buildInProgressPanelStrings, InProgressPanelStrings } from '../inProgress';
import { validateLittleGlenMessage, AllowedLittleGlenCommand } from '../../littleGlen/validation';
import { buildSharedStyles } from '../shared/theme';
import { t } from '../../l10n';

export interface InProgressPanelDeps {
  provider: BeadsTreeDataProvider;
  openBead: (item: BeadItemData) => Promise<void>;
  strings?: InProgressPanelStrings;
  locale?: string;
}

export async function openInProgressPanel(deps: InProgressPanelDeps): Promise<void> {
  const {
    provider,
    openBead,
    strings = buildInProgressPanelStrings(),
    locale = vscode.env.language || 'en',
  } = deps;

  const panel = vscode.window.createWebviewPanel(
    'inProgressSpotlight',
    strings.title,
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  if (!(provider as any)['items'] || (provider as any)['items'].length === 0) {
    await provider.refresh();
  }

  const render = (): void => {
    const items = (provider as any)['items'] as BeadItemData[] || [];
    const inProgress = items.filter((item) => item.status === 'in_progress');
    panel.webview.html = getInProgressPanelHtml(inProgress, strings, locale)
      .replace('<style>', `<style>\n${buildSharedStyles()}\n`);
  };

  render();

  const subscription = provider.onDidChangeTreeData(() => render());
  panel.onDidDispose(() => subscription.dispose());

  panel.webview.onDidReceiveMessage(async (message) => {
    const allowed: AllowedLittleGlenCommand[] = ['openBead'];
    const validated = validateLittleGlenMessage(message, allowed);
    if (!validated) {
      console.warn('[inProgressPanel] Ignoring invalid message');
      return;
    }

    if (validated.command === 'openBead') {
      const items = (provider as any)['items'] as BeadItemData[] || [];
      const item = items.find((i: BeadItemData) => i.id === validated.beadId);
      if (item) {
        await openBead(item);
      } else {
        void vscode.window.showWarningMessage(t('Issue {0} not found', validated.beadId));
      }
    }
  });
}
