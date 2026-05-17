/**
 * Tests for the migration audit walker. Builds a synthetic React
 * project under a temp dir + runs auditProject + asserts on the
 * candidate list.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { auditProject } from '../src/migrate/audit.js';

let projectRoot = '';

beforeEach(async () => {
  projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'yf-audit-'));
  await fs.mkdir(path.join(projectRoot, 'src'), { recursive: true });
  await fs.mkdir(path.join(projectRoot, 'src', 'pages'), { recursive: true });
  await fs.mkdir(path.join(projectRoot, 'node_modules', 'noise'), { recursive: true });
});

afterEach(async () => {
  await fs.rm(projectRoot, { recursive: true, force: true });
});

async function writeFile(rel: string, body: string): Promise<void> {
  await fs.writeFile(path.join(projectRoot, rel), body);
}

describe('auditProject', () => {
  it('finds intrinsic action + field + region candidates', async () => {
    await writeFile('src/App.tsx', [
      'export const App = () => (',
      '  <main>',
      '    <input type="text" />',
      '    <button>Save</button>',
      '    <a href="#">link</a>',
      '    <section><p>hi</p></section>',
      '  </main>',
      ');',
    ].join('\n'));
    const r = await auditProject({ projectRoot });
    expect(r.scanned_files).toBe(1);
    const kinds = r.candidates.map((c) => c.kind).sort();
    expect(kinds).toEqual(['action', 'action', 'field', 'region', 'region']);
    // No element should have already_tagged=true.
    expect(r.summary.already_tagged).toBe(0);
  });

  it('flags already_tagged when data-nac-id is present', async () => {
    await writeFile('src/Form.tsx', [
      'export const Form = () => (',
      '  <form>',
      '    <input data-nac-id="form.email" />',
      '    <button data-nac-id="form.save">Save</button>',
      '  </form>',
      ');',
    ].join('\n'));
    const r = await auditProject({ projectRoot });
    expect(r.summary.already_tagged).toBe(2);
    for (const c of r.candidates) {
      expect(c.already_tagged).toBe(true);
    }
  });

  it('flags arbitrary tags with onClick as action candidates', async () => {
    await writeFile('src/Card.tsx', [
      'export const Card = ({ onPick }) => (',
      '  <div onClick={onPick}>click me</div>',
      ');',
    ].join('\n'));
    const r = await auditProject({ projectRoot });
    expect(r.summary.actions).toBe(1);
    expect(r.candidates[0]?.element).toBe('div');
  });

  it('skips PascalCase components (left for future passes)', async () => {
    await writeFile('src/App.tsx', [
      'import { Button } from "./Button";',
      'export const App = () => <Button onClick={()=>{}}>x</Button>;',
    ].join('\n'));
    const r = await auditProject({ projectRoot });
    expect(r.summary.total).toBe(0);
  });

  it('walks subdirectories + produces dotted proposed_id', async () => {
    await writeFile('src/pages/Invoice.tsx', [
      'export const Invoice = () => <button>save</button>;',
    ].join('\n'));
    const r = await auditProject({ projectRoot });
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0]?.proposed_id).toBe('pages.invoice.action_button');
    expect(r.candidates[0]?.file).toBe('src/pages/Invoice.tsx');
  });

  it('ignores node_modules + dist + .git', async () => {
    await writeFile('node_modules/noise/index.tsx',
      'export const X = () => <button>nope</button>;');
    await fs.mkdir(path.join(projectRoot, 'src', 'dist'), { recursive: true });
    await writeFile('src/A.tsx', 'export const A = () => <button>a</button>;');
    const r = await auditProject({ projectRoot });
    expect(r.scanned_files).toBe(1);
    expect(r.summary.actions).toBe(1);
  });

  it('rejects projects without a src/', async () => {
    const bare = await fs.mkdtemp(path.join(os.tmpdir(), 'yf-bare-'));
    try {
      await expect(auditProject({ projectRoot: bare })).rejects.toThrow(/no src/);
    } finally {
      await fs.rm(bare, { recursive: true, force: true });
    }
  });

  it('reports zero candidates on a clean project', async () => {
    await writeFile('src/App.tsx', 'export const App = () => "hello";');
    const r = await auditProject({ projectRoot });
    expect(r.summary.total).toBe(0);
  });
});
