import * as vscode from 'vscode';
import { buildFeedbackBody } from '../feedback';
import { computeFeedbackEnablement } from '../feedback/enablement';

const t = vscode.l10n.t;

type FeedbackTypeOption = {
  label: string;
  description?: string;
  value: string;
};

async function pickFeedbackType(): Promise<string | undefined> {
  const options: FeedbackTypeOption[] = [
    { label: t('Bug report'), description: t('Something is broken'), value: 'bug' },
    { label: t('Feature request'), description: t('Suggest an improvement'), value: 'feature' },
    { label: t('Question'), description: t('Ask for help or clarification'), value: 'question' },
    { label: t('Other'), description: t('General feedback'), value: 'other' },
  ];

  const selection = await vscode.window.showQuickPick(options, {
    title: t('Send Feedback'),
    placeHolder: t('Select a feedback type'),
    canPickMany: false,
  });

  return selection?.value;
}

async function confirmLogAttachment(defaultInclude: boolean): Promise<boolean | undefined> {
  const yesLabel = defaultInclude ? t('Yes (recommended)') : t('Yes');
  const noLabel = defaultInclude ? t('No') : t('No (recommended)');

  const selection = await vscode.window.showQuickPick(
    [
      { label: yesLabel, value: true },
      { label: noLabel, value: false },
    ],
    {
      title: t('Attach sanitized logs?'),
      placeHolder: t('Logs are redacted and size-limited'),
    }
  );

  return selection?.value;
}

function buildIssueUrl(repository: string, title: string, body: string): vscode.Uri {
  const url = new URL(`https://github.com/${repository}/issues/new`);
  url.searchParams.set('title', title);
  url.searchParams.set('body', body);
  return vscode.Uri.parse(url.toString());
}

export async function sendFeedback(context: vscode.ExtensionContext): Promise<void> {
  const enablement = computeFeedbackEnablement();
  if (!enablement.enabled) {
    const reason = enablement.reason ?? t('feedback disabled');
    void vscode.window.showWarningMessage(
      t('Feedback is turned off or misconfigured: {0}', reason)
    );
    return;
  }

  const summary = await vscode.window.showInputBox({
    title: t('Send Feedback'),
    prompt: t('Brief summary'),
    placeHolder: t('Example: Stale badge sticks after refresh'),
    validateInput: (value) => (value && value.trim().length > 0 ? undefined : t('Summary is required')),
  });

  if (!summary) {
    return;
  }

  const type = await pickFeedbackType();
  if (!type) {
    return;
  }

  const details = await vscode.window.showInputBox({
    title: t('Add details (optional)'),
    prompt: t('Steps, expectations, or context'),
    placeHolder: t('What happened? What did you expect?'),
    value: '',
  });

  const includeLogsSelection = await confirmLogAttachment(enablement.config.includeAnonymizedLogs !== false);
  if (includeLogsSelection === undefined) {
    return;
  }

  const baseBody = [summary, details].filter(Boolean).join('\n\n');

  const workspacePaths = vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath);
  const logDir = context.logUri?.fsPath;

  let body = baseBody;
  try {
    body = await buildFeedbackBody({
      baseBody,
      includeLogs: includeLogsSelection,
      logDir,
      workspacePaths,
    });
  } catch (error: any) {
    console.warn('Failed to build feedback body, falling back to base text', error);
  }

  const issueTitle = summary.split(/\r?\n/, 1)[0].trim() || t('Feedback');
  const issueUrl = buildIssueUrl(enablement.config.repository ?? '', issueTitle, body);

  await vscode.env.openExternal(issueUrl);
  void vscode.window.showInformationMessage(
    t('Opening GitHub to create feedback in {0}', enablement.config.repository ?? '')
  );
}

export function registerSendFeedbackCommand(context: vscode.ExtensionContext): vscode.Disposable {
  return vscode.commands.registerCommand('beady.sendFeedback', () => sendFeedback(context));
}
