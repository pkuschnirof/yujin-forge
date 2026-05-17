/**
 * `yf new <slug>` -- scaffold a new Yujin Forge React app from a
 * template.
 *
 * Day-0 stub: prints the would-be flow + exits 0. Real impl in
 * the 'Template scaffold' milestone (docs/SPEC.md section 8).
 */
import type { Command } from 'commander';
import { stub } from './_stub.js';

export interface NewOptions {
  template?: string;
  dir?: string;
}

export function registerNewCommand(program: Command): void {
  program
    .command('new <slug>')
    .description('Scaffold a new Yujin Forge React app.')
    .option('-t, --template <name>', 'starter template id (default: react-app)', 'react-app')
    .option('-d, --dir <path>', 'target directory (default: ./<slug>)')
    .action((_slug: string, _opts: NewOptions) => {
      stub('new', 'milestone: Template scaffold (2026-07)');
    });
}
