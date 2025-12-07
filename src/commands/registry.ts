import * as vscode from 'vscode';

/**
 * Context provided to command handlers for executing operations.
 */
export interface CommandContext {
  /** The extension context for accessing state and subscriptions */
  extensionContext: vscode.ExtensionContext;
}

/**
 * A command handler function.
 */
export type CommandHandler<T extends unknown[] = unknown[]> = (...args: T) => unknown | Promise<unknown>;

/**
 * Command definition for registration.
 */
export interface CommandDefinition {
  /** The command ID (e.g., 'beady.refresh') */
  id: string;
  /** The handler function */
  handler: CommandHandler;
  /** Optional description for documentation */
  description?: string;
}

/**
 * Options for registering commands.
 */
export interface CommandRegistryOptions {
  /** Prefix to add to command IDs (e.g., 'beady') */
  prefix?: string;
}

/**
 * Registry for managing VS Code command registrations.
 * Provides a centralized place to register commands and track disposables.
 */
export class CommandRegistry implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly prefix: string;

  constructor(options: CommandRegistryOptions = {}) {
    this.prefix = options.prefix ?? 'beady';
  }

  /**
   * Register a single command.
   * @param id Command ID (without prefix)
   * @param handler Handler function
   */
  register(id: string, handler: CommandHandler): void {
    const fullId = `${this.prefix}.${id}`;
    const disposable = vscode.commands.registerCommand(fullId, handler);
    this.disposables.push(disposable);
  }

  /**
   * Register multiple commands at once.
   * @param commands Array of command definitions
   */
  registerAll(commands: CommandDefinition[]): void {
    for (const cmd of commands) {
      const disposable = vscode.commands.registerCommand(cmd.id, cmd.handler);
      this.disposables.push(disposable);
    }
  }

  /**
   * Get all disposables for subscription management.
   */
  getDisposables(): vscode.Disposable[] {
    return [...this.disposables];
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables.length = 0;
  }
}

/**
 * Create a command definition helper.
 */
export function defineCommand(id: string, handler: CommandHandler, description?: string): CommandDefinition {
  return { id, handler, description };
}
