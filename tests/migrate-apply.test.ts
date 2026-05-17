/**
 * Tests for the migration apply step. Asserts edits are byte-
 * preserving everywhere except at the insertion points + are
 * idempotent (second apply finds no work).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyMigration, applyEditsToSource } from '../src/migrate/apply.js';
import { auditProject } from '../src/migrate/audit.js';
import type { Candidate } from '../src/migrate/types.js';

let projectRoot = '';

beforeEach(async () => {
  projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'yf-apply-'));
  await fs.mkdir(path.join(projectRoot, 'src'), { recursive: true });
});

afterEach(async () => {
  await fs.rm(projectRoot, { recursive: true, force: true });
});

async function writeFile(rel: string, body: string): Promise<void> {
  await fs.writeFile(path.join(projectRoot, rel), body);
}

async function readFile(rel: string): Promise<string> {
  return fs.readFile(path.join(projectRoot, rel), 'utf-8');
}

describe('applyEditsToSource', () => {
  it('inserts attrs right after the tag name on a self-closing element', () => {
    const src = '<input type="text" />';
    const cands: Candidate[] = [{
      file: 'x', line: 1, kind: 'field', element: 'input',
      proposed_id: 'foo.field_input', already_tagged: false,
    }];
    const out = applyEditsToSource(src, 'x.tsx', cands);
    expect(out).toBe('<input data-nac-id="foo.field_input" data-nac-role="field" type="text" />');
  });

  it('handles multiple inserts in one file with correct offsets', () => {
    const src = '<main><button>x</button><input/></main>';
    // No need to be precise about line -- apply.ts re-derives the
    // candidate-match position via AST. Use the same line for all.
    const cands: Candidate[] = [
      { file: 'x', line: 1, kind: 'region', element: 'main',
        proposed_id: 'foo.region_main', already_tagged: false },
      { file: 'x', line: 1, kind: 'action', element: 'button',
        proposed_id: 'foo.action_button', already_tagged: false },
      { file: 'x', line: 1, kind: 'field',  element: 'input',
        proposed_id: 'foo.field_input', already_tagged: false },
    ];
    const out = applyEditsToSource(src, 'x.tsx', cands);
    expect(out).toContain('<main data-nac-id="foo.region_main"');
    expect(out).toContain('<button data-nac-id="foo.action_button"');
    expect(out).toContain('<input data-nac-id="foo.field_input"');
  });

  it('skips elements that already carry data-nac-id', () => {
    const src = '<button data-nac-id="form.save">save</button>';
    const cands: Candidate[] = [{
      file: 'x', line: 1, kind: 'action', element: 'button',
      proposed_id: 'form.action_button', already_tagged: true,
    }];
    const out = applyEditsToSource(src, 'x.tsx', cands);
    expect(out).toBe(src);
  });
});

describe('applyMigration', () => {
  it('writes edited content to disk', async () => {
    await writeFile('src/App.tsx',
      'export const App = () => <button>Save</button>;'
    );
    const r = await applyMigration({ projectRoot });
    expect(r.wrote).toBe(true);
    expect(r.edited_files).toHaveLength(1);
    const content = await readFile('src/App.tsx');
    expect(content).toContain('data-nac-id="app.action_button"');
    expect(content).toContain('data-nac-role="action"');
  });

  it('dryRun returns edits without touching disk', async () => {
    const orig = 'export const A = () => <input/>;';
    await writeFile('src/A.tsx', orig);
    const r = await applyMigration({ projectRoot, dryRun: true });
    expect(r.wrote).toBe(false);
    expect(r.edited_files).toHaveLength(1);
    expect(r.edited_files[0]?.newContent).toContain('data-nac-id="a.field_input"');
    const onDisk = await readFile('src/A.tsx');
    expect(onDisk).toBe(orig);
  });

  it('is idempotent: second pass finds nothing to do', async () => {
    await writeFile('src/A.tsx',
      'export const A = () => <button>x</button>;'
    );
    const first  = await applyMigration({ projectRoot });
    const second = await applyMigration({ projectRoot });
    expect(first.edited_files.length).toBe(1);
    expect(second.edited_files.length).toBe(0);
  });

  it('preserves bytes outside insertion points', async () => {
    const src = [
      '// header comment kept',
      'export const App = () => (',
      '  <main>',
      '    <button onClick={() => {}}>Save</button>',
      '  </main>',
      ');',
      '',
    ].join('\n');
    await writeFile('src/App.tsx', src);

    await applyMigration({ projectRoot });
    const out = await readFile('src/App.tsx');
    expect(out).toContain('// header comment kept');
    expect(out).toContain('onClick={() => {}}');
    expect(out.split('\n').length).toBe(src.split('\n').length);
  });

  it('audit then apply: counts match', async () => {
    await writeFile('src/App.tsx', [
      'export const App = () => (',
      '  <main><button>x</button><input/></main>',
      ');',
    ].join('\n'));
    const a = await auditProject({ projectRoot });
    const r = await applyMigration({ projectRoot, dryRun: true });
    const todo = a.summary.total - a.summary.already_tagged;
    const inserted = r.edited_files.reduce((sum, e) => sum + e.inserts, 0);
    expect(inserted).toBe(todo);
  });
});
