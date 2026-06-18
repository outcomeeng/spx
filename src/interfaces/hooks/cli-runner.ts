/**
 * Hook CLI process contract runner.
 *
 * @module interfaces/hooks/cli-runner
 */

import type { Result } from "@/config/types";
import type { ControllingProcessEnv } from "@/domains/worktree/controlling-process";
import type { OccupancyFileSystem } from "@/domains/worktree/occupancy-store";
import type { ProcessTable } from "@/domains/worktree/process-table";
import type { HookSessionStartEnv } from "@/domains/hooks/session-start";
import type { GitDependencies } from "@/git/root";
import { sanitizeCliArgument } from "@/lib/sanitize-cli-argument";

import { HOOK_ERROR, isHookEvent, runHookEvent, type RunHookEventOptions } from "./registry";

export interface HookProcessIo {
  readStdin(): Promise<Result<string | undefined>>;
  writeStdout(content: string): void;
  writeStderr(content: string): void;
}

export interface HookCliRunOptions {
  readonly claimWriteToken: string;
  readonly cwd: string;
  readonly envFile?: string;
  readonly env: HookSessionStartEnv & ControllingProcessEnv;
  readonly event: string;
  readonly fs: OccupancyFileSystem;
  readonly gitDeps: GitDependencies;
  readonly io: HookProcessIo;
  readonly onWarning?: (warning: string | undefined) => void;
  readonly processTable: ProcessTable;
  readonly runEvent?: (options: RunHookEventOptions) => ReturnType<typeof runHookEvent>;
  readonly selfPid: number;
  readonly worktreesDir?: string;
}

const LINE_SEPARATOR = "\n";
const STDIN_READ_ERROR = "hook stdin read failed";

/** Runs a hook event from a CLI transport, including hook-owned process I/O. */
export async function runHookCli(options: HookCliRunOptions): Promise<Result<void>> {
  if (!isHookEvent(options.event)) {
    options.io.writeStderr(`${HOOK_ERROR.UNKNOWN_EVENT}: ${sanitizeCliArgument(options.event)}`);
    return { ok: false, error: HOOK_ERROR.UNKNOWN_EVENT };
  }

  const diagnostics: string[] = [];
  const stdin = await options.io.readStdin();
  const content = stdin.ok ? stdin.value : undefined;
  if (!stdin.ok) diagnostics.push(stdin.error);
  const runEvent = options.runEvent ?? runHookEvent;
  const result = await runEvent({
    claimWriteToken: options.claimWriteToken,
    content,
    cwd: options.cwd,
    env: options.env,
    envFile: options.envFile,
    event: options.event,
    fs: options.fs,
    gitDeps: options.gitDeps,
    onWarning: options.onWarning,
    processTable: options.processTable,
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

export const processHookIo: HookProcessIo = {
  readStdin: async () => {
    if (process.stdin.isTTY) return { ok: true, value: undefined };

    return new Promise((resolve) => {
      let data = "";
      process.stdin.setEncoding("utf-8");
      process.stdin.on("data", (chunk) => {
        data += chunk;
      });
      process.stdin.on("end", () => {
        resolve({ ok: true, value: data.length === 0 ? undefined : data });
      });
      process.stdin.on("error", () => {
        resolve({ ok: false, error: STDIN_READ_ERROR });
      });
    });
  },
  writeStdout: (content) => {
    process.stdout.write(`${content}${LINE_SEPARATOR}`);
  },
  writeStderr: (content) => {
    process.stderr.write(`${content}${LINE_SEPARATOR}`);
  },
};
