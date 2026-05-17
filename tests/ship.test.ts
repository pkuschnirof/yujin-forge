/**
 * Tests for the ship runner. Uses the runProcess injection point
 * so the suite never spawns npm -- we exercise the orchestration,
 * not the underlying tools.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runShip, type ProcessResult } from '../src/ship/run.js';
import { activate } from '../src/license/activate.js';

let projectRoot = '';
let tmpHome = '';
const originalHome = os.homedir();

function base64Url(s: string): string {
  return Buffer.from(s).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function makeJwt(payload: object): string {
  const h = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const p = base64Url(JSON.stringify(payload));
  return [h, p, base64Url('sig')].join('.');
}

async function makeValidProject(): Promise<void> {
  await fs.writeFile(path.join(projectRoot, 'yujin.forge.json'), JSON.stringify({
    project_slug: 'my-app',
    project_name: 'My App',
    forge_version: '0.1.0',
    nac_version: '2.3.x',
  }, null, 2));
  await fs.writeFile(path.join(projectRoot, 'package.json'), JSON.stringify({
    name: 'my-app',
    dependencies: { '@yujin/nac': '2.3.0' },
  }, null, 2));
  await fs.mkdir(path.join(projectRoot, 'src'), { recursive: true });
}

async function makePaidLicense(): Promise<void> {
  const exp = Math.floor(Date.now() / 1000) + 365 * 86400;
  await activate(makeJwt({ sub: 'seat-x', email: 'pablo@yujin.app', exp }));
}

beforeEach(async () => {
  projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'yf-ship-'));
  tmpHome     = await fs.mkdtemp(path.join(os.tmpdir(), 'yf-home-'));
  process.env.HOME = tmpHome;
  process.env.USERPROFILE = tmpHome;
});

afterEach(async () => {
  process.env.HOME = originalHome;
  process.env.USERPROFILE = originalHome;
  await fs.rm(projectRoot, { recursive: true, force: true });
  await fs.rm(tmpHome, { recursive: true, force: true });
});

function ok(): ProcessResult  { return { code: 0, stdoutTail: '', stderrTail: '' }; }
function fail(detail = 'broken'): ProcessResult { return { code: 1, stdoutTail: '', stderrTail: detail }; }

describe('runShip', () => {
  it('passes the full pipeline when everything is OK', async () => {
    await makeValidProject();
    await makePaidLicense();
    const calls: string[] = [];
    const exec = async (cmd: string, args: string[]): Promise<ProcessResult> => {
      calls.push([cmd, ...args].join(' '));
      return ok();
    };
    const result = await runShip({ projectRoot, skipTests: false, runProcess: exec });
    expect(result.ok).toBe(true);
    expect(result.steps.map((s) => s.name)).toEqual(['validate', 'license', 'test', 'build']);
    for (const s of result.steps) expect(s.ok).toBe(true);
    expect(calls).toEqual([
      'npm test --silent',
      'npm run build --silent',
    ]);
  });

  it('stops at validate when the project is broken', async () => {
    // No yujin.forge.json -> validate fails.
    let invoked = 0;
    const exec = async (): Promise<ProcessResult> => { invoked++; return ok(); };
    const r = await runShip({ projectRoot, skipTests: false, runProcess: exec });
    expect(r.ok).toBe(false);
    expect(r.steps).toHaveLength(1);
    expect(r.steps[0]?.name).toBe('validate');
    expect(invoked).toBe(0);
  });

  it('stops at license when not authorized', async () => {
    await makeValidProject();
    // Pre-create an expired trial.
    const forgeDir = path.join(tmpHome, '.yujin-forge');
    await fs.mkdir(forgeDir, { recursive: true });
    const past = new Date(Date.now() - 40 * 86400000);
    await fs.writeFile(path.join(forgeDir, 'trial.json'), JSON.stringify({
      startedAt: past.toISOString(),
      endsAt:    new Date(past.getTime() + 30 * 86400000).toISOString(),
    }));

    let invoked = 0;
    const exec = async (): Promise<ProcessResult> => { invoked++; return ok(); };
    const r = await runShip({ projectRoot, skipTests: false, runProcess: exec });
    expect(r.ok).toBe(false);
    const names = r.steps.map((s) => s.name);
    expect(names).toEqual(['validate', 'license']);
    expect(invoked).toBe(0);
  });

  it('skips test step when skipTests=true', async () => {
    await makeValidProject();
    await makePaidLicense();
    const calls: string[] = [];
    const exec = async (cmd: string, args: string[]): Promise<ProcessResult> => {
      calls.push([cmd, ...args].join(' '));
      return ok();
    };
    const r = await runShip({ projectRoot, skipTests: true, runProcess: exec });
    expect(r.ok).toBe(true);
    const testStep = r.steps.find((s) => s.name === 'test');
    expect(testStep?.skipped).toBe(true);
    expect(calls).toEqual(['npm run build --silent']);
  });

  it('stops at test when npm test exits non-zero', async () => {
    await makeValidProject();
    await makePaidLicense();
    let calls = 0;
    const exec = async (cmd: string, args: string[]): Promise<ProcessResult> => {
      calls++;
      if (args[0] === 'test') return fail('1 failing test');
      return ok();
    };
    const r = await runShip({ projectRoot, skipTests: false, runProcess: exec });
    expect(r.ok).toBe(false);
    const testStep = r.steps.find((s) => s.name === 'test');
    expect(testStep?.ok).toBe(false);
    expect(testStep?.detail).toContain('1 failing test');
    expect(calls).toBe(1); // build was not attempted
  });

  it('stops at build when npm run build exits non-zero', async () => {
    await makeValidProject();
    await makePaidLicense();
    const exec = async (cmd: string, args: string[]): Promise<ProcessResult> => {
      if (args[0] === 'run' && args[1] === 'build') return fail('tsc error');
      return ok();
    };
    const r = await runShip({ projectRoot, skipTests: false, runProcess: exec });
    expect(r.ok).toBe(false);
    const buildStep = r.steps.find((s) => s.name === 'build');
    expect(buildStep?.ok).toBe(false);
  });

  it('trial-active license passes the gate', async () => {
    await makeValidProject();
    // No license activation -> first call starts a fresh trial.
    // loadLicense in ship runner kicks it off.
    const exec = async (): Promise<ProcessResult> => ok();
    const r = await runShip({ projectRoot, skipTests: false, runProcess: exec });
    expect(r.ok).toBe(true);
    const lic = r.steps.find((s) => s.name === 'license');
    expect(lic?.detail).toContain('trial');
  });
});
