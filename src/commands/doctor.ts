/**
 * `yf doctor` -- environment + project health check. Reports
 * what's installed, what's missing, what's misconfigured.
 *
 * Day-0 ships a working version since it has no external
 * dependencies; later milestones add more checks.
 */
import type { Command } from 'commander';
import { c, header } from '../ui/colors.js';
import { loadLicense } from '../license/index.js';
import { VERSION } from '../version.js';

export interface DoctorOptions {
  json?: boolean;
}

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

export function registerDoctorCommand(program: Command): void {
  program
    .command('doctor')
    .description('Check the local environment + Forge installation health.')
    .option('--json', 'emit JSON instead of human-readable output')
    .action(async (opts: DoctorOptions) => {
      const checks = await runDoctorChecks();
      if (opts.json) {
        process.stdout.write(JSON.stringify({ version: VERSION, checks }, null, 2) + '\n');
        return;
      }
      header('Yujin Forge -- doctor');
      console.log('');
      console.log('  Forge CLI ' + c.dim(VERSION));
      console.log('');
      for (const check of checks) {
        const mark = check.ok ? c.success('✓') : c.warn('✗');
        console.log('  ' + mark + ' ' + check.name + c.dim(' -- ' + check.detail));
      }
      console.log('');
      const failing = checks.filter((c) => !c.ok).length;
      if (failing === 0) {
        console.log(c.success('All checks passed.'));
      } else {
        console.log(c.warn(failing + ' check(s) need attention.'));
      }
    });
}

async function runDoctorChecks(): Promise<Check[]> {
  const checks: Check[] = [];

  const nodeMajor = parseInt(process.versions.node.split('.')[0] ?? '0', 10);
  checks.push({
    name:   'Node.js >= 18.17',
    ok:     nodeMajor >= 18,
    detail: 'detected ' + process.versions.node,
  });

  const lic = await loadLicense();
  checks.push({
    name:   'License state',
    ok:     lic.status === 'paid' || lic.status === 'trial',
    detail: 'status=' + lic.status + ' (' + lic.source + ')',
  });

  return checks;
}
