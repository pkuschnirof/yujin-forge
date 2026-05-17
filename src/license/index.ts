/**
 * Yujin Forge -- license client.
 *
 * Day-0 implementation handles the TRIAL flow end-to-end (the
 * paid-seat path is stubbed). Trial semantics per docs/SPEC.md
 * section 2.1:
 *
 *   - 30 days from first call to loadLicense
 *   - cached at ~/.yujin-forge/trial.json
 *   - watermarks generated code (handled by callers, not here)
 *
 * The paid-seat path (validate against license.yujin.dev, refresh
 * every 24h, offline grace of 7 days) lands with the License
 * client milestone (docs/SPEC.md section 8).
 *
 * The file layout under ~/.yujin-forge/ is:
 *
 *   ~/.yujin-forge/
 *     trial.json     -- TrialState (set on first invocation)
 *     license.json   -- SeatToken  (set on 'yf license activate')
 *
 * trial.json wins read precedence only if license.json is absent
 * (a paid seat trumps a trial). This is enforced by loadLicense.
 */
import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import type {
  LicenseState,
  LicenseStatus,
  SeatToken,
  TrialState,
} from './types.js';

const TRIAL_DAYS = 30;

export function configDir(): string {
  return path.join(homedir(), '.yujin-forge');
}

function trialPath():   string { return path.join(configDir(), 'trial.json'); }
function licensePath(): string { return path.join(configDir(), 'license.json'); }

async function readJsonOrNull<T>(file: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(file, 'utf-8');
    return JSON.parse(raw) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    return null;
  }
}

async function ensureConfigDir(): Promise<void> {
  await fs.mkdir(configDir(), { recursive: true });
}

async function readPaidSeat(): Promise<SeatToken | null> {
  return readJsonOrNull<SeatToken>(licensePath());
}

async function readTrial(): Promise<TrialState | null> {
  const stored = await readJsonOrNull<{ startedAt: string; endsAt: string }>(trialPath());
  if (!stored) return null;
  return computeTrialState(stored.startedAt, stored.endsAt);
}

async function startTrial(): Promise<TrialState> {
  await ensureConfigDir();
  const now = new Date();
  const ends = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  const stored = {
    startedAt: now.toISOString(),
    endsAt:    ends.toISOString(),
  };
  await fs.writeFile(trialPath(), JSON.stringify(stored, null, 2));
  return computeTrialState(stored.startedAt, stored.endsAt);
}

function computeTrialState(startedAt: string, endsAt: string): TrialState {
  const now = Date.now();
  const ends = Date.parse(endsAt);
  const daysLeft = Math.ceil((ends - now) / (24 * 60 * 60 * 1000));
  return { startedAt, endsAt, daysLeft };
}

function trialStatus(t: TrialState): LicenseStatus {
  return t.daysLeft > 0 ? 'trial' : 'expired';
}

/**
 * Read (or initialise) the local license state. Idempotent + safe
 * to call on every CLI invocation.
 *
 * Tests inject FORGE_CONFIG_DIR to point at a temp directory; the
 * helper resolves $HOME via os.homedir() so setting HOME in the
 * test process flips the file layout cleanly. Avoids the test
 * harness having to mock fs.
 */
export async function loadLicense(): Promise<LicenseState> {
  const seat = await readPaidSeat();
  if (seat) {
    return {
      status: 'paid',
      source: 'cache:paid',
      seat,
      trial: null,
    };
  }

  let trial = await readTrial();
  let source: LicenseState['source'] = 'cache:trial';
  if (!trial) {
    trial = await startTrial();
    source = 'fresh:trial';
  }
  const status = trialStatus(trial);
  return {
    status,
    source: status === 'expired' ? 'absent' : source,
    seat:   null,
    trial,
  };
}

export function isPaidSeat(state: LicenseState): boolean {
  return state.status === 'paid';
}

export function isTrialActive(state: LicenseState): boolean {
  return state.status === 'trial';
}

/**
 * Predicate the CLI uses to gate commercial features. Returns true
 * when the user can use anything Forge offers; false when they're
 * either expired or never had a license (in which case the calling
 * command should print the upgrade nudge).
 */
export function isAuthorized(state: LicenseState): boolean {
  return isPaidSeat(state) || isTrialActive(state);
}
