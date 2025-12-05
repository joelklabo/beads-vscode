// VS Code entry point kept lean: delegate all activation logic to extension.main
// to keep business logic in a dedicated module. When tests reload this module,
// ensure the underlying implementation is also reloaded so stubs take effect.
if (typeof require !== 'undefined') {
  try {
    delete require.cache[require.resolve('./extension.main')];
  } catch {
    // ignore cache misses
  }
}

export * from './extension.main';
