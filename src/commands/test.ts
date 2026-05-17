/**
 * `yf test` -- run the project's test corpus.
 *
 * Day-1 contract: shells out to the appropriate npm script in
 * the project directory. The auto-generated corpus gen (the part
 * that emits test files from a manifest) lands as a separate
 * 'yf generate tests' command in a future milestone.
 *
 * Script routing:
 *   --unit  -> npm run test:unit  (or npm test if absent)
 *   --e2e   -> npm run test:e2e
 *   (none)  -> npm test
 *
 * --watch and --filter are passed through as extra args:
 *   yf test --watch                -> npm test -- --watch
 *   yf test --filter 'todos'       -> npm test -- --filter todos
 *
 * Inherits stdio so the user sees test output live.
 */
import type { Command } from 'commander';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { c, header } from '../ui/colors.js';

export interface TestOptions {
  unit?: boolean;
  e2e?: boolean;
  watch?: boolean;
  filter?: string;
  cwd?: string;
}

export function registerTestCommand(program: Command): void {
  program
    .command('test')
    .description('Run the project test corpus (npm test in the project directory).')
    .option('--unit',       'run only the unit suite (npm run test:unit)')
    .option('--e2e',        'run only the e2e suite (npm run test:e2e)')
    .option('--watch',      'rerun on file changes (passed through to the runner)')
    .option('-f, --filter <pattern>', 'filter by test name (passed through)')
    .option('--cwd <path>', 'project root (default: current directory)')
    .action(async (opts: TestOptions) => {
      const projectRoot = opts.cwd ? path.resolve(opts.cwd) : process.cwd();
      header('Yujin Forge -- test');
      console.log('');
      console.log('  Project: ' + c.dim(projectRoot));

      const { script, scriptArgs } = chooseScript(opts);
      console.log('  Command: ' + c.dim('npm ' + scriptArgs.join(' ')));
      console.log('');

      // Pass-through inherit-stdio so the test runner output goes
      // straight to the terminal. We exit with the child's code.
      const code = await runInherit('npm', scriptArgs, projectRoot);
      if (code !== 0) {
        console.log('');
        console.log(c.error('Tests failed (' + script + ' exit code ' + code + ').'));
        process.exitCode = code;
      }
    });
}

interface ChosenScript {
  script: string;
  scriptArgs: string[];
}

function chooseScript(opts: TestOptions): ChosenScript {
  const extras: string[] = [];
  if (opts.filter) extras.push('--filter', opts.filter);
  if (opts.watch)  extras.push('--watch');

  if (opts.e2e) {
    return { script: 'test:e2e', scriptArgs: extras.length === 0
      ? ['run', 'test:e2e']
      : ['run', 'test:e2e', '--', ...extras] };
  }
  if (opts.unit) {
    return { script: 'test:unit', scriptArgs: extras.length === 0
      ? ['run', 'test:unit']
      : ['run', 'test:unit', '--', ...extras] };
  }
  return { script: 'test', scriptArgs: extras.length === 0
    ? ['test']
    : ['test', '--', ...extras] };
}

function runInherit(cmd: string, args: string[], cwd: string): Promise<number> {
  return new Promise<number>((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
}
