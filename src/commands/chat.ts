/**
 * `yf chat` -- launch the voice + chat panel server.
 *
 * Day-1 scope: HTTP server on 127.0.0.1 + 3-mode browser panel
 * (globito / mini / full) + Claude chat backend. Voice STT/TTS
 * stays stubbed in the panel UI; the integration lands when the
 * NAC v2.3 audio runtime publishes.
 */
import type { Command } from 'commander';
import path from 'node:path';
import { c, header } from '../ui/colors.js';
import { startChatServer } from '../chat/server.js';
import { loadLicense, isAuthorized } from '../license/index.js';

export interface ChatOptions {
  voice?: boolean;
  port?: number;
  cwd?: string;
  /** Test mode: start + return without blocking. */
  detach?: boolean;
}

export function registerChatCommand(program: Command): void {
  program
    .command('chat')
    .description('Launch the Yujin Forge chat panel (3-mode browser UI + Claude backend).')
    .option('--no-voice', 'disable voice input (the panel ships voice as a stub today either way)')
    .option('-p, --port <port>', 'panel server port', (v) => parseInt(v, 10), 4847)
    .option('--cwd <path>',      'project root (default: current directory)')
    .action(async (opts: ChatOptions) => {
      header('Yujin Forge -- chat');
      console.log('');

      const projectRoot = opts.cwd ? path.resolve(opts.cwd) : process.cwd();
      const lic = await loadLicense();
      if (!isAuthorized(lic)) {
        console.error(c.error('No active license or trial.'));
        console.error('  ' + c.dim('Run ') + c.code('yf license activate --key <jwt>')
          + c.dim(' or restart the trial by removing ~/.yujin-forge/trial.json.'));
        process.exitCode = 1;
        return;
      }

      const port = opts.port ?? 4847;
      let started;
      try {
        started = await startChatServer({ projectRoot, port });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (/EADDRINUSE/i.test(message)) {
          console.error(c.error('Port ' + port + ' is already in use.'));
          console.error('  ' + c.dim('Pick another with ') + c.code('--port <n>') + c.dim(' .'));
        } else {
          console.error(c.error(message));
        }
        process.exitCode = 1;
        return;
      }

      console.log('  Project:   ' + c.dim(projectRoot));
      console.log('  Panel URL: ' + c.brand(started.url));
      console.log('  Transcript: ' + c.dim(started.store.filePath));
      console.log('');
      console.log(c.dim('Open the URL in your browser. Press Ctrl+C to stop.'));
      console.log('');

      if (opts.detach) {
        // Test path: don't block, let the caller close().
        return;
      }

      const onShutdown = async () => {
        console.log('');
        console.log(c.dim('Shutting down...'));
        try { await started.store.flush(); } catch { /* best-effort */ }
        await started.close();
        process.exit(0);
      };
      process.on('SIGINT',  onShutdown);
      process.on('SIGTERM', onShutdown);

      // Block forever -- the server keeps the event loop alive.
      await new Promise(() => { /* never resolves */ });
    });
}
