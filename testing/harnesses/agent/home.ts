import { resolve } from "node:path";

import { defaultAgentResumeCommandDeps, listAgentResumeSessions } from "@/commands/agent/resume";
import { defaultAgentSearchCommandDeps, jsonAgentSearchSessions } from "@/commands/agent/search";
import {
  AGENT_HOME_ENV,
  type AgentHomeDirs,
  agentHomeDirsFromHomeDir,
  resolveAgentHomeDirs,
} from "@/domains/agent/home";
import { AGENT_SESSION_STORE } from "@/domains/agent/protocol";
import { claudeProjectDirName, worktreeResumeScope } from "@/domains/agent/resume";
import { agentSearchQueryFromOptions } from "@/domains/agent/search";
import {
  arbitraryAgentResumeNowMs,
  arbitraryAgentSessionCwd,
  arbitraryAgentSessionId,
  arbitraryAgentWorktreeRoot,
  sampleAgentResumeValue,
} from "@testing/generators/agent/resume";
import { piTranscript } from "@testing/harnesses/agent/pi-resume";
import {
  agentSessionJsonlName,
  claudeCodeTranscript,
  codexTranscript,
  MemoryAgentSessionFileSystem,
} from "@testing/harnesses/agent/resume";

const CODEX_TRANSCRIPT_PARTS = ["sessions", "2026", "06", "27"] as const;
const CONFIGURED_AGENT_HOME_SAMPLE = {
  DEFAULT_HOME: 401,
  CODEX_HOME: 402,
  CLAUDE_HOME: 403,
  PI_AGENT_HOME: 404,
  PI_SESSION_HOME: 405,
  WORKTREE_ROOT: 406,
  CODEX_CWD: 407,
  CLAUDE_CWD: 408,
  PI_CWD: 409,
  CODEX_SESSION_ID: 410,
  CLAUDE_SESSION_ID: 411,
  PI_SESSION_ID: 412,
  DEFAULT_SESSION_ID: 413,
  NOW_MS: 414,
  DEFAULT_CLAUDE_SESSION_ID: 415,
  DEFAULT_PI_SESSION_ID: 416,
} as const;

interface DefaultAgentSessionStoreEvidence {
  readonly resolvedHomeDirs: AgentHomeDirs;
  readonly homeDir: string;
  readonly resumeOutput: string;
  readonly codexSessionId: string;
  readonly claudeSessionId: string;
  readonly piSessionId: string;
}

export async function withDefaultAgentSessionStoreEvidence(
  callback: (evidence: DefaultAgentSessionStoreEvidence) => void,
): Promise<void> {
  const fs = new MemoryAgentSessionFileSystem();
  const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), 417);
  const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 418);
  const worktreeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 419);
  const cwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), 420);
  const codexSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 421);
  const claudeSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 422);
  const piSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 423);
  const timestamp = new Date(nowMs).toISOString();
  const resolvedHomeDirs = agentHomeDirsFromHomeDir(homeDir);
  writeAgentTranscripts(fs, defaultFixtureHomeDirs(homeDir), {
    codexSessionId,
    claudeSessionId,
    piSessionId,
    cwd,
    timestamp,
    nowMs,
  });

  callback({
    resolvedHomeDirs,
    homeDir,
    resumeOutput: await discoverResume(fs, () => resolvedHomeDirs, worktreeRoot, cwd, nowMs),
    codexSessionId,
    claudeSessionId,
    piSessionId,
  });
}

interface AgentHomeResolutionEvidence {
  readonly configured: AgentHomeDirs;
  readonly configuredInputs: AgentHomeDirs;
  readonly defaults: AgentHomeDirs;
  readonly defaultHome: string;
}

export function withAgentHomeResolutionEvidence(
  callback: (evidence: AgentHomeResolutionEvidence) => void,
): void {
  const defaultHome = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), CONFIGURED_AGENT_HOME_SAMPLE.DEFAULT_HOME);
  const configuredInputs = {
    codex: sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), CONFIGURED_AGENT_HOME_SAMPLE.CODEX_HOME),
    claudeCode: sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), CONFIGURED_AGENT_HOME_SAMPLE.CLAUDE_HOME),
    piAgent: sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), CONFIGURED_AGENT_HOME_SAMPLE.PI_AGENT_HOME),
    piSessions: sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), CONFIGURED_AGENT_HOME_SAMPLE.PI_SESSION_HOME),
  };
  callback({
    configured: resolveAgentHomeDirs({
      [AGENT_HOME_ENV.CODEX]: configuredInputs.codex,
      [AGENT_HOME_ENV.CLAUDE]: configuredInputs.claudeCode,
      [AGENT_HOME_ENV.PI_AGENT]: configuredInputs.piAgent,
      [AGENT_HOME_ENV.PI_SESSIONS]: configuredInputs.piSessions,
    }, { homeDir: () => defaultHome }),
    configuredInputs,
    defaults: resolveAgentHomeDirs({}, { homeDir: () => defaultHome }),
    defaultHome,
  });
}

interface PiAgentDirectoryEvidence {
  readonly resolved: AgentHomeDirs;
  readonly defaultHome: string;
  readonly piAgentHome: string;
  readonly resumeOutput: string;
  readonly defaultResumeOutput: string;
  readonly configuredSessionId: string;
  readonly defaultSessionId: string;
}

export async function withPiAgentDirectoryEvidence(
  callback: (evidence: PiAgentDirectoryEvidence) => void,
): Promise<void> {
  const fs = new MemoryAgentSessionFileSystem();
  const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), 424);
  const defaultHome = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 425);
  const piAgentHome = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 426);
  const worktreeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 427);
  const cwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), 428);
  const configuredSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 429);
  const defaultSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 430);
  const timestamp = new Date(nowMs).toISOString();
  const resolved = resolveAgentHomeDirs({ [AGENT_HOME_ENV.PI_AGENT]: piAgentHome }, { homeDir: () => defaultHome });
  const defaults = agentHomeDirsFromHomeDir(defaultHome);
  fs.writeFile(
    piTranscriptFile(resolve(piAgentHome, AGENT_SESSION_STORE.PI_SESSIONS_DIR), configuredSessionId),
    piTranscript({ sessionId: configuredSessionId, cwd, timestamp }),
    nowMs,
  );
  fs.writeFile(
    piTranscriptFile(
      resolve(
        defaultHome,
        AGENT_SESSION_STORE.PI_DIR,
        AGENT_SESSION_STORE.PI_AGENT_DIR,
        AGENT_SESSION_STORE.PI_SESSIONS_DIR,
      ),
      defaultSessionId,
    ),
    piTranscript({ sessionId: defaultSessionId, cwd, timestamp }),
    nowMs,
  );

  callback({
    resolved,
    defaultHome,
    piAgentHome,
    resumeOutput: await withAgentHomeEnvironment(
      { [AGENT_HOME_ENV.PI_AGENT]: piAgentHome },
      () => discoverResume(fs, defaultAgentResumeCommandDeps.agentHomeDirs, worktreeRoot, cwd, nowMs),
    ),
    defaultResumeOutput: await discoverResume(fs, () => defaults, worktreeRoot, cwd, nowMs),
    configuredSessionId,
    defaultSessionId,
  });
}

interface PiSessionDirectoryEvidence {
  readonly resolved: AgentHomeDirs;
  readonly defaultHome: string;
  readonly piSessionHome: string;
  readonly resumeOutput: string;
  readonly sessionId: string;
}

export async function withPiSessionDirectoryEvidence(
  callback: (evidence: PiSessionDirectoryEvidence) => void,
): Promise<void> {
  const fs = new MemoryAgentSessionFileSystem();
  const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), 431);
  const defaultHome = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 432);
  const piSessionHome = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 433);
  const worktreeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 434);
  const cwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), 435);
  const sessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 436);
  const resolved = resolveAgentHomeDirs(
    { [AGENT_HOME_ENV.PI_SESSIONS]: piSessionHome },
    { homeDir: () => defaultHome },
  );
  fs.writeFile(
    piTranscriptFile(piSessionHome, sessionId),
    piTranscript({ sessionId, cwd, timestamp: new Date(nowMs).toISOString() }),
    nowMs,
  );
  callback({
    resolved,
    defaultHome,
    piSessionHome,
    resumeOutput: await withAgentHomeEnvironment(
      { [AGENT_HOME_ENV.PI_SESSIONS]: piSessionHome },
      () => discoverResume(fs, defaultAgentResumeCommandDeps.agentHomeDirs, worktreeRoot, cwd, nowMs),
    ),
    sessionId,
  });
}

interface ConfiguredAgentHomeDiscoveryEvidence {
  readonly resumeOutput: string;
  readonly defaultResumeOutput: string;
  readonly configuredSearchOutput: string;
  readonly defaultSearchOutput: string;
  readonly configuredCodexSessionId: string;
  readonly configuredClaudeSessionId: string;
  readonly configuredPiSessionId: string;
  readonly defaultCodexSessionId: string;
  readonly defaultClaudeSessionId: string;
  readonly defaultPiSessionId: string;
}

export async function withConfiguredAgentHomeDiscoveryEvidence(
  callback: (evidence: ConfiguredAgentHomeDiscoveryEvidence) => void,
): Promise<void> {
  const fixture = createConfiguredAgentHomeFixture();
  callback({
    resumeOutput: await withAgentHomeEnvironment(
      agentHomeEnvironment(fixture.agentHomeDirs),
      () =>
        discoverResume(
          fixture.fs,
          defaultAgentResumeCommandDeps.agentHomeDirs,
          fixture.worktreeRoot,
          fixture.codexCwd,
          fixture.nowMs,
        ),
    ),
    defaultResumeOutput: await discoverResume(
      fixture.fs,
      () => fixture.defaultHomeDirs,
      fixture.worktreeRoot,
      fixture.codexCwd,
      fixture.nowMs,
    ),
    configuredSearchOutput: await withAgentHomeEnvironment(
      agentHomeEnvironment(fixture.agentHomeDirs),
      () => discoverSearch(fixture, defaultAgentSearchCommandDeps.agentHomeDirs),
    ),
    defaultSearchOutput: await discoverSearch(fixture, () => fixture.defaultHomeDirs),
    configuredCodexSessionId: fixture.codexSessionId,
    configuredClaudeSessionId: fixture.claudeSessionId,
    configuredPiSessionId: fixture.piSessionId,
    defaultCodexSessionId: fixture.defaultCodexSessionId,
    defaultClaudeSessionId: fixture.defaultClaudeSessionId,
    defaultPiSessionId: fixture.defaultPiSessionId,
  });
}

interface ConfiguredAgentHomeFixture {
  readonly fs: MemoryAgentSessionFileSystem;
  readonly agentHomeDirs: AgentHomeDirs;
  readonly defaultHomeDirs: AgentHomeDirs;
  readonly worktreeRoot: string;
  readonly codexCwd: string;
  readonly codexSessionId: string;
  readonly claudeSessionId: string;
  readonly piSessionId: string;
  readonly defaultCodexSessionId: string;
  readonly defaultClaudeSessionId: string;
  readonly defaultPiSessionId: string;
  readonly nowMs: number;
}

function createConfiguredAgentHomeFixture(): ConfiguredAgentHomeFixture {
  const fs = new MemoryAgentSessionFileSystem();
  const agentHomeDirs = {
    codex: sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), CONFIGURED_AGENT_HOME_SAMPLE.CODEX_HOME),
    claudeCode: sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), CONFIGURED_AGENT_HOME_SAMPLE.CLAUDE_HOME),
    piAgent: sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), CONFIGURED_AGENT_HOME_SAMPLE.PI_AGENT_HOME),
    piSessions: sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), CONFIGURED_AGENT_HOME_SAMPLE.PI_SESSION_HOME),
  };
  const defaultHome = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), CONFIGURED_AGENT_HOME_SAMPLE.DEFAULT_HOME);
  const defaultHomeDirs = agentHomeDirsFromHomeDir(defaultHome);
  const worktreeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), CONFIGURED_AGENT_HOME_SAMPLE.WORKTREE_ROOT);
  const codexCwd = sampleAgentResumeValue(
    arbitraryAgentSessionCwd(worktreeRoot),
    CONFIGURED_AGENT_HOME_SAMPLE.CODEX_CWD,
  );
  const claudeCwd = sampleAgentResumeValue(
    arbitraryAgentSessionCwd(worktreeRoot),
    CONFIGURED_AGENT_HOME_SAMPLE.CLAUDE_CWD,
  );
  const piCwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), CONFIGURED_AGENT_HOME_SAMPLE.PI_CWD);
  const codexSessionId = sampleAgentResumeValue(
    arbitraryAgentSessionId(),
    CONFIGURED_AGENT_HOME_SAMPLE.CODEX_SESSION_ID,
  );
  const claudeSessionId = sampleAgentResumeValue(
    arbitraryAgentSessionId(),
    CONFIGURED_AGENT_HOME_SAMPLE.CLAUDE_SESSION_ID,
  );
  const piSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), CONFIGURED_AGENT_HOME_SAMPLE.PI_SESSION_ID);
  const defaultCodexSessionId = sampleAgentResumeValue(
    arbitraryAgentSessionId(),
    CONFIGURED_AGENT_HOME_SAMPLE.DEFAULT_SESSION_ID,
  );
  const defaultClaudeSessionId = sampleAgentResumeValue(
    arbitraryAgentSessionId(),
    CONFIGURED_AGENT_HOME_SAMPLE.DEFAULT_CLAUDE_SESSION_ID,
  );
  const defaultPiSessionId = sampleAgentResumeValue(
    arbitraryAgentSessionId(),
    CONFIGURED_AGENT_HOME_SAMPLE.DEFAULT_PI_SESSION_ID,
  );
  const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), CONFIGURED_AGENT_HOME_SAMPLE.NOW_MS);
  const timestamp = new Date(nowMs).toISOString();
  writeAgentTranscripts(fs, agentHomeDirs, {
    codexSessionId,
    claudeSessionId,
    piSessionId,
    cwd: codexCwd,
    claudeCwd,
    piCwd,
    timestamp,
    nowMs,
  });
  writeAgentTranscripts(fs, defaultFixtureHomeDirs(defaultHome), {
    codexSessionId: defaultCodexSessionId,
    claudeSessionId: defaultClaudeSessionId,
    piSessionId: defaultPiSessionId,
    cwd: codexCwd,
    claudeCwd,
    piCwd,
    timestamp,
    nowMs,
  });
  return {
    fs,
    agentHomeDirs,
    defaultHomeDirs,
    worktreeRoot,
    codexCwd,
    codexSessionId,
    claudeSessionId,
    piSessionId,
    defaultCodexSessionId,
    defaultClaudeSessionId,
    defaultPiSessionId,
    nowMs,
  };
}

function defaultFixtureHomeDirs(homeDir: string): AgentHomeDirs {
  const piAgent = resolve(homeDir, AGENT_SESSION_STORE.PI_DIR, AGENT_SESSION_STORE.PI_AGENT_DIR);
  return {
    codex: resolve(homeDir, AGENT_SESSION_STORE.CODEX_DIR),
    claudeCode: resolve(homeDir, AGENT_SESSION_STORE.CLAUDE_DIR),
    piAgent,
    piSessions: resolve(piAgent, AGENT_SESSION_STORE.PI_SESSIONS_DIR),
  };
}

interface TranscriptSet {
  readonly codexSessionId: string;
  readonly claudeSessionId: string;
  readonly piSessionId: string;
  readonly cwd: string;
  readonly claudeCwd?: string;
  readonly piCwd?: string;
  readonly timestamp: string;
  readonly nowMs: number;
}

function writeAgentTranscripts(fs: MemoryAgentSessionFileSystem, homes: AgentHomeDirs, input: TranscriptSet): void {
  const claudeCwd = input.claudeCwd ?? input.cwd;
  const piCwd = input.piCwd ?? input.cwd;
  fs.writeFile(
    codexTranscriptFile(homes.codex, input.codexSessionId),
    codexTranscript({ sessionId: input.codexSessionId, cwd: input.cwd, timestamp: input.timestamp }),
    input.nowMs,
  );
  fs.writeFile(
    claudeTranscriptFile(homes.claudeCode, claudeCwd, input.claudeSessionId),
    claudeCodeTranscript({ sessionId: input.claudeSessionId, cwd: claudeCwd, timestamp: input.timestamp }),
    input.nowMs,
  );
  fs.writeFile(
    piTranscriptFile(homes.piSessions, input.piSessionId),
    piTranscript({ sessionId: input.piSessionId, cwd: piCwd, timestamp: input.timestamp }),
    input.nowMs,
  );
}

function codexTranscriptFile(codexHome: string, sessionId: string): string {
  return resolve(codexHome, ...CODEX_TRANSCRIPT_PARTS, agentSessionJsonlName(sessionId));
}

function claudeTranscriptFile(claudeHome: string, cwd: string, sessionId: string): string {
  return resolve(
    claudeHome,
    AGENT_SESSION_STORE.CLAUDE_PROJECTS_DIR,
    claudeProjectDirName(cwd),
    agentSessionJsonlName(sessionId),
  );
}

function piTranscriptFile(piSessions: string, sessionId: string): string {
  return resolve(piSessions, agentSessionJsonlName(sessionId));
}

async function discoverResume(
  fs: MemoryAgentSessionFileSystem,
  agentHomeDirs: () => AgentHomeDirs,
  worktreeRoot: string,
  cwd: string,
  nowMs: number,
): Promise<string> {
  return listAgentResumeSessions({
    cwd,
    fallbackWorktreeRoot: worktreeRoot,
    scope: worktreeResumeScope(),
    deps: { fs, agentHomeDirs, nowMs: () => nowMs, resolveWorktreeRoot: async () => worktreeRoot },
  });
}

async function discoverSearch(
  fixture: ConfiguredAgentHomeFixture,
  agentHomeDirs: () => AgentHomeDirs,
): Promise<string> {
  return jsonAgentSearchSessions({
    cwd: fixture.codexCwd,
    fallbackProductScopeRoot: fixture.worktreeRoot,
    query: agentSearchQueryFromOptions({}),
    deps: {
      fs: fixture.fs,
      agentHomeDirs,
      nowMs: () => fixture.nowMs,
      resolveProductScopeRoot: async () => fixture.worktreeRoot,
      resolveBranchAssociatedWorktreeRoots: async () => [],
    },
  });
}

function agentHomeEnvironment(agentHomeDirs: AgentHomeDirs): Record<string, string> {
  return {
    [AGENT_HOME_ENV.CODEX]: agentHomeDirs.codex,
    [AGENT_HOME_ENV.CLAUDE]: agentHomeDirs.claudeCode,
    [AGENT_HOME_ENV.PI_AGENT]: agentHomeDirs.piAgent,
    [AGENT_HOME_ENV.PI_SESSIONS]: agentHomeDirs.piSessions,
  };
}

async function withAgentHomeEnvironment<T>(
  environment: Readonly<Record<string, string>>,
  callback: () => Promise<T>,
): Promise<T> {
  const original = {
    codex: process.env[AGENT_HOME_ENV.CODEX],
    claude: process.env[AGENT_HOME_ENV.CLAUDE],
    piAgent: process.env[AGENT_HOME_ENV.PI_AGENT],
    piSessions: process.env[AGENT_HOME_ENV.PI_SESSIONS],
  };
  delete process.env[AGENT_HOME_ENV.CODEX];
  delete process.env[AGENT_HOME_ENV.CLAUDE];
  delete process.env[AGENT_HOME_ENV.PI_AGENT];
  delete process.env[AGENT_HOME_ENV.PI_SESSIONS];
  Object.assign(process.env, environment);
  try {
    return await callback();
  } finally {
    restoreEnvironment(AGENT_HOME_ENV.CODEX, original.codex);
    restoreEnvironment(AGENT_HOME_ENV.CLAUDE, original.claude);
    restoreEnvironment(AGENT_HOME_ENV.PI_AGENT, original.piAgent);
    restoreEnvironment(AGENT_HOME_ENV.PI_SESSIONS, original.piSessions);
  }
}

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
