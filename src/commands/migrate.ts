/**
 * `yf migrate <repo>` -- audit and optionally apply NAC-3
 * migration to an existing React project.
 *
 * Day-0 stub.
 */
import type { Command } from 'commander';
import { stub } from './_stub.js';

export interface MigrateOptions {
  audit?: boolean;
  apply?: boolean;
  yes?: boolean;
}

export function registerMigrateCommand(program: Command): void {
  program
    .command('migrate <repo>')
    .description('Audit or apply a NAC-3 migration to an existing React project.')
    .option('--audit', 'produce a migration report without mutating files', true)
    .option('--apply', 'execute the proposed migration (requires paid seat)')
    .option('-y, --yes', 'skip confirmation prompts (CI mode)')
    .action((_repo: string, _opts: MigrateOptions) => {
      stub('migrate', 'milestone: Migration tool (2026-10)');
    });
}
