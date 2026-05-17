/**
 * `yf chat` -- launch the voice + chat panel hooked to the
 * current project. Calls Claude Agent SDK with workspace tools.
 *
 * Day-0 stub.
 */
import type { Command } from 'commander';
import { stub } from './_stub.js';

export interface ChatOptions {
  voice?: boolean;
  port?: number;
}

export function registerChatCommand(program: Command): void {
  program
    .command('chat')
    .description('Launch the voice + chat panel for the current project.')
    .option('--no-voice', 'disable voice input (text only)')
    .option('-p, --port <port>', 'panel server port', (v) => parseInt(v, 10), 4847)
    .action((_opts: ChatOptions) => {
      stub('chat', 'milestone: Voice + chat panel (2026-09)');
    });
}
