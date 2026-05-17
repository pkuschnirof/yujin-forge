/**
 * Yujin Forge -- project validator.
 *
 * Verifies that a directory looks like a Yujin Forge project. The
 * check is static (no compile, no install). Useful day-1 as:
 *
 *   - a pre-commit hook
 *   - a CI gate (yf validate --strict && yf test && yf ship)
 *   - a sanity probe after `yf new` / `yf migrate --apply`
 *
 * The full NAC-3 manifest validator (label_i18n completeness for
 * all 10 locales, verb declarations, ack contract) lands once the
 * @yujin/nac runtime is published; this stage focuses on the
 * structural contract that doesn't depend on the runtime.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { isValidSlug } from '../template/index.js';

export type Severity = 'error' | 'warn';

export interface Finding {
  severity: Severity;
  code: string;
  message: string;
}

export interface ValidateReport {
  project_root: string;
  findings: Finding[];
  ok: boolean;
}

export interface ValidateOptions {
  /** Project root to validate. */
  projectRoot: string;
  /** If true, treat warnings as errors. */
  strict?: boolean;
}

const REQUIRED_FORGE_FIELDS = [
  'project_slug',
  'project_name',
  'forge_version',
  'nac_version',
] as const;

export async function validateProject(opts: ValidateOptions): Promise<ValidateReport> {
  const findings: Finding[] = [];

  await checkForgeJson(opts.projectRoot, findings);
  await checkPackageJson(opts.projectRoot, findings);
  await checkSrcDir(opts.projectRoot, findings);

  const errorCount = findings.filter((f) => f.severity === 'error').length;
  const warnCount  = findings.filter((f) => f.severity === 'warn').length;
  const ok = errorCount === 0 && (!opts.strict || warnCount === 0);

  return {
    project_root: opts.projectRoot,
    findings,
    ok,
  };
}

async function checkForgeJson(root: string, out: Finding[]): Promise<void> {
  const p = path.join(root, 'yujin.forge.json');
  let raw: string;
  try {
    raw = await fs.readFile(p, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      out.push({
        severity: 'error',
        code: 'forge_json_missing',
        message: 'yujin.forge.json not found at ' + p,
      });
      return;
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    out.push({
      severity: 'error',
      code: 'forge_json_unparseable',
      message: 'yujin.forge.json is not valid JSON: '
        + (err instanceof Error ? err.message : String(err)),
    });
    return;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    out.push({
      severity: 'error',
      code: 'forge_json_not_object',
      message: 'yujin.forge.json must be a JSON object',
    });
    return;
  }
  const obj = parsed as Record<string, unknown>;
  for (const field of REQUIRED_FORGE_FIELDS) {
    if (!(field in obj)) {
      out.push({
        severity: 'error',
        code: 'forge_json_missing_field',
        message: "yujin.forge.json missing required field '" + field + "'",
      });
    }
  }
  const slug = obj['project_slug'];
  if (typeof slug === 'string' && !isValidSlug(slug)) {
    out.push({
      severity: 'error',
      code: 'forge_json_invalid_slug',
      message: "project_slug '" + slug + "' is not a valid slug (lowercase, dash, 3..40 chars, starts with a letter)",
    });
  }
  const tel = obj['telemetry'];
  if (tel !== undefined && (typeof tel !== 'object' || tel === null || Array.isArray(tel))) {
    out.push({
      severity: 'warn',
      code: 'forge_json_telemetry_shape',
      message: "yujin.forge.json 'telemetry' must be an object when present",
    });
  }
}

async function checkPackageJson(root: string, out: Finding[]): Promise<void> {
  const p = path.join(root, 'package.json');
  let raw: string;
  try {
    raw = await fs.readFile(p, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      out.push({
        severity: 'error',
        code: 'package_json_missing',
        message: 'package.json not found at ' + p,
      });
      return;
    }
    throw err;
  }
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(raw);
  } catch {
    out.push({
      severity: 'error',
      code: 'package_json_unparseable',
      message: 'package.json is not valid JSON',
    });
    return;
  }

  const deps = {
    ...(asDeps(pkg['dependencies'])),
    ...(asDeps(pkg['devDependencies'])),
    ...(asDeps(pkg['peerDependencies'])),
  };
  if (!('@yujin/nac' in deps) && !('@yujin/nac-commercial' in deps)) {
    out.push({
      severity: 'warn',
      code: 'package_json_no_nac_dep',
      message: "package.json does not depend on '@yujin/nac' or '@yujin/nac-commercial'",
    });
  }
}

function asDeps(v: unknown): Record<string, string> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v)) {
    if (typeof val === 'string') out[k] = val;
  }
  return out;
}

async function checkSrcDir(root: string, out: Finding[]): Promise<void> {
  const p = path.join(root, 'src');
  try {
    const stat = await fs.stat(p);
    if (!stat.isDirectory()) {
      out.push({
        severity: 'error',
        code: 'src_not_a_directory',
        message: 'src/ exists but is not a directory',
      });
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      out.push({
        severity: 'error',
        code: 'src_missing',
        message: 'src/ directory not found at ' + p,
      });
    } else {
      throw err;
    }
  }
}
