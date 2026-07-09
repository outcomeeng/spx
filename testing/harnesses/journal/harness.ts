/**
 * Journal test harness — a temp product directory for journal command-runtime
 * tests, plus a recording streaming sink that captures the events the runtime
 * emits to the run's streaming surface.
 *
 * @module journal/testing/harness
 */

import type { JournalStreamSink } from "@/commands/journal/runtime";
import type { JournalEvent } from "@/lib/agent-run-journal";
import type { GitDependencies } from "@/lib/git/root";

import { createTempDir, removeTempDir } from "@testing/harnesses/with-temp-dir";

const GIT_UNAVAILABLE_MESSAGE = "git not found";

/**
 * A {@link GitDependencies} double whose git invocation always rejects, standing in for
 * git not being installed. The journal verbs' scope resolution then falls back to cwd and
 * the fixed branch identity, so a test exercises the git-unavailable path deterministically.
 */
export function failingGitDependencies(): GitDependencies {
  return { execa: () => Promise.reject(new Error(GIT_UNAVAILABLE_MESSAGE)) };
}

export interface JournalHarness {
  /** Absolute path to the temp directory used as a fake product directory. */
  readonly productDir: string;
  /** Removes the temp product directory and all contents. */
  cleanup(): Promise<void>;
}

/** Creates a journal test harness backed by a temp product directory. */
export async function createJournalHarness(): Promise<JournalHarness> {
  const productDir = await createTempDir("spx-journal-harness-");
  return {
    productDir,
    cleanup(): Promise<void> {
      return removeTempDir(productDir);
    },
  };
}

/** Runs `callback` with a fresh temp product directory, cleaning it up afterwards. */
export async function withJournalHarness(callback: (productDir: string) => Promise<void>): Promise<void> {
  const harness = await createJournalHarness();
  try {
    await callback(harness.productDir);
  } finally {
    await harness.cleanup();
  }
}

/** A streaming sink that records every event the runtime emits, exercised through DI. */
export class RecordingJournalStreamSink implements JournalStreamSink {
  readonly emitted: JournalEvent[] = [];

  emit(event: JournalEvent): Promise<void> {
    this.emitted.push(event);
    return Promise.resolve();
  }
}
