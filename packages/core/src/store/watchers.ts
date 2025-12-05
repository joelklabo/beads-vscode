import * as path from 'path';

export type WatchEvent = 'create' | 'change' | 'delete';

export interface WatchSubscription {
  dispose(): void;
}

export interface WatchAdapter {
  /**
   * Begin watching the target path. Implementations should invoke the listener for create/change/delete
   * events. The returned subscription must stop all underlying watchers when disposed.
   */
  watch(targetPath: string, listener: (event: WatchEvent, targetPath: string) => void): WatchSubscription;
}

export interface WatchManagerOptions {
  /** Milliseconds to debounce notifications per watched path. Defaults to 750ms. */
  debounceMs?: number;
}

interface WatchEntry {
  handle: WatchSubscription;
  listeners: Set<(event: WatchEvent, targetPath: string) => void>;
  timer?: NodeJS.Timeout;
}

export class WatcherManager {
  private readonly entries = new Map<string, WatchEntry>();
  private readonly debounceMs: number;

  constructor(private readonly adapter: WatchAdapter, options: WatchManagerOptions = {}) {
    this.debounceMs = options.debounceMs ?? 750;
  }

  /**
   * Watch a file or directory path. Multiple listeners for the same normalized path share a single
   * underlying watcher and receive debounced notifications.
   */
  watch(targetPath: string, listener: (event: WatchEvent, targetPath: string) => void): WatchSubscription {
    if (!targetPath) {
      return { dispose: () => undefined };
    }

    const normalized = path.normalize(targetPath);
    let entry = this.entries.get(normalized);
    if (!entry) {
      const handle = this.adapter.watch(normalized, (event, target) => this.scheduleNotify(normalized, event, target));
      entry = { handle, listeners: new Set() };
      this.entries.set(normalized, entry);
    }

    entry.listeners.add(listener);

    return {
      dispose: () => {
        const current = this.entries.get(normalized);
        if (!current) {
          return;
        }
        current.listeners.delete(listener);
        if (current.listeners.size === 0) {
          if (current.timer) {
            clearTimeout(current.timer);
          }
          current.handle.dispose();
          this.entries.delete(normalized);
        }
      },
    };
  }

  dispose(): void {
    for (const entry of this.entries.values()) {
      if (entry.timer) {
        clearTimeout(entry.timer);
      }
      entry.handle.dispose();
    }
    this.entries.clear();
  }

  private scheduleNotify(pathKey: string, event: WatchEvent, targetPath: string): void {
    const entry = this.entries.get(pathKey);
    if (!entry) {
      return;
    }

    if (entry.timer) {
      clearTimeout(entry.timer);
    }

    entry.timer = setTimeout(() => {
      entry.timer = undefined;
      for (const listener of entry.listeners) {
        try {
          listener(event, targetPath);
        } catch (error) {
          // Do not let listener failures break other subscribers
          console.warn('Watcher listener failed', error);
        }
      }
    }, this.debounceMs);
  }
}
