import { execa } from "execa";

/** The ripgrep executable and the flag that reports its version without a search. */
export const RIPGREP_COMMAND = {
  EXECUTABLE: "rg",
  VERSION: "--version",
} as const;

/** Ripgrep's documented exit statuses. */
export const RIPGREP_EXIT_CODE = {
  MATCH: 0,
  NO_MATCH: 1,
  ERROR: 2,
} as const;

/** The diagnostic a signal-terminated ripgrep run carries as its failure output. */
export const RIPGREP_SIGNAL_DIAGNOSTIC = "ripgrep terminated by signal";

/** The encoding ripgrep's diagnostic output is read under. */
const RIPGREP_STDERR_ENCODING = "utf8";

/** The outcome of one ripgrep process as the process dependency reports it: a subset of execa's result. */
export interface RipgrepProcessOutcome {
  /** Ripgrep's exit status; absent when the process did not exit normally. */
  readonly exitCode?: number;
  /** The Node error code when the executable could not be started, such as `ENOENT`. */
  readonly code?: string;
  /** The signal that terminated the process, when one did. */
  readonly signal?: string;
  readonly stdout: Uint8Array;
  readonly stderr: Uint8Array;
}

/** One ripgrep run as its consumer reads it; `exitCode` is null when the executable could not be started. */
export interface RipgrepRunResult {
  readonly exitCode: number | null;
  readonly stdout: Uint8Array;
  readonly stderr: string;
}

export type RipgrepRunner = (args: readonly string[]) => Promise<RipgrepRunResult>;

export interface RipgrepDependencies {
  readonly runRipgrep: (args: readonly string[]) => Promise<RipgrepProcessOutcome>;
}

export const defaultRipgrepDependencies: RipgrepDependencies = {
  runRipgrep: async (args) => {
    const result = await execa(RIPGREP_COMMAND.EXECUTABLE, [...args], {
      reject: false,
      encoding: "buffer",
      stripFinalNewline: false,
    });
    return {
      exitCode: result.exitCode,
      code: "code" in result && typeof result.code === "string" ? result.code : undefined,
      signal: result.signal,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  },
};

/**
 * Maps a ripgrep process outcome to a run result. A process that neither exited nor was
 * terminated by a signal never started — whatever error code the spawn reported — and is the
 * unstartable result (null exit code); a signal-terminated run is a failed run whose diagnostic
 * names the signal; an exited run carries ripgrep's own exit status and its output bytes.
 */
export function ripgrepRunResultFromOutcome(outcome: RipgrepProcessOutcome): RipgrepRunResult {
  if (outcome.exitCode === undefined && outcome.signal === undefined) {
    return { exitCode: null, stdout: new Uint8Array(), stderr: "" };
  }
  if (outcome.exitCode === undefined) {
    return {
      exitCode: RIPGREP_EXIT_CODE.ERROR,
      stdout: new Uint8Array(),
      stderr: `${RIPGREP_SIGNAL_DIAGNOSTIC} ${outcome.signal}`,
    };
  }
  return {
    exitCode: outcome.exitCode,
    stdout: outcome.stdout,
    stderr: Buffer.from(outcome.stderr).toString(RIPGREP_STDERR_ENCODING),
  };
}

/** Starts ripgrep through the injected process dependency and maps its outcome to a run result. */
export function createRipgrepRunner(deps: RipgrepDependencies = defaultRipgrepDependencies): RipgrepRunner {
  return async (args) => ripgrepRunResultFromOutcome(await deps.runRipgrep(args));
}

export const defaultRipgrepRunner: RipgrepRunner = createRipgrepRunner();
