/**
 * Yujin Forge -- Claude API client (minimal).
 *
 * Wraps the Anthropic /v1/messages endpoint. Day-1 scope is just
 * chat completion -- the tool-use loop (function calling against
 * NAC tools) lands when @yujin/nac publishes + the chat panel
 * has tools to expose.
 *
 * API key resolution order:
 *   1. options.apiKey (test injection)
 *   2. process.env.YUJIN_ANTHROPIC_API_KEY
 *   3. process.env.ANTHROPIC_API_KEY
 *   4. ~/.yujin-forge/api-key.txt (one line, plain text)
 *
 * Falls through with a clear ConfigurationError when none of the
 * above resolves.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { configDir } from '../license/index.js';

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export class ClaudeApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ClaudeApiError';
    this.status = status;
  }
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ClaudeChatRequest {
  /** Conversation history, oldest first. */
  messages: ChatMessage[];
  /** System prompt (single string, the Anthropic API accepts one). */
  system?: string;
  /** Hard cap on output tokens. */
  maxTokens?: number;
  /** Override the default model. */
  model?: string;
}

export interface ClaudeChatResponse {
  text: string;
  tokensIn: number;
  tokensOut: number;
  model: string;
}

export interface ClaudeClientOptions {
  apiKey?: string;
  /** Default model. */
  defaultModel?: string;
  /** Test injection for fetch (Node 18+ has global fetch). */
  fetchImpl?: typeof fetch;
}

/**
 * Resolve the API key per the priority list at the top of the
 * module. Throws ConfigurationError when nothing is found so the
 * CLI can print a precise nudge.
 */
export async function resolveApiKey(injected?: string): Promise<string> {
  if (injected && injected.trim() !== '') return injected.trim();
  const fromEnv = process.env['YUJIN_ANTHROPIC_API_KEY']
              ?? process.env['ANTHROPIC_API_KEY'];
  if (fromEnv && fromEnv.trim() !== '') return fromEnv.trim();
  const filePath = path.join(configDir(), 'api-key.txt');
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const trimmed = raw.trim();
    if (trimmed !== '') return trimmed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  throw new ConfigurationError(
    'no Anthropic API key found. Set YUJIN_ANTHROPIC_API_KEY env or '
    + 'drop the key into ~/.yujin-forge/api-key.txt'
  );
}

const DEFAULT_MODEL = 'claude-sonnet-4-6';

export class ClaudeClient {
  private apiKey: string | null;
  private fetchImpl: typeof fetch;
  private defaultModel: string;

  constructor(opts: ClaudeClientOptions = {}) {
    this.apiKey = opts.apiKey ?? null;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.defaultModel = opts.defaultModel ?? DEFAULT_MODEL;
  }

  async chat(req: ClaudeChatRequest): Promise<ClaudeChatResponse> {
    if (this.apiKey === null) {
      this.apiKey = await resolveApiKey();
    }
    const model = req.model ?? this.defaultModel;
    const body = {
      model,
      max_tokens: req.maxTokens ?? 1024,
      ...(req.system ? { system: req.system } : {}),
      messages: req.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    };
    const resp = await this.fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type':     'application/json',
        'x-api-key':        this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const detail = await safeText(resp);
      throw new ClaudeApiError(
        'Claude API ' + resp.status + ': ' + detail.slice(0, 500),
        resp.status
      );
    }
    const data = await resp.json() as {
      content?: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
      model?: string;
    };
    const text = (data.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('');
    return {
      text,
      tokensIn:  data.usage?.input_tokens  ?? 0,
      tokensOut: data.usage?.output_tokens ?? 0,
      model:     data.model ?? model,
    };
  }
}

async function safeText(r: Response): Promise<string> {
  try { return await r.text(); } catch { return '(no body)'; }
}
