/**
 * Yujin Forge -- license activation + revocation.
 *
 * `yf license activate --key <jwt>` parses the JWT (without
 * signature verification today -- the server key isn't published
 * yet), extracts email + expiry, computes the machine fingerprint,
 * and persists ~/.yujin-forge/license.json.
 *
 * `yf license revoke` deletes the license file so the user falls
 * back to trial semantics.
 *
 * Server-side verification (POST to license.yujin.dev for
 * signature + revocation check) is deferred. When wired, the same
 * activate path will additionally verify against the public key
 * and refuse activation if the server rejects the seat.
 *
 * JWT payload contract:
 *   {
 *     "sub":   "<seat-id>",
 *     "email": "<email or null>",
 *     "exp":   <unix-seconds or null for perpetual seats>,
 *     "iss":   "license.yujin.dev",
 *     "iat":   <unix-seconds>
 *   }
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { configDir } from './index.js';
import { machineFingerprint } from './fingerprint.js';
import type { SeatToken } from './types.js';

export interface ParsedJwt {
  header:  Record<string, unknown>;
  payload: Record<string, unknown>;
  raw:     string;
}

export class InvalidLicenseKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidLicenseKeyError';
  }
}

/**
 * Parse a JWT without verifying the signature. Throws
 * InvalidLicenseKeyError on any shape error so the caller can
 * print a precise hint instead of a stack trace.
 */
export function parseJwt(raw: string): ParsedJwt {
  const trimmed = raw.trim();
  if (trimmed === '') {
    throw new InvalidLicenseKeyError('license key is empty');
  }
  const parts = trimmed.split('.');
  if (parts.length !== 3) {
    throw new InvalidLicenseKeyError('license key must be a JWT (3 dot-separated parts)');
  }
  const [h, p] = parts;
  let header: unknown;
  let payload: unknown;
  try {
    header = JSON.parse(base64UrlDecode(h!));
  } catch {
    throw new InvalidLicenseKeyError('license key header is not valid base64url JSON');
  }
  try {
    payload = JSON.parse(base64UrlDecode(p!));
  } catch {
    throw new InvalidLicenseKeyError('license key payload is not valid base64url JSON');
  }
  if (!isPlainObject(header) || !isPlainObject(payload)) {
    throw new InvalidLicenseKeyError('license key header or payload is not an object');
  }
  return { header, payload, raw: trimmed };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function base64UrlDecode(s: string): string {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const normalised = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(normalised, 'base64').toString('utf-8');
}

export interface ActivateResult {
  seat: SeatToken;
  path: string;
}

/**
 * Activate a license key on this machine. Writes
 * ~/.yujin-forge/license.json after extracting the relevant claims.
 *
 * Throws InvalidLicenseKeyError on shape / freshness errors.
 * Throws plain Error on filesystem issues.
 */
export async function activate(rawKey: string): Promise<ActivateResult> {
  const parsed = parseJwt(rawKey);
  const payload = parsed.payload;

  const sub = payload['sub'];
  if (typeof sub !== 'string' || sub.length === 0) {
    throw new InvalidLicenseKeyError("license key payload missing 'sub'");
  }

  const expRaw = payload['exp'];
  let expiresAt: string | null = null;
  if (expRaw != null) {
    if (typeof expRaw !== 'number') {
      throw new InvalidLicenseKeyError("license key payload 'exp' must be a number (unix seconds) or null");
    }
    if (expRaw * 1000 <= Date.now()) {
      throw new InvalidLicenseKeyError('license key is already expired');
    }
    expiresAt = new Date(expRaw * 1000).toISOString();
  }

  const emailRaw = payload['email'];
  const email: string | null = typeof emailRaw === 'string' && emailRaw.length > 0
    ? emailRaw
    : null;

  const seat: SeatToken = {
    token: rawKey.trim(),
    expiresAt,
    lastCheckedAt: new Date().toISOString(),
    email,
    machineFingerprint: machineFingerprint(),
  };

  await fs.mkdir(configDir(), { recursive: true });
  const filePath = path.join(configDir(), 'license.json');
  await fs.writeFile(filePath, JSON.stringify(seat, null, 2), 'utf-8');
  return { seat, path: filePath };
}

/**
 * Remove the local license cache. Returns true if a file was
 * deleted, false if no license was installed.
 */
export async function revoke(): Promise<boolean> {
  const filePath = path.join(configDir(), 'license.json');
  try {
    await fs.unlink(filePath);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw err;
  }
}
