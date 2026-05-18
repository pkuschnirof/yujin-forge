/**
 * Yujin Forge -- chat panel HTTP server.
 *
 * Routes (all on the local loopback port; CORS not needed):
 *
 *   GET  /                serves the panel HTML
 *   GET  /api/health      { ok: true, version, project }
 *   POST /api/chat        { messages } -> { ok, message }
 *
 * The server binds to 127.0.0.1 only -- never 0.0.0.0. Forge
 * chat is a local-developer tool; exposing it on the LAN would
 * leak the API key + the project source-aware system prompt.
 */
import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ClaudeClient, ConfigurationError, ClaudeApiError, type ChatMessage } from './claude.js';
import { renderPanelHtml } from './panel.js';
import { TranscriptStore } from './persistence.js';
import { VERSION } from '../version.js';

export interface StartOptions {
  projectRoot: string;
  port: number;
  /** Test injection -- defaults to a real ClaudeClient. */
  claude?: ClaudeClient;
}

export interface StartedServer {
  server: Server;
  url: string;
  store: TranscriptStore;
  close: () => Promise<void>;
}

export async function startChatServer(opts: StartOptions): Promise<StartedServer> {
  const projectName = await readProjectName(opts.projectRoot);
  const claude = opts.claude ?? new ClaudeClient();
  const store = new TranscriptStore(opts.projectRoot, VERSION);

  const server = createServer(async (req, res) => {
    try {
      await route(req, res, {
        projectRoot: opts.projectRoot,
        projectName,
        port: opts.port,
        claude,
        store,
      });
    } catch (err) {
      sendJson(res, 500, {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port, '127.0.0.1', () => resolve());
  });

  const url = 'http://127.0.0.1:' + opts.port + '/';
  return {
    server,
    url,
    store,
    close: () => new Promise<void>((resolve) => {
      server.close(() => resolve());
    }),
  };
}

interface Ctx {
  projectRoot: string;
  projectName: string;
  port: number;
  claude: ClaudeClient;
  store: TranscriptStore;
}

async function route(req: IncomingMessage, res: ServerResponse, ctx: Ctx): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');

  if (req.method === 'GET' && url.pathname === '/') {
    res.statusCode = 200;
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(renderPanelHtml({
      projectRoot: ctx.projectRoot,
      projectName: ctx.projectName,
      port:        ctx.port,
    }));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/health') {
    sendJson(res, 200, {
      ok: true,
      version: VERSION,
      project: { name: ctx.projectName, root: ctx.projectRoot },
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/chat') {
    await handleChat(req, res, ctx);
    return;
  }

  sendJson(res, 404, { ok: false, error: 'not found' });
}

async function handleChat(req: IncomingMessage, res: ServerResponse, ctx: Ctx): Promise<void> {
  const raw = await readBody(req);
  let body: { messages?: unknown };
  try { body = JSON.parse(raw); }
  catch { sendJson(res, 400, { ok: false, error: 'invalid JSON body' }); return; }

  const msgs = body.messages;
  if (!Array.isArray(msgs) || msgs.length === 0) {
    sendJson(res, 400, { ok: false, error: 'messages[] required' });
    return;
  }
  const normalized: ChatMessage[] = [];
  for (const m of msgs) {
    if (typeof m !== 'object' || m === null) continue;
    const r = (m as Record<string, unknown>)['role'];
    const c = (m as Record<string, unknown>)['content'];
    if ((r === 'user' || r === 'assistant') && typeof c === 'string') {
      normalized.push({ role: r, content: c });
    }
  }
  if (normalized.length === 0) {
    sendJson(res, 400, { ok: false, error: 'no valid user/assistant messages' });
    return;
  }

  try {
    const reply = await ctx.claude.chat({
      messages: normalized,
      system: buildSystemPrompt(ctx),
      maxTokens: 1024,
    });
    // Append the latest user message + the assistant's reply to
    // the persistent transcript. Older messages may already be
    // present from previous turns; we only need to capture the
    // *new* turn so the on-disk file matches conversation order.
    const lastUser = normalized[normalized.length - 1];
    if (lastUser && lastUser.role === 'user') {
      // Only append if this user message isn't already the last
      // recorded one (prevents dup on retry).
      const recent = ctx.store.messages();
      const tail = recent[recent.length - 1];
      if (!tail || tail.role !== 'user' || tail.content !== lastUser.content) {
        ctx.store.append(lastUser);
      }
    }
    ctx.store.append({ role: 'assistant', content: reply.text });
    void ctx.store.flush();

    sendJson(res, 200, {
      ok: true,
      message: { role: 'assistant', text: reply.text },
      tokens: { in: reply.tokensIn, out: reply.tokensOut },
      model: reply.model,
    });
  } catch (err) {
    if (err instanceof ConfigurationError) {
      sendJson(res, 503, {
        ok: false,
        code: 'no_api_key',
        error: err.message,
      });
      return;
    }
    if (err instanceof ClaudeApiError) {
      sendJson(res, 502, {
        ok: false,
        code: 'claude_api_error',
        error: err.message,
      });
      return;
    }
    sendJson(res, 502, {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function buildSystemPrompt(ctx: Ctx): string {
  return [
    'You are Yujin Forge -- a friendly assistant embedded in a developer\'s React project.',
    '',
    'PRINCIPLES:',
    '- Reply in the user\'s language. Default to Spanish if unclear.',
    '- Keep replies short + conversational.',
    '- Ask one clarifying question at a time.',
    '- When proposing code changes, paste minimal diffs the user can apply manually.',
    '  Direct AST mutation lands when the tool-use loop ships.',
    '',
    'CONTEXT:',
    '- Project: ' + ctx.projectName,
    '- Root:    ' + ctx.projectRoot,
    '- Forge:   v' + VERSION,
  ].join('\n');
}

function sendJson(res: ServerResponse, status: number, body: object): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
    if (chunks.reduce((s, c) => s + c.length, 0) > 1_000_000) {
      throw new Error('request body too large (>1MB)');
    }
  }
  return Buffer.concat(chunks).toString('utf-8');
}

async function readProjectName(projectRoot: string): Promise<string> {
  try {
    const raw = await fs.readFile(path.join(projectRoot, 'yujin.forge.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.project_name === 'string') return parsed.project_name;
  } catch { /* fall through */ }
  try {
    const raw = await fs.readFile(path.join(projectRoot, 'package.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.name === 'string') return parsed.name;
  } catch { /* fall through */ }
  return path.basename(projectRoot);
}
