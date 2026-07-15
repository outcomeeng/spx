import { describe, expect, it } from "vitest";

import { agentHomeDirsFromHomeDir } from "@/domains/agent/home";
import { AGENT_SESSION_KIND } from "@/domains/agent/protocol";
import {
  type AgentResumeCandidate,
  branchResumeScope,
  buildAgentResumeLaunchCommand,
  discoverAgentResumeCandidates,
  worktreeResumeScope,
} from "@/domains/agent/resume";
import { AGENT_CLI } from "@/interfaces/cli/agent";
import { launchAgentResume } from "@/interfaces/cli/agent/resume/launch-agent-resume";
import { selectedAgentResumeCandidate } from "@/interfaces/cli/agent/resume/run-picker";
import { FOREGROUND_LAUNCH_STDIO } from "@/interfaces/cli/foreground-launch";
import { SPX_COMMANDER_PARSE_SOURCE } from "@/interfaces/cli/product-context";
import {
  arbitraryAgentBranch,
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
  agentResumeFixedWorktreeRootResolver,
  agentResumeMultiRootResolver,
  agentSessionJsonlName,
  claudeCodeTranscript,
  claudeProjectTranscriptPath,
  codexTranscript,
  codexTranscriptPath,
  piTranscript,
  piTranscriptPath,
  createInteractiveResumeProgram,
  ImmediateExit,
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
    const piSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 6);
    const siblingSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 7);
    const codexCwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), 8);
    const claudeCwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), 9);
    const piCwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), 10);
    const siblingCwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(siblingRoot), 11);

    fs.writeFile(
      codexTranscriptPath(homeDir, agentSessionJsonlName(codexSessionId)),
      codexTranscript({ sessionId: codexSessionId, cwd: codexCwd, timestamp: sessionTimestamp }),
      nowMs,
    );
    fs.writeFile(
      claudeProjectTranscriptPath(homeDir, claudeCwd, agentSessionJsonlName(claudeSessionId)),
      claudeCodeTranscript({ sessionId: claudeSessionId, cwd: claudeCwd, timestamp: sessionTimestamp }),
      nowMs - 1,
    );
    fs.writeFile(
      piTranscriptPath(homeDir, agentSessionJsonlName(piSessionId)),
      piTranscript({ sessionId: piSessionId, cwd: piCwd, timestamp: sessionTimestamp }),
      nowMs - 2,
    );
    fs.writeFile(
      codexTranscriptPath(homeDir, agentSessionJsonlName(siblingSessionId)),
      codexTranscript({ sessionId: siblingSessionId, cwd: siblingCwd, timestamp: sessionTimestamp }),
      nowMs,
    );

    const candidates = await discoverAgentResumeCandidates({
      invocationDir,
      agentHomeDirs: agentHomeDirsFromHomeDir(homeDir),
      nowMs,
      scope: worktreeResumeScope(),
      fs,
      resolveWorktreeRoot: agentResumeMultiRootResolver(worktreeRoot, siblingRoot),
    });

    expect(candidates.map((candidate) => [candidate.agent, candidate.sessionId])).toEqual([
      [AGENT_SESSION_KIND.CODEX, codexSessionId],
      [AGENT_SESSION_KIND.CLAUDE_CODE, claudeSessionId],
      [AGENT_SESSION_KIND.PI, piSessionId],
    ]);
  });

  it("includes sessions started on the named branch across worktrees and excludes other branches", async () => {
    const fs = new MemoryAgentSessionFileSystem();
    const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), 30);
    const timestamp = new Date(nowMs).toISOString();
    const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 31);
    const worktreeRootA = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 32);
    const worktreeRootB = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 33);
    const invocationDir = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRootA), 34);
    const cwdA = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRootA), 35);
    const cwdB = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRootB), 36);
    const targetBranch = sampleAgentResumeValue(arbitraryAgentBranch(), 37);
    const otherBranch = sampleAgentResumeValue(arbitraryAgentBranch(), 38);
    const codexOnBranch = sampleAgentResumeValue(arbitraryAgentSessionId(), 39);
    const claudeOnBranch = sampleAgentResumeValue(arbitraryAgentSessionId(), 40);
    const codexOtherBranch = sampleAgentResumeValue(arbitraryAgentSessionId(), 41);

    fs.writeFile(
      codexTranscriptPath(homeDir, agentSessionJsonlName(codexOnBranch)),
      codexTranscript({ sessionId: codexOnBranch, cwd: cwdA, timestamp, branch: targetBranch }),
      nowMs,
    );
    fs.writeFile(
      claudeProjectTranscriptPath(homeDir, cwdB, agentSessionJsonlName(claudeOnBranch)),
      claudeCodeTranscript({ sessionId: claudeOnBranch, cwd: cwdB, timestamp, branch: targetBranch }),
      nowMs - 1,
    );
    fs.writeFile(
      codexTranscriptPath(homeDir, agentSessionJsonlName(codexOtherBranch)),
      codexTranscript({ sessionId: codexOtherBranch, cwd: cwdA, timestamp, branch: otherBranch }),
      nowMs,
    );

    const candidates = await discoverAgentResumeCandidates({
      invocationDir,
      agentHomeDirs: agentHomeDirsFromHomeDir(homeDir),
      nowMs,
      scope: branchResumeScope(targetBranch),
      fs,
      resolveWorktreeRoot: agentResumeFixedWorktreeRootResolver(worktreeRootA),
    });

    expect(new Set(candidates.map((candidate) => candidate.sessionId))).toEqual(
      new Set([codexOnBranch, claudeOnBranch]),
    );
  });

  it("lets the interactive picker choose a candidate and launches it through the agent command", async () => {
    const fs = new MemoryAgentSessionFileSystem();
    const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 10);
    const sessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 13);
    const sourcePath = codexTranscriptPath(homeDir, agentSessionJsonlName(sessionId));
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

    const program = createInteractiveResumeProgram({
      fs,
      homeDir,
      cwd: chosen.cwd,
      nowMs: chosen.modifiedAtMs,
      resolveWorktreeRoot: agentResumeFixedWorktreeRootResolver(chosen.cwd),
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
