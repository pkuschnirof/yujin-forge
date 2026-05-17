/**
 * Tests for the project validator.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateProject } from '../src/validate/index.js';

let projectRoot = '';

beforeEach(async () => {
  projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'yf-val-'));
});

afterEach(async () => {
  await fs.rm(projectRoot, { recursive: true, force: true });
});

async function writeForgeJson(body: object): Promise<void> {
  await fs.writeFile(path.join(projectRoot, 'yujin.forge.json'), JSON.stringify(body, null, 2));
}
async function writePackageJson(body: object): Promise<void> {
  await fs.writeFile(path.join(projectRoot, 'package.json'), JSON.stringify(body, null, 2));
}
async function makeSrc(): Promise<void> {
  await fs.mkdir(path.join(projectRoot, 'src'), { recursive: true });
}

describe('validateProject', () => {
  it('returns ok=true for a complete project', async () => {
    await writeForgeJson({
      project_slug: 'my-app',
      project_name: 'My App',
      forge_version: '0.1.0',
      nac_version: '2.3.x',
    });
    await writePackageJson({
      name: 'my-app',
      dependencies: { '@yujin/nac': '2.3.0' },
    });
    await makeSrc();

    const r = await validateProject({ projectRoot });
    expect(r.ok).toBe(true);
    expect(r.findings).toEqual([]);
  });

  it('errors when yujin.forge.json is missing', async () => {
    await makeSrc();
    await writePackageJson({ name: 'x', dependencies: { '@yujin/nac': '*' } });
    const r = await validateProject({ projectRoot });
    expect(r.ok).toBe(false);
    expect(r.findings.find((f) => f.code === 'forge_json_missing')).toBeDefined();
  });

  it('errors when yujin.forge.json is unparseable', async () => {
    await fs.writeFile(path.join(projectRoot, 'yujin.forge.json'), '{not json');
    await writePackageJson({ name: 'x', dependencies: { '@yujin/nac': '*' } });
    await makeSrc();
    const r = await validateProject({ projectRoot });
    expect(r.findings.find((f) => f.code === 'forge_json_unparseable')).toBeDefined();
  });

  it('errors per missing required field', async () => {
    await writeForgeJson({ project_slug: 'x' });
    await writePackageJson({ name: 'x', dependencies: { '@yujin/nac': '*' } });
    await makeSrc();
    const r = await validateProject({ projectRoot });
    const missing = r.findings.filter((f) => f.code === 'forge_json_missing_field');
    // 3 required fields are missing (project_name, forge_version, nac_version)
    expect(missing).toHaveLength(3);
  });

  it('errors on invalid slug', async () => {
    await writeForgeJson({
      project_slug: 'Bad_Slug!',
      project_name: 'x', forge_version: '0', nac_version: '0',
    });
    await writePackageJson({ name: 'x', dependencies: { '@yujin/nac': '*' } });
    await makeSrc();
    const r = await validateProject({ projectRoot });
    expect(r.findings.find((f) => f.code === 'forge_json_invalid_slug')).toBeDefined();
  });

  it('warns when no @yujin/nac dep is declared', async () => {
    await writeForgeJson({
      project_slug: 'good',
      project_name: 'G', forge_version: '0', nac_version: '0',
    });
    await writePackageJson({ name: 'good', dependencies: { 'react': '*' } });
    await makeSrc();
    const r = await validateProject({ projectRoot });
    const warn = r.findings.find((f) => f.code === 'package_json_no_nac_dep');
    expect(warn).toBeDefined();
    expect(warn?.severity).toBe('warn');
    // Default mode: warnings don't fail.
    expect(r.ok).toBe(true);
  });

  it('strict mode turns warnings into failures', async () => {
    await writeForgeJson({
      project_slug: 'good',
      project_name: 'G', forge_version: '0', nac_version: '0',
    });
    await writePackageJson({ name: 'good', dependencies: { 'react': '*' } });
    await makeSrc();
    const r = await validateProject({ projectRoot, strict: true });
    expect(r.ok).toBe(false);
  });

  it('errors when src/ is missing', async () => {
    await writeForgeJson({
      project_slug: 'x',
      project_name: 'x', forge_version: '0', nac_version: '0',
    });
    await writePackageJson({ name: 'x', dependencies: { '@yujin/nac': '*' } });
    const r = await validateProject({ projectRoot });
    expect(r.findings.find((f) => f.code === 'src_missing')).toBeDefined();
  });

  it('detects @yujin/nac in devDependencies too', async () => {
    await writeForgeJson({
      project_slug: 'x',
      project_name: 'x', forge_version: '0', nac_version: '0',
    });
    await writePackageJson({ name: 'x', devDependencies: { '@yujin/nac-commercial': '1' } });
    await makeSrc();
    const r = await validateProject({ projectRoot });
    expect(r.findings.find((f) => f.code === 'package_json_no_nac_dep')).toBeUndefined();
  });
});
