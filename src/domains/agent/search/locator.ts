import { RIPGREP_EXIT_CODE, type RipgrepRunner, type RipgrepRunResult } from "@/lib/ripgrep/runner";

import { AGENT_SESSION_STORE } from "../protocol";

/**
 * Names the transcripts under `roots` whose text contains `needle`. Candidacy for every
 * selector that reads recorded content comes from this port; the search reads no
 * transcript past its metadata head that the locator did not name.
 */
export interface TranscriptLocator {
  locate(roots: readonly string[], needle: string): Promise<readonly string[]>;
}

/** One ripgrep run as the locator reads it: the ripgrep runner library's result. */
export type TranscriptLocatorRunResult = RipgrepRunResult;

export type TranscriptLocatorRunner = RipgrepRunner;

export const RIPGREP_LOCATOR_COMMAND = {
  FILES_WITH_MATCHES: "-l",
  FIXED_STRINGS: "-F",
  TEXT: "-a",
  HIDDEN: "--hidden",
  NO_IGNORE: "--no-ignore",
  NO_CONFIG: "--no-config",
  NO_MESSAGES: "--no-messages",
  NULL_SEPARATED: "-0",
  GLOB: "-g",
  PATTERN: "-e",
  END_OF_OPTIONS: "--",
} as const;

/** The glob restricting the search to transcript files, derived from the store's transcript extension. */
export const RIPGREP_TRANSCRIPT_GLOB = `*${AGENT_SESSION_STORE.JSONL_EXTENSION}`;

/** The byte that terminates every path ripgrep prints under `-0`. */
export const RIPGREP_PATH_TERMINATOR = 0;

export const TRANSCRIPT_LOCATOR_RUN_OUTCOME = {
  PATHS: "paths",
  FAILED: "failed",
  UNAVAILABLE: "unavailable",
} as const;

export type TranscriptLocatorRunInterpretation =
  | { readonly kind: typeof TRANSCRIPT_LOCATOR_RUN_OUTCOME.PATHS; readonly paths: readonly string[] }
  | { readonly kind: typeof TRANSCRIPT_LOCATOR_RUN_OUTCOME.FAILED; readonly stderr: string }
  | { readonly kind: typeof TRANSCRIPT_LOCATOR_RUN_OUTCOME.UNAVAILABLE };

export const TRANSCRIPT_LOCATOR_DIAGNOSTIC = {
  UNAVAILABLE: "agent search requires ripgrep (rg) for --contains, --pickup-id, --branch, and --session-id;"
    + " install ripgrep (https://github.com/BurntSushi/ripgrep#installation)",
  FAILED: "ripgrep failed while locating agent transcripts",
} as const;

export class TranscriptLocatorUnavailableError extends Error {
  constructor() {
    super(TRANSCRIPT_LOCATOR_DIAGNOSTIC.UNAVAILABLE);
    this.name = "TranscriptLocatorUnavailableError";
  }
}

export class TranscriptLocatorError extends Error {
  constructor(readonly stderr: string) {
    super(`${TRANSCRIPT_LOCATOR_DIAGNOSTIC.FAILED}: ${stderr}`);
    this.name = "TranscriptLocatorError";
  }
}

/** The ripgrep invocation that names the transcripts under `roots` carrying `needle`. */
export function ripgrepLocateArgs(roots: readonly string[], needle: string): readonly string[] {
  return [
    RIPGREP_LOCATOR_COMMAND.FILES_WITH_MATCHES,
    RIPGREP_LOCATOR_COMMAND.FIXED_STRINGS,
    RIPGREP_LOCATOR_COMMAND.TEXT,
    RIPGREP_LOCATOR_COMMAND.HIDDEN,
    RIPGREP_LOCATOR_COMMAND.NO_IGNORE,
    RIPGREP_LOCATOR_COMMAND.NO_CONFIG,
    RIPGREP_LOCATOR_COMMAND.NO_MESSAGES,
    RIPGREP_LOCATOR_COMMAND.NULL_SEPARATED,
    RIPGREP_LOCATOR_COMMAND.GLOB,
    RIPGREP_TRANSCRIPT_GLOB,
    RIPGREP_LOCATOR_COMMAND.PATTERN,
    needle,
    RIPGREP_LOCATOR_COMMAND.END_OF_OPTIONS,
    ...roots,
  ];
}

/** The paths ripgrep printed under `-0`: each path followed by one terminator byte. */
export function parseRipgrepPaths(stdout: Uint8Array): readonly string[] {
  const paths: string[] = [];
  let start = 0;
  for (let index = 0; index < stdout.length; index += 1) {
    if (stdout[index] === RIPGREP_PATH_TERMINATOR) {
      paths.push(decodePath(stdout.subarray(start, index)));
      start = index + 1;
    }
  }
  if (start < stdout.length) {
    paths.push(decodePath(stdout.subarray(start)));
  }
  return paths;
}

function decodePath(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString(AGENT_SESSION_STORE.TEXT_ENCODING);
}

/** Reads a ripgrep run from its exit status; matches and no-match both yield a path set. */
export function interpretTranscriptLocatorRun(result: TranscriptLocatorRunResult): TranscriptLocatorRunInterpretation {
  if (result.exitCode === null) {
    return { kind: TRANSCRIPT_LOCATOR_RUN_OUTCOME.UNAVAILABLE };
  }
  if (result.exitCode === RIPGREP_EXIT_CODE.MATCH) {
    return { kind: TRANSCRIPT_LOCATOR_RUN_OUTCOME.PATHS, paths: parseRipgrepPaths(result.stdout) };
  }
  if (result.exitCode === RIPGREP_EXIT_CODE.NO_MATCH) {
    return { kind: TRANSCRIPT_LOCATOR_RUN_OUTCOME.PATHS, paths: [] };
  }
  return { kind: TRANSCRIPT_LOCATOR_RUN_OUTCOME.FAILED, stderr: result.stderr };
}

/**
 * The locator over an injected ripgrep runner. Empty roots name nothing
 * without a run, because ripgrep given no path searches the working directory.
 */
export function createRipgrepTranscriptLocator(runner: TranscriptLocatorRunner): TranscriptLocator {
  return {
    async locate(roots, needle) {
      if (roots.length === 0) {
        return [];
      }
      const interpretation = interpretTranscriptLocatorRun(await runner(ripgrepLocateArgs(roots, needle)));
      switch (interpretation.kind) {
        case TRANSCRIPT_LOCATOR_RUN_OUTCOME.PATHS:
          return interpretation.paths;
        case TRANSCRIPT_LOCATOR_RUN_OUTCOME.UNAVAILABLE:
          throw new TranscriptLocatorUnavailableError();
        case TRANSCRIPT_LOCATOR_RUN_OUTCOME.FAILED:
          throw new TranscriptLocatorError(interpretation.stderr);
      }
    },
  };
}
