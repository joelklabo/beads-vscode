import { startApp } from './start';
import { createHarnessAppConfig } from './test-harness';

const harnessEnabled = process.env.TUI_HARNESS === '1' || process.env.TUI_HARNESS === 'true';
const fixtureEnabled = harnessEnabled || process.env.TUI_FIXTURE === '1';

const fixedClockMs = process.env.TUI_HARNESS_CLOCK_MS ? Number(process.env.TUI_HARNESS_CLOCK_MS) : undefined;
if (Number.isFinite(fixedClockMs)) {
  const fixed = fixedClockMs as number;
  Date.now = () => fixed;
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    const nowValue = performance.now();
    (performance as any).now = () => nowValue;
  }
}

const harnessProps = fixtureEnabled ? createHarnessAppConfig({ clockMs: fixedClockMs }) : undefined;

const exitCode = startApp({
  requireTTY: !harnessEnabled,
  appProps: harnessProps,
});
if (exitCode !== 0) {
  process.exit(exitCode);
}
