import { describe, expect, it } from "vitest";

import { resolveAgentSearchProductScopeRoot } from "@/commands/agent/search";
import { agentHomeDirsFromHomeDir } from "@/domains/agent/home";
import { AGENT_SESSION_KIND } from "@/domains/agent/protocol";
import {
  AGENT_SEARCH_MATCH_REASON,
  agentSearchQueryFromOptions,
  pickupIdSearchLiteral,
  searchAgentSessions,
} from "@/domains/agent/search";
import { resolveProductDir } from "@/domains/config/root";
import { GIT_COMMON_DIR_ARGS, GIT_SHOW_TOPLEVEL_ARGS, type GitDependencies } from "@/git/root";
import { AGENT_CLI, createAgentDomain } from "@/interfaces/cli/agent";
import { SPX_COMMANDER_PARSE_SOURCE } from "@/interfaces/cli/product-context";
import { createCliProgram } from "@/interfaces/cli/program";
import { sanitizeCliArgument } from "@/lib/sanitize-cli-argument";
import {
  arbitraryAgentResumeNowMs,
  arbitraryAgentSessionCwd,
  arbitraryAgentSessionId,
  arbitraryAgentWorktreeRoot,
  arbitraryPartialNumericAgentSearchLimit,
  arbitraryUnsafeAgentSearchLimit,
  sampleAgentResumeValue,
} from "@testing/generators/agent/resume";
import { arbitraryDomainLiteral } from "@testing/generators/literal/literal";
import {
  MemoryAgentSessionFileSystem,
  writeClaudeProjectTranscriptFile,
  writeClaudeSubagentTranscriptFile,
  writeCodexTranscriptFile,
} from "@testing/harnesses/agent/resume";

describe("agent session search scenarios", () => {
  it("resolves default product scope to the linked worktree root", async () => {
    const linkedWorktreeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 60);
    const commonCheckoutRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 61);
    const fallbackProductScopeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 62);
    const git: GitDependencies = {
      execa: async (_command, args) => {
        if (args.join(" ") === GIT_SHOW_TOPLEVEL_ARGS.join(" ")) {
          return { exitCode: 0, stdout: linkedWorktreeRoot, stderr: "" };
        }
        if (args.join(" ") === GIT_COMMON_DIR_ARGS.join(" ")) {
          throw new Error("agent search product scope must not read git common dir");
        }
        return { exitCode: 0, stdout: commonCheckoutRoot, stderr: "" };
      },
    };

    await expect(
      resolveAgentSearchProductScopeRoot(linkedWorktreeRoot, fallbackProductScopeRoot, git),
    ).resolves.toBe(linkedWorktreeRoot);
  });

  it("finds product-scoped top-level sessions by pickup marker", async () => {
    const fs = new MemoryAgentSessionFileSystem();
    const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot());
    const productScopeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 1);
    const foreignProductRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 2);
    const codexCwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(productScopeRoot), 3);
    const claudeCwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(productScopeRoot), 4);
    const foreignCwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(foreignProductRoot), 5);
    const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs());
    const timestamp = new Date(nowMs).toISOString();
    const pickupId = sampleAgentResumeValue(arbitraryDomainLiteral(), 6);
    const pickupMarker = pickupIdSearchLiteral(pickupId);
    const codexSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 7);
    const claudeSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 8);
    const foreignSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 9);
    const subagentSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 10);

    writeCodexTranscriptFile(fs, homeDir, {
      sessionId: codexSessionId,
      cwd: codexCwd,
      timestamp,
      marker: pickupMarker,
      modifiedAtMs: nowMs,
    });
    writeClaudeProjectTranscriptFile(fs, homeDir, {
      sessionId: claudeSessionId,
      cwd: claudeCwd,
      timestamp,
      marker: pickupMarker,
      modifiedAtMs: nowMs - 1,
    });
    writeCodexTranscriptFile(fs, homeDir, {
      sessionId: foreignSessionId,
      cwd: foreignCwd,
      timestamp,
      marker: pickupMarker,
      modifiedAtMs: nowMs,
    });
    writeClaudeSubagentTranscriptFile(fs, homeDir, {
      sessionId: subagentSessionId,
      cwd: claudeCwd,
      timestamp,
      marker: pickupMarker,
      modifiedAtMs: nowMs,
    });

    const results = await searchAgentSessions({
      agentHomeDirs: agentHomeDirsFromHomeDir(homeDir),
      nowMs,
      productScopeRoot,
      fs,
      query: agentSearchQueryFromOptions({ pickupId }),
    });

    expect(results).toHaveLength(2);
    expect(results.map((result) => result.sessionId)).toEqual([codexSessionId, claudeSessionId]);
    expect(results.map((result) => result.agent)).toEqual([
      AGENT_SESSION_KIND.CODEX,
      AGENT_SESSION_KIND.CLAUDE_CODE,
    ]);
    expect(results.map((result) => result.matches)).toEqual([
      [AGENT_SEARCH_MATCH_REASON.PICKUP_ID],
      [AGENT_SEARCH_MATCH_REASON.PICKUP_ID],
    ]);
    expect(results.map((result) => result.cwd)).toEqual([codexCwd, claudeCwd]);
    expect(results.map((result) => result.sessionId)).not.toContain(foreignSessionId);
    expect(results.map((result) => result.sessionId)).not.toContain(subagentSessionId);
  });

  it("renders JSON records with session metadata and match reasons", async () => {
    const fs = new MemoryAgentSessionFileSystem();
    const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 20);
    const productScopeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 21);
    const cwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(productScopeRoot), 22);
    const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), 23);
    const timestamp = new Date(nowMs).toISOString();
    const pickupId = sampleAgentResumeValue(arbitraryDomainLiteral(), 24);
    const sessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 25);
    const sourcePath = writeCodexTranscriptFile(fs, homeDir, {
      sessionId,
      cwd,
      timestamp,
      marker: pickupIdSearchLiteral(pickupId),
      modifiedAtMs: nowMs,
    });

    const stdout: string[] = [];
    const program = createCliProgram({
      domains: [
        createAgentDomain({
          searchDeps: {
            fs,
            agentHomeDirs: () => agentHomeDirsFromHomeDir(homeDir),
            nowMs: () => nowMs,
            resolveProductScopeRoot: async () => productScopeRoot,
          },
        }),
      ],
      processCwd: () => cwd,
      writeStdout: (output) => stdout.push(output),
    });

    await program.parseAsync([
      AGENT_CLI.commandName,
      AGENT_CLI.searchCommandName,
      AGENT_CLI.flags.pickupId,
      pickupId,
      AGENT_CLI.flags.json,
    ], { from: SPX_COMMANDER_PARSE_SOURCE });

    const parsed = JSON.parse(stdout.join("")) as readonly Record<string, unknown>[];

    expect(parsed).toHaveLength(1);
    const [record] = parsed;
    expect(record?.agent).toBe(AGENT_SESSION_KIND.CODEX);
    expect(record?.sessionId).toBe(sessionId);
    expect(record?.cwd).toBe(cwd);
    expect(record?.sourcePath).toBe(sourcePath);
    expect(record?.modifiedAtMs).toBe(nowMs);
    expect(record?.updatedAt).toBe(timestamp);
    expect(record?.branch).toBeNull();
    expect(record?.matches).toEqual([AGENT_SEARCH_MATCH_REASON.PICKUP_ID]);
  });

  it("warns and keeps fallback product scope when the invocation directory is outside git", async () => {
    const fs = new MemoryAgentSessionFileSystem();
    const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 30);
    const fallbackProductScopeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 31);
    const foreignProductRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 32);
    const cwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(fallbackProductScopeRoot), 33);
    const foreignCwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(foreignProductRoot), 34);
    const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), 35);
    const timestamp = new Date(nowMs).toISOString();
    const pickupId = sampleAgentResumeValue(arbitraryDomainLiteral(), 36);
    const pickupMarker = pickupIdSearchLiteral(pickupId);
    const sessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 37);
    const foreignSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 38);
    const warning = resolveProductDir(fallbackProductScopeRoot).warning;
    if (warning === undefined) {
      throw new Error("agent search fallback scope fixture must be outside a git worktree");
    }

    writeCodexTranscriptFile(fs, homeDir, {
      sessionId,
      cwd,
      timestamp,
      marker: pickupMarker,
      modifiedAtMs: nowMs,
    });
    writeCodexTranscriptFile(fs, homeDir, {
      sessionId: foreignSessionId,
      cwd: foreignCwd,
      timestamp,
      marker: pickupMarker,
      modifiedAtMs: nowMs,
    });

    const stdout: string[] = [];
    const stderr: string[] = [];
    const program = createCliProgram({
      domains: [
        createAgentDomain({
          searchDeps: {
            fs,
            agentHomeDirs: () => agentHomeDirsFromHomeDir(homeDir),
            nowMs: () => nowMs,
            resolveProductScopeRoot: async (_cwd, fallbackRoot) => fallbackRoot,
          },
        }),
      ],
      processCwd: () => fallbackProductScopeRoot,
      writeStdout: (output) => stdout.push(output),
      writeStderr: (output) => stderr.push(output),
    });

    await program.parseAsync([
      AGENT_CLI.commandName,
      AGENT_CLI.searchCommandName,
      AGENT_CLI.flags.pickupId,
      pickupId,
    ], { from: SPX_COMMANDER_PARSE_SOURCE });

    expect(stderr.join("")).toContain(warning);
    expect(stdout.join("")).toContain(sessionId);
    expect(stdout.join("")).not.toContain(foreignSessionId);
  });

  it("sanitizes invalid limit values before writing parser errors", async () => {
    const cwd = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 40);
    const unsafeLimit = sampleAgentResumeValue(arbitraryUnsafeAgentSearchLimit(), 41);
    const stderr: string[] = [];
    const program = createCliProgram({
      domains: [createAgentDomain()],
      processCwd: () => cwd,
      writeStderr: (output) => stderr.push(output),
    });
    program.exitOverride();

    await expect(
      program.parseAsync([
        AGENT_CLI.commandName,
        AGENT_CLI.searchCommandName,
        AGENT_CLI.flags.limit,
        unsafeLimit,
      ], { from: SPX_COMMANDER_PARSE_SOURCE }),
    ).rejects.toThrow();

    expect(stderr.join("")).toContain(sanitizeCliArgument(unsafeLimit));
    expect(stderr.join("")).not.toContain(unsafeLimit);
  });

  it("rejects partially numeric limit values", async () => {
    const cwd = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 42);
    const partialNumericLimit = sampleAgentResumeValue(arbitraryPartialNumericAgentSearchLimit(), 43);
    const stderr: string[] = [];
    const program = createCliProgram({
      domains: [createAgentDomain()],
      processCwd: () => cwd,
      writeStderr: (output) => stderr.push(output),
    });
    program.exitOverride();

    await expect(
      program.parseAsync([
        AGENT_CLI.commandName,
        AGENT_CLI.searchCommandName,
        AGENT_CLI.flags.limit,
        partialNumericLimit,
      ], { from: SPX_COMMANDER_PARSE_SOURCE }),
    ).rejects.toThrow();

    expect(stderr.join("")).toContain(sanitizeCliArgument(partialNumericLimit));
  });

  it("sanitizes invalid agent-kind values before writing parser errors", async () => {
    const cwd = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 44);
    const unsafeAgentKind = sampleAgentResumeValue(arbitraryUnsafeAgentSearchLimit(), 45);
    const stderr: string[] = [];
    const program = createCliProgram({
      domains: [createAgentDomain()],
      processCwd: () => cwd,
      writeStderr: (output) => stderr.push(output),
    });
    program.exitOverride();

    await expect(
      program.parseAsync([
        AGENT_CLI.commandName,
        AGENT_CLI.searchCommandName,
        AGENT_CLI.flags.agent,
        unsafeAgentKind,
      ], { from: SPX_COMMANDER_PARSE_SOURCE }),
    ).rejects.toThrow();

    expect(stderr.join("")).toContain(sanitizeCliArgument(unsafeAgentKind));
    expect(stderr.join("")).not.toContain(unsafeAgentKind);
  });
});
