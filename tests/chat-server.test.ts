/**
 * Integration tests for the chat server. Starts the server on an
 * ephemeral port + hits it with real fetch. Claude client is
 * injected as a fake.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startChatServer, type StartedServer } from '../src/chat/server.js';
import {
  ClaudeClient,
  ConfigurationError,
  ClaudeApiError,
  type ChatMessage,
} from '../src/chat/claude.js';

class FakeClaude extends ClaudeClient {
  reply = 'Listo, qué necesitás.';
  failWith: Error | null = null;
  captured: ChatMessage[] = [];
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  override async chat(req: { messages: ChatMessage[] }): Promise<any> {
    this.captured = req.messages;
    if (this.failWith) throw this.failWith;
    return {
      text:      this.reply,
      tokensIn:  5,
      tokensOut: 7,
      model:     'claude-fake',
    };
  }
}

let projectRoot = '';
let started: StartedServer | null = null;

async function makeProject(): Promise<void> {
  await fs.writeFile(path.join(projectRoot, 'yujin.forge.json'), JSON.stringify({
    project_slug: 'demo',
    project_name: 'Demo',
    forge_version: '0.1.0',
    nac_version: '2.3.x',
  }, null, 2));
  await fs.mkdir(path.join(projectRoot, 'src'), { recursive: true });
}

beforeEach(async () => {
  projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'yf-srv-'));
  await makeProject();
});

afterEach(async () => {
  if (started) await started.close();
  started = null;
  await fs.rm(projectRoot, { recursive: true, force: true });
});

describe('chat server', () => {
  it('GET / serves the panel HTML with project name interpolated', async () => {
    started = await startChatServer({
      projectRoot, port: 0,
      claude: new FakeClaude({ apiKey: 'x' }),
    });
    const port = (started.server.address() as { port: number }).port;
    const r = await fetch('http://127.0.0.1:' + port + '/');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('text/html');
    const body = await r.text();
    expect(body).toContain('Yujin Forge');
    expect(body).toContain('Demo');
  });

  it('GET /api/health returns ok + version + project', async () => {
    started = await startChatServer({
      projectRoot, port: 0,
      claude: new FakeClaude({ apiKey: 'x' }),
    });
    const port = (started.server.address() as { port: number }).port;
    const r = await fetch('http://127.0.0.1:' + port + '/api/health');
    expect(r.status).toBe(200);
    const data = await r.json() as any;
    expect(data.ok).toBe(true);
    expect(data.project.name).toBe('Demo');
    expect(typeof data.version).toBe('string');
  });

  it('POST /api/chat returns the assistant text + persists', async () => {
    const fake = new FakeClaude({ apiKey: 'x' });
    fake.reply = 'Pediles ayuda con el slot.';
    started = await startChatServer({ projectRoot, port: 0, claude: fake });
    const port = (started.server.address() as { port: number }).port;
    const r = await fetch('http://127.0.0.1:' + port + '/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'qué hago primero?' }],
      }),
    });
    expect(r.status).toBe(200);
    const body = await r.json() as any;
    expect(body.ok).toBe(true);
    expect(body.message.text).toBe('Pediles ayuda con el slot.');
    expect(body.tokens.in).toBe(5);

    // Persistence flushed eventually -- give it a tick.
    await started.store.flush();
    const transcriptRaw = await fs.readFile(started.store.filePath, 'utf-8');
    const transcript = JSON.parse(transcriptRaw);
    expect(transcript.messages).toHaveLength(2);
    expect(transcript.messages[0]).toEqual({ role: 'user', content: 'qué hago primero?' });
    expect(transcript.messages[1].role).toBe('assistant');
  });

  it('POST /api/chat rejects empty messages', async () => {
    started = await startChatServer({
      projectRoot, port: 0,
      claude: new FakeClaude({ apiKey: 'x' }),
    });
    const port = (started.server.address() as { port: number }).port;
    const r = await fetch('http://127.0.0.1:' + port + '/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [] }),
    });
    expect(r.status).toBe(400);
  });

  it('POST /api/chat translates ConfigurationError to 503', async () => {
    const fake = new FakeClaude({ apiKey: 'x' });
    fake.failWith = new ConfigurationError('no key');
    started = await startChatServer({ projectRoot, port: 0, claude: fake });
    const port = (started.server.address() as { port: number }).port;
    const r = await fetch('http://127.0.0.1:' + port + '/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
    });
    expect(r.status).toBe(503);
    const data = await r.json() as any;
    expect(data.code).toBe('no_api_key');
  });

  it('POST /api/chat translates ClaudeApiError to 502', async () => {
    const fake = new FakeClaude({ apiKey: 'x' });
    fake.failWith = new ClaudeApiError('rate limited', 429);
    started = await startChatServer({ projectRoot, port: 0, claude: fake });
    const port = (started.server.address() as { port: number }).port;
    const r = await fetch('http://127.0.0.1:' + port + '/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
    });
    expect(r.status).toBe(502);
    const data = await r.json() as any;
    expect(data.code).toBe('claude_api_error');
  });

  it('falls back to package.json name when yujin.forge.json is missing', async () => {
    await fs.unlink(path.join(projectRoot, 'yujin.forge.json'));
    await fs.writeFile(path.join(projectRoot, 'package.json'),
      JSON.stringify({ name: 'pkg-only-app' }));
    started = await startChatServer({
      projectRoot, port: 0,
      claude: new FakeClaude({ apiKey: 'x' }),
    });
    const port = (started.server.address() as { port: number }).port;
    const r = await fetch('http://127.0.0.1:' + port + '/api/health');
    const data = await r.json() as any;
    expect(data.project.name).toBe('pkg-only-app');
  });

  it('unknown routes return 404', async () => {
    started = await startChatServer({
      projectRoot, port: 0,
      claude: new FakeClaude({ apiKey: 'x' }),
    });
    const port = (started.server.address() as { port: number }).port;
    const r = await fetch('http://127.0.0.1:' + port + '/api/ghost');
    expect(r.status).toBe(404);
  });
});
