/**
 * `yf license <action>` -- license-lifecycle subcommands. Action
 * is one of: activate, status, revoke.
 *
 * `status` is implemented today (reads the local cache).
 * `activate` + `revoke` ship with the License client milestone.
 */
import type { Command } from 'commander';
import { c, header } from '../ui/colors.js';
import { loadLicense, isPaidSeat, isTrialActive } from '../license/index.js';
import { stub } from './_stub.js';

export interface LicenseOptions {
  key?: string;
  json?: boolean;
}

export function registerLicenseCommand(program: Command): void {
  const cmd = program
    .command('license')
    .description('Activate, inspect, or revoke a Yujin Forge license.');

  cmd
    .command('status')
    .description('Print the current license state.')
    .option('--json', 'emit JSON instead of human-readable output')
    .action(async (opts: LicenseOptions) => {
      const lic = await loadLicense();
      if (opts.json) {
        process.stdout.write(JSON.stringify(lic, null, 2) + '\n');
        return;
      }
      header('Yujin Forge -- license status');
      console.log('');
      console.log('  Status:      ' + colorStatus(lic.status));
      console.log('  Source:      ' + c.dim(lic.source));
      if (isPaidSeat(lic)) {
        console.log('  Seat email:  ' + (lic.seat?.email     ?? c.dim('(unknown)')));
        console.log('  Expires:     ' + (lic.seat?.expiresAt ?? c.dim('(no expiry)')));
      } else if (isTrialActive(lic)) {
        console.log('  Trial ends:  ' + (lic.trial?.endsAt   ?? c.dim('(unknown)')));
        console.log('  Trial days left: ' + (lic.trial?.daysLeft ?? 0));
      } else {
        console.log('  ' + c.warn('No active license or trial.'));
        console.log('  Run ' + c.code('yf license activate --key <key>') + ' to install one.');
      }
    });

  cmd
    .command('activate')
    .description('Install a license key (paid seat) on this machine.')
    .option('-k, --key <key>', 'paid seat key issued by the parent server')
    .action((_opts: LicenseOptions) => {
      stub('license activate', 'milestone: License client (2026-06)');
    });

  cmd
    .command('revoke')
    .description('Remove the local license cache (return to trial mode).')
    .action((_opts: LicenseOptions) => {
      stub('license revoke', 'milestone: License client (2026-06)');
    });
}

function colorStatus(s: string): string {
  if (s === 'paid')        return c.success(s);
  if (s === 'trial')       return c.info(s);
  if (s === 'expired')     return c.warn(s);
  return c.error(s);
}
