/**
 * Tests for the transcript store. Writes to a temp project dir +
 * verifies the file landing in .yujin-forge/cache/chat/.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  TranscriptStore,
  sessionFilename,
  cacheDir,
} from '../src/chat/persistence.js';

let projectRoot = '';

beforeEach(async () => {
  projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'yf-tx-'));
});

afterEach(async () => {
  await fs.rm(projectRoot, { recursive: true, force: true });
});

describe('sessionFilename', () => {
  it('matches the YYYY-MM-DD_HHMMSS_xxxxxx.json pattern', () => {
    const name = sessionFilename(new Date('2026-05-17T21:23:54Z'));
    expect(name).toMatch(/^2026-05-17_212354_[A-Za-z0-9]{6}\.json$/);
  });

  it('generates distinct names on rapid succession', () => {
    const a = sessionFilename(new Date('2026-05-17T21:23:54Z'));
    const b = sessionFilename(new Date('2026-05-17T21:23:54Z'));
    expect(a).not.toBe(b); // random suffix differs
  });
});

describe('cacheDir', () => {
  it('points at .yujin-forge/cache/chat/ under the project', () => {
    expect(cacheDir('/foo/bar')).toBe(path.join('/foo/bar', '.yujin-forge', 'cache', 'chat'));
  });
});

describe('TranscriptStore', () => {
  it('writes the transcript file on flush', async () => {
    const store = new TranscriptStore(projectRoot, '0.1.0');
    store.append({ role: 'user',      content: 'hola' });
    store.append({ role: 'assistant', content: 'que tal' });
    await store.flush();
    const raw = await fs.readFile(store.filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.messages).toHaveLength(2);
    expect(parsed.meta.forgeVersion).toBe('0.1.0');
    expect(parsed.meta.projectRoot).toBe(projectRoot);
  });

  it('flush is idempotent when nothing is dirty', async () => {
    const store = new TranscriptStore(projectRoot, '0.1.0');
    store.append({ role: 'user', content: 'x' });
    await store.flush();
    const statBefore = await fs.stat(store.filePath);
    // no append between the two flushes
    await store.flush();
    const statAfter  = await fs.stat(store.filePath);
    expect(statAfter.mtimeMs).toBe(statBefore.mtimeMs);
  });

  it('append + flush + append + flush appends the new messages', async () => {
    const store = new TranscriptStore(projectRoot, '0.1.0');
    store.append({ role: 'user', content: 'a' });
    await store.flush();
    store.append({ role: 'assistant', content: 'b' });
    await store.flush();
    const parsed = JSON.parse(await fs.readFile(store.filePath, 'utf-8'));
    expect(parsed.messages).toHaveLength(2);
  });

  it('uses a custom filename when provided', async () => {
    const store = new TranscriptStore(projectRoot, '0.1.0', 'my-session.json');
    expect(path.basename(store.filePath)).toBe('my-session.json');
    store.append({ role: 'user', content: 'hi' });
    await store.flush();
    const exists = await fs.access(store.filePath).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });
});
