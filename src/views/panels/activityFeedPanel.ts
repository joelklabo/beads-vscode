import * as vscode from 'vscode';
import type { ActivityFeedTreeDataProvider } from '../../activityFeedProvider';
import type { BeadsTreeDataProvider } from '../../providers/beads/treeDataProvider';
import type { BeadItemData } from '../../utils';
import { getActivityFeedPanelHtml, ActivityFeedStrings } from '../activityFeed';
import { validateLittleGlenMessage, AllowedLittleGlenCommand } from '../../littleGlen/validation';
import { buildSharedStyles } from '../shared/theme';
import { fetchEvents as defaultFetchEvents } from '../../activityFeed';
import { t } from '../../l10n';

export interface ActivityFeedPanelDeps {
  activityFeedProvider: ActivityFeedTreeDataProvider;
  beadsProvider: BeadsTreeDataProvider;
  openBead: (item: BeadItemData) => Promise<void>;
  fetchEvents?: typeof defaultFetchEvents;
  getProjectRoot?: () => string;
  locale?: string;
}

function buildActivityFeedStrings(): ActivityFeedStrings {
  return {
    title: t('Activity Feed'),
    emptyTitle: t('No activity yet'),
    emptyDescription: t('Events will appear here as you work with issues.'),
    eventsLabel: t('events'),
  };
}

export async function openActivityFeedPanel(deps: ActivityFeedPanelDeps): Promise<void> {
  const {
    activityFeedProvider,
    beadsProvider,
    openBead,
    fetchEvents = defaultFetchEvents,
    getProjectRoot = () => vscode.workspace.getConfiguration('beady').get<string>('projectRoot') ||
      (vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? ''),
    locale = vscode.env.language || 'en',
  } = deps;

  const activityStrings = buildActivityFeedStrings();

  const panel = vscode.window.createWebviewPanel(
    'activityFeedPanel',
    activityStrings.title,
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  const projectRoot = getProjectRoot();
  const result = await fetchEvents(projectRoot, { limit: 100 });

  panel.webview.html = getActivityFeedPanelHtml(result.events, activityStrings, locale)
    .replace('<style>', `<style>\n${buildSharedStyles()}\n`);

  panel.webview.onDidReceiveMessage(async (message) => {
    const allowed: AllowedLittleGlenCommand[] = ['openBead'];
    const validated = validateLittleGlenMessage(message, allowed);
    if (!validated) {
      console.warn('[activityFeedPanel] Ignoring invalid message');
      return;
    }
    if (validated.command === 'openBead') {
      const item = (beadsProvider['items'] as BeadItemData[] | undefined)?.find((i) => i.id === validated.beadId);
      if (item) {
        await openBead(item);
      } else {
        void vscode.window.showInformationMessage(t('Opening issue {0}', validated.beadId));
      }
    }
  });

  const refreshDisposable = activityFeedProvider.onDidChangeTreeData(async () => {
    const refreshed = await fetchEvents(projectRoot, { limit: 100 });
    panel.webview.html = getActivityFeedPanelHtml(refreshed.events, activityStrings, locale)
      .replace('<style>', `<style>\n${buildSharedStyles()}\n`);
  });

  panel.onDidDispose(() => refreshDisposable.dispose());
}
