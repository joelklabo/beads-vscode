import * as vscode from 'vscode';
import {
  BeadsStore,
  BeadsStoreSnapshot,
  WatcherManager,
  WorkspaceTarget,
} from '@beads/core';
import { createVsCodeWatchAdapter, createWorkspaceTarget, WorkspaceTargetInput } from './store';

/**
 * Event emitted when the store refreshes successfully.
 */
export interface BeadsRefreshEvent {
  snapshot: BeadsStoreSnapshot;
  targets: WorkspaceTarget[];
}

/**
 * Event emitted when a store operation fails.
 */
export interface BeadsErrorEvent {
  error: Error;
  operation: 'load' | 'refresh' | 'watch';
}

/**
 * Lifecycle manager for BeadsStore instances.
 * Encapsulates store creation, watcher setup, refresh scheduling, and multi-root handling.
 * Provides typed events for consumers (tree providers, activity feed, dependency tree).
 */
export class BeadsLifecycle implements vscode.Disposable {
  private readonly _onDidRefresh = new vscode.EventEmitter<BeadsRefreshEvent>();
  private readonly _onDidError = new vscode.EventEmitter<BeadsErrorEvent>();
  
  /** Fired when the store refreshes with new data. */
  readonly onDidRefresh = this._onDidRefresh.event;
  /** Fired when a store operation fails. */
  readonly onDidError = this._onDidError.event;

  private readonly watchManager: WatcherManager;
  private readonly store: BeadsStore;
  private storeSubscription?: () => void;
  private activeTargets: WorkspaceTarget[] = [];
  private started = false;

  constructor(watchManager?: WatcherManager) {
    this.watchManager = watchManager ?? new WatcherManager(createVsCodeWatchAdapter());
    this.store = new BeadsStore({ watchManager: this.watchManager });
  }

  /**
   * Start the lifecycle - subscribe to store changes and emit events.
   * Call this during extension activation.
   */
  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;

    this.storeSubscription = this.store.onDidChange((snapshot) => {
      this._onDidRefresh.fire({ snapshot, targets: this.activeTargets });
    });
  }

  /**
   * Stop the lifecycle - unsubscribe from store and clean up.
   * Call this during extension deactivation.
   */
  stop(): void {
    if (!this.started) {
      return;
    }
    this.started = false;

    this.storeSubscription?.();
    this.storeSubscription = undefined;
  }

  /**
   * Get the underlying store instance.
   * Prefer using events for reactive updates.
   */
  getStore(): BeadsStore {
    return this.store;
  }

  /**
   * Get the WatcherManager instance.
   */
  getWatchManager(): WatcherManager {
    return this.watchManager;
  }

  /**
   * Get the currently active workspace targets.
   */
  getActiveTargets(): WorkspaceTarget[] {
    return this.activeTargets;
  }

  /**
   * Set the active workspace targets from raw inputs and refresh the store.
   * Converts WorkspaceTargetInput objects to WorkspaceTarget.
   */
  async setActiveTargets(inputs: WorkspaceTargetInput[]): Promise<void> {
    this.activeTargets = inputs.map(createWorkspaceTarget);
    
    try {
      await this.store.refresh(this.activeTargets);
    } catch (error) {
      this._onDidError.fire({
        error: error instanceof Error ? error : new Error(String(error)),
        operation: 'load',
      });
    }
  }

  /**
   * Set the active workspace targets directly and refresh the store.
   * Use this when you already have WorkspaceTarget objects.
   */
  async setTargets(targets: WorkspaceTarget[]): Promise<void> {
    this.activeTargets = targets;
    
    try {
      await this.store.refresh(this.activeTargets);
    } catch (error) {
      this._onDidError.fire({
        error: error instanceof Error ? error : new Error(String(error)),
        operation: 'load',
      });
    }
  }

  /**
   * Force a refresh of the current targets.
   */
  async refresh(): Promise<void> {
    try {
      await this.store.refresh(this.activeTargets);
    } catch (error) {
      this._onDidError.fire({
        error: error instanceof Error ? error : new Error(String(error)),
        operation: 'refresh',
      });
    }
  }

  /**
   * Get the current snapshot without triggering a refresh.
   */
  getSnapshot(): BeadsStoreSnapshot {
    return this.store.getSnapshot();
  }

  /**
   * Check if the lifecycle is currently started.
   */
  isStarted(): boolean {
    return this.started;
  }

  dispose(): void {
    this.stop();
    this._onDidRefresh.dispose();
    this._onDidError.dispose();
    this.store.dispose();
    this.watchManager.dispose();
  }
}
