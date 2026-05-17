/**
 * Tests for the license client. Trial lifecycle + cache reads.
 *
 * The license module reads `~/.yujin-forge/`, so we point HOME at
 * a fresh temp directory per test. That's cleaner than mocking fs
 * + survives a future refactor that adds more file paths.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  loadLicense,
  isPaidSeat,
  isTrialActive,
  isAuthorized,
} from '../src/license/index.js';

const originalHome = os.homedir();
let tmpHome = '';

async function makeTempHome(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'yf-test-'));
  return dir;
}

beforeEach(async () => {
  tmpHome = await makeTempHome();
  process.env.HOME    = tmpHome;
  process.env.USERPROFILE = tmpHome; // Windows
});

afterEach(async () => {
  process.env.HOME    = originalHome;
  process.env.USERPROFILE = originalHome;
  await fs.rm(tmpHome, { recursive: true, force: true });
});

describe('license client', () => {
  it('starts a fresh trial on first invocation', async () => {
    const lic = await loadLicense();
    expect(lic.status).toBe('trial');
    expect(lic.source).toBe('fresh:trial');
    expect(lic.trial).not.toBeNull();
    expect(lic.trial!.daysLeft).toBeGreaterThan(28);
    expect(lic.trial!.daysLeft).toBeLessThanOrEqual(30);
    expect(lic.seat).toBeNull();
  });

  it('re-reads the cached trial on the second invocation', async () => {
    const first  = await loadLicense();
    const second = await loadLicense();
    expect(first.trial?.startedAt).toBe(second.trial?.startedAt);
    expect(second.source).toBe('cache:trial');
  });

  it('reports paid when a license.json exists', async () => {
    const forgeDir = path.join(tmpHome, '.yujin-forge');
    await fs.mkdir(forgeDir, { recursive: true });
    await fs.writeFile(path.join(forgeDir, 'license.json'), JSON.stringify({
      token: 'paid.jwt.token',
      expiresAt: '2027-12-31T00:00:00Z',
      lastCheckedAt: new Date().toISOString(),
      email: 'pablo@example.com',
      machineFingerprint: 'abc123',
    }));

    const lic = await loadLicense();
    expect(lic.status).toBe('paid');
    expect(lic.source).toBe('cache:paid');
    expect(lic.seat?.email).toBe('pablo@example.com');
    expect(isPaidSeat(lic)).toBe(true);
    expect(isAuthorized(lic)).toBe(true);
  });

  it('reports expired when the cached trial is in the past', async () => {
    const forgeDir = path.join(tmpHome, '.yujin-forge');
    await fs.mkdir(forgeDir, { recursive: true });
    const past = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000); // 40 days ago
    await fs.writeFile(path.join(forgeDir, 'trial.json'), JSON.stringify({
      startedAt: past.toISOString(),
      endsAt:    new Date(past.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    }));

    const lic = await loadLicense();
    expect(lic.status).toBe('expired');
    expect(lic.trial?.daysLeft).toBeLessThanOrEqual(0);
    expect(isTrialActive(lic)).toBe(false);
    expect(isAuthorized(lic)).toBe(false);
  });

  it('prefers a paid seat over an active trial when both exist', async () => {
    const forgeDir = path.join(tmpHome, '.yujin-forge');
    await fs.mkdir(forgeDir, { recursive: true });
    // Drop both a trial AND a paid seat.
    await fs.writeFile(path.join(forgeDir, 'trial.json'), JSON.stringify({
      startedAt: new Date().toISOString(),
      endsAt:    new Date(Date.now() + 30 * 86400000).toISOString(),
    }));
    await fs.writeFile(path.join(forgeDir, 'license.json'), JSON.stringify({
      token: 'paid.jwt',
      expiresAt: null,
      lastCheckedAt: new Date().toISOString(),
      email: 'pro@yujin.app',
      machineFingerprint: 'x',
    }));

    const lic = await loadLicense();
    expect(lic.status).toBe('paid');
  });
});
