// VS Code entry point kept lean: delegate all activation logic to extension.main
// to keep business logic in a dedicated module. When tests reload this module,
// ensure the underlying implementation is also reloaded so stubs take effect.
if (typeof require !== 'undefined') {
  const reloadTargets = ['./extension.main', './activation', './activation/commands'];
  for (const target of reloadTargets) {
    try {
      delete require.cache[require.resolve(target)];
    } catch {
      // ignore cache misses
    }
  }
}

export * from './extension.main';
