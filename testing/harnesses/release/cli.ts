import { Command } from "commander";

import { type CliInvocation, SPX_COMMANDER_PARSE_SOURCE } from "@/interfaces/cli/product-context";
import { createReleaseDomain, RELEASE_CLI, type ReleaseCliDependencies } from "@/interfaces/cli/release";

/** The process-stream and exit boundary a release CLI drive observes through. */
export interface ReleaseCliIo {
  readonly writeStdout: (output: string) => void;
  readonly writeStderr: (output: string) => void;
  readonly exit: (exitCode: number) => never;
}

export interface ReleaseCliParseOptions {
  readonly productDir: string;
  /** The argv after the executable, starting at the `release` command. */
  readonly argv: readonly string[];
  readonly overrides: Partial<ReleaseCliDependencies>;
  readonly io: ReleaseCliIo;
}

/**
 * Registers the release domain on a fresh Commander program with the product
 * context pinned to `productDir` and parses `argv` through it, so a test drives
 * the real descriptor wiring against injected commands.
 */
export async function parseReleaseCli(options: ReleaseCliParseOptions): Promise<void> {
  const program = new Command();
  const invocation: CliInvocation = {
    io: {
      writeStdout: options.io.writeStdout,
      writeStderr: options.io.writeStderr,
      // Both channels of a stream share one destination, as the production
      // program's fallback does, so a relayed document is observed where the
      // drive already reads that stream's composed output.
      writePassThrough: options.io.writeStdout,
      writePassThroughError: options.io.writeStderr,
      setExitCode: () => undefined,
      exit: options.io.exit,
    },
    resolveEffectiveInvocationDir: () => options.productDir,
    resolveProductContext: () => ({
      effectiveInvocationDir: options.productDir,
      productDir: options.productDir,
    }),
  };
  createReleaseDomain(options.overrides).register(program, invocation);
  await program.parseAsync([...options.argv], { from: SPX_COMMANDER_PARSE_SOURCE });
}

/** One release verb together with the dependency override that makes its command reject. */
export interface ReleaseCliFailureDrive {
  readonly verb: string;
  readonly argv: readonly string[];
  readonly rejectingOverrides: (failure: Error) => Partial<ReleaseCliDependencies>;
}

/** Every release verb the descriptor exposes, each driven to a rejecting command. */
export function releaseCliFailureDrives(tag: string): readonly ReleaseCliFailureDrive[] {
  return [
    {
      verb: RELEASE_CLI.NOTES_COMMAND,
      argv: [RELEASE_CLI.COMMAND, RELEASE_CLI.NOTES_COMMAND],
      rejectingOverrides: (failure) => ({ releaseNotesCommand: () => Promise.reject(failure) }),
    },
    {
      verb: `${RELEASE_CLI.DOCS_COMMAND} ${RELEASE_CLI.SYNC_COMMAND}`,
      argv: [RELEASE_CLI.COMMAND, RELEASE_CLI.DOCS_COMMAND, RELEASE_CLI.SYNC_COMMAND],
      rejectingOverrides: (failure) => ({ documentationSyncCommand: () => Promise.reject(failure) }),
    },
    {
      verb: RELEASE_CLI.PUBLISH_COMMAND,
      argv: [RELEASE_CLI.COMMAND, RELEASE_CLI.PUBLISH_COMMAND, RELEASE_CLI.TAG_FLAG, tag],
      rejectingOverrides: (failure) => ({ publishReleaseCommand: () => Promise.reject(failure) }),
    },
  ];
}

/** What a release verb wrote and how it exited when the command it dispatched rejected. */
export interface ReleaseCliFailureObservation {
  readonly verb: string;
  readonly failure: Error;
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCodes: readonly number[];
}

/**
 * Drives one release verb against a command that rejects with `failure`,
 * recording standard output, standard error, and every exit code the descriptor
 * requested. The process exit is recorded rather than performed.
 */
export async function observeReleaseCliFailure(
  productDir: string,
  drive: ReleaseCliFailureDrive,
  failure: Error,
): Promise<ReleaseCliFailureObservation> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCodes: number[] = [];
  try {
    await parseReleaseCli({
      productDir,
      argv: drive.argv,
      overrides: drive.rejectingOverrides(failure),
      io: {
        writeStdout: (output) => stdout.push(output),
        writeStderr: (output) => stderr.push(output),
        exit: (exitCode) => {
          exitCodes.push(exitCode);
          throw new RecordedCliExit(exitCode);
        },
      },
    });
  } catch (error: unknown) {
    if (!(error instanceof RecordedCliExit)) throw error;
  }
  return { verb: drive.verb, failure, stdout: stdout.join(""), stderr: stderr.join(""), exitCodes };
}

/** Stands in for the process exit the descriptor requests, so the harness can record it and unwind. */
class RecordedCliExit extends Error {
  constructor(readonly exitCode: number) {
    super(`release verb requested exit ${exitCode}`);
    this.name = "RecordedCliExit";
  }
}
