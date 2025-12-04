import * as vscode from 'vscode';
import { promises as fs } from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { ZorkEngine } from './engine';
import { ChoiceOption, RunnerContext, ZorkScript } from './types';

const execFileAsync = promisify(execFile);

interface ZorkScriptEntry extends ZorkScript {
  id: string;
  description?: string;
}

interface SavedRunState {
  scriptId: string;
  answers: Record<string, string>;
  vars?: Record<string, string>;
  lastStatus?: string;
  lastMessage?: string;
  updatedAt: number;
}

interface PanelMessageBase {
  type: string;
}

type PanelMessage =
  | ({ type: 'start' | 'resume' | 'restart'; scriptId?: string })
  | ({ type: 'promptResponse'; stepId: string; value: string })
  | ({ type: 'choiceResponse'; stepId: string; choiceId: string });

function createNonce(): string {
  return Math.random().toString(36).slice(2, 15) + Math.random().toString(36).slice(2, 15);
}

async function loadZorkScripts(extensionPath: string): Promise<ZorkScriptEntry[]> {
  const candidates = [
    path.join(extensionPath, 'out', 'zork', 'scripts.json'),
    path.join(extensionPath, 'out', 'zork', 'bundle.json'),
    path.join(extensionPath, 'zork', 'scripts.json'),
  ];

  for (const candidate of candidates) {
    try {
      const raw = await fs.readFile(candidate, 'utf8');
      const parsed = JSON.parse(raw);
      const scripts = normalizeScripts(parsed);
      if (scripts.length > 0) {
        return scripts;
      }
    } catch (error) {
      // ignore missing/parse errors and keep trying
      continue;
    }
  }

  // Fallback sample script to ensure the UI works even if bundle missing
  return [
    {
      id: 'sample',
      name: 'Sample Walkthrough',
      description: 'Demo flow to validate Zork UI',
      steps: [
        { id: 'start', type: 'prompt', message: 'What is your name?', variable: 'name' },
        {
          id: 'path',
          type: 'choice',
          message: 'Pick a path',
          options: [
            { id: 'inspect', label: 'Inspect workspace', goto: 'inspect' },
            { id: 'skip', label: 'Skip command', goto: 'finish' },
          ],
        },
        { id: 'inspect', type: 'command', command: 'ls', args: ['-1'], onError: 'continue' },
        { id: 'assert', type: 'assert', expression: 'vars.name.length > 0', message: 'Name required' },
        { id: 'finish', type: 'end', status: 'success', message: 'Walkthrough complete' },
      ],
    },
  ];
}

function normalizeScripts(input: unknown): ZorkScriptEntry[] {
  const results: ZorkScriptEntry[] = [];

  if (Array.isArray(input)) {
    input.forEach((entry, idx) => {
      const script = entry as Partial<ZorkScriptEntry>;
      if (!script.steps) {
        return;
      }
      const id = (script as any).id || (script as any).name || `script-${idx}`;
      results.push({ ...script, id, name: script.name ?? id, steps: script.steps } as ZorkScriptEntry);
    });
    return results;
  }

  if (input && typeof input === 'object') {
    const obj = input as Record<string, any>;
    if (Array.isArray(obj.scripts)) {
      return normalizeScripts(obj.scripts);
    }

    if (obj.default) {
      return normalizeScripts(obj.default as any);
    }
  }

  return results;
}

function getStateKey(workspaceFolder?: vscode.WorkspaceFolder): string {
  const base = workspaceFolder?.uri.fsPath ?? 'global';
  return `zork.state:${base}`;
}

export async function openZorkGuide(
  context: vscode.ExtensionContext,
  workspaceFolder?: vscode.WorkspaceFolder,
  projectRoot?: string
): Promise<void> {
  await ZorkPanel.createOrShow(context, workspaceFolder, projectRoot);
}

class ZorkPanel {
  private static panels = new Map<string, ZorkPanel>();

  static async createOrShow(
    context: vscode.ExtensionContext,
    workspaceFolder?: vscode.WorkspaceFolder,
    projectRoot?: string
  ): Promise<void> {
    const key = workspaceFolder?.uri.fsPath ?? 'global';
    const existing = ZorkPanel.panels.get(key);
    if (existing) {
      existing.reveal();
      return;
    }

    const panel = new ZorkPanel(context, workspaceFolder, projectRoot ?? workspaceFolder?.uri.fsPath);
    ZorkPanel.panels.set(key, panel);
    await panel.initialize();
  }

  private panel: vscode.WebviewPanel;
  private scripts: ZorkScriptEntry[] = [];
  private savedState?: SavedRunState;
  private pendingPromptResolvers = new Map<string, (value: string) => void>();
  private pendingChoiceResolvers = new Map<string, (value: string) => void>();
  private isRunning = false;
  private currentAnswers: Record<string, string> = {};

  private constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly workspaceFolder: vscode.WorkspaceFolder | undefined,
    private readonly projectRoot: string | undefined,
  ) {
    this.panel = vscode.window.createWebviewPanel(
      'beadsZork',
      'Beads Zork Guide',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, 'media'),
          vscode.Uri.joinPath(context.extensionUri, 'out'),
        ],
      },
    );

    this.panel.onDidDispose(() => this.dispose());

    this.panel.webview.onDidReceiveMessage(async (message: PanelMessage) => {
      switch (message.type) {
        case 'start':
          await this.startRun(message.scriptId, { useSavedAnswers: false });
          break;
        case 'resume':
          await this.startRun(message.scriptId, { useSavedAnswers: true });
          break;
        case 'restart':
          await this.startRun(message.scriptId, { useSavedAnswers: false, clearSaved: true });
          break;
        case 'promptResponse': {
          const resolver = this.pendingPromptResolvers.get(message.stepId);
          if (resolver) {
            this.pendingPromptResolvers.delete(message.stepId);
            resolver(message.value ?? '');
          }
          break;
        }
        case 'choiceResponse': {
          const resolver = this.pendingChoiceResolvers.get(message.stepId);
          if (resolver) {
            this.pendingChoiceResolvers.delete(message.stepId);
            resolver(message.choiceId);
          }
          break;
        }
      }
    });
  }

  private async initialize(): Promise<void> {
    this.savedState = await this.context.workspaceState.get<SavedRunState>(getStateKey(this.workspaceFolder));
    this.scripts = await loadZorkScripts(this.context.extensionPath);

    this.panel.webview.html = this.getHtml(this.panel.webview);
    await this.postMessage({ type: 'init', scripts: this.scripts, state: this.savedState });
  }

  private reveal(): void {
    this.panel.reveal(vscode.ViewColumn.One);
  }

  private getHtml(webview: vscode.Webview): string {
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'zork', 'styles.css'));
    const nonce = createNonce();
    const csp = [
      "default-src 'none'",
      `style-src ${webview.cspSource}`,
      `img-src ${webview.cspSource} data:`,
      `script-src 'nonce-${nonce}'`,
    ].join('; ');

    const script = [
      '(function(){',
      'const vscode = acquireVsCodeApi();',
      'let scripts = [];',
      'let savedState;',
      'let busy = false;',
      'let currentPromptStep;',
      'let currentChoiceStep;',
      'const scriptSelect = document.getElementById("script-select");',
      'const logEl = document.getElementById("log");',
      'const promptEl = document.getElementById("prompt");',
      'const choiceEl = document.getElementById("choice");',
      'const statusEl = document.getElementById("status");',
      'function setBusy(state){ busy = state; document.querySelectorAll("button").forEach(btn => btn.disabled = state); statusEl.textContent = state ? "Running…" : "Idle"; }',
      'function renderScripts(list){ scripts = list || []; scriptSelect.innerHTML = ""; scripts.forEach(s => { const opt = document.createElement("option"); opt.value = s.id; opt.textContent = s.name || s.id; scriptSelect.appendChild(opt); }); if (savedState && savedState.scriptId && scripts.find(s => s.id === savedState.scriptId)){ scriptSelect.value = savedState.scriptId; }}',
      'function appendLog(text, level){ const entry = document.createElement("div"); entry.className = "log-entry " + (level || "info"); entry.textContent = text; logEl.appendChild(entry); logEl.scrollTop = logEl.scrollHeight; }',
      'function clearForms(){ promptEl.style.display = "none"; promptEl.innerHTML = ""; choiceEl.style.display = "none"; choiceEl.innerHTML = ""; currentPromptStep = undefined; currentChoiceStep = undefined; }',
      'function showPrompt(payload){ clearForms(); currentPromptStep = payload.stepId; promptEl.style.display = "block"; promptEl.innerHTML = "<h3>" + payload.message + "</h3>" + "<input id=\"prompt-input\" value=\"" + (payload.defaultValue || "") + "\" aria-label=\"" + payload.message + "\" />" + "<div class=\"caption\">Step " + payload.stepId + "</div>" + "<button id=\"prompt-submit\">Submit</button>"; const submitBtn = document.getElementById("prompt-submit"); if (submitBtn) { submitBtn.onclick = function(){ const input = document.getElementById("prompt-input"); const value = input && "value" in input ? input.value : ""; vscode.postMessage({ type: "promptResponse", stepId: payload.stepId, value: value }); appendLog("> " + payload.message + ": " + value); clearForms(); }; } }',
      'function showChoice(payload){ clearForms(); currentChoiceStep = payload.stepId; choiceEl.style.display = "block"; choiceEl.innerHTML = "<h3>" + payload.message + "</h3><div class=\"choice-options\"></div><div class=\"caption\">Step " + payload.stepId + "</div>"; const container = choiceEl.querySelector(".choice-options"); if (container) { payload.options.forEach(opt => { const btn = document.createElement("button"); btn.textContent = opt.label; btn.onclick = function(){ vscode.postMessage({ type: "choiceResponse", stepId: payload.stepId, choiceId: opt.id }); appendLog("> " + payload.message + ": " + opt.label); clearForms(); }; container.appendChild(btn); }); } }',
      'window.addEventListener("message", function(event){ const msg = event.data; switch(msg.type){ case "init": savedState = msg.state; renderScripts(msg.scripts || []); if (savedState && savedState.lastMessage){ appendLog("Last: " + savedState.lastMessage); } break; case "log": appendLog(msg.message, msg.level); break; case "prompt": showPrompt(msg); break; case "choice": showChoice(msg); break; case "status": statusEl.textContent = msg.message || msg.status; break; case "reset": logEl.innerHTML = ""; clearForms(); statusEl.textContent = "Idle"; break; case "busy": setBusy(msg.value); break; default: break; } });',
      'const startBtn = document.getElementById("start");',
      'if (startBtn) { startBtn.onclick = function(){ logEl.innerHTML = ""; clearForms(); vscode.postMessage({ type: "start", scriptId: scriptSelect.value }); }; }',
      'const resumeBtn = document.getElementById("resume");',
      'if (resumeBtn) { resumeBtn.onclick = function(){ vscode.postMessage({ type: "resume", scriptId: scriptSelect.value }); }; }',
      'const restartBtn = document.getElementById("restart");',
      'if (restartBtn) { restartBtn.onclick = function(){ logEl.innerHTML = ""; clearForms(); vscode.postMessage({ type: "restart", scriptId: scriptSelect.value }); }; }',
      '})();'
    ].join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${styleUri}">
  <title>Beads Zork Guide</title>
</head>
<body>
  <header>
    <label for="script-select">Script</label>
    <select id="script-select"></select>
    <button id="start">Start</button>
    <button id="resume" class="secondary">Resume</button>
    <button id="restart" class="secondary">Restart</button>
    <span id="status" class="badge">Idle</span>
  </header>

  <div id="log" aria-live="polite"></div>
  <div id="prompt" style="display:none"></div>
  <div id="choice" style="display:none"></div>

  <script nonce="${nonce}">${script}</script>
</body>
</html>`;
  }
  private async startRun(scriptId: string | undefined, options: { useSavedAnswers: boolean; clearSaved?: boolean } = { useSavedAnswers: false }): Promise<void> {
    if (this.isRunning) {
      void vscode.window.showWarningMessage('A Zork run is already in progress.');
      return;
    }

    const selectedScript = this.scripts.find((s) => s.id === scriptId) || this.scripts[0];
    if (!selectedScript) {
      void vscode.window.showErrorMessage('No Zork scripts available. Ensure the bundle is built.');
      return;
    }

    if (options.clearSaved) {
      this.savedState = undefined;
      await this.context.workspaceState.update(getStateKey(this.workspaceFolder), undefined);
    }

    this.currentAnswers = options.useSavedAnswers ? { ...(this.savedState?.answers ?? {}) } : {};

    this.isRunning = true;
    await this.postMessage({ type: 'busy', value: true });
    await this.postMessage({ type: 'reset' });
    await this.postMessage({ type: 'log', level: 'info', message: `Running script: ${selectedScript.name || selectedScript.id}` });

    const engine = new ZorkEngine({
      prompt: async (message: string, _defaultValue: string | undefined, ctx: RunnerContext) => {
        const stepId = ctx.currentStepId ?? `prompt-${Date.now()}`;
        if (options.useSavedAnswers && this.currentAnswers[stepId] !== undefined) {
          await this.postMessage({ type: 'log', level: 'info', message: `Replaying saved answer for ${stepId}` });
          return this.currentAnswers[stepId];
        }

        return new Promise<string>((resolve) => {
          this.pendingPromptResolvers.set(stepId, (value) => {
            this.currentAnswers[stepId] = value;
            resolve(value);
          });
          void this.postMessage({ type: 'prompt', stepId, message, defaultValue: _defaultValue });
        });
      },
      choose: async (message: string, optionsList: ChoiceOption[], ctx: RunnerContext) => {
        const stepId = ctx.currentStepId ?? `choice-${Date.now()}`;
        if (options.useSavedAnswers && this.currentAnswers[stepId] !== undefined) {
          await this.postMessage({ type: 'log', level: 'info', message: `Replaying saved choice for ${stepId}` });
          return this.currentAnswers[stepId];
        }

        return new Promise<string>((resolve) => {
          this.pendingChoiceResolvers.set(stepId, (value) => {
            this.currentAnswers[stepId] = value;
            resolve(value);
          });
          void this.postMessage({ type: 'choice', stepId, message, options: optionsList });
        });
      },
      execCommand: async (cmd: string, args: string[] | undefined, cwd: string | undefined) => {
        const workingDir = cwd || this.projectRoot || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
        try {
          const { stdout, stderr } = await execFileAsync(cmd, args ?? [], { cwd: workingDir, timeout: 20000 });
          if (stdout) {
            await this.postMessage({ type: 'log', level: 'info', message: stdout.trim() });
          }
          if (stderr) {
            await this.postMessage({ type: 'log', level: 'warn', message: stderr.trim() });
          }
          return { code: 0, stdout, stderr };
        } catch (error: any) {
          const stderr = error?.stderr?.toString?.() ?? error?.message ?? 'Command failed';
          await this.postMessage({ type: 'log', level: 'error', message: stderr });
          return { code: typeof error?.code === 'number' ? error.code : 1, stdout: error?.stdout, stderr };
        }
      },
      evaluate: async (expression: string, ctx: RunnerContext) => {
        try {
          const fn = new Function('vars', `return (${expression});`);
          return Boolean(fn(ctx.vars));
        } catch (error: any) {
          await this.postMessage({ type: 'log', level: 'error', message: `Eval error: ${error?.message ?? error}` });
          return false;
        }
      },
      log: async (message: string) => {
        await this.postMessage({ type: 'log', level: 'info', message });
      },
    });

    try {
      const initialVars = options.useSavedAnswers ? { ...(this.savedState?.vars ?? {}) } : {};
      const result = await engine.run(selectedScript, initialVars);
      await this.postMessage({ type: 'status', status: result.status, message: result.lastMessage ?? result.status });

      this.savedState = {
        scriptId: selectedScript.id,
        answers: { ...this.currentAnswers },
        vars: result.vars,
        lastStatus: result.status,
        lastMessage: result.lastMessage,
        updatedAt: Date.now(),
      };
      await this.context.workspaceState.update(getStateKey(this.workspaceFolder), this.savedState);
    } catch (error: any) {
      const message = error?.message ?? 'Unexpected error running script';
      await this.postMessage({ type: 'log', level: 'error', message });
      await this.postMessage({ type: 'status', status: 'failure', message });
    } finally {
      this.pendingChoiceResolvers.clear();
      this.pendingPromptResolvers.clear();
      this.isRunning = false;
      await this.postMessage({ type: 'busy', value: false });
    }
  }

  private async postMessage(payload: Record<string, unknown>): Promise<void> {
    try {
      await this.panel.webview.postMessage(payload);
    } catch {
      // ignore
    }
  }

  private dispose(): void {
    this.pendingChoiceResolvers.clear();
    this.pendingPromptResolvers.clear();
    ZorkPanel.panels.delete(this.workspaceFolder?.uri.fsPath ?? 'global');
  }
}
