import * as vscode from 'vscode';
import type { BeadsTreeDataProvider } from '../../providers/beads/treeDataProvider';
import type { BeadItemData } from '../../utils';
import { getInProgressPanelHtml, buildInProgressPanelStrings, InProgressPanelStrings } from '../inProgress';
import { validateLittleGlenMessage, AllowedLittleGlenCommand } from '../../littleGlen/validation';
import { buildSharedStyles } from '../shared/theme';
const t = vscode.l10n.t;

export interface InProgressPanelDeps {
  provider: BeadsTreeDataProvider;
  openBead: (item: BeadItemData) => Promise<void>;
  strings?: InProgressPanelStrings;
  locale?: string;
  density?: 'default' | 'compact';
}

export async function openInProgressPanel(deps: InProgressPanelDeps): Promise<void> {
  const {
    provider,
    openBead,
    strings = buildInProgressPanelStrings(),
    locale = vscode.env.language || 'en',
  } = deps;

  const canRefresh = typeof (provider as any).refresh === 'function';
  const viewColumn = (vscode.ViewColumn && vscode.ViewColumn.One) || 1;
  const panel = vscode.window.createWebviewPanel(
    'inProgressSpotlight',
    strings.title,
    viewColumn,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  const itemsMaybe = (provider as any)['items'];
  if ((!Array.isArray(itemsMaybe) || itemsMaybe.length === 0) && canRefresh) {
    try {
      await (provider as any).refresh();
    } catch (error) {
      console.warn('[inProgressPanel] Failed to refresh provider:', error);
      void vscode.window.showWarningMessage(
        t('Issues are still loading. Try again after refreshing the explorer.')
      );
    }
  } else if ((!Array.isArray(itemsMaybe) || itemsMaybe.length === 0) && !canRefresh) {
    void vscode.window.showWarningMessage(t('Issues are still loading. Try again after refreshing the explorer.'));
  }

  const render = (): void => {
    const normalizeStatus = (value: string | undefined): string | undefined =>
      value?.toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');

    const sourceItems =
      typeof (provider as any).getVisibleBeads === 'function'
        ? ((provider as any).getVisibleBeads() as BeadItemData[] | undefined) ?? []
        : (Array.isArray((provider as any)['items']) ? (provider as any)['items'] as BeadItemData[] : []);

    const inProgress = sourceItems.filter((item) => normalizeStatus(item.status) === 'in_progress');
    panel.webview.html = getInProgressPanelHtml(inProgress, strings, locale)
      .replace('<style>', `<style>\n${buildSharedStyles()}\n`);
  };

  render();

  const subscription = provider.onDidChangeTreeData(() => render());
  panel.onDidDispose(() => subscription.dispose());

  let invalidLogged = false;
  panel.webview.onDidReceiveMessage(async (message) => {
    const allowed: AllowedLittleGlenCommand[] = ['openBead'];
    const validated = validateLittleGlenMessage(message, allowed);
    if (!validated) {
      if (!invalidLogged) {
        console.warn('[inProgressPanel] Ignoring invalid message');
        void vscode.window.showWarningMessage(t('Ignored invalid request from In Progress panel.'));
        invalidLogged = true;
      }
      return;
    }

    if (validated.command === 'openBead') {
      if (typeof openBead !== 'function') {
        void vscode.window.showWarningMessage(t('Unable to open issues right now. Please refresh and try again.'));
        return;
      }
      const items = (provider as any)['items'] as BeadItemData[] || [];
      const item = items.find((i: BeadItemData) => i.id === validated.beadId);
      if (!item) {
        void vscode.window.showWarningMessage(t('Issue {0} not found', validated.beadId));
        return;
      }
      await openBead(item);
    }
  });
}
