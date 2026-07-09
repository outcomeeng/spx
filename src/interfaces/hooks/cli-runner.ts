/**
 * Hook CLI process contract runner.
 *
 * @module interfaces/hooks/cli-runner
 */

import type { Result } from "@/config/types";
import type { HookSessionStartEnv } from "@/domains/hooks/session-start";
import type { ControllingProcessEnv } from "@/domains/worktree/controlling-process";
import type { OccupancyFileSystem } from "@/domains/worktree/occupancy-store";
import type { ProcessTable } from "@/domains/worktree/process-table";
import type { RandomBytes } from "@/lib/atomic-file-write";
import type { GitDependencies } from "@/lib/git/root";
import { sanitizeCliArgument } from "@/lib/sanitize-cli-argument";

import { HOOK_ERROR, isHookEvent, runHookEvent, type RunHookEventOptions } from "./registry";

export interface HookProcessIo {
  readStdin(): Promise<Result<string | undefined>>;
  writeStdout(content: string): void;
  writeStderr(content: string): void;
}

export interface HookCliRunOptions {
  readonly compactStdout: boolean;
  readonly stdinContent?: Result<string | undefined>;
  readonly cwd: string;
  readonly envFile?: string;
  readonly env: HookSessionStartEnv & ControllingProcessEnv;
  readonly event: string;
  readonly fs: OccupancyFileSystem;
  readonly gitDeps: GitDependencies;
  readonly io: HookProcessIo;
  readonly onWarning?: (warning: string | undefined) => void;
  readonly processTable: ProcessTable;
  readonly claimRandomBytes: RandomBytes;
  readonly runEvent?: (options: RunHookEventOptions) => ReturnType<typeof runHookEvent>;
  readonly selfPid: number;
  readonly worktreesDir?: string;
}

export interface HookProcessIoStreams {
  readonly stdin: {
    readonly isTTY?: boolean;
    setEncoding(encoding: BufferEncoding): void;
    on(event: "data", listener: (chunk: string) => void): unknown;
    on(event: "end", listener: () => void): unknown;
    on(event: "error", listener: (error: unknown) => void): unknown;
  };
  readonly stdout: { write(content: string): unknown };
  readonly stderr: { write(content: string): unknown };
}

export const HOOK_PROCESS_IO_EVENT = {
  DATA: "data",
  END: "end",
  ERROR: "error",
} as const;

const LINE_SEPARATOR = "\n";
export const ERROR_DETAIL_SEPARATOR = ": ";
export const STDIN_READ_ERROR = "hook stdin read failed";
export const HOOK_CONFIG_ERROR_PREFIX = "hook agent environment config read failed";

/** Runs a hook event from a CLI transport, including hook-owned process I/O. */
export async function runHookCli(options: HookCliRunOptions): Promise<Result<void>> {
  if (!isHookEvent(options.event)) {
    options.io.writeStderr(`${HOOK_ERROR.UNKNOWN_EVENT}: ${sanitizeCliArgument(options.event)}`);
    return { ok: false, error: HOOK_ERROR.UNKNOWN_EVENT };
  }

  const diagnostics: string[] = [];
  const stdin = options.stdinContent ?? (await options.io.readStdin());
  const content = stdin.ok ? stdin.value : undefined;
  if (!stdin.ok) diagnostics.push(stdin.error);
  const runEvent = options.runEvent ?? runHookEvent;
  const result = await runEvent({
    compactStdout: options.compactStdout,
    content,
    cwd: options.cwd,
    env: options.env,
    envFile: options.envFile,
    event: options.event,
    fs: options.fs,
    gitDeps: options.gitDeps,
    onWarning: options.onWarning,
    processTable: options.processTable,
    claimRandomBytes: options.claimRandomBytes,
    selfPid: options.selfPid,
    worktreesDir: options.worktreesDir,
  });
  for (const diagnostic of diagnostics) {
    options.io.writeStderr(diagnostic);
  }
  if (!result.ok) {
    options.io.writeStderr(result.error);
    return result;
  }

  for (const diagnostic of result.value.diagnostics) {
    options.io.writeStderr(diagnostic);
  }
  if (result.value.stdout.length > 0) {
    options.io.writeStdout(result.value.stdout);
  }
  return { ok: true, value: undefined };
}

export function createProcessHookIo(streams: HookProcessIoStreams): HookProcessIo {
  return {
    readStdin: async () => {
      if (streams.stdin.isTTY) return { ok: true, value: undefined };

      return new Promise((resolve) => {
        let data = "";
        streams.stdin.setEncoding("utf-8");
        streams.stdin.on(HOOK_PROCESS_IO_EVENT.DATA, (chunk) => {
          data += chunk;
        });
        streams.stdin.on(HOOK_PROCESS_IO_EVENT.END, () => {
          resolve({ ok: true, value: data.length === 0 ? undefined : data });
        });
        streams.stdin.on(HOOK_PROCESS_IO_EVENT.ERROR, (error) => {
          resolve({ ok: false, error: formatStdinReadError(error) });
        });
      });
    },
    writeStdout: (content) => {
      streams.stdout.write(`${content}${LINE_SEPARATOR}`);
    },
    writeStderr: (content) => {
      streams.stderr.write(`${content}${LINE_SEPARATOR}`);
    },
  };
}

function formatStdinReadError(error: unknown): string {
  return `${STDIN_READ_ERROR}${ERROR_DETAIL_SEPARATOR}${describeStdinReadError(error)}`;
}

// Stringify a caught stdin-read error without throwing: an Error yields its
// message, a string passes through verbatim, and any other value is serialized
// explicitly (falling back to its type name for values JSON cannot represent,
// such as a bigint or a circular object) so the handler never rethrows.
function describeStdinReadError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    const serialized = JSON.stringify(error);
    return typeof serialized === "string" ? serialized : `${typeof error}`;
  } catch {
    return `${typeof error}`;
  }
}

export const processHookIo: HookProcessIo = createProcessHookIo({
  stdin: process.stdin,
  stdout: process.stdout,
  stderr: process.stderr,
});
