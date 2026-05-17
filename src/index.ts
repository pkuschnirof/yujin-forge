/**
 * Yujin Forge -- public library exports.
 *
 * Consumers that embed the Forge CLI as a library (e.g. a VS Code
 * extension) import from here. The bin entry (`yf`) is the main
 * surface but the SDK is reusable.
 */
export { buildProgram } from './bin/yf.js';
export { VERSION } from './version.js';
export type { LicenseState, LicenseStatus, TrialState } from './license/types.js';
export { loadLicense, isPaidSeat, isTrialActive } from './license/index.js';
