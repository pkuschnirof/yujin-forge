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
import { activate, revoke, InvalidLicenseKeyError } from '../license/activate.js';

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
    .action(async (opts: LicenseOptions) => {
      const key = (opts.key ?? '').trim();
      if (key === '') {
        console.error(c.error('Pass the key: ') + c.code('yf license activate --key <jwt>'));
        process.exitCode = 1;
        return;
      }
      try {
        const res = await activate(key);
        header('Yujin Forge -- license activated');
        console.log('');
        console.log('  Seat email:    ' + (res.seat.email ?? c.dim('(not bound to email)')));
        console.log('  Expires:       ' + (res.seat.expiresAt ?? c.dim('(no expiry)')));
        console.log('  Fingerprint:   ' + c.dim(res.seat.machineFingerprint));
        console.log('  Stored at:     ' + c.dim(res.path));
        console.log('');
        console.log(c.success('License installed. Commercial features unlocked.'));
        console.log(c.dim('Server-side validation runs every 24h once the license server is live.'));
      } catch (err) {
        if (err instanceof InvalidLicenseKeyError) {
          console.error(c.error('Invalid license key: ') + err.message);
        } else {
          console.error(c.error(err instanceof Error ? err.message : String(err)));
        }
        process.exitCode = 1;
      }
    });

  cmd
    .command('revoke')
    .description('Remove the local license cache (return to trial mode).')
    .action(async (_opts: LicenseOptions) => {
      const removed = await revoke();
      header('Yujin Forge -- license revoked');
      console.log('');
      if (removed) {
        console.log(c.success('License removed. Falling back to trial semantics.'));
      } else {
        console.log(c.dim('No license was installed -- nothing to do.'));
      }
    });
}

function colorStatus(s: string): string {
  if (s === 'paid')        return c.success(s);
  if (s === 'trial')       return c.info(s);
  if (s === 'expired')     return c.warn(s);
  return c.error(s);
}
