/**
 * `yf ship` -- gated deploy. Runs the pipeline:
 *
 *   validate -> license -> test -> build
 *
 * Stops on first failure; reports per-step ok / detail / ms.
 * --skip-tests skips step 3 (CI runs the tests in a separate job).
 * --target hooks the deploy step (deferred; the dist/ from step 4
 * is emitted regardless).
 */
import type { Command } from 'commander';
import path from 'node:path';
import { c, header } from '../ui/colors.js';
import { runShip } from '../ship/run.js';

export interface ShipOptions {
  target?: string;
  skipTests?: boolean;
  cwd?: string;
}

export function registerShipCommand(program: Command): void {
  program
    .command('ship')
    .description('Run the deploy gate (validate + license + tests + build) and emit dist/.')
    .option('-t, --target <name>', 'deploy target hook (default: static)', 'static')
    .option('--skip-tests',        'skip the test gate (NOT for production)')
    .option('--cwd <path>',        'project root (default: current directory)')
    .action(async (opts: ShipOptions) => {
      const projectRoot = opts.cwd ? path.resolve(opts.cwd) : process.cwd();
      header('Yujin Forge -- ship');
      console.log('');
      console.log('  Project: ' + c.dim(projectRoot));
      console.log('  Target:  ' + (opts.target ?? 'static'));
      console.log('');

      const result = await runShip({
        projectRoot,
        skipTests: !!opts.skipTests,
      });

      for (const step of result.steps) {
        const mark = step.skipped
          ? c.dim('-')
          : (step.ok ? c.success('✓') : c.error('✗'));
        const ms = step.ms > 0 ? c.dim('(' + step.ms + 'ms)') : '';
        console.log('  ' + mark + ' ' + step.name + '  ' + step.detail + ' ' + ms);
      }
      console.log('');
      if (result.ok) {
        console.log(c.success('Ship gate passed. dist/ is ready to deploy.'));
        console.log(c.dim('Deploy hook for target=' + (opts.target ?? 'static')
          + ' lands in the milestone: yf ship gate (2026-11).'));
      } else {
        console.log(c.error('Ship gate failed. Fix the first failing step above + retry.'));
        process.exitCode = 1;
      }
    });
}
