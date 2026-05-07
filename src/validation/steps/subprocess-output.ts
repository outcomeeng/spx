/**
 * Output forwarding for validation subprocesses.
 *
 * Validation tools write through the parent process so CLI lifecycle handlers
 * can observe broken pipes and terminate tracked children.
 *
 * @module validation/steps/subprocess-output
 */

import type { Readable } from "node:stream";

export const VALIDATION_SUBPROCESS_STDIO = "pipe";

export const VALIDATION_SUBPROCESS_EVENTS = {
  CLOSE: "close",
  DATA: "data",
  DRAIN: "drain",
  ERROR: "error",
} as const;

export interface ValidationSubprocessOutputStreams {
  readonly stdout: ValidationWritableStream;
  readonly stderr: ValidationWritableStream;
}

export interface ValidationWritableStream {
  write(chunk: string | Uint8Array): boolean;
  once?(event: typeof VALIDATION_SUBPROCESS_EVENTS.DRAIN, listener: () => void): unknown;
}

export interface ValidationSubprocessWithOutput {
  readonly stdout?: Readable | null;
  readonly stderr?: Readable | null;
}

export const defaultValidationSubprocessOutputStreams: ValidationSubprocessOutputStreams = {
  stdout: process.stdout,
  stderr: process.stderr,
};

export function forwardValidationSubprocessOutput(
  child: ValidationSubprocessWithOutput,
  streams: ValidationSubprocessOutputStreams = defaultValidationSubprocessOutputStreams,
): void {
  child.stdout?.on(VALIDATION_SUBPROCESS_EVENTS.DATA, (chunk: string | Uint8Array) => {
    forwardChunkWithBackpressure(child.stdout, streams.stdout, chunk);
  });

  child.stderr?.on(VALIDATION_SUBPROCESS_EVENTS.DATA, (chunk: string | Uint8Array) => {
    forwardChunkWithBackpressure(child.stderr, streams.stderr, chunk);
  });
}

function forwardChunkWithBackpressure(
  source: Readable | null | undefined,
  stream: ValidationWritableStream,
  chunk: string | Uint8Array,
): void {
  const ready = stream.write(chunk);
  if (ready || stream.once === undefined || source === null || source === undefined) {
    return;
  }

  source.pause();
  stream.once(VALIDATION_SUBPROCESS_EVENTS.DRAIN, () => {
    source.resume();
  });
}
