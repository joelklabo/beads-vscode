#!/usr/bin/env tsx
/**
 * Manifest linter:
 *  - Every contributed view and viewsContainer must declare an icon.
 *  - Chat participants must declare an icon.
 *  - activationEvents should be omitted (VS Code derives from contributions); fail if present.
 */
import * as fs from 'fs';
import * as path from 'path';

type Finding = string;

function ensureIcon(target: any, pathLabel: string, findings: Finding[]): void {
  if (target && 'icon' in target) {
    return;
  }
  findings.push(`${pathLabel} is missing "icon"`);
}

function main(): void {
  const pkgPath = path.resolve(__dirname, '../package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  const findings: Finding[] = [];
  const contributes = pkg.contributes || {};

  // Views (per container)
  const views = contributes.views || {};
  Object.entries(views).forEach(([container, arr]) => {
    if (!Array.isArray(arr)) return;
    arr.forEach((view: any, idx: number) => ensureIcon(view, `contributes.views.${container}[${idx}]`, findings));
  });

  // Views containers
  const viewContainers = contributes.viewsContainers || {};
  Object.entries(viewContainers).forEach(([loc, arr]) => {
    if (!Array.isArray(arr)) return;
    arr.forEach((vc: any, idx: number) => ensureIcon(vc, `contributes.viewsContainers.${loc}[${idx}]`, findings));
  });

  // Chat participants
  const chatParticipants = contributes.chatParticipants || [];
  if (Array.isArray(chatParticipants)) {
    chatParticipants.forEach((cp: any, idx: number) => ensureIcon(cp, `contributes.chatParticipants[${idx}]`, findings));
  }

  // Activation events should be omitted to let VS Code derive from contributions
  if (Array.isArray(pkg.activationEvents) && pkg.activationEvents.length > 0) {
    findings.push('activationEvents should be omitted; VS Code derives them from contributions');
  }

  if (findings.length > 0) {
    console.error('Manifest audit failed:');
    findings.forEach(f => console.error(` - ${f}`));
    process.exit(1);
  }

  console.log('✅ Manifest audit passed (icons present; activationEvents omitted).');
}

main();

