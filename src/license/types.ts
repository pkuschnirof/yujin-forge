/**
 * Yujin Forge -- license types.
 *
 * The license state is a discriminated union over `status`. The
 * runtime always returns one of these four states; callers check
 * via the helpers in src/license/index.ts (isPaidSeat, etc).
 */

export type LicenseStatus = 'paid' | 'trial' | 'expired' | 'absent';

export type LicenseSource =
  | 'cache:paid'      // ~/.yujin-forge/license.json contains a paid seat token
  | 'cache:trial'     // ~/.yujin-forge/trial.json marks an active trial
  | 'fresh:trial'     // first invocation -- trial just started
  | 'absent';         // no cache, trial expired or never started

export interface SeatToken {
  /** Opaque server-issued JWT. */
  token: string;
  /** ISO-8601 timestamp for the seat's hard expiry. */
  expiresAt: string | null;
  /** ISO-8601 timestamp the cache was last refreshed against the server. */
  lastCheckedAt: string;
  /** Email the seat is bound to (or null for machine-only seats). */
  email: string | null;
  /** Machine fingerprint the seat is pinned to. */
  machineFingerprint: string;
}

export interface TrialState {
  /** ISO-8601 timestamp when the trial was started. */
  startedAt: string;
  /** ISO-8601 timestamp when the trial ends (startedAt + 30 days). */
  endsAt: string;
  /** Convenience -- whole days remaining (negative when expired). */
  daysLeft: number;
}

export interface LicenseState {
  status: LicenseStatus;
  source: LicenseSource;
  /** Present when status === 'paid'. */
  seat: SeatToken | null;
  /** Present when status === 'trial' OR 'expired'. */
  trial: TrialState | null;
}
