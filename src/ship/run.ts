/**
 * Yujin Forge -- ship gate runner.
 *
 * Coordinates the pre-deploy gate:
 *   1. validate (--strict) -- structural sanity
 *   2. license check       -- paid OR trial-active
 *   3. npm test            -- runs `npm test --silent` in the project
 *   4. npm run build       -- vite/tsc/etc as the project defines
 *
 * Each step yields a ShipStep result. The pipeline stops on the
 * first failure unless --skip-tests is set (in which case step 3
 * is skipped but still recorded). The caller (the ship command)
 * renders results + sets process.exitCode.
 *
 * Process execution is delegated to a runner injected as a
 * parameter so tests can stub child_process without spawning
 * real processes.
 */
import { spawn } from 'node:child_process';
import { validateProject } from '../validate/index.js';
import { loadLicense, isAuthorized, isPaidSeat } from '../license/index.js';
import type { ValidateReport } from '../validate/index.js';
import type { LicenseState } from '../license/types.js';

export type StepName = 'validate' | 'license' | 'test' | 'build';

export interface ShipStep {
  name:    StepName;
  ok:      boolean;
  skipped: boolean;
  detail:  string;
  /** ms duration of this step. */
  ms: number;
}

export interface ShipResult {
  steps: ShipStep[];
  ok:    boolean;
}

export interface ShipOptions {
  projectRoot: string;
  skipTests:   boolean;
  /** Test injection point. Defaults to spawn-based runner. */
  runProcess?: (cmd: string, args: string[], cwd: string) => Promise<ProcessResult>;
}

export interface ProcessResult {
  code: number;
  stdoutTail: string;
  stderrTail: string;
}

export async function runShip(opts: ShipOptions): Promise<ShipResult> {
  const steps: ShipStep[] = [];
  const exec = opts.runProcess ?? defaultRunProcess;

  // 1. validate
  const t1 = Date.now();
  const v = await validateProject({ projectRoot: opts.projectRoot, strict: true });
  steps.push({
    name:    'validate',
    ok:      v.ok,
    skipped: false,
    detail:  summariseValidate(v),
    ms:      Date.now() - t1,
  });
  if (!v.ok) return { steps, ok: false };

  // 2. license
  const t2 = Date.now();
  const lic = await loadLicense();
  const licOk = isAuthorized(lic);
  steps.push({
    name:    'license',
    ok:      licOk,
    skipped: false,
    detail:  summariseLicense(lic),
    ms:      Date.now() - t2,
  });
  if (!licOk) return { steps, ok: false };

  // 3. test
  if (opts.skipTests) {
    steps.push({
      name: 'test', ok: true, skipped: true,
      detail: 'skipped (--skip-tests)',
      ms: 0,
    });
  } else {
    const t3 = Date.now();
    const r = await exec('npm', ['test', '--silent'], opts.projectRoot);
    steps.push({
      name:    'test',
      ok:      r.code === 0,
      skipped: false,
      detail:  r.code === 0 ? 'passed' : 'failed: ' + tailLine(r.stderrTail || r.stdoutTail),
      ms:      Date.now() - t3,
    });
    if (r.code !== 0) return { steps, ok: false };
  }

  // 4. build
  const t4 = Date.now();
  const b = await exec('npm', ['run', 'build', '--silent'], opts.projectRoot);
  steps.push({
    name:    'build',
    ok:      b.code === 0,
    skipped: false,
    detail:  b.code === 0 ? 'passed' : 'failed: ' + tailLine(b.stderrTail || b.stdoutTail),
    ms:      Date.now() - t4,
  });
  if (b.code !== 0) return { steps, ok: false };

  return { steps, ok: true };
}

function summariseValidate(v: ValidateReport): string {
  if (v.ok && v.findings.length === 0) return 'clean';
  const errs = v.findings.filter((f) => f.severity === 'error').length;
  const warns = v.findings.filter((f) => f.severity === 'warn').length;
  return errs + ' error(s), ' + warns + ' warning(s)';
}

function summariseLicense(lic: LicenseState): string {
  if (isPaidSeat(lic)) return 'paid seat (' + (lic.seat?.email ?? 'machine-bound') + ')';
  if (lic.status === 'trial' && lic.trial) {
    return 'trial -- ' + lic.trial.daysLeft + ' day(s) left';
  }
  return 'no active license or trial';
}

function tailLine(s: string): string {
  const lines = s.trim().split(/\r?\n/).filter((l) => l.length > 0);
  return lines[lines.length - 1] ?? '';
}

async function defaultRunProcess(cmd: string, args: string[], cwd: string): Promise<ProcessResult> {
  return new Promise<ProcessResult>((resolve) => {
    let stdoutBuf = '';
    let stderrBuf = '';
    // shell:true on Windows so 'npm' resolves to npm.cmd. Safe
    // because cmd + args are not user-supplied here.
    const child = spawn(cmd, args, { cwd, shell: process.platform === 'win32' });
    child.stdout?.on('data', (chunk) => { stdoutBuf += String(chunk); if (stdoutBuf.length > 8192) stdoutBuf = stdoutBuf.slice(-8192); });
    child.stderr?.on('data', (chunk) => { stderrBuf += String(chunk); if (stderrBuf.length > 8192) stderrBuf = stderrBuf.slice(-8192); });
    child.on('close', (code) => resolve({
      code: code ?? 1,
      stdoutTail: stdoutBuf,
      stderrTail: stderrBuf,
    }));
    child.on('error', () => resolve({ code: 1, stdoutTail: '', stderrTail: 'failed to spawn ' + cmd }));
  });
}
