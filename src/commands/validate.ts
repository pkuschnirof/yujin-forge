/**
 * `yf validate [path]` -- static project structure check.
 *
 * Prints findings (errors + warnings) and exits non-zero when any
 * error is present (or any warning under --strict). Designed to
 * be cheap enough for a pre-commit hook -- no compile, no install.
 */
import type { Command } from 'commander';
import path from 'node:path';
import { c, header } from '../ui/colors.js';
import { validateProject } from '../validate/index.js';

export interface ValidateOptions {
  strict?: boolean;
  json?: boolean;
}

export function registerValidateCommand(program: Command): void {
  program
    .command('validate [path]')
    .description('Statically check that a directory is a valid Yujin Forge project.')
    .option('--strict', 'fail on warnings as well as errors')
    .option('--json',   'emit JSON report instead of human-readable')
    .action(async (where: string | undefined, opts: ValidateOptions) => {
      const projectRoot = path.resolve(process.cwd(), where ?? '.');
      const report = await validateProject({ projectRoot, strict: !!opts.strict });

      if (opts.json) {
        process.stdout.write(JSON.stringify(report, null, 2) + '\n');
        if (!report.ok) process.exitCode = 1;
        return;
      }

      header('Yujin Forge -- validate');
      console.log('');
      console.log('  Project: ' + c.dim(projectRoot));
      console.log('');

      const errors = report.findings.filter((f) => f.severity === 'error');
      const warns  = report.findings.filter((f) => f.severity === 'warn');

      if (errors.length > 0) {
        console.log(c.error('Errors:'));
        for (const f of errors) {
          console.log('  ' + c.error('✗ ' + f.code) + '  ' + f.message);
        }
        console.log('');
      }
      if (warns.length > 0) {
        console.log(c.warn('Warnings:'));
        for (const f of warns) {
          console.log('  ' + c.warn('! ' + f.code) + '  ' + f.message);
        }
        console.log('');
      }
      if (errors.length === 0 && warns.length === 0) {
        console.log(c.success('All checks passed.'));
      } else if (report.ok) {
        console.log(c.success('OK ') + c.dim('(' + warns.length + ' warning(s) -- use --strict to fail)'));
      } else {
        console.log(c.error('FAILED ') + c.dim('(' + errors.length + ' error(s), ' + warns.length + ' warning(s))'));
        process.exitCode = 1;
      }
    });
}
