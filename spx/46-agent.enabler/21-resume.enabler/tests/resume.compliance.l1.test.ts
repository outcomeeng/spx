import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  AGENT_RESUME_LIMITS,
  AGENT_RESUME_RECENT_WINDOW_MS,
  AGENT_SESSION_KIND,
  AGENT_SESSION_STORE,
} from "@/domains/agent/protocol";
import { claudeCodeSessionStoreDir, codexSessionStoreDir, discoverAgentResumeCandidates } from "@/domains/agent/resume";
import {
  arbitraryAgentResumeExtraCandidateCount,
  arbitraryAgentResumeNowMs,
  arbitraryAgentSessionCwd,
  arbitraryAgentSessionId,
  arbitraryAgentWorktreeRoot,
  sampleAgentResumeValue,
} from "@testing/generators/agent/resume";
import {
  claudeCodeTranscript,
  codexTranscript,
  codexTranscriptPath,
  isPathInsideOrEqual,
  MemoryAgentSessionFileSystem,
} from "@testing/harnesses/agent/resume";

describe("agent resume recency and display compliance", () => {
  it("sorts newest first, limits candidates to recent sessions, and caps displayed candidates", async () => {
    const fs = new MemoryAgentSessionFileSystem();
    const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs());
    const sessionTimestamp = new Date(nowMs).toISOString();
    const oldSessionOffsetMs = AGENT_RESUME_RECENT_WINDOW_MS + AGENT_RESUME_LIMITS.MILLISECONDS_PER_SECOND;
    const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot());
    const worktreeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 1);
    const cwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), 2);
    const candidateCount = AGENT_RESUME_LIMITS.DISPLAYED_CANDIDATES
      + sampleAgentResumeValue(arbitraryAgentResumeExtraCandidateCount());

    for (let index = 0; index < candidateCount; index += 1) {
      const sessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), index);
      fs.writeFile(
        codexTranscriptPath(homeDir, `${sessionId}${AGENT_SESSION_STORE.JSONL_EXTENSION}`),
        codexTranscript({ sessionId, cwd, timestamp: sessionTimestamp }),
        nowMs - index,
      );
    }
    const oldSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), candidateCount);
    const futureSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), candidateCount + 1);
    const oldSessionPath = join(
      homeDir,
      AGENT_SESSION_STORE.CLAUDE_DIR,
      AGENT_SESSION_STORE.CLAUDE_PROJECTS_DIR,
      `${oldSessionId}${AGENT_SESSION_STORE.JSONL_EXTENSION}`,
    );
    const futureSessionPath = join(
      homeDir,
      AGENT_SESSION_STORE.CLAUDE_DIR,
      AGENT_SESSION_STORE.CLAUDE_PROJECTS_DIR,
      `${futureSessionId}${AGENT_SESSION_STORE.JSONL_EXTENSION}`,
    );
    fs.writeFile(
      oldSessionPath,
      claudeCodeTranscript({ sessionId: oldSessionId, cwd, timestamp: sessionTimestamp }),
      nowMs - oldSessionOffsetMs,
    );
    fs.writeFile(
      futureSessionPath,
      claudeCodeTranscript({ sessionId: futureSessionId, cwd, timestamp: sessionTimestamp }),
      nowMs + AGENT_RESUME_LIMITS.MILLISECONDS_PER_SECOND,
    );

    const candidates = await discoverAgentResumeCandidates({
      invocationDir: cwd,
      homeDir,
      nowMs,
      fs,
      resolveWorktreeRoot: async (candidateCwd) =>
        isPathInsideOrEqual(worktreeRoot, candidateCwd) ? worktreeRoot : null,
    });

    expect(candidates).toHaveLength(AGENT_RESUME_LIMITS.DISPLAYED_CANDIDATES);
    expect(candidates.map((candidate) => candidate.modifiedAtMs)).toEqual(
      [...candidates].map((candidate) => candidate.modifiedAtMs).sort((left, right) => right - left),
    );
    expect(candidates.map((candidate) => candidate.sessionId)).not.toContain(oldSessionId);
    expect(candidates.map((candidate) => candidate.sessionId)).not.toContain(futureSessionId);
    expect(fs.readCount(oldSessionPath)).toBe(0);
    expect(fs.readCount(futureSessionPath)).toBe(0);
  });
});

describe("agent resume root-resolution compliance", () => {
  it("uses the latest Claude Code cwd row when resolving a candidate worktree", async () => {
    const fs = new MemoryAgentSessionFileSystem();
    const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), 20);
    const sessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 21);
    const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 22);
    const originalWorktreeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 23);
    const currentWorktreeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 24);
    const originalCwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(originalWorktreeRoot), 25);
    const currentCwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(currentWorktreeRoot), 26);
    const originalTimestamp = new Date(nowMs - AGENT_RESUME_LIMITS.MILLISECONDS_PER_SECOND).toISOString();
    const currentTimestamp = new Date(nowMs).toISOString();
    const transcriptPath = join(
      homeDir,
      AGENT_SESSION_STORE.CLAUDE_DIR,
      AGENT_SESSION_STORE.CLAUDE_PROJECTS_DIR,
      `${sessionId}${AGENT_SESSION_STORE.JSONL_EXTENSION}`,
    );
    fs.writeFile(
      transcriptPath,
      [
        claudeCodeTranscript({ sessionId, cwd: originalCwd, timestamp: originalTimestamp }),
        claudeCodeTranscript({ sessionId, cwd: currentCwd, timestamp: currentTimestamp }),
      ].join("\n"),
      nowMs,
    );

    const candidates = await discoverAgentResumeCandidates({
      invocationDir: currentCwd,
      homeDir,
      nowMs,
      fs,
      resolveWorktreeRoot: async (candidateCwd) =>
        isPathInsideOrEqual(currentWorktreeRoot, candidateCwd) ? currentWorktreeRoot : null,
    });

    expect(candidates.map((candidate) => [candidate.agent, candidate.sessionId, candidate.cwd])).toEqual([
      [AGENT_SESSION_KIND.CLAUDE_CODE, sessionId, currentCwd],
    ]);
  });

  it("resolves candidate worktree roots with bounded concurrency while preserving newest-first matches", async () => {
    const fs = new MemoryAgentSessionFileSystem();
    const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs());
    const sessionTimestamp = new Date(nowMs).toISOString();
    const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 6);
    const worktreeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 7);
    const cwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), 8);
    const candidateCount = AGENT_RESUME_LIMITS.ROOT_RESOLUTION_CONCURRENCY
      + sampleAgentResumeValue(arbitraryAgentResumeExtraCandidateCount(), 9);
    let activeResolutions = 0;
    let maxActiveResolutions = 0;
    let releaseResolution: (() => void) | null = null;
    const resolutionBarrier = new Promise<void>((resolveBarrier) => {
      releaseResolution = resolveBarrier;
    });

    for (let index = 0; index < candidateCount; index += 1) {
      const sessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), index + 10);
      fs.writeFile(
        codexTranscriptPath(homeDir, `${sessionId}${AGENT_SESSION_STORE.JSONL_EXTENSION}`),
        codexTranscript({ sessionId, cwd, timestamp: sessionTimestamp }),
        nowMs - index,
      );
    }

    const candidates = await discoverAgentResumeCandidates({
      invocationDir: worktreeRoot,
      homeDir,
      nowMs,
      fs,
      resolveWorktreeRoot: async (candidateCwd) => {
        if (candidateCwd === worktreeRoot) {
          return worktreeRoot;
        }
        activeResolutions += 1;
        maxActiveResolutions = Math.max(maxActiveResolutions, activeResolutions);
        if (activeResolutions === AGENT_RESUME_LIMITS.ROOT_RESOLUTION_CONCURRENCY && releaseResolution !== null) {
          releaseResolution();
        }
        await resolutionBarrier;
        activeResolutions -= 1;
        return isPathInsideOrEqual(worktreeRoot, candidateCwd) ? worktreeRoot : null;
      },
    });

    expect(candidates).toHaveLength(Math.min(candidateCount, AGENT_RESUME_LIMITS.DISPLAYED_CANDIDATES));
    expect(candidates.map((candidate) => candidate.modifiedAtMs)).toEqual(
      [...candidates].map((candidate) => candidate.modifiedAtMs).sort((left, right) => right - left),
    );
    expect(maxActiveResolutions).toBe(AGENT_RESUME_LIMITS.ROOT_RESOLUTION_CONCURRENCY);
  });
});

describe("agent resume store path compliance", () => {
  it("reads Codex and Claude Code candidates from their default agent session stores", () => {
    const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot());

    expect(codexSessionStoreDir(homeDir)).toBe(
      join(homeDir, AGENT_SESSION_STORE.CODEX_DIR, AGENT_SESSION_STORE.CODEX_SESSIONS_DIR),
    );
    expect(claudeCodeSessionStoreDir(homeDir)).toBe(
      join(homeDir, AGENT_SESSION_STORE.CLAUDE_DIR, AGENT_SESSION_STORE.CLAUDE_PROJECTS_DIR),
    );
  });
});
