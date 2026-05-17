/**
 * Yujin Forge -- migration audit.
 *
 * Walks a React project's src/ tree, parses every .tsx / .jsx
 * file via the TypeScript compiler API, and reports every JSX
 * element that is a NAC-3 migration candidate. Produces NO
 * mutations -- the apply step lands in a later milestone.
 *
 * Candidate criteria:
 *   - <button>, <a>, or any element with an onClick handler ->
 *     'action' candidate
 *   - <input>, <textarea>, <select> -> 'field' candidate
 *   - <main>, <section>, <aside>, <article>, <nav>, <header>,
 *     <footer> -> 'region' candidate
 *
 * Elements already carrying a `data-nac-id` attribute are still
 * reported but flagged `already_tagged: true` so the apply step
 * can skip them.
 *
 * proposed_id derivation:
 *   '<dotted-file-stem>.<role>_<element|verb>'
 *   src/pages/Invoice.tsx + <button onClick=...>Save</button>
 *   -> 'pages.invoice.action_button'
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import type {
  AuditReport,
  AuditSummary,
  Candidate,
  CandidateKind,
} from './types.js';

const FIELD_TAGS = new Set(['input', 'textarea', 'select']);
const REGION_TAGS = new Set([
  'main', 'section', 'aside', 'article', 'nav', 'header', 'footer',
]);
// Tags whose mere presence flags them as an action candidate.
const INTRINSIC_ACTION_TAGS = new Set(['button', 'a']);

export interface AuditOptions {
  /** Project root (must exist + contain a src/ directory). */
  projectRoot: string;
  /** Optional subdirectory to walk under projectRoot (default: 'src'). */
  scanSubdir?: string;
}

export async function auditProject(opts: AuditOptions): Promise<AuditReport> {
  const rootStat = await fs.stat(opts.projectRoot);
  if (!rootStat.isDirectory()) {
    throw new Error('projectRoot is not a directory: ' + opts.projectRoot);
  }

  const subdir = opts.scanSubdir ?? 'src';
  const scanRoot = path.join(opts.projectRoot, subdir);
  let entryExists = true;
  try {
    await fs.stat(scanRoot);
  } catch {
    entryExists = false;
  }
  if (!entryExists) {
    throw new Error('no ' + subdir + '/ directory under ' + opts.projectRoot);
  }

  const files = await collectFiles(scanRoot, ['.tsx', '.jsx']);
  const candidates: Candidate[] = [];

  for (const absPath of files) {
    const rel = toPosix(path.relative(opts.projectRoot, absPath));
    const source = await fs.readFile(absPath, 'utf-8');
    const sf = ts.createSourceFile(absPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    walkSourceFile(sf, rel, candidates);
  }

  candidates.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

  const summary: AuditSummary = {
    actions:        candidates.filter((c) => c.kind === 'action').length,
    fields:         candidates.filter((c) => c.kind === 'field').length,
    regions:        candidates.filter((c) => c.kind === 'region').length,
    already_tagged: candidates.filter((c) => c.already_tagged).length,
    total:          candidates.length,
  };

  return {
    generated_at: new Date().toISOString(),
    project_root: opts.projectRoot,
    scanned_files: files.length,
    candidates,
    summary,
  };
}

async function collectFiles(root: string, exts: string[]): Promise<string[]> {
  const out: string[] = [];
  const stack: string[] = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.git') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        stack.push(full);
      } else if (e.isFile()) {
        if (exts.includes(path.extname(e.name))) out.push(full);
      }
    }
  }
  return out.sort();
}

function walkSourceFile(sf: ts.SourceFile, relPath: string, out: Candidate[]): void {
  const stem = fileStem(relPath);

  function visit(node: ts.Node): void {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = getTagName(node.tagName);
      if (tagName !== null) {
        const c = classify(tagName, node);
        if (c !== null) {
          const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
          out.push({
            file:           relPath,
            line:           line + 1,
            kind:           c.kind,
            element:        tagName,
            proposed_id:    stem + '.' + c.kind + '_' + tagName,
            already_tagged: c.already_tagged,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
}

function getTagName(node: ts.JsxTagNameExpression): string | null {
  if (ts.isIdentifier(node)) {
    const text = node.text;
    // Intrinsic JSX elements are lowercase. Components (PascalCase)
    // are skipped -- we don't recurse into custom components from
    // here; the apply step handles them once Forge knows their
    // role.
    return text[0] === text[0]?.toLowerCase() ? text : null;
  }
  return null;
}

interface Classification {
  kind: CandidateKind;
  already_tagged: boolean;
}

function classify(
  tag: string,
  node: ts.JsxOpeningElement | ts.JsxSelfClosingElement
): Classification | null {
  const hasOnClick     = hasAttribute(node, 'onClick');
  const hasDataNacId   = hasAttribute(node, 'data-nac-id');

  if (FIELD_TAGS.has(tag)) {
    return { kind: 'field', already_tagged: hasDataNacId };
  }
  if (INTRINSIC_ACTION_TAGS.has(tag) || hasOnClick) {
    return { kind: 'action', already_tagged: hasDataNacId };
  }
  if (REGION_TAGS.has(tag)) {
    return { kind: 'region', already_tagged: hasDataNacId };
  }
  return null;
}

function hasAttribute(
  node: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
  name: string
): boolean {
  for (const attr of node.attributes.properties) {
    if (ts.isJsxAttribute(attr)) {
      const n = attr.name;
      if (ts.isIdentifier(n) && n.text === name) return true;
      if (ts.isJsxNamespacedName(n)
          && (n.namespace.text + ':' + n.name.text) === name) return true;
      // data-* attrs come through as a single identifier with a dash:
      if (ts.isIdentifier(n) && n.escapedText === name) return true;
      // ts uses an unparsed token for kebab-case attrs; getText handles it.
      const raw = n.getText();
      if (raw === name) return true;
    }
  }
  return false;
}

function fileStem(rel: string): string {
  // src/pages/Invoice.tsx -> pages.invoice
  // src/App.tsx           -> app
  // components/Foo/Bar.tsx -> components.foo.bar
  const noExt = rel.replace(/\.(tsx|jsx)$/, '');
  const stripped = noExt.replace(/^src[\\/]/, '');
  return stripped
    .split(/[\\/]+/)
    .map((part) => part.toLowerCase())
    .join('.');
}

function toPosix(p: string): string {
  return p.replace(/\\/g, '/');
}
