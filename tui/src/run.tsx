import { startApp } from './start';

const exitCode = startApp();
if (exitCode !== 0) {
  process.exit(exitCode);
}
