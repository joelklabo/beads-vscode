import * as vscode from 'vscode';
import { AllowedLittleGlenCommand, validateLittleGlenMessage } from '../../littleGlen/validation';
import { addDependencyCommand, removeDependencyCommand } from '../../commands/dependencies';
import { editAssignee } from '../../commands';
import { resolveProjectRoot } from '../../utils/workspace';
import { formatError, BeadItemData, validateLabelInput } from '../../utils';
import { getBeadDetailHtml } from './html';
import { buildBeadDetailStrings, getStatusLabels, BeadsTreeDataProvider } from '../../providers/beads/treeDataProvider';
import { runBdCommand } from '../../services/cliService';

const t = vscode.l10n.t;
const PROJECT_ROOT_ERROR = t('Unable to resolve project root. Set "beady.projectRoot" or open a workspace folder.');

function createNonce(): string {
  return Math.random().toString(36).slice(2, 15) + Math.random().toString(36).slice(2, 15);
}

export async function openBeadPanel(
  item: BeadItemData,
  provider: BeadsTreeDataProvider,
  openBead: (item: BeadItemData, provider: BeadsTreeDataProvider) => Promise<void>,
  density: "default" | "compact" = "default"
): Promise<void> {
  const nonce = createNonce();
  const viewColumn = (vscode.ViewColumn && vscode.ViewColumn.One) || 1;
  const baseWorkspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri ?? vscode.Uri?.file?.(process.cwd());
  const extensionUri = provider['context']?.extensionUri ?? vscode.Uri?.file?.(process.cwd());
  const localResourceRoots = [
    baseWorkspaceUri && (vscode.Uri?.joinPath ? vscode.Uri.joinPath(baseWorkspaceUri) : baseWorkspaceUri),
    extensionUri,
  ].filter(Boolean);

  const panel = vscode.window.createWebviewPanel(
    'beadDetail',
    item.id,
    viewColumn,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots,
    }
  );

  const allItems = provider['items'] as BeadItemData[];
  const statusLabels = getStatusLabels();
  const beadStrings = buildBeadDetailStrings(statusLabels);
  const locale = vscode.env.language || 'en';
  panel.webview.html = getBeadDetailHtml(item, allItems, panel.webview, nonce, beadStrings, locale)
    .replace('<body', `<body data-density="${density}"${density === 'compact' ? ' class=\"compact\"' : ''}`);

  provider.registerPanel(item.id, panel);

  const allowedCommands: AllowedLittleGlenCommand[] = [
    'updateStatus',
    'updateTitle',
    'updateDescription',
    'updateDesign',
    'updateAcceptanceCriteria',
    'updateNotes',
    'updateType',
    'updatePriority',
    'editAssignee',
    'addLabel',
    'removeLabel',
    'addDependency',
    'removeDependency',
    'deleteBead',
    'openBead',
    'openExternalUrl',
  ];

  panel.webview.onDidReceiveMessage(async (message) => {
    const validated = validateLittleGlenMessage(message, allowedCommands);
    if (!validated) {
      console.warn('[Little Glen] Ignoring invalid panel message');
      void vscode.window.showWarningMessage(t('Ignored invalid request from Little Glen panel.'));
      return;
    }

    switch (validated.command) {
      case 'updateStatus':
        await provider.updateStatus(item, validated.status);
        return;
      case 'updateTitle':
        await provider.updateTitle(item, validated.title);
        return;
      case 'updateDescription':
        await provider.updateDescription(item, validated.value);
        return;
      case 'updateDesign':
        await provider.updateDesign(item, validated.value);
        return;
      case 'updateAcceptanceCriteria':
        await provider.updateAcceptanceCriteria(item, validated.value);
        return;
      case 'updateNotes':
        await provider.updateNotes(item, validated.value);
        return;
      case 'updateType':
        await provider.updateType(item, validated.type);
        return;
      case 'updatePriority':
        await provider.updatePriority(item, validated.priority);
        return;
      case 'editAssignee':
        await editAssignee(provider as any, undefined, item);
        return;
      case 'addLabel':
        if (!validated.label) {
          const input = await vscode.window.showInputBox({
            placeHolder: t('Label name'),
            prompt: t('Enter a label to add'),
            validateInput: (value) => {
              const res = validateLabelInput(value);
              return res.valid ? null : t('Invalid label format');
            },
          });
          if (input) {
            await provider.addLabel(item, input);
          }
        } else {
          await provider.addLabel(item, validated.label);
        }
        return;
      case 'removeLabel':
        await provider.removeLabel(item, validated.label);
        return;
      case 'addDependency': {
        const sourceId = validated.sourceId ?? item.id;
        const targetId = validated.targetId;
        const sourceItem = (provider as any)['items']?.find((i: BeadItemData) => i.id === sourceId) ?? item;
        await addDependencyCommand(provider as any, sourceItem, targetId ? { sourceId, targetId } : undefined);
        return;
      }
      case 'removeDependency': {
        await removeDependencyCommand(
          provider as any,
          validated.sourceId && validated.targetId ? { sourceId: validated.sourceId, targetId: validated.targetId } : undefined,
          { contextId: item.id }
        );
        return;
      }
      case 'deleteBead': {
        const projectRoot = resolveProjectRoot(vscode.workspace.getConfiguration('beady'));
        if (!projectRoot) {
          void vscode.window.showErrorMessage(PROJECT_ROOT_ERROR);
          return;
        }

        const deleteLabel = t('Delete');
        const answer = await vscode.window.showWarningMessage(
          t('Are you sure you want to delete this bead?\n\n{0}', item.id),
          { modal: true },
          deleteLabel
        );
        if (answer !== deleteLabel) {
          return;
        }

        try {
          await runBdCommand(['delete', item.id, '--force'], projectRoot);
          await provider.refresh();
          panel.dispose();
        } catch (error) {
          console.error('Failed to delete bead from detail view', error);
          void vscode.window.showErrorMessage(formatError(t('Failed to delete bead'), error));
        }
        return;
      }
      case 'openBead': {
        const targetBead = allItems.find((i) => i.id === validated.beadId);
        if (targetBead) {
          await openBead(targetBead, provider);
        } else {
          void vscode.window.showWarningMessage(t('Issue {0} not found', validated.beadId));
        }
        return;
      }
      case 'openExternalUrl':
        await vscode.env.openExternal(vscode.Uri.parse(validated.url));
        return;
    }
  });
}

export const openBeadFromFeed = async (
  issueId: string,
  beadsProvider: BeadsTreeDataProvider,
  opener: (item: BeadItemData, provider: BeadsTreeDataProvider) => Promise<void>
): Promise<boolean> => {
  const items = beadsProvider['items'] as BeadItemData[] | undefined;
  const target = items?.find((i) => i.id === issueId);

  if (!target) {
    console.warn(`[ActivityFeed] Issue ${issueId} not found when opening from feed`);
    void vscode.window.showWarningMessage(t('Issue {0} no longer exists or is not loaded.', issueId));
    return false;
  }

  try {
    await opener(target, beadsProvider);
    return true;
  } catch (error) {
    console.error(`[ActivityFeed] Failed to open issue ${issueId} from feed:`, error);
    void vscode.window.showErrorMessage(formatError(t('Failed to open issue from activity feed'), error));
    return false;
  }
};
