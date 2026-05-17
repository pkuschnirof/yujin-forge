/**
 * `yf new <slug>` -- scaffold a new Yujin Forge React app.
 *
 * Real implementation. Reads templates/<template>/ from the
 * installed package, applies token substitution, writes to the
 * target directory.
 *
 * License-mode handling:
 *   - paid seat: license_ref in yujin.forge.json = seat email or
 *     'paid:<short-fingerprint>'
 *   - trial:     license_ref = 'trial'
 *   - expired:   refuse to scaffold; print the upgrade nudge
 *
 * Does NOT run `npm install` for now (left to the user to keep
 * the scaffolder fast + offline-friendly). The README the
 * starter ships tells them what to do.
 */
import type { Command } from 'commander';
import path from 'node:path';
import { c, header } from '../ui/colors.js';
import { loadLicense, isAuthorized, isPaidSeat } from '../license/index.js';
import { scaffold, isValidSlug, titleCaseFromSlug } from '../template/index.js';

export interface NewOptions {
  template: string;
  dir?: string;
  name?: string;
  force?: boolean;
  here?: boolean;
}

export function registerNewCommand(program: Command): void {
  program
    .command('new <slug>')
    .description('Scaffold a new Yujin Forge React app from a starter template.')
    .option('-t, --template <name>', 'starter template id (under templates/)', 'react-app')
    .option('-d, --dir <path>',      'target directory (default: ./<slug>)')
    .option('-n, --name <name>',     'human-friendly project name (default: title-cased slug)')
    .option('--here',                'scaffold INTO the current directory (must be empty)')
    .option('--force',               'overwrite a non-empty target directory')
    .action(async (slug: string, opts: NewOptions) => {
      await runNew(slug, opts);
    });
}

export async function runNew(slug: string, opts: NewOptions): Promise<void> {
  header('Yujin Forge -- new project');
  console.log('');

  if (!isValidSlug(slug)) {
    console.error(c.error('Invalid slug: ' + slug));
    console.error('  Slugs are lowercase alphanumeric + dashes, 3..40 chars,');
    console.error('  must start with a letter. Examples: my-todos, yujin-koe.');
    process.exitCode = 1;
    return;
  }

  const lic = await loadLicense();
  if (!isAuthorized(lic)) {
    console.error(c.error('No active license or trial.'));
    console.error('  Run ' + c.code('yf license activate --key <key>') + ' to install a paid seat,');
    console.error('  or delete ~/.yujin-forge/trial.json to restart the 30-day trial.');
    process.exitCode = 1;
    return;
  }

  const targetDir = resolveTargetDir(slug, opts);
  const projectName = (opts.name ?? '').trim() || titleCaseFromSlug(slug);
  const licenseRef = isPaidSeat(lic)
    ? (lic.seat?.email ?? 'paid:seat')
    : 'trial';

  console.log('  Slug:        ' + c.brand(slug));
  console.log('  Name:        ' + projectName);
  console.log('  Template:    ' + opts.template);
  console.log('  Target:      ' + c.dim(targetDir));
  console.log('  License:     ' + c.dim(licenseRef));
  console.log('');

  try {
    const result = await scaffold({
      templateName: opts.template,
      targetDir,
      ctx: { projectSlug: slug, projectName, licenseRef },
      refuseIfNonEmpty: !opts.force,
    });
    console.log(c.success('Wrote ' + result.files.length + ' file(s).'));
    console.log('');
    console.log('Next:');
    console.log('  ' + c.code('cd ' + path.relative(process.cwd(), targetDir)));
    console.log('  ' + c.code('npm install'));
    console.log('  ' + c.code('npm run dev'));
    console.log('');
    if (!isPaidSeat(lic) && lic.trial) {
      console.log(c.dim('Trial: ' + lic.trial.daysLeft + ' days remaining.'));
    }
  } catch (err) {
    console.error(c.error(err instanceof Error ? err.message : String(err)));
    process.exitCode = 1;
  }
}

function resolveTargetDir(slug: string, opts: NewOptions): string {
  if (opts.here) return process.cwd();
  if (opts.dir)  return path.resolve(process.cwd(), opts.dir);
  return path.resolve(process.cwd(), slug);
}
