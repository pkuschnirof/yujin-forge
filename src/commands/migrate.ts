/**
 * `yf migrate <repo> --audit` -- produce an audit report.
 * `yf migrate <repo> --apply` -- run the migration (NOT yet impl).
 *
 * Audit is read-only + free for everyone (the SPEC carves it out
 * as a pre-purchase funnel surface). Apply is gated on a paid
 * seat and lands in a later milestone.
 */
import type { Command } from 'commander';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { c, header } from '../ui/colors.js';
import { auditProject } from '../migrate/audit.js';
import { applyMigration } from '../migrate/apply.js';
import { loadLicense, isPaidSeat } from '../license/index.js';

export interface MigrateOptions {
  audit?: boolean;
  apply?: boolean;
  yes?: boolean;
  out?: string;
  subdir?: string;
  dryRun?: boolean;
}

export function registerMigrateCommand(program: Command): void {
  program
    .command('migrate <repo>')
    .description('Audit or apply a NAC-3 migration to an existing React project.')
    .option('--audit',         'produce a migration report without mutating files (default)', true)
    .option('--apply',         'execute the proposed migration (requires paid seat)')
    .option('--dry-run',       'with --apply, compute edits without writing files')
    .option('-y, --yes',       'skip confirmation prompts (CI mode)')
    .option('-o, --out <path>', 'write the audit report to a JSON file')
    .option('--subdir <name>', 'subdirectory to scan under <repo> (default: src)', 'src')
    .action(async (repo: string, opts: MigrateOptions) => {
      if (opts.apply) {
        await runApply(repo, opts);
        return;
      }
      await runAudit(repo, opts);
    });
}

export async function runAudit(repo: string, opts: MigrateOptions): Promise<void> {
  header('Yujin Forge -- migration audit');
  console.log('');

  const projectRoot = path.resolve(process.cwd(), repo);

  let report;
  try {
    report = await auditProject({ projectRoot, scanSubdir: opts.subdir });
  } catch (err) {
    console.error(c.error(err instanceof Error ? err.message : String(err)));
    process.exitCode = 1;
    return;
  }

  console.log('  Project:        ' + c.dim(projectRoot));
  console.log('  Files scanned:  ' + report.scanned_files);
  console.log('  Candidates:     ' + report.summary.total);
  console.log('');
  console.log('  ' + c.brand('action ') + ' ' + report.summary.actions);
  console.log('  ' + c.brand('field  ') + ' ' + report.summary.fields);
  console.log('  ' + c.brand('region ') + ' ' + report.summary.regions);
  console.log('  ' + c.dim('already tagged ') + report.summary.already_tagged);
  console.log('');

  if (opts.out) {
    const outPath = path.resolve(process.cwd(), opts.out);
    await fs.writeFile(outPath, JSON.stringify(report, null, 2), 'utf-8');
    console.log(c.success('Wrote report to ' + outPath));
  } else if (report.candidates.length > 0) {
    const preview = report.candidates.slice(0, 10);
    console.log(c.dim('First ' + preview.length + ' candidate(s):'));
    for (const cand of preview) {
      const tag = cand.already_tagged ? c.dim('[ok] ') : '';
      console.log('  ' + tag + cand.file + ':' + cand.line + '  '
        + c.brand(cand.kind) + '  ' + c.dim(cand.element + '  ->  ' + cand.proposed_id));
    }
    if (report.candidates.length > preview.length) {
      console.log(c.dim('  ... + ' + (report.candidates.length - preview.length) + ' more (use --out to dump JSON)'));
    }
  }

  if (report.summary.total === 0) {
    console.log(c.success('Nothing to migrate -- project already looks NAC-3 clean.'));
  } else {
    const todo = report.summary.total - report.summary.already_tagged;
    console.log('');
    console.log(c.dim(todo + ' element(s) need a data-nac-id. Run ' )
      + c.code('yf migrate ' + repo + ' --apply')
      + c.dim(' (paid seat) to add them.'));
  }
}

export async function runApply(repo: string, opts: MigrateOptions): Promise<void> {
  header('Yujin Forge -- migration apply' + (opts.dryRun ? ' (dry run)' : ''));
  console.log('');

  const lic = await loadLicense();
  if (!isPaidSeat(lic)) {
    console.error(c.error('migrate --apply requires a paid seat.'));
    console.error('  ' + c.dim('Trial mode produces the audit only. Run ')
      + c.code('yf license activate --key <jwt>')
      + c.dim(' to install a seat.'));
    process.exitCode = 1;
    return;
  }

  const projectRoot = path.resolve(process.cwd(), repo);
  try {
    const result = await applyMigration({
      projectRoot,
      scanSubdir: opts.subdir,
      dryRun: !!opts.dryRun,
    });

    console.log('  Project:        ' + c.dim(projectRoot));
    console.log('  Files scanned:  ' + result.report.scanned_files);
    console.log('  Files edited:   ' + result.edited_files.length);
    console.log('  Skipped (already tagged): ' + result.skipped_already_tagged);
    console.log('');
    for (const e of result.edited_files) {
      console.log('  ' + c.success('+ ') + e.file + c.dim(' (' + e.inserts + ' insert(s))'));
    }
    console.log('');
    if (opts.dryRun) {
      console.log(c.warn('Dry run -- no files were written.'));
      console.log(c.dim('Re-run without --dry-run to apply.'));
    } else if (result.edited_files.length === 0) {
      console.log(c.success('Nothing to do -- project is already NAC-3 clean.'));
    } else {
      console.log(c.success('Migration applied. Run your test suite to verify.'));
    }
    if (opts.out) {
      const outPath = path.resolve(process.cwd(), opts.out);
      await fs.writeFile(outPath, JSON.stringify(result.report, null, 2), 'utf-8');
      console.log(c.dim('Audit report written to ' + outPath));
    }
  } catch (err) {
    console.error(c.error(err instanceof Error ? err.message : String(err)));
    process.exitCode = 1;
  }
}
