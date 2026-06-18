import { describe, expect, it } from "vitest";

import type { Result } from "@/config/types";
import { defaultGitDependencies } from "@/git/root";
import { runHookCli, type HookProcessIo } from "@/interfaces/hooks/cli-runner";
import { HOOK_EVENT } from "@/interfaces/hooks/registry";
import { defaultOccupancyFileSystem } from "@/lib/worktree-occupancy-file-system";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import { createProcessTable } from "@testing/harnesses/worktree/harness";

class RecordingHookIo implements HookProcessIo {
  readonly stderr: string[] = [];
  readonly stdout: string[] = [];

  constructor(private readonly stdinFailure: string) {}

  async readStdin(): Promise<Result<string | undefined>> {
    return { ok: false, error: this.stdinFailure };
  }

  writeStdout(content: string): void {
    this.stdout.push(content);
  }

  writeStderr(content: string): void {
    this.stderr.push(content);
  }
}

describe("hook CLI runner", () => {
  it("records a diagnostic when hook stdin cannot be read", async () => {
    const cwd = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const stdinFailure = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
    const claimWriteToken = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.writeToken());
    const selfPid = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.pid());
    const io = new RecordingHookIo(stdinFailure);
    const processTable = createProcessTable({
      host: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.host()),
      processes: new Map(),
    });

    const result = await runHookCli({
      claimWriteToken,
      cwd,
      env: {},
      event: HOOK_EVENT.SESSION_START,
      fs: defaultOccupancyFileSystem,
      gitDeps: defaultGitDependencies,
      io,
      processTable,
      selfPid,
    });

    expect(result.ok).toBe(true);
    expect(io.stderr).toContain(stdinFailure);
    expect(io.stdout).toEqual([]);
  });

  it("records a stdin diagnostic before a hook handler rejection", async () => {
    const cwd = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const stdinFailure = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
    const handlerFailure = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
    const claimWriteToken = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.writeToken());
    const selfPid = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.pid());
    const io = new RecordingHookIo(stdinFailure);
    const processTable = createProcessTable({
      host: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.host()),
      processes: new Map(),
    });

    const result = await runHookCli({
      claimWriteToken,
      cwd,
      env: {},
      event: HOOK_EVENT.SESSION_START,
      fs: defaultOccupancyFileSystem,
      gitDeps: defaultGitDependencies,
      io,
      processTable,
      runEvent: async () => ({ ok: false, error: handlerFailure }),
      selfPid,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected hook CLI to return the handler failure");
    expect(result.error).toBe(handlerFailure);
    expect(io.stderr).toEqual([stdinFailure, handlerFailure]);
    expect(io.stdout).toEqual([]);
  });
});
