import type { SpawnOptions } from "node:child_process";

import { agentHomeDirsFromHomeDir, piSessionStoreDir } from "@/domains/agent/home";
import { AGENT_RESUME_LIMITS, AGENT_SESSION_KIND } from "@/domains/agent/protocol";
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
import {
  agentResumeCandidate,
  agentResumeFixedWorktreeRootResolver,
  agentResumeMultiRootResolver,
  agentResumeWorktreeRootResolver,
  agentSessionJsonlName,
  agentTranscriptActivityRow,
  claudeCodeTranscript,
  claudeProjectTranscriptPath,
  codexTranscript,
  codexTranscriptPath,
  createInteractiveResumeProgram,
  ImmediateExit,
  MemoryAgentSessionFileSystem,
  piTranscript,
  piTranscriptPath,
} from "@testing/harnesses/agent/resume";
import { RecordingLaunchRunner, RecordingSuspender } from "@testing/harnesses/session/launch-runner";

interface PiSinceEvidence {
  readonly actualSessionIds: readonly string[];
  readonly recentSessionId: string;
  readonly staleSessionId: string;
  readonly recentActivityAtMs: number;
  readonly actualActivityAtMs: number | null;
  readonly maxTailReadBytes: number;
}

const PI_SINCE_WINDOW_MS = 60_000;
const PI_RECENT_ACTIVITY_AGE_MS = 30_000;
const PI_STALE_ACTIVITY_AGE_MS = 120_000;

export async function withPiSinceEvidence(
  callback: (evidence: PiSinceEvidence) => void,
): Promise<void> {
  const fs = new MemoryAgentSessionFileSystem();
  const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), 430);
  const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 431);
  const worktreeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 432);
  const cwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), 433);
  const recentSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 434);
  const staleSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 435);
  const recentActivityAtMs = nowMs - PI_RECENT_ACTIVITY_AGE_MS;
  const staleActivityAtMs = nowMs - PI_STALE_ACTIVITY_AGE_MS;
  const filler = "x".repeat(AGENT_RESUME_LIMITS.ACTIVITY_TAIL_BYTES * 2);
  const transcriptPath = piTranscriptPath(homeDir, agentSessionJsonlName(recentSessionId));

  fs.writeFile(
    transcriptPath,
    [
      piTranscript({ sessionId: recentSessionId, cwd, timestamp: new Date(staleActivityAtMs).toISOString() }),
      filler,
      agentTranscriptActivityRow(new Date(recentActivityAtMs).toISOString()),
    ].join("\n"),
    nowMs,
  );
  fs.writeFile(
    piTranscriptPath(homeDir, agentSessionJsonlName(staleSessionId)),
    [
      piTranscript({ sessionId: staleSessionId, cwd, timestamp: new Date(staleActivityAtMs).toISOString() }),
      filler,
      agentTranscriptActivityRow(new Date(staleActivityAtMs).toISOString()),
    ].join("\n"),
    nowMs,
  );

  const candidates = await discoverAgentResumeCandidates({
    invocationDir: cwd,
    agentHomeDirs: agentHomeDirsFromHomeDir(homeDir),
    nowMs,
    scope: worktreeResumeScope(),
    sinceMs: PI_SINCE_WINDOW_MS,
    fs,
    resolveWorktreeRoot: agentResumeFixedWorktreeRootResolver(worktreeRoot),
  });
  callback({
    actualSessionIds: candidates.map((candidate) => candidate.sessionId),
    recentSessionId,
    staleSessionId,
    recentActivityAtMs,
    actualActivityAtMs: candidates.find((candidate) => candidate.sessionId === recentSessionId)?.lastActivityAtMs
      ?? null,
    maxTailReadBytes: fs.maxTailReadBytes(transcriptPath),
  });
}

interface PiWorktreeScopeEvidence {
  readonly actualCandidates: readonly (readonly [string, string])[];
  readonly codexSessionId: string;
  readonly claudeSessionId: string;
  readonly piSessionId: string;
}

export async function withPiWorktreeScopeEvidence(
  callback: (evidence: PiWorktreeScopeEvidence) => void,
): Promise<void> {
  const fs = new MemoryAgentSessionFileSystem();
  const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs());
  const timestamp = new Date(nowMs).toISOString();
  const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 1);
  const worktreeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 2);
  const siblingRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 3);
  const invocationDir = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), 4);
  const codexCwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), 5);
  const claudeCwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), 6);
  const piCwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), 7);
  const siblingCwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(siblingRoot), 8);
  const codexSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 9);
  const claudeSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 10);
  const piSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 11);
  const siblingSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 12);
  fs.writeFile(
    codexTranscriptPath(homeDir, agentSessionJsonlName(codexSessionId)),
    codexTranscript({ sessionId: codexSessionId, cwd: codexCwd, timestamp }),
    nowMs,
  );
  fs.writeFile(
    claudeProjectTranscriptPath(homeDir, claudeCwd, agentSessionJsonlName(claudeSessionId)),
    claudeCodeTranscript({ sessionId: claudeSessionId, cwd: claudeCwd, timestamp }),
    nowMs - 1,
  );
  fs.writeFile(
    piTranscriptPath(homeDir, agentSessionJsonlName(piSessionId)),
    piTranscript({ sessionId: piSessionId, cwd: piCwd, timestamp }),
    nowMs - 2,
  );
  fs.writeFile(
    codexTranscriptPath(homeDir, agentSessionJsonlName(siblingSessionId)),
    codexTranscript({ sessionId: siblingSessionId, cwd: siblingCwd, timestamp }),
    nowMs - 3,
  );
  callback({
    actualCandidates: (await discoverAgentResumeCandidates({
      invocationDir,
      agentHomeDirs: agentHomeDirsFromHomeDir(homeDir),
      nowMs,
      scope: worktreeResumeScope(),
      fs,
      resolveWorktreeRoot: agentResumeMultiRootResolver(worktreeRoot, siblingRoot),
    })).map((candidate) => [candidate.agent, candidate.sessionId]),
    codexSessionId,
    claudeSessionId,
    piSessionId,
  });
}

function sampleRoot(seed: number): string {
  return sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), seed);
}

function sampleCwd(root: string, seed: number): string {
  return sampleAgentResumeValue(arbitraryAgentSessionCwd(root), seed);
}

function sampleSessionId(seed: number): string {
  return sampleAgentResumeValue(arbitraryAgentSessionId(), seed);
}

interface PiBranchScopeEvidence {
  readonly actualSessionIds: readonly string[];
  readonly codexSessionId: string;
  readonly claudeSessionId: string;
  readonly piStoreWasRead: boolean;
}

export async function withPiBranchScopeEvidence(
  callback: (evidence: PiBranchScopeEvidence) => void,
): Promise<void> {
  const fs = new MemoryAgentSessionFileSystem();
  const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), 30);
  const timestamp = new Date(nowMs).toISOString();
  const homeDir = sampleRoot(31);
  const worktreeRoot = sampleRoot(32);
  const siblingRoot = sampleRoot(33);
  const invocationDir = sampleCwd(worktreeRoot, 34);
  const cwdA = sampleCwd(worktreeRoot, 35);
  const cwdB = sampleCwd(siblingRoot, 36);
  const targetBranch = sampleAgentResumeValue(arbitraryAgentBranch(), 37);
  const otherBranch = sampleAgentResumeValue(arbitraryAgentBranch(), 38);
  const codexOnBranch = sampleSessionId(39);
  const claudeOnBranch = sampleSessionId(40);
  const codexOtherBranch = sampleSessionId(41);
  const piWithoutBranch = sampleSessionId(42);
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
    nowMs - 2,
  );
  fs.writeFile(
    piTranscriptPath(homeDir, agentSessionJsonlName(piWithoutBranch)),
    piTranscript({ sessionId: piWithoutBranch, cwd: cwdA, timestamp }),
    nowMs - 3,
  );
  const agentHomeDirs = agentHomeDirsFromHomeDir(homeDir);
  callback({
    actualSessionIds: (await discoverAgentResumeCandidates({
      invocationDir,
      agentHomeDirs,
      nowMs,
      scope: branchResumeScope(targetBranch),
      fs,
      resolveWorktreeRoot: agentResumeMultiRootResolver(worktreeRoot, siblingRoot),
    })).map((candidate) => candidate.sessionId),
    codexSessionId: codexOnBranch,
    claudeSessionId: claudeOnBranch,
    piStoreWasRead: fs.wasDirectoryRead(piSessionStoreDir(agentHomeDirs.piAgent, agentHomeDirs.piSessions)),
  });
}

interface PiInteractiveLaunchEvidence {
  readonly parseError: unknown;
  readonly launchedCandidates: readonly (readonly [string, string, string])[];
  readonly piSessionId: string;
  readonly piSourcePath: string;
  readonly commands: readonly string[];
  readonly args: readonly (readonly string[])[];
  readonly cwd: SpawnOptions["cwd"];
  readonly piCwd: string;
  readonly stdio: SpawnOptions["stdio"];
  readonly restoreCount: number;
  readonly exitCodes: readonly number[];
  readonly launchExitCode: number;
}

export async function withPiInteractiveLaunchEvidence(
  callback: (evidence: PiInteractiveLaunchEvidence) => void,
): Promise<void> {
  const fs = new MemoryAgentSessionFileSystem();
  const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), 50);
  const timestamp = new Date(nowMs).toISOString();
  const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 51);
  const worktreeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 52);
  const invocationDir = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), 53);
  const codexCwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), 54);
  const claudeCwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), 55);
  const piCwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), 56);
  const codexSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 57);
  const claudeSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 58);
  const piSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 59);
  const piSourcePath = piTranscriptPath(homeDir, agentSessionJsonlName(piSessionId));
  const launchExitCode = sampleAgentResumeValue(arbitraryAgentLaunchExitCode(), 60);
  const launched: AgentResumeCandidate[] = [];
  const exitCodes: number[] = [];
  const runner = new RecordingLaunchRunner();
  const suspender = new RecordingSuspender();
  fs.writeFile(
    codexTranscriptPath(homeDir, agentSessionJsonlName(codexSessionId)),
    codexTranscript({ sessionId: codexSessionId, cwd: codexCwd, timestamp }),
    nowMs,
  );
  fs.writeFile(
    claudeProjectTranscriptPath(homeDir, claudeCwd, agentSessionJsonlName(claudeSessionId)),
    claudeCodeTranscript({ sessionId: claudeSessionId, cwd: claudeCwd, timestamp }),
    nowMs - 1,
  );
  fs.writeFile(piSourcePath, piTranscript({ sessionId: piSessionId, cwd: piCwd, timestamp }), nowMs - 2);
  const program = createInteractiveResumeProgram({
    fs,
    homeDir,
    cwd: invocationDir,
    nowMs,
    resolveWorktreeRoot: agentResumeFixedWorktreeRootResolver(worktreeRoot),
    pickCandidate: async (candidates) => {
      const candidate = candidates.find((value) => value.agent === AGENT_SESSION_KIND.PI);
      if (candidate === undefined) {
        throw new Error("expected matching Pi resume candidate");
      }
      return selectedAgentResumeCandidate(candidate);
    },
    launchCandidate: async (candidate) => {
      launched.push(candidate);
      const pending = launchAgentResume(runner, suspender, buildAgentResumeLaunchCommand(candidate));
      runner.children[0].emitExit(launchExitCode);
      return pending;
    },
    setExitCode: (exitCode) => exitCodes.push(exitCode),
    exit: (exitCode) => {
      exitCodes.push(exitCode);
      throw new ImmediateExit(exitCode);
    },
  });
  program.exitOverride();
  let parseError: unknown;
  try {
    await program.parseAsync([AGENT_CLI.commandName, AGENT_CLI.resumeCommandName], {
      from: SPX_COMMANDER_PARSE_SOURCE,
    });
  } catch (error) {
    parseError = error;
  }
  callback({
    parseError,
    launchedCandidates: launched.map((candidate) => [candidate.agent, candidate.sessionId, candidate.sourcePath]),
    piSessionId,
    piSourcePath,
    commands: runner.commands,
    args: runner.args,
    cwd: runner.options[0]?.cwd,
    piCwd,
    stdio: runner.options[0]?.stdio,
    restoreCount: suspender.restoreCount,
    exitCodes,
    launchExitCode,
  });
}

interface PiScopeMappingEvidence {
  readonly actualRows: readonly (readonly string[])[];
  readonly worktreeOnTarget: string;
  readonly worktreeOnOther: string;
  readonly piInWorktree: string;
  readonly siblingOnTarget: string;
}

export async function withPiScopeMappingEvidence(
  callback: (evidence: PiScopeMappingEvidence) => void,
): Promise<void> {
  const fs = new MemoryAgentSessionFileSystem();
  const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), 70);
  const timestamp = new Date(nowMs).toISOString();
  const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 71);
  const worktreeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 72);
  const siblingRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 73);
  const cwdInWorktree = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), 74);
  const cwdInSibling = sampleAgentResumeValue(arbitraryAgentSessionCwd(siblingRoot), 75);
  const targetBranch = sampleAgentResumeValue(arbitraryAgentBranch(), 76);
  const otherBranch = sampleAgentResumeValue(arbitraryAgentBranch(), 77);
  const worktreeOnTarget = sampleAgentResumeValue(arbitraryAgentSessionId(), 78);
  const siblingOnTarget = sampleAgentResumeValue(arbitraryAgentSessionId(), 79);
  const worktreeOnOther = sampleAgentResumeValue(arbitraryAgentSessionId(), 80);
  const piInWorktree = sampleAgentResumeValue(arbitraryAgentSessionId(), 81);
  const transcriptFiles = [
    {
      path: codexTranscriptPath(homeDir, agentSessionJsonlName(worktreeOnTarget)),
      content: codexTranscript({ sessionId: worktreeOnTarget, cwd: cwdInWorktree, timestamp, branch: targetBranch }),
      mtimeMs: nowMs,
    },
    {
      path: claudeProjectTranscriptPath(homeDir, cwdInSibling, agentSessionJsonlName(siblingOnTarget)),
      content: claudeCodeTranscript({ sessionId: siblingOnTarget, cwd: cwdInSibling, timestamp, branch: targetBranch }),
      mtimeMs: nowMs - 1,
    },
    {
      path: codexTranscriptPath(homeDir, agentSessionJsonlName(worktreeOnOther)),
      content: codexTranscript({ sessionId: worktreeOnOther, cwd: cwdInWorktree, timestamp, branch: otherBranch }),
      mtimeMs: nowMs - 2,
    },
    {
      path: piTranscriptPath(homeDir, agentSessionJsonlName(piInWorktree)),
      content: piTranscript({ sessionId: piInWorktree, cwd: cwdInWorktree, timestamp }),
      mtimeMs: nowMs - 3,
    },
  ];
  for (const transcriptFile of transcriptFiles) {
    fs.writeFile(transcriptFile.path, transcriptFile.content, transcriptFile.mtimeMs);
  }
  const resolveWorktreeRoot = agentResumeMultiRootResolver(worktreeRoot, siblingRoot);
  callback({
    actualRows: [
      (await discoverAgentResumeCandidates({
        invocationDir: cwdInWorktree,
        agentHomeDirs: agentHomeDirsFromHomeDir(homeDir),
        nowMs,
        scope: worktreeResumeScope(),
        fs,
        resolveWorktreeRoot,
      })).map((candidate) => candidate.sessionId),
      (await discoverAgentResumeCandidates({
        invocationDir: cwdInWorktree,
        agentHomeDirs: agentHomeDirsFromHomeDir(homeDir),
        nowMs,
        scope: branchResumeScope(targetBranch),
        fs,
        resolveWorktreeRoot,
      })).map((candidate) => candidate.sessionId),
    ],
    worktreeOnTarget,
    worktreeOnOther,
    piInWorktree,
    siblingOnTarget,
  });
}

interface BranchListOutputInput {
  readonly fs: MemoryAgentSessionFileSystem;
  readonly homeDir: string;
  readonly cwd: string;
  readonly nowMs: number;
  readonly worktreeRoot: string;
  readonly branch: string;
}

async function branchListOutput(input: BranchListOutputInput): Promise<string> {
  const output: string[] = [];
  const program = createInteractiveResumeProgram({
    fs: input.fs,
    homeDir: input.homeDir,
    cwd: input.cwd,
    nowMs: input.nowMs,
    resolveWorktreeRoot: agentResumeWorktreeRootResolver(input.worktreeRoot),
    launchCandidate: async () => {
      throw new Error("list mode should not launch an agent");
    },
    writeStdout: (text) => output.push(text),
  });
  await program.parseAsync(
    [AGENT_CLI.commandName, AGENT_CLI.resumeCommandName, AGENT_CLI.flags.branch, input.branch, AGENT_CLI.flags.list],
    { from: SPX_COMMANDER_PARSE_SOURCE },
  );
  return output.join("");
}

interface PiBranchCliScopeEvidence {
  readonly output: string;
  readonly includedSessionId: string;
  readonly excludedSessionIds: readonly string[];
}

export async function withPiBranchCliScopeEvidence(
  callback: (evidence: PiBranchCliScopeEvidence) => void,
): Promise<void> {
  const fs = new MemoryAgentSessionFileSystem();
  const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), 90);
  const timestamp = new Date(nowMs).toISOString();
  const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 91);
  const worktreeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 92);
  const siblingRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 93);
  const invocationCwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), 94);
  const siblingCwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(siblingRoot), 95);
  const targetBranch = sampleAgentResumeValue(arbitraryAgentBranch(), 96);
  const otherBranch = sampleAgentResumeValue(arbitraryAgentBranch(), 97);
  const siblingOnTarget = sampleAgentResumeValue(arbitraryAgentSessionId(), 98);
  const worktreeOnOther = sampleAgentResumeValue(arbitraryAgentSessionId(), 99);
  const piWithoutBranch = sampleAgentResumeValue(arbitraryAgentSessionId(), 100);
  fs.writeFile(
    codexTranscriptPath(homeDir, agentSessionJsonlName(siblingOnTarget)),
    codexTranscript({ sessionId: siblingOnTarget, cwd: siblingCwd, timestamp, branch: targetBranch }),
    nowMs,
  );
  fs.writeFile(
    codexTranscriptPath(homeDir, agentSessionJsonlName(worktreeOnOther)),
    codexTranscript({ sessionId: worktreeOnOther, cwd: invocationCwd, timestamp, branch: otherBranch }),
    nowMs - 1,
  );
  fs.writeFile(
    piTranscriptPath(homeDir, agentSessionJsonlName(piWithoutBranch)),
    piTranscript({ sessionId: piWithoutBranch, cwd: invocationCwd, timestamp }),
    nowMs - 2,
  );
  callback({
    output: await branchListOutput({ fs, homeDir, cwd: invocationCwd, nowMs, worktreeRoot, branch: targetBranch }),
    includedSessionId: siblingOnTarget,
    excludedSessionIds: [worktreeOnOther, piWithoutBranch],
  });
}

interface PiLaunchMappingEvidence {
  readonly actual: ReturnType<typeof buildAgentResumeLaunchCommand>;
  readonly candidate: AgentResumeCandidate;
}

export function withPiLaunchMappingEvidence(
  callback: (evidence: PiLaunchMappingEvidence) => void,
): void {
  const candidate = agentResumeCandidate({ agent: AGENT_SESSION_KIND.PI });
  callback({
    actual: buildAgentResumeLaunchCommand(candidate),
    candidate,
  });
}
