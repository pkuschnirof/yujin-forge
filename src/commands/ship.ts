/**
 * `yf ship` -- gated deploy. Requires: tests green +
 * NAC.validate clean + license valid -> emit deploy.
 *
 * Day-0 stub.
 */
import type { Command } from 'commander';
import { stub } from './_stub.js';

export interface ShipOptions {
  target?: string;
  skipTests?: boolean;
}

export function registerShipCommand(program: Command): void {
  program
    .command('ship')
    .description('Run the deploy gate (tests + NAC validate + license) and emit dist/.')
    .option('-t, --target <name>', 'deploy target hook (default: static)', 'static')
    .option('--skip-tests', 'skip the test gate (NOT for production)')
    .action((_opts: ShipOptions) => {
      stub('ship', 'milestone: yf ship gate (2026-11)');
    });
}
