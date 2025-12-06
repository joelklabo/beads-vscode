#!/usr/bin/env node
/*
 * Start bundle:watch and typecheck in parallel so VS Code F5 uses the bundled output.
 * Keeps outputs on stdout/stderr and propagates exit codes.
 */
const { spawn } = require('child_process');

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const processes = [
  { name: 'bundle:watch', args: ['run', 'bundle:watch'] },
  { name: 'typecheck', args: ['run', 'typecheck', '--', '--watch', '--preserveWatchOutput'] },
];

const children = processes.map(({ name, args }) => {
  const child = spawn(npmCmd, args, { stdio: 'inherit' });

  child.on('exit', (code, signal) => {
    if (signal) {
      return;
    }
    if (typeof code === 'number' && code !== 0) {
      console.error(`${name} exited with code ${code}`);
      process.exitCode = code;
    }
  });

  return child;
});

const shutdown = () => {
  children.forEach((child) => {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  });
};

process.on('SIGINT', () => {
  shutdown();
  process.exit();
});
process.on('SIGTERM', shutdown);
