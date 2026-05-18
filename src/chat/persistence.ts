/**
 * Yujin Forge -- chat transcript persistence.
 *
 * Per SPEC 5 (last bullet), transcripts go to
 * `.yujin-forge/cache/chat/` inside the project root -- the user
 * owns the data, not the home directory.
 *
 * File naming: ISO-style timestamp + a 6-char random suffix to
 * avoid collisions if the user opens two panels in the same
 * minute:
 *
 *   .yujin-forge/cache/chat/2026-05-17_212354_xK9bRq.json
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { ChatMessage } from './claude.js';

export interface TranscriptMeta {
  /** When the session opened. */
  startedAt: string;
  /** Project root the panel was launched against. */
  projectRoot: string;
  /** Forge CLI version (so we can replay older formats later). */
  forgeVersion: string;
}

export interface Transcript {
  meta: TranscriptMeta;
  messages: ChatMessage[];
}

export function cacheDir(projectRoot: string): string {
  return path.join(projectRoot, '.yujin-forge', 'cache', 'chat');
}

export function sessionFilename(at: Date = new Date()): string {
  const pad = (n: number): string => n.toString().padStart(2, '0');
  const stamp = at.getUTCFullYear()
    + '-' + pad(at.getUTCMonth() + 1)
    + '-' + pad(at.getUTCDate())
    + '_' + pad(at.getUTCHours())
    + pad(at.getUTCMinutes())
    + pad(at.getUTCSeconds());
  const suffix = randomBytes(4).toString('base64')
    .replace(/[+/=]/g, '').slice(0, 6);
  return stamp + '_' + suffix + '.json';
}

export class TranscriptStore {
  readonly projectRoot: string;
  readonly filePath: string;
  private transcript: Transcript;
  private dirty = false;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(projectRoot: string, forgeVersion: string, filename?: string) {
    this.projectRoot = projectRoot;
    this.filePath = path.join(cacheDir(projectRoot), filename ?? sessionFilename());
    this.transcript = {
      meta: {
        startedAt:    new Date().toISOString(),
        projectRoot,
        forgeVersion,
      },
      messages: [],
    };
  }

  append(message: ChatMessage): void {
    this.transcript.messages.push(message);
    this.dirty = true;
  }

  /**
   * Persist the current transcript. Calls are serialised through
   * a single in-flight promise so concurrent appends don't
   * interleave writes. Returns only after every queued write has
   * settled (so callers can await disk-state reliably even when
   * an upstream fire-and-forget already enqueued a write).
   */
  async flush(): Promise<void> {
    if (this.dirty) {
      const snapshot = JSON.stringify(this.transcript, null, 2);
      this.dirty = false;
      this.writeQueue = this.writeQueue.then(async () => {
        await fs.mkdir(path.dirname(this.filePath), { recursive: true });
        await fs.writeFile(this.filePath, snapshot, 'utf-8');
      });
    }
    await this.writeQueue;
  }

  /** Total messages currently in the transcript (excl. system). */
  size(): number {
    return this.transcript.messages.length;
  }

  /** Return a shallow copy of the messages for downstream send. */
  messages(): ChatMessage[] {
    return this.transcript.messages.slice();
  }
}
