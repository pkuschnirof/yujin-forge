/**
 * Yujin Forge -- migration apply.
 *
 * Takes an AuditReport (or runs auditProject internally) and
 * inserts data-nac-id + data-nac-role attributes on every
 * candidate JSX element that doesn't already carry them.
 *
 * The edit strategy is byte-position-based, NOT printer-based:
 *
 *   - Re-parse each file with the TS compiler API to get the
 *     exact source position right after the opening tag name.
 *   - Compute one insertion per candidate edit, sorted DESCENDING
 *     by offset so earlier inserts don't shift later positions.
 *   - Splice the original source string. Surrounding formatting,
 *     comments, and JSX whitespace are preserved verbatim.
 *
 * Atomic per file: build the new content, write once. Dry-run
 * mode collects the diffs without touching disk.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { auditProject, type AuditOptions } from './audit.js';
import type { AuditReport, Candidate, CandidateKind } from './types.js';

export interface ApplyOptions extends AuditOptions {
  /** When true, compute the edits but do NOT write to disk. */
  dryRun?: boolean;
}

export interface PerFileEdit {
  file: string;
  inserts: number;
  /** Patched content. Always returned (handy for dry-run preview + tests). */
  newContent: string;
}

export interface ApplyResult {
  report: AuditReport;
  edited_files: PerFileEdit[];
  /** Number of candidates that were already tagged + skipped. */
  skipped_already_tagged: number;
  /** Whether disk was written. */
  wrote: boolean;
}

export async function applyMigration(opts: ApplyOptions): Promise<ApplyResult> {
  const report = await auditProject(opts);

  // Group candidates by file.
  const byFile = new Map<string, Candidate[]>();
  let skipped = 0;
  for (const c of report.candidates) {
    if (c.already_tagged) { skipped++; continue; }
    const list = byFile.get(c.file) ?? [];
    list.push(c);
    byFile.set(c.file, list);
  }

  const edits: PerFileEdit[] = [];
  for (const [relFile, cands] of byFile) {
    const abs = path.join(opts.projectRoot, relFile);
    const source = await fs.readFile(abs, 'utf-8');
    const next = applyEditsToSource(source, abs, cands);
    edits.push({ file: relFile, inserts: cands.length, newContent: next });
  }

  edits.sort((a, b) => a.file.localeCompare(b.file));

  if (!opts.dryRun) {
    for (const e of edits) {
      const abs = path.join(opts.projectRoot, e.file);
      await fs.writeFile(abs, e.newContent, 'utf-8');
    }
  }

  return {
    report,
    edited_files: edits,
    skipped_already_tagged: skipped,
    wrote: !opts.dryRun,
  };
}

/**
 * Compute the new source string for a file given the candidates
 * we want to tag. Exported for testing the edit math against
 * controlled inputs.
 */
export function applyEditsToSource(
  source: string,
  abs: string,
  candidates: Candidate[]
): string {
  const sf = ts.createSourceFile(abs, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  // Walk the AST a second time and collect (offset, insert) pairs
  // keyed by line + tag (matching what the audit emitted). We
  // can't rely on (file,line) alone since one line can have
  // multiple JSX tags, so we also match the kind + element.
  type Insert = { offset: number; text: string };
  const inserts: Insert[] = [];

  function visit(node: ts.Node): void {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName;
      if (ts.isIdentifier(tag)) {
        const tagText = tag.text;
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        const match = candidates.find((c) =>
          c.line === line + 1 && c.element === tagText
        );
        if (match && !nodeHasAttr(node, 'data-nac-id')) {
          // Insert attrs right after the tag name (which is
          // tag.getEnd()) with a leading space.
          inserts.push({
            offset: tag.getEnd(),
            text: ' '
              + 'data-nac-id="' + match.proposed_id + '" '
              + 'data-nac-role="' + roleForKind(match.kind) + '"',
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);

  // Apply DESCENDING by offset so earlier inserts don't shift
  // later offsets.
  inserts.sort((a, b) => b.offset - a.offset);
  let out = source;
  for (const ins of inserts) {
    out = out.slice(0, ins.offset) + ins.text + out.slice(ins.offset);
  }
  return out;
}

function nodeHasAttr(
  node: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
  name: string
): boolean {
  for (const attr of node.attributes.properties) {
    if (ts.isJsxAttribute(attr)) {
      const raw = attr.name.getText();
      if (raw === name) return true;
    }
  }
  return false;
}

function roleForKind(kind: CandidateKind): string {
  // The NAC-3 role names match the audit kinds today. Kept as a
  // helper so we can extend the mapping (e.g. add 'tab' / 'data-
  // table' / 'confirm-dialog' detection later) without touching
  // every call site.
  return kind;
}
