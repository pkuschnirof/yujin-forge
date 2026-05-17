/**
 * `yf test` -- run the auto-generated test corpus + mocks.
 * Reports coverage by NAC pipeline stage.
 *
 * Day-0 stub.
 */
import type { Command } from 'commander';
import { stub } from './_stub.js';

export interface TestOptions {
  unit?: boolean;
  e2e?: boolean;
  watch?: boolean;
  filter?: string;
}

export function registerTestCommand(program: Command): void {
  program
    .command('test')
    .description('Run the auto-generated test corpus + mocks for the current project.')
    .option('--unit',       'run only Vitest unit suites')
    .option('--e2e',        'run only Playwright e2e suites')
    .option('--watch',      'rerun on file changes')
    .option('-f, --filter <pattern>', 'filter by test name')
    .action((_opts: TestOptions) => {
      stub('test', 'milestone: Test corpus gen (2026-08)');
    });
}
