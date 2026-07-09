import { describe, expect, it } from "vitest";

import { EventEmitter } from "node:events";

import type { Result } from "@/config/types";
import {
  createProcessHookIo,
  ERROR_DETAIL_SEPARATOR,
  HOOK_PROCESS_IO_EVENT,
  type HookProcessIo,
  runHookCli,
  STDIN_READ_ERROR,
} from "@/interfaces/hooks/cli-runner";
import { HOOK_EVENT } from "@/interfaces/hooks/registry";
import { defaultGitDependencies } from "@/lib/git/root";
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

class ErroringHookInput extends EventEmitter {
  readonly isTTY = false;
  private encoding: BufferEncoding | undefined;

  constructor(private readonly failure: unknown) {
    super();
  }

  setEncoding(encoding: BufferEncoding): void {
    this.encoding = encoding;
  }

  start(): void {
    if (this.encoding === undefined) throw new Error("expected hook input encoding to be configured");
    this.emit(HOOK_PROCESS_IO_EVENT.ERROR, this.failure);
  }
}

async function readErroringStdin(failure: unknown): Promise<Result<string | undefined>> {
  const stdin = new ErroringHookInput(failure);
  const io = createProcessHookIo({
    stdin,
    stdout: { write: () => undefined },
    stderr: { write: () => undefined },
  });
  const read = io.readStdin();
  stdin.start();
  return read;
}

describe("hook CLI runner", () => {
  it("records a diagnostic when hook stdin cannot be read", async () => {
    const cwd = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const stdinFailure = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
    const claimRandomBytes = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes());
    const selfPid = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.pid());
    const io = new RecordingHookIo(stdinFailure);
    const processTable = createProcessTable({
      host: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.host()),
      processes: new Map(),
    });

    const result = await runHookCli({
      claimRandomBytes,
      compactStdout: false,
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
    const claimRandomBytes = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes());
    const selfPid = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.pid());
    const io = new RecordingHookIo(stdinFailure);
    const processTable = createProcessTable({
      host: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.host()),
      processes: new Map(),
    });

    const result = await runHookCli({
      claimRandomBytes,
      compactStdout: false,
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

  it("records stdin error details from process hook IO", async () => {
    const errorMessage = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
    const stdin = new ErroringHookInput(new Error(errorMessage));
    const stdout: string[] = [];
    const stderr: string[] = [];
    const io = createProcessHookIo({
      stdin,
      stdout: { write: (content) => stdout.push(content) },
      stderr: { write: (content) => stderr.push(content) },
    });

    const read = io.readStdin();
    stdin.start();
    const result = await read;

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected stdin read to fail");
    expect(result.error).toContain(errorMessage);
    expect(stdout).toEqual([]);
    expect(stderr).toEqual([]);
  });

  it("renders an Error stdin failure as its message", async () => {
    const message = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
    const result = await readErroringStdin(new Error(message));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected stdin read to fail");
    expect(result.error).toBe(`${STDIN_READ_ERROR}${ERROR_DETAIL_SEPARATOR}${message}`);
  });

  it("passes a string stdin error through verbatim", async () => {
    const failure = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
    const result = await readErroringStdin(failure);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected stdin read to fail");
    expect(result.error).toBe(`${STDIN_READ_ERROR}${ERROR_DETAIL_SEPARATOR}${failure}`);
  });

  it("serializes a JSON-representable stdin error object", async () => {
    const detail = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
    const failure = { detail };
    const result = await readErroringStdin(failure);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected stdin read to fail");
    expect(result.error).toBe(`${STDIN_READ_ERROR}${ERROR_DETAIL_SEPARATOR}${JSON.stringify(failure)}`);
  });

  it("falls back to the type name when a stdin error serializes to undefined", async () => {
    const failure = Symbol(sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId()));
    const result = await readErroringStdin(failure);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected stdin read to fail");
    expect(result.error).toBe(`${STDIN_READ_ERROR}${ERROR_DETAIL_SEPARATOR}${typeof failure}`);
  });

  it("falls back to the type name when a stdin error cannot be serialized", async () => {
    const failure: Record<string, unknown> = {};
    failure.self = failure;
    const result = await readErroringStdin(failure);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected stdin read to fail");
    expect(result.error).toBe(`${STDIN_READ_ERROR}${ERROR_DETAIL_SEPARATOR}${typeof failure}`);
  });
});
