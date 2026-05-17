/**
 * Tests for the license activation + revocation flow.
 *
 * Builds JWTs manually (unsigned -- we don't verify the signature
 * yet) so the tests don't depend on a published server public key.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  parseJwt,
  activate,
  revoke,
  InvalidLicenseKeyError,
} from '../src/license/activate.js';
import { loadLicense } from '../src/license/index.js';
import { machineFingerprint } from '../src/license/fingerprint.js';

let tmpHome = '';
const originalHome = os.homedir();

function base64Url(s: string): string {
  return Buffer.from(s).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function makeJwt(payload: object, header: object = { alg: 'RS256', typ: 'JWT' }): string {
  const h = base64Url(JSON.stringify(header));
  const p = base64Url(JSON.stringify(payload));
  const sig = base64Url('fake-signature');
  return [h, p, sig].join('.');
}

beforeEach(async () => {
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'yf-act-'));
  process.env.HOME = tmpHome;
  process.env.USERPROFILE = tmpHome;
});

afterEach(async () => {
  process.env.HOME = originalHome;
  process.env.USERPROFILE = originalHome;
  await fs.rm(tmpHome, { recursive: true, force: true });
});

describe('parseJwt', () => {
  it('parses a well-formed JWT', () => {
    const jwt = makeJwt({ sub: 'seat-123', email: 'a@b.com' });
    const r = parseJwt(jwt);
    expect(r.payload.sub).toBe('seat-123');
    expect(r.payload.email).toBe('a@b.com');
  });

  it('rejects empty input', () => {
    expect(() => parseJwt('')).toThrow(InvalidLicenseKeyError);
  });

  it('rejects wrong segment count', () => {
    expect(() => parseJwt('not.a.jwt.atall')).toThrow(/3 dot-separated parts/);
    expect(() => parseJwt('only.two')).toThrow(/3 dot-separated parts/);
  });

  it('rejects non-JSON payload', () => {
    const bad = [base64Url('{"alg":"RS256"}'), base64Url('not json'), 'sig'].join('.');
    expect(() => parseJwt(bad)).toThrow(/not valid base64url JSON/);
  });
});

describe('machineFingerprint', () => {
  it('returns a 32-hex-char digest', () => {
    const fp = machineFingerprint();
    expect(fp).toMatch(/^[0-9a-f]{32}$/);
  });
  it('is stable across calls', () => {
    expect(machineFingerprint()).toBe(machineFingerprint());
  });
});

describe('activate', () => {
  it('persists a license file with the expected fields', async () => {
    const futureExp = Math.floor(Date.now() / 1000) + 365 * 86400;
    const jwt = makeJwt({ sub: 'seat-xyz', email: 'pablo@yujin.app', exp: futureExp });
    const res = await activate(jwt);
    expect(res.seat.email).toBe('pablo@yujin.app');
    expect(res.seat.token).toBe(jwt);
    expect(res.seat.expiresAt).toBeTruthy();
    expect(res.seat.machineFingerprint).toMatch(/^[0-9a-f]{32}$/);

    const stored = JSON.parse(await fs.readFile(res.path, 'utf-8'));
    expect(stored.email).toBe('pablo@yujin.app');
  });

  it('refuses an already-expired key', async () => {
    const pastExp = Math.floor(Date.now() / 1000) - 60;
    const jwt = makeJwt({ sub: 'seat-x', exp: pastExp });
    await expect(activate(jwt)).rejects.toThrow(/already expired/);
  });

  it('refuses a payload missing sub', async () => {
    const jwt = makeJwt({ email: 'no-sub@example.com' });
    await expect(activate(jwt)).rejects.toThrow(/'sub'/);
  });

  it('accepts a perpetual seat (exp absent)', async () => {
    const jwt = makeJwt({ sub: 'forever', email: null });
    const res = await activate(jwt);
    expect(res.seat.expiresAt).toBeNull();
    expect(res.seat.email).toBeNull();
  });

  it('loadLicense reflects the activation', async () => {
    const jwt = makeJwt({ sub: 'seat-1', email: 'me@me.com' });
    await activate(jwt);
    const lic = await loadLicense();
    expect(lic.status).toBe('paid');
    expect(lic.seat?.email).toBe('me@me.com');
  });
});

describe('revoke', () => {
  it('returns false when no license is installed', async () => {
    const removed = await revoke();
    expect(removed).toBe(false);
  });

  it('deletes the license file when one exists', async () => {
    const jwt = makeJwt({ sub: 's' });
    await activate(jwt);
    const removed = await revoke();
    expect(removed).toBe(true);

    const lic = await loadLicense();
    expect(lic.status).not.toBe('paid');
  });
});
