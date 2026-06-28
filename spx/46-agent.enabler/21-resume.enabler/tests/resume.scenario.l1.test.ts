import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { AGENT_RESUME_LIMITS, AGENT_SESSION_KIND, AGENT_SESSION_STORE } from "@/domains/agent/protocol";
import {
  type AgentResumeCandidate,
  buildAgentResumeLaunchCommand,
  discoverAgentResumeCandidates,
} from "@/domains/agent/resume";
import { AGENT_CLI, createAgentDomain } from "@/interfaces/cli/agent";
import { launchAgentResume } from "@/interfaces/cli/agent/resume/launch-agent-resume";
import { selectedAgentResumeCandidate } from "@/interfaces/cli/agent/resume/run-picker";
import { FOREGROUND_LAUNCH_STDIO } from "@/interfaces/cli/foreground-launch";
import { SPX_COMMANDER_PARSE_SOURCE } from "@/interfaces/cli/product-context";
import { createCliProgram } from "@/interfaces/cli/program";
import {
  arbitraryAgentLaunchExitCode,
  arbitraryAgentResumeNowMs,
  arbitraryAgentSessionCwd,
  arbitraryAgentSessionId,
  arbitraryAgentWorktreeRoot,
  sampleAgentResumeValue,
} from "@testing/generators/agent/resume";
import { renderAgentResumePickerView } from "@testing/harnesses/agent/picker";
import {
  agentResumeCandidate,
  claudeCodeTranscript,
  codexTranscript,
  codexTranscriptPath,
  ImmediateExit,
  isPathInsideOrEqual,
  MemoryAgentSessionFileSystem,
} from "@testing/harnesses/agent/resume";
import { RecordingLaunchRunner, RecordingSuspender } from "@testing/harnesses/session/launch-runner";

describe("agent resume discovery scenarios", () => {
  it("includes sessions recorded inside the invocation worktree and excludes sibling worktrees", async () => {
    const fs = new MemoryAgentSessionFileSystem();
    const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs());
    const sessionTimestamp = new Date(nowMs).toISOString();
    const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot());
    const worktreeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 1);
    const siblingRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 2);
    const invocationDir = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), 3);
    const codexSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 4);
    const claudeSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 5);
    const siblingSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 6);
    const codexCwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), 7);
    const claudeCwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), 8);
    const siblingCwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(siblingRoot), 9);
    const claudeSourceFileName = `${claudeSessionId}${AGENT_SESSION_STORE.JSONL_EXTENSION}`;

    fs.writeFile(
      codexTranscriptPath(homeDir, `${codexSessionId}${AGENT_SESSION_STORE.JSONL_EXTENSION}`),
      codexTranscript({ sessionId: codexSessionId, cwd: codexCwd, timestamp: sessionTimestamp }),
      nowMs,
    );
    fs.writeFile(
      join(homeDir, AGENT_SESSION_STORE.CLAUDE_DIR, AGENT_SESSION_STORE.CLAUDE_PROJECTS_DIR, claudeSourceFileName),
      claudeCodeTranscript({ sessionId: claudeSessionId, cwd: claudeCwd, timestamp: sessionTimestamp }),
      nowMs - AGENT_RESUME_LIMITS.MILLISECONDS_PER_SECOND,
    );
    fs.writeFile(
      codexTranscriptPath(homeDir, `${siblingSessionId}${AGENT_SESSION_STORE.JSONL_EXTENSION}`),
      codexTranscript({ sessionId: siblingSessionId, cwd: siblingCwd, timestamp: sessionTimestamp }),
      nowMs,
    );

    const candidates = await discoverAgentResumeCandidates({
      invocationDir,
      homeDir,
      nowMs,
      fs,
      resolveWorktreeRoot: async (cwd) => {
        if (isPathInsideOrEqual(worktreeRoot, cwd)) return worktreeRoot;
        if (isPathInsideOrEqual(siblingRoot, cwd)) return siblingRoot;
        return null;
      },
    });

    expect(candidates.map((candidate) => [candidate.agent, candidate.sessionId])).toEqual([
      [AGENT_SESSION_KIND.CODEX, codexSessionId],
      [AGENT_SESSION_KIND.CLAUDE_CODE, claudeSessionId],
    ]);
  });

  it("lets the interactive picker choose a candidate and launches it through the agent command", async () => {
    const fs = new MemoryAgentSessionFileSystem();
    const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 10);
    const sessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 13);
    const sourcePath = codexTranscriptPath(
      homeDir,
      `${sessionId}${AGENT_SESSION_STORE.JSONL_EXTENSION}`,
    );
    const chosen = agentResumeCandidate({
      cwd: sampleAgentResumeValue(
        arbitraryAgentSessionCwd(sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 11)),
        12,
      ),
      sessionId,
      sourcePath,
    });
    const launchExitCode = sampleAgentResumeValue(arbitraryAgentLaunchExitCode());
    const launched: AgentResumeCandidate[] = [];
    const exitCodes: number[] = [];
    fs.writeFile(
      sourcePath,
      codexTranscript({
        sessionId: chosen.sessionId,
        cwd: chosen.cwd,
        timestamp: chosen.updatedAt ?? new Date(chosen.modifiedAtMs).toISOString(),
      }),
      chosen.modifiedAtMs,
    );

    const program = createCliProgram({
      domains: [
        createAgentDomain({
          isInteractiveTerminal: () => true,
          resumeDeps: {
            fs,
            homeDir: () => homeDir,
            nowMs: () => chosen.modifiedAtMs,
            resolveWorktreeRoot: async () => chosen.cwd,
          },
          pickCandidate: async (candidates) => {
            const candidate = candidates.at(0);
            if (candidate === undefined) {
              throw new Error("expected matching agent resume candidate");
            }
            return selectedAgentResumeCandidate(candidate);
          },
          launchCandidate: async (candidate) => {
            launched.push(candidate);
            return launchExitCode;
          },
        }),
      ],
      processCwd: () => chosen.cwd,
      setExitCode: (exitCode) => exitCodes.push(exitCode),
      exit: (exitCode) => {
        exitCodes.push(exitCode);
        throw new ImmediateExit(exitCode);
      },
    });
    program.exitOverride();

    await expect(
      program.parseAsync([AGENT_CLI.commandName, AGENT_CLI.resumeCommandName], { from: SPX_COMMANDER_PARSE_SOURCE }),
    ).rejects.toBeInstanceOf(ImmediateExit);

    expect(launched).toEqual([chosen]);
    expect(exitCodes).toEqual([launchExitCode]);
  });

  it("drives the agent resume picker component through Ink key input", async () => {
    const first = agentResumeCandidate({ sessionId: sampleAgentResumeValue(arbitraryAgentSessionId(), 14) });
    const second = agentResumeCandidate({ sessionId: sampleAgentResumeValue(arbitraryAgentSessionId(), 15) });
    const chosen: AgentResumeCandidate[] = [];
    const view = renderAgentResumePickerView({
      candidates: [first, second],
      onChoose: (candidate) => {
        chosen.push(candidate);
      },
    });

    expect(view.rowLinesFor(first.sessionId)).toHaveLength(1);
    expect(view.rowLinesFor(second.sessionId)).toHaveLength(1);

    await view.arrowDown();
    await view.enter();
    view.unmount();

    expect(chosen).toEqual([second]);
  });

  it("quits the agent resume picker component through q and Escape key input", async () => {
    const candidates = [agentResumeCandidate({ sessionId: sampleAgentResumeValue(arbitraryAgentSessionId(), 16) })];
    const quitActions: readonly ((view: ReturnType<typeof renderAgentResumePickerView>) => Promise<void>)[] = [
      (view) => view.quitWithQ(),
      (view) => view.escape(),
    ];

    for (const quitAction of quitActions) {
      let chose = false;
      let quit = false;
      const view = renderAgentResumePickerView({
        candidates,
        onChoose: () => {
          chose = true;
        },
        onQuit: () => {
          quit = true;
        },
      });

      await quitAction(view);
      view.unmount();

      expect(quit).toBe(true);
      expect(chose).toBe(false);
    }
  });

  it("launches a native agent resume command from the candidate cwd through foreground handoff", async () => {
    const candidate = agentResumeCandidate({
      cwd: sampleAgentResumeValue(
        arbitraryAgentSessionCwd(sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 17)),
        18,
      ),
    });
    const runner = new RecordingLaunchRunner();
    const suspender = new RecordingSuspender();
    const pending = launchAgentResume(runner, suspender, buildAgentResumeLaunchCommand(candidate));

    runner.children[0].emitExit(sampleAgentResumeValue(arbitraryAgentLaunchExitCode(), 19));

    await pending;

    expect(runner.options[0]).toMatchObject({ cwd: candidate.cwd, stdio: FOREGROUND_LAUNCH_STDIO });
    expect(suspender.restoreCount).toBe(1);
  });
});
