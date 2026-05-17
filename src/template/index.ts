/**
 * Yujin Forge -- template engine.
 *
 * Reads a starter template from the package's templates/<name>/
 * directory, applies token substitution, and writes the materialised
 * project to a target directory.
 *
 * Tokens (case-sensitive, matched literally):
 *
 *   %%PROJECT_SLUG%%      slug passed to `yf new <slug>`
 *   %%PROJECT_NAME%%      human-friendly name (default = title-cased slug)
 *   %%LICENSE_REF%%       license reference (paid seat token or 'trial')
 *
 * Binary files (images, archives, fonts) are passed through
 * unchanged. The text-vs-binary detection is extension-based --
 * cheap, deterministic, and avoids partial reads that would break
 * UTF-8 substitution.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Files we touch as UTF-8 text + substitute tokens in. */
const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.json', '.md', '.css', '.html', '.txt',
  '.yml', '.yaml', '.toml', '.lock',
  '.gitignore', '.npmrc', '.env', '.env.example',
]);

export interface TemplateContext {
  projectSlug: string;
  projectName: string;
  licenseRef: string;
}

export interface ScaffoldOptions {
  /** Template id under templates/ (e.g. 'react-app'). */
  templateName: string;
  /** Absolute path of the target directory. */
  targetDir: string;
  /** Substitution values. */
  ctx: TemplateContext;
  /**
   * If true, refuse to write into a non-empty target dir.
   * If false, overwrite existing files (no merge, no rename).
   */
  refuseIfNonEmpty: boolean;
}

export interface ScaffoldResult {
  files: string[];
}

/**
 * Resolve the absolute path of the bundled templates directory.
 *
 * Works in three runtimes:
 *   - tsx dev: src/commands/new.ts -> ../../templates/
 *   - tsc out: dist/commands/new.js -> ../../templates/
 *   - npm pkg: node_modules/.../dist/commands/new.js -> same
 *
 * Exported so tests can override via templatesDirForTest() when
 * exercising the scaffolder against a controlled fixture.
 */
export function defaultTemplatesDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..', '..', 'templates');
}

export async function scaffold(opts: ScaffoldOptions, templatesDir?: string): Promise<ScaffoldResult> {
  const root = templatesDir ?? defaultTemplatesDir();
  const src = path.join(root, opts.templateName);

  await assertTemplateExists(src, opts.templateName);
  await assertTargetWritable(opts.targetDir, opts.refuseIfNonEmpty);

  await fs.mkdir(opts.targetDir, { recursive: true });
  const written: string[] = [];
  await walkAndCopy(src, opts.targetDir, opts.ctx, written);
  written.sort();
  return { files: written };
}

async function assertTemplateExists(dir: string, name: string): Promise<void> {
  try {
    const stat = await fs.stat(dir);
    if (!stat.isDirectory()) {
      throw new Error(`template '${name}' is not a directory at ${dir}`);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`template '${name}' not found (looked in ${dir})`);
    }
    throw err;
  }
}

async function assertTargetWritable(dir: string, refuseIfNonEmpty: boolean): Promise<void> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw err;
  }
  if (refuseIfNonEmpty && entries.length > 0) {
    throw new Error(
      `target directory ${dir} is not empty (use --force to overwrite, or pick a different --dir)`
    );
  }
}

async function walkAndCopy(
  srcDir: string,
  destDir: string,
  ctx: TemplateContext,
  written: string[]
): Promise<void> {
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath  = path.join(srcDir,  entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      await fs.mkdir(destPath, { recursive: true });
      await walkAndCopy(srcPath, destPath, ctx, written);
      continue;
    }

    if (entry.isFile()) {
      const ext = path.extname(entry.name);
      const isText = TEXT_EXTENSIONS.has(ext) || isDotConfig(entry.name);
      if (isText) {
        const raw = await fs.readFile(srcPath, 'utf-8');
        await fs.writeFile(destPath, applyTokens(raw, ctx), 'utf-8');
      } else {
        await fs.copyFile(srcPath, destPath);
      }
      written.push(destPath);
    }
  }
}

function isDotConfig(name: string): boolean {
  // Cover dotfiles without a recognised extension (.gitignore,
  // .npmrc, .env, .env.example etc).
  return name.startsWith('.') && !name.includes('.', 1);
}

export function applyTokens(input: string, ctx: TemplateContext): string {
  return input
    .replace(/%%PROJECT_SLUG%%/g, ctx.projectSlug)
    .replace(/%%PROJECT_NAME%%/g, ctx.projectName)
    .replace(/%%LICENSE_REF%%/g,  ctx.licenseRef);
}

/**
 * Title-case a slug for the human-readable project name.
 *   "my-todos" -> "My Todos"
 *   "yujin-koe" -> "Yujin Koe"
 */
export function titleCaseFromSlug(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter((part) => part.length > 0)
    .map((part) => part[0]!.toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Validate a project slug. NAC + npm conventions:
 *   - lowercase
 *   - alphanumeric + dash
 *   - 3..40 chars
 *   - must start with a letter
 */
export function isValidSlug(slug: string): boolean {
  return /^[a-z][a-z0-9-]{2,39}$/.test(slug);
}
