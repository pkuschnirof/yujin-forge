/**
 * Smoke tests for the CLI. Each test loads the program + invokes
 * Commander programmatically (no subprocess) so we get fast,
 * deterministic assertions.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildProgram } from '../src/bin/yf.js';
import { VERSION } from '../src/version.js';

let tmpHome = '';
const originalHome = os.homedir();

beforeEach(async () => {
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'yf-cli-'));
  process.env.HOME    = tmpHome;
  process.env.USERPROFILE = tmpHome;
});

afterEach(async () => {
  process.env.HOME    = originalHome;
  process.env.USERPROFILE = originalHome;
  await fs.rm(tmpHome, { recursive: true, force: true });
});

describe('yf CLI', () => {
  it('builds a program with the eight top-level commands', () => {
    const program = buildProgram();
    const names = program.commands.map((c) => c.name()).sort();
    expect(names).toEqual([
      'chat',
      'doctor',
      'license',
      'migrate',
      'new',
      'ship',
      'test',
      'validate',
    ]);
  });

  it('reports the correct version', () => {
    const program = buildProgram();
    expect(program.version()).toBe(VERSION);
  });

  it('license has three subcommands', () => {
    const program = buildProgram();
    const lic = program.commands.find((c) => c.name() === 'license');
    expect(lic).toBeDefined();
    const subs = lic!.commands.map((c) => c.name()).sort();
    expect(subs).toEqual(['activate', 'revoke', 'status']);
  });

  it('doctor --json emits valid JSON with version + checks', async () => {
    const program = buildProgram();
    const captured: string[] = [];
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: any) => {
      captured.push(String(chunk));
      return true;
    });
    program.exitOverride();
    try {
      await program.parseAsync(['node', 'yf', 'doctor', '--json']);
    } finally {
      writeSpy.mockRestore();
    }
    const joined = captured.join('');
    const parsed = JSON.parse(joined);
    expect(parsed.version).toBe(VERSION);
    expect(Array.isArray(parsed.checks)).toBe(true);
    expect(parsed.checks.length).toBeGreaterThan(0);
    for (const check of parsed.checks) {
      expect(typeof check.name).toBe('string');
      expect(typeof check.ok).toBe('boolean');
      expect(typeof check.detail).toBe('string');
    }
  });

  it('license status --json emits parseable LicenseState', async () => {
    const program = buildProgram();
    const captured: string[] = [];
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: any) => {
      captured.push(String(chunk));
      return true;
    });
    program.exitOverride();
    try {
      await program.parseAsync(['node', 'yf', 'license', 'status', '--json']);
    } finally {
      writeSpy.mockRestore();
    }
    const parsed = JSON.parse(captured.join(''));
    expect(['paid', 'trial', 'expired', 'absent']).toContain(parsed.status);
  });
});
