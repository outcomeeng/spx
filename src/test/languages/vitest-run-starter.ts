/**
 * The Vitest run-starter port: the options a journal-streaming run starts Vitest with, the
 * outcome of a start, and the starter that performs it.
 *
 * The module imports nothing from the language descriptor contract or the journal reporter, so
 * both can depend on it without a cycle.
 */
import type { Reporter } from "vitest/node";

/** How a journal-streaming run starts Vitest: the scope to run and the reporters registered on it. */
export interface VitestRunStartOptions {
  /** Product directory the run executes against. */
  readonly productDir: string;
  /** Test file paths the run covers; empty runs the runner's full scope. */
  readonly testPaths: readonly string[];
  /** Reporters registered on the run — the journal reporter among them. */
  readonly reporters: readonly Reporter[];
  /** Setup files each test worker of the run executes — the read recorder among them. */
  readonly setupFiles: readonly string[];
  /** Environment variables each test worker of the run receives. */
  readonly workerEnv: Readonly<Record<string, string>>;
}

/** Whether a start ran Vitest, or found no Vitest Node API in the product directory searched. */
export type VitestRunStart =
  | { readonly started: true }
  | {
    readonly started: false;
    /** The product directory searched for the Node API. */
    readonly unresolvedProductDir: string;
  };

/**
 * Starts a programmatic Vitest run with the given reporters registered through the
 * Node API. Production wires the product-resolved `startVitest`; tests inject a spy
 * that records the options without spawning Vitest.
 */
export interface VitestRunStarter {
  start(options: VitestRunStartOptions): Promise<VitestRunStart>;
}
