import { describe, expect, it } from "vitest";

import {
  AGENT_RESUME_COMMAND,
  AGENT_RESUME_MODE,
  AGENT_RESUME_TEXT,
  AGENT_SESSION_KIND,
  AGENT_SESSION_STORE,
} from "@/domains/agent/protocol";
import {
  AGENT_RESUME_PICKER_ACTION,
  type AgentResumeCandidate,
  type AgentResumeScope,
  branchResumeScope,
  buildAgentResumeLaunchCommand,
  discoverAgentResumeCandidates,
  initialAgentResumePickerState,
  reduceAgentResumePickerState,
  resolveAgentResumePickerAction,
  worktreeResumeScope,
} from "@/domains/agent/resume";
import { AGENT_CLI, AGENT_CLI_EXIT, createAgentDomain } from "@/interfaces/cli/agent";
import {
  type AgentResumePickerResult,
  quitAgentResumePicker,
  selectedAgentResumeCandidate,
} from "@/interfaces/cli/agent/resume/run-picker";
import { SPX_COMMANDER_PARSE_SOURCE } from "@/interfaces/cli/product-context";
import { createCliProgram } from "@/interfaces/cli/program";
import {
  arbitraryAgentBranch,
  arbitraryAgentLaunchExitCode,
  arbitraryAgentResumeNowMs,
  arbitraryAgentResumeRecentOffsetMs,
  arbitraryAgentSessionCwd,
  arbitraryAgentSessionId,
  arbitraryAgentWorktreeRoot,
  sampleAgentResumeValue,
} from "@testing/generators/agent/resume";
import {
  agentResumeCandidate,
  claudeCodeTranscript,
  claudeProjectTranscriptPath,
  codexTranscript,
  codexTranscriptPath,
  ImmediateExit,
  isPathInsideOrEqual,
  MemoryAgentSessionFileSystem,
} from "@testing/harnesses/agent/resume";

interface ResumeFixture {
  readonly fs: MemoryAgentSessionFileSystem;
  readonly homeDir: string;
  readonly worktreeRoot: string;
  readonly cwd: string;
  readonly nowMs: number;
  readonly newestSessionId: string;
  readonly olderSessionId: string;
}

function createResumeFixture(): ResumeFixture {
  const fs = new MemoryAgentSessionFileSystem();
  const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot());
  const worktreeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 1);
  const cwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), 2);
  const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs());
  const timestamp = new Date(nowMs).toISOString();
  const newestSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 3);
  const olderSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 4);
  const olderModifiedAtMs = nowMs - sampleAgentResumeValue(arbitraryAgentResumeRecentOffsetMs(), 5);
  const olderTimestamp = new Date(olderModifiedAtMs).toISOString();

  fs.writeFile(
    codexTranscriptPath(homeDir, `${newestSessionId}${AGENT_SESSION_STORE.JSONL_EXTENSION}`),
    codexTranscript({ sessionId: newestSessionId, cwd, timestamp }),
    nowMs,
  );
  fs.writeFile(
    codexTranscriptPath(homeDir, `${olderSessionId}${AGENT_SESSION_STORE.JSONL_EXTENSION}`),
    codexTranscript({ sessionId: olderSessionId, cwd, timestamp: olderTimestamp }),
    olderModifiedAtMs,
  );

  return { fs, homeDir, worktreeRoot, cwd, nowMs, newestSessionId, olderSessionId };
}

function createProgramForFixture(
  fixture: ResumeFixture,
  options: {
    readonly pickCandidate?: (candidates: readonly AgentResumeCandidate[]) => Promise<AgentResumePickerResult>;
    readonly launchCandidate?: (candidate: AgentResumeCandidate) => Promise<number>;
    readonly writeStdout?: (output: string) => void;
    readonly writeStderr?: (output: string) => void;
    readonly exit?: (exitCode: number) => never;
  } = {},
) {
  return createCliProgram({
    domains: [
      createAgentDomain({
        isInteractiveTerminal: () => true,
        resumeDeps: {
          fs: fixture.fs,
          homeDir: () => fixture.homeDir,
          nowMs: () => fixture.nowMs,
          resolveWorktreeRoot: async (candidateCwd, fallbackWorktreeRoot) =>
            isPathInsideOrEqual(fixture.worktreeRoot, candidateCwd) ? fixture.worktreeRoot : fallbackWorktreeRoot,
        },
        pickCandidate: options.pickCandidate
          ?? (async (candidates) => {
            const candidate = candidates.at(0);
            return candidate === undefined ? quitAgentResumePicker() : selectedAgentResumeCandidate(candidate);
          }),
        launchCandidate: options.launchCandidate
          ?? (async () => sampleAgentResumeValue(arbitraryAgentLaunchExitCode(), 6)),
      }),
    ],
    processCwd: () => fixture.cwd,
    writeStdout: options.writeStdout,
    writeStderr: options.writeStderr,
    exit: options.exit,
  });
}

describe("agent resume mode behavior mappings", () => {
  it("default mode opens the interactive picker and launches the chosen session", async () => {
    const fixture = createResumeFixture();
    const launchExitCode = sampleAgentResumeValue(arbitraryAgentLaunchExitCode(), 7);
    const pickedSessionIds: string[] = [];
    const launchedSessionIds: string[] = [];
    const program = createProgramForFixture(fixture, {
      pickCandidate: async (candidates) => {
        const chosen = candidates.at(1);
        if (chosen === undefined) {
          return quitAgentResumePicker();
        }
        pickedSessionIds.push(chosen.sessionId);
        return selectedAgentResumeCandidate(chosen);
      },
      launchCandidate: async (candidate) => {
        launchedSessionIds.push(candidate.sessionId);
        return launchExitCode;
      },
      exit: (exitCode) => {
        throw new ImmediateExit(exitCode);
      },
    });
    program.exitOverride();

    await expect(
      program.parseAsync([AGENT_CLI.commandName, AGENT_CLI.resumeCommandName], { from: SPX_COMMANDER_PARSE_SOURCE }),
    ).rejects.toMatchObject({ exitCode: launchExitCode });

    expect(pickedSessionIds).toEqual([fixture.olderSessionId]);
    expect(launchedSessionIds).toEqual([fixture.olderSessionId]);
  });

  it("latest mode launches the newest matching session without opening the picker", async () => {
    const fixture = createResumeFixture();
    const launchExitCode = sampleAgentResumeValue(arbitraryAgentLaunchExitCode(), 8);
    const launchedSessionIds: string[] = [];
    const program = createProgramForFixture(fixture, {
      pickCandidate: async () => {
        throw new Error("latest mode should not open the picker");
      },
      launchCandidate: async (candidate) => {
        launchedSessionIds.push(candidate.sessionId);
        return launchExitCode;
      },
      exit: (exitCode) => {
        throw new ImmediateExit(exitCode);
      },
    });
    program.exitOverride();

    await expect(
      program.parseAsync([AGENT_CLI.commandName, AGENT_CLI.resumeCommandName, AGENT_CLI.flags.latest], {
        from: SPX_COMMANDER_PARSE_SOURCE,
      }),
    ).rejects.toMatchObject({ exitCode: launchExitCode });

    expect(launchedSessionIds).toEqual([fixture.newestSessionId]);
  });

  it("default mode treats picker quit as a successful exit without launching an agent", async () => {
    const fixture = createResumeFixture();
    const stderr: string[] = [];
    const launchedSessionIds: string[] = [];
    const program = createCliProgram({
      domains: [
        createAgentDomain({
          isInteractiveTerminal: () => true,
          resumeDeps: {
            fs: fixture.fs,
            homeDir: () => fixture.homeDir,
            nowMs: () => fixture.nowMs,
            resolveWorktreeRoot: async (candidateCwd, fallbackWorktreeRoot) =>
              isPathInsideOrEqual(fixture.worktreeRoot, candidateCwd) ? fixture.worktreeRoot : fallbackWorktreeRoot,
          },
          pickCandidate: async () => quitAgentResumePicker(),
          launchCandidate: async (candidate) => {
            launchedSessionIds.push(candidate.sessionId);
            return sampleAgentResumeValue(arbitraryAgentLaunchExitCode(), 9);
          },
        }),
      ],
      processCwd: () => fixture.cwd,
      writeStderr: (output) => stderr.push(output),
      exit: (exitCode) => {
        throw new ImmediateExit(exitCode);
      },
    });
    program.exitOverride();

    await expect(
      program.parseAsync([AGENT_CLI.commandName, AGENT_CLI.resumeCommandName], {
        from: SPX_COMMANDER_PARSE_SOURCE,
      }),
    ).rejects.toMatchObject({ exitCode: AGENT_CLI_EXIT.SUCCESS });

    expect(stderr.join("")).not.toContain(AGENT_RESUME_TEXT.NO_MATCHES);
    expect(launchedSessionIds).toEqual([]);
  });

  it("list mode prints matching sessions without launching an agent", async () => {
    const fixture = createResumeFixture();
    const stdout: string[] = [];
    const program = createProgramForFixture(fixture, {
      writeStdout: (output) => stdout.push(output),
      launchCandidate: async () => {
        throw new Error("list mode should not launch an agent");
      },
    });

    await program.parseAsync([AGENT_CLI.commandName, AGENT_CLI.resumeCommandName, AGENT_CLI.flags.list], {
      from: SPX_COMMANDER_PARSE_SOURCE,
    });

    const rendered = stdout.join("");
    expect(rendered).toContain(fixture.cwd);
    expect(rendered.indexOf(fixture.newestSessionId)).toBeGreaterThanOrEqual(0);
    expect(rendered.indexOf(fixture.newestSessionId)).toBeLessThan(rendered.indexOf(fixture.olderSessionId));
  });

  it("json mode prints matching sessions as parseable JSON without launching an agent", async () => {
    const fixture = createResumeFixture();
    const stdout: string[] = [];
    const program = createProgramForFixture(fixture, {
      writeStdout: (output) => stdout.push(output),
      launchCandidate: async () => {
        throw new Error("json mode should not launch an agent");
      },
    });

    await program.parseAsync([AGENT_CLI.commandName, AGENT_CLI.resumeCommandName, AGENT_CLI.flags.json], {
      from: SPX_COMMANDER_PARSE_SOURCE,
    });

    const parsed = JSON.parse(stdout.join("")) as readonly AgentResumeCandidate[];
    expect(parsed.map((candidate) => candidate.sessionId)).toEqual([fixture.newestSessionId, fixture.olderSessionId]);
  });

  it.each(
    [
      [[AGENT_CLI.flags.latest, AGENT_CLI.flags.list], [AGENT_RESUME_MODE.LATEST, AGENT_RESUME_MODE.LIST]],
      [[AGENT_CLI.flags.latest, AGENT_CLI.flags.json], [AGENT_RESUME_MODE.LATEST, AGENT_RESUME_MODE.JSON]],
      [[AGENT_CLI.flags.list, AGENT_CLI.flags.json], [AGENT_RESUME_MODE.LIST, AGENT_RESUME_MODE.JSON]],
      [
        [AGENT_CLI.flags.latest, AGENT_CLI.flags.list, AGENT_CLI.flags.json],
        [AGENT_RESUME_MODE.LATEST, AGENT_RESUME_MODE.LIST, AGENT_RESUME_MODE.JSON],
      ],
    ] as const,
  )(
    "conflicting mode flags %j write a diagnostic and exit non-zero without launching an agent",
    async (flags, expectedModes) => {
      const fixture = createResumeFixture();
      const stderr: string[] = [];
      const launchedSessionIds: string[] = [];
      const program = createProgramForFixture(fixture, {
        launchCandidate: async (candidate) => {
          launchedSessionIds.push(candidate.sessionId);
          return sampleAgentResumeValue(arbitraryAgentLaunchExitCode(), 10);
        },
        writeStderr: (output) => stderr.push(output),
        exit: (exitCode) => {
          throw new ImmediateExit(exitCode);
        },
      });
      program.exitOverride();

      await expect(
        program.parseAsync([AGENT_CLI.commandName, AGENT_CLI.resumeCommandName, ...flags], {
          from: SPX_COMMANDER_PARSE_SOURCE,
        }),
      ).rejects.toMatchObject({ exitCode: AGENT_CLI_EXIT.FAILURE });

      expect(stderr.join("")).toContain(AGENT_RESUME_TEXT.MODE_CONFLICT);
      for (const expectedMode of expectedModes) {
        expect(stderr.join("")).toContain(expectedMode);
      }
      expect(launchedSessionIds).toEqual([]);
    },
  );
});

describe("agent resume launch command mappings", () => {
  it("maps Codex and Claude Code candidates to native resume commands from the recorded cwd", () => {
    const codex = agentResumeCandidate({ agent: AGENT_SESSION_KIND.CODEX });
    const claudeCode = agentResumeCandidate({ agent: AGENT_SESSION_KIND.CLAUDE_CODE });

    expect(buildAgentResumeLaunchCommand(codex)).toEqual({
      command: AGENT_RESUME_COMMAND.CODEX_BINARY,
      args: [AGENT_RESUME_COMMAND.CODEX_RESUME, codex.sessionId],
      cwd: codex.cwd,
    });
    expect(buildAgentResumeLaunchCommand(claudeCode)).toEqual({
      command: AGENT_RESUME_COMMAND.CLAUDE_BINARY,
      args: [AGENT_RESUME_COMMAND.CLAUDE_RESUME, claudeCode.sessionId],
      cwd: claudeCode.cwd,
    });
  });
});

describe("agent resume scope mappings", () => {
  it("maps the active scope to its candidate set: worktree by recorded cwd, branch by initial branch across worktrees", async () => {
    const fs = new MemoryAgentSessionFileSystem();
    const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), 50);
    const timestamp = new Date(nowMs).toISOString();
    const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 51);
    const worktreeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 52);
    const siblingRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 53);
    const cwdInWorktree = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), 54);
    const cwdInSibling = sampleAgentResumeValue(arbitraryAgentSessionCwd(siblingRoot), 55);
    const targetBranch = sampleAgentResumeValue(arbitraryAgentBranch(), 56);
    const otherBranch = sampleAgentResumeValue(arbitraryAgentBranch(), 57);
    const worktreeOnTarget = sampleAgentResumeValue(arbitraryAgentSessionId(), 58);
    const siblingOnTarget = sampleAgentResumeValue(arbitraryAgentSessionId(), 59);
    const worktreeOnOther = sampleAgentResumeValue(arbitraryAgentSessionId(), 60);

    fs.writeFile(
      codexTranscriptPath(homeDir, `${worktreeOnTarget}${AGENT_SESSION_STORE.JSONL_EXTENSION}`),
      codexTranscript({ sessionId: worktreeOnTarget, cwd: cwdInWorktree, timestamp, branch: targetBranch }),
      nowMs,
    );
    fs.writeFile(
      claudeProjectTranscriptPath(homeDir, cwdInSibling, `${siblingOnTarget}${AGENT_SESSION_STORE.JSONL_EXTENSION}`),
      claudeCodeTranscript({ sessionId: siblingOnTarget, cwd: cwdInSibling, timestamp, branch: targetBranch }),
      nowMs - 1,
    );
    fs.writeFile(
      codexTranscriptPath(homeDir, `${worktreeOnOther}${AGENT_SESSION_STORE.JSONL_EXTENSION}`),
      codexTranscript({ sessionId: worktreeOnOther, cwd: cwdInWorktree, timestamp, branch: otherBranch }),
      nowMs - 2,
    );

    const resolveWorktreeRoot = async (candidateCwd: string): Promise<string | null> => {
      if (isPathInsideOrEqual(worktreeRoot, candidateCwd)) return worktreeRoot;
      if (isPathInsideOrEqual(siblingRoot, candidateCwd)) return siblingRoot;
      return null;
    };
    const cases: readonly { readonly scope: AgentResumeScope; readonly expected: readonly string[] }[] = [
      { scope: worktreeResumeScope(), expected: [worktreeOnTarget, worktreeOnOther] },
      { scope: branchResumeScope(targetBranch), expected: [worktreeOnTarget, siblingOnTarget] },
    ];

    for (const testCase of cases) {
      const candidates = await discoverAgentResumeCandidates({
        invocationDir: cwdInWorktree,
        homeDir,
        nowMs,
        scope: testCase.scope,
        fs,
        resolveWorktreeRoot,
      });
      expect(new Set(candidates.map((candidate) => candidate.sessionId))).toEqual(new Set(testCase.expected));
    }
  });

  it("scopes the CLI resume candidate set to the branch flag through Commander", async () => {
    const fs = new MemoryAgentSessionFileSystem();
    const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), 61);
    const timestamp = new Date(nowMs).toISOString();
    const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 62);
    const worktreeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 63);
    const siblingRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 64);
    const invocationCwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), 65);
    const siblingCwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(siblingRoot), 66);
    const targetBranch = sampleAgentResumeValue(arbitraryAgentBranch(), 67);
    const otherBranch = sampleAgentResumeValue(arbitraryAgentBranch(), 68);
    const siblingOnTarget = sampleAgentResumeValue(arbitraryAgentSessionId(), 69);
    const worktreeOnOther = sampleAgentResumeValue(arbitraryAgentSessionId(), 70);
    fs.writeFile(
      codexTranscriptPath(homeDir, `${siblingOnTarget}${AGENT_SESSION_STORE.JSONL_EXTENSION}`),
      codexTranscript({ sessionId: siblingOnTarget, cwd: siblingCwd, timestamp, branch: targetBranch }),
      nowMs,
    );
    fs.writeFile(
      codexTranscriptPath(homeDir, `${worktreeOnOther}${AGENT_SESSION_STORE.JSONL_EXTENSION}`),
      codexTranscript({ sessionId: worktreeOnOther, cwd: invocationCwd, timestamp, branch: otherBranch }),
      nowMs - 1,
    );
    const stdout: string[] = [];
    const program = createCliProgram({
      domains: [
        createAgentDomain({
          isInteractiveTerminal: () => true,
          resumeDeps: {
            fs,
            homeDir: () => homeDir,
            nowMs: () => nowMs,
            resolveWorktreeRoot: async (candidateCwd, fallbackWorktreeRoot) =>
              isPathInsideOrEqual(worktreeRoot, candidateCwd) ? worktreeRoot : fallbackWorktreeRoot,
          },
          launchCandidate: async () => {
            throw new Error("list mode should not launch an agent");
          },
        }),
      ],
      processCwd: () => invocationCwd,
      writeStdout: (output) => stdout.push(output),
    });

    await program.parseAsync(
      [AGENT_CLI.commandName, AGENT_CLI.resumeCommandName, AGENT_CLI.flags.branch, targetBranch, AGENT_CLI.flags.list],
      { from: SPX_COMMANDER_PARSE_SOURCE },
    );

    const rendered = stdout.join("");
    expect(rendered).toContain(siblingOnTarget);
    expect(rendered).not.toContain(worktreeOnOther);
  });
});

describe("agent resume picker state mappings", () => {
  it("maps Ink key input to pure picker actions and clamps selection to the candidate bounds", () => {
    let state = initialAgentResumePickerState();

    expect(resolveAgentResumePickerAction({
      input: "",
      upArrow: true,
      downArrow: false,
      return: false,
      escape: false,
    })).toBe(AGENT_RESUME_PICKER_ACTION.MOVE_UP);
    expect(resolveAgentResumePickerAction({
      input: "",
      upArrow: false,
      downArrow: true,
      return: false,
      escape: false,
    })).toBe(AGENT_RESUME_PICKER_ACTION.MOVE_DOWN);
    expect(resolveAgentResumePickerAction({
      input: "",
      upArrow: false,
      downArrow: false,
      return: true,
      escape: false,
    })).toBe(AGENT_RESUME_PICKER_ACTION.CHOOSE);
    expect(resolveAgentResumePickerAction({
      input: "q",
      upArrow: false,
      downArrow: false,
      return: false,
      escape: false,
    })).toBe(AGENT_RESUME_PICKER_ACTION.QUIT);
    expect(resolveAgentResumePickerAction({
      input: "",
      upArrow: false,
      downArrow: false,
      return: false,
      escape: true,
    })).toBe(AGENT_RESUME_PICKER_ACTION.QUIT);

    state = reduceAgentResumePickerState(state, AGENT_RESUME_PICKER_ACTION.MOVE_UP, 2);
    expect(state.selectedIndex).toBe(0);
    state = reduceAgentResumePickerState(state, AGENT_RESUME_PICKER_ACTION.MOVE_DOWN, 2);
    expect(state.selectedIndex).toBe(1);
    state = reduceAgentResumePickerState(state, AGENT_RESUME_PICKER_ACTION.MOVE_DOWN, 2);
    expect(state.selectedIndex).toBe(1);
    state = reduceAgentResumePickerState(state, AGENT_RESUME_PICKER_ACTION.MOVE_UP, 2);
    expect(state.selectedIndex).toBe(0);
  });
});
