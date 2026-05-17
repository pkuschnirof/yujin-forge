/**
 * Yujin Forge -- machine fingerprint.
 *
 * Deterministic identifier the license server pins seats to.
 * Inputs are stable across boots + non-PII:
 *   - hostname (os.hostname())
 *   - platform (process.platform)
 *   - arch     (process.arch)
 *   - $HOME basename (signals 'pablo' vs 'root' but doesn't leak the path)
 *
 * We deliberately AVOID MAC addresses + serial numbers -- the
 * value is to bind a license to "this machine for this user",
 * not to identify the hardware.
 */
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

export function machineFingerprint(): string {
  const homeBase = path.basename(os.homedir() || '');
  const raw = [
    'yujin-forge/v1',
    os.hostname(),
    process.platform,
    process.arch,
    homeBase,
  ].join('|');
  return createHash('sha256').update(raw).digest('hex').slice(0, 32);
}
