/**
 * Tests for the template engine. Exercises token substitution +
 * walk-and-copy semantics against a controlled fixture so the
 * assertions don't depend on the real templates/react-app/ layout.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  scaffold,
  applyTokens,
  isValidSlug,
  titleCaseFromSlug,
  type TemplateContext,
} from '../src/template/index.js';

let tmpRoot = '';
let templatesDir = '';
let target = '';

const ctx: TemplateContext = {
  projectSlug: 'my-app',
  projectName: 'My App',
  licenseRef:  'trial',
};

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'yf-tmpl-'));
  templatesDir = path.join(tmpRoot, 'templates');
  target = path.join(tmpRoot, 'out');

  // Build a minimal fixture template.
  const fixtureDir = path.join(templatesDir, 'fixture');
  await fs.mkdir(path.join(fixtureDir, 'src'), { recursive: true });
  await fs.writeFile(
    path.join(fixtureDir, 'package.json'),
    JSON.stringify({ name: '%%PROJECT_SLUG%%', desc: '%%PROJECT_NAME%%' }, null, 2)
  );
  await fs.writeFile(
    path.join(fixtureDir, 'src', 'App.tsx'),
    '// %%PROJECT_NAME%% generated\nexport const slug = "%%PROJECT_SLUG%%";\n'
  );
  await fs.writeFile(path.join(fixtureDir, '.gitignore'), 'node_modules/\n');
  // A "binary" file (we treat .png as binary -- bytes are arbitrary).
  await fs.writeFile(path.join(fixtureDir, 'logo.png'), Buffer.from([0, 1, 2, 3, 4]));
});

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

describe('applyTokens', () => {
  it('substitutes all three tokens', () => {
    const out = applyTokens('slug=%%PROJECT_SLUG%% name=%%PROJECT_NAME%% lic=%%LICENSE_REF%%', ctx);
    expect(out).toBe('slug=my-app name=My App lic=trial');
  });
  it('leaves unrelated text alone', () => {
    expect(applyTokens('no tokens here', ctx)).toBe('no tokens here');
  });
});

describe('isValidSlug', () => {
  it.each([
    ['my-app',     true],
    ['yujin-koe',  true],
    ['a1b',        true],
    ['ab',         false],          // too short
    ['My-App',     false],          // uppercase
    ['1abc',       false],          // starts with digit
    ['my_app',     false],          // underscore
    ['my.app',     false],          // dot
  ])('slug %s -> %s', (slug, ok) => {
    expect(isValidSlug(slug)).toBe(ok);
  });
});

describe('titleCaseFromSlug', () => {
  it('dashes', () => { expect(titleCaseFromSlug('my-todo-app')).toBe('My Todo App'); });
  it('underscores', () => { expect(titleCaseFromSlug('yujin_koe')).toBe('Yujin Koe'); });
  it('mixed', () => { expect(titleCaseFromSlug('a-b_c')).toBe('A B C'); });
});

describe('scaffold', () => {
  it('writes the fixture with tokens substituted', async () => {
    const r = await scaffold({
      templateName: 'fixture',
      targetDir: target,
      ctx,
      refuseIfNonEmpty: true,
    }, templatesDir);

    expect(r.files.length).toBe(4);
    const pkg = JSON.parse(await fs.readFile(path.join(target, 'package.json'), 'utf-8'));
    expect(pkg.name).toBe('my-app');
    expect(pkg.desc).toBe('My App');

    const app = await fs.readFile(path.join(target, 'src', 'App.tsx'), 'utf-8');
    expect(app).toContain('My App generated');
    expect(app).toContain('slug = "my-app"');

    const gi = await fs.readFile(path.join(target, '.gitignore'), 'utf-8');
    expect(gi).toBe('node_modules/\n');

    // Binary survives byte-for-byte.
    const png = await fs.readFile(path.join(target, 'logo.png'));
    expect(Array.from(png)).toEqual([0, 1, 2, 3, 4]);
  });

  it('refuses a non-empty target by default', async () => {
    await fs.mkdir(target, { recursive: true });
    await fs.writeFile(path.join(target, 'existing.txt'), 'hi');
    await expect(scaffold({
      templateName: 'fixture',
      targetDir: target,
      ctx,
      refuseIfNonEmpty: true,
    }, templatesDir)).rejects.toThrow(/not empty/);
  });

  it('overwrites when refuseIfNonEmpty=false', async () => {
    await fs.mkdir(target, { recursive: true });
    await fs.writeFile(path.join(target, 'package.json'), 'OLD');
    const r = await scaffold({
      templateName: 'fixture',
      targetDir: target,
      ctx,
      refuseIfNonEmpty: false,
    }, templatesDir);
    expect(r.files.length).toBeGreaterThan(0);
    const pkg = await fs.readFile(path.join(target, 'package.json'), 'utf-8');
    expect(pkg).not.toBe('OLD');
  });

  it('throws when the template does not exist', async () => {
    await expect(scaffold({
      templateName: 'ghost',
      targetDir: target,
      ctx,
      refuseIfNonEmpty: true,
    }, templatesDir)).rejects.toThrow(/not found/);
  });
});
