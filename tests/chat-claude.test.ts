/**
 * Tests for the Claude client. Uses fetch injection so we never
 * touch the network.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ClaudeClient,
  ConfigurationError,
  ClaudeApiError,
  resolveApiKey,
} from '../src/chat/claude.js';

let tmpHome = '';
const originalHome = os.homedir();
const oldYujinKey  = process.env['YUJIN_ANTHROPIC_API_KEY'];
const oldAnthrKey  = process.env['ANTHROPIC_API_KEY'];

beforeEach(async () => {
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'yf-chat-'));
  process.env.HOME = tmpHome;
  process.env.USERPROFILE = tmpHome;
  delete process.env['YUJIN_ANTHROPIC_API_KEY'];
  delete process.env['ANTHROPIC_API_KEY'];
});

afterEach(async () => {
  process.env.HOME = originalHome;
  process.env.USERPROFILE = originalHome;
  if (oldYujinKey !== undefined) process.env['YUJIN_ANTHROPIC_API_KEY'] = oldYujinKey;
  if (oldAnthrKey !== undefined) process.env['ANTHROPIC_API_KEY']       = oldAnthrKey;
  await fs.rm(tmpHome, { recursive: true, force: true });
});

describe('resolveApiKey', () => {
  it('prefers the injected key', async () => {
    const k = await resolveApiKey('sk-test-injected');
    expect(k).toBe('sk-test-injected');
  });

  it('falls back to YUJIN_ANTHROPIC_API_KEY env', async () => {
    process.env['YUJIN_ANTHROPIC_API_KEY'] = 'sk-from-yujin-env';
    const k = await resolveApiKey();
    expect(k).toBe('sk-from-yujin-env');
  });

  it('falls back to ANTHROPIC_API_KEY env', async () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-from-anthropic-env';
    const k = await resolveApiKey();
    expect(k).toBe('sk-from-anthropic-env');
  });

  it('reads ~/.yujin-forge/api-key.txt as last resort', async () => {
    const forgeDir = path.join(tmpHome, '.yujin-forge');
    await fs.mkdir(forgeDir, { recursive: true });
    await fs.writeFile(path.join(forgeDir, 'api-key.txt'), 'sk-from-file\n');
    const k = await resolveApiKey();
    expect(k).toBe('sk-from-file');
  });

  it('throws ConfigurationError when nothing is configured', async () => {
    await expect(resolveApiKey()).rejects.toThrow(ConfigurationError);
  });
});

describe('ClaudeClient.chat', () => {
  it('posts the expected envelope + extracts the text', async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    const fakeFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      captured = { url: String(input), init: init ?? {} };
      return new Response(JSON.stringify({
        content: [{ type: 'text', text: 'Hola.' }],
        usage:   { input_tokens: 10, output_tokens: 20 },
        model:   'claude-test',
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const cli = new ClaudeClient({ apiKey: 'sk-test', fetchImpl: fakeFetch });
    const r = await cli.chat({
      messages: [{ role: 'user', content: 'hola' }],
      system: 'be helpful',
    });
    expect(r.text).toBe('Hola.');
    expect(r.tokensIn).toBe(10);
    expect(r.tokensOut).toBe(20);
    expect(r.model).toBe('claude-test');
    expect(captured!.url).toContain('api.anthropic.com/v1/messages');
    const sent = JSON.parse(String(captured!.init.body));
    expect(sent.system).toBe('be helpful');
    expect(sent.messages).toEqual([{ role: 'user', content: 'hola' }]);
    expect((captured!.init.headers as Record<string, string>)['x-api-key']).toBe('sk-test');
  });

  it('throws ClaudeApiError on non-2xx', async () => {
    const fakeFetch = async (): Promise<Response> => new Response('rate limited', { status: 429 });
    const cli = new ClaudeClient({ apiKey: 'sk', fetchImpl: fakeFetch });
    await expect(cli.chat({ messages: [{ role: 'user', content: 'x' }] }))
      .rejects.toThrow(ClaudeApiError);
  });

  it('joins multi-block text content', async () => {
    const fakeFetch = async (): Promise<Response> => new Response(JSON.stringify({
      content: [
        { type: 'text', text: 'one ' },
        { type: 'tool_use', id: 'x', name: 'y', input: {} },
        { type: 'text', text: 'two' },
      ],
      usage: {}, model: 'claude',
    }), { status: 200 });
    const cli = new ClaudeClient({ apiKey: 'sk', fetchImpl: fakeFetch });
    const r = await cli.chat({ messages: [{ role: 'user', content: 'x' }] });
    expect(r.text).toBe('one two');
  });
});
