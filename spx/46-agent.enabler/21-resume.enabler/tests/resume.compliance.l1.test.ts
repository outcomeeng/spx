import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  AGENT_RESUME_LIMITS,
  AGENT_RESUME_RECENT_WINDOW_MS,
  AGENT_SESSION_KIND,
  AGENT_SESSION_STORE,
  CODEX_SESSION_ORIGINATOR,
} from "@/domains/agent/protocol";
import {
  branchResumeScope,
  claudeCodeSessionStoreDir,
  codexSessionStoreDir,
  discoverAgentResumeCandidates,
  worktreeResumeScope,
} from "@/domains/agent/resume";
import {
  arbitraryAgentBranch,
  arbitraryAgentResumeNowMs,
  arbitraryAgentResumeOverCapCount,
  arbitraryAgentSessionCwd,
  arbitraryAgentSessionId,
  arbitraryAgentWorktreeRoot,
  sampleAgentResumeValue,
} from "@testing/generators/agent/resume";
import {
  claudeCodeTranscript,
  claudeProjectTranscriptPath,
  claudeSubagentTranscriptPath,
  codexSubagentTranscript,
  codexTranscript,
  codexTranscriptPath,
  isPathInsideOrEqual,
  MemoryAgentSessionFileSystem,
} from "@testing/harnesses/agent/resume";

function jsonlName(sessionId: string): string {
  return `${sessionId}${AGENT_SESSION_STORE.JSONL_EXTENSION}`;
}

function worktreeRootResolver(worktreeRoot: string): (cwd: string) => Promise<string | null> {
  return async (candidateCwd) => (isPathInsideOrEqual(worktreeRoot, candidateCwd) ? worktreeRoot : null);
}

describe("agent resume per-agent display cap compliance", () => {
  it("keeps only the newest sessions per agent within the active scope, newest first", async () => {
    const fs = new MemoryAgentSessionFileSystem();
    const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs());
    const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 1);
    const worktreeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 2);
    const cwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), 3);
    const codexCount = sampleAgentResumeValue(arbitraryAgentResumeOverCapCount(), 4);
    const claudeCount = sampleAgentResumeValue(arbitraryAgentResumeOverCapCount(), 5);
    const cap = AGENT_RESUME_LIMITS.PER_AGENT_DISPLAYED_CANDIDATES;

    const codexIds: string[] = [];
    for (let index = 0; index < codexCount; index += 1) {
      const sessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 10 + index);
      codexIds.push(sessionId);
      fs.writeFile(
        codexTranscriptPath(homeDir, jsonlName(sessionId)),
        codexTranscript({ sessionId, cwd, timestamp: new Date(nowMs - index).toISOString() }),
        nowMs - index,
      );
    }
    const claudeIds: string[] = [];
    for (let index = 0; index < claudeCount; index += 1) {
      const sessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 40 + index);
      claudeIds.push(sessionId);
      fs.writeFile(
        claudeProjectTranscriptPath(homeDir, cwd, jsonlName(sessionId)),
        claudeCodeTranscript({ sessionId, cwd, timestamp: new Date(nowMs - index).toISOString() }),
        nowMs - index,
      );
    }

    const candidates = await discoverAgentResumeCandidates({
      invocationDir: cwd,
      homeDir,
      nowMs,
      scope: worktreeResumeScope(),
      fs,
      resolveWorktreeRoot: worktreeRootResolver(worktreeRoot),
    });

    const codexResult = candidates.filter((candidate) => candidate.agent === AGENT_SESSION_KIND.CODEX);
    const claudeResult = candidates.filter((candidate) => candidate.agent === AGENT_SESSION_KIND.CLAUDE_CODE);
    expect(codexResult.map((candidate) => candidate.sessionId)).toEqual(codexIds.slice(0, cap));
    expect(claudeResult.map((candidate) => candidate.sessionId)).toEqual(claudeIds.slice(0, cap));
    expect(candidates.map((candidate) => candidate.modifiedAtMs)).toEqual(
      [...candidates].map((candidate) => candidate.modifiedAtMs).sort((left, right) => right - left),
    );
  });
});

describe("agent resume scope-reference resolution compliance", () => {
  it("resolves the invocation worktree root once rather than once per candidate", async () => {
    const fs = new MemoryAgentSessionFileSystem();
    const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), 70);
    const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 71);
    const worktreeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 72);
    const cwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), 73);
    const sessionCount = sampleAgentResumeValue(arbitraryAgentResumeOverCapCount(), 74);
    for (let index = 0; index < sessionCount; index += 1) {
      const sessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 80 + index);
      fs.writeFile(
        codexTranscriptPath(homeDir, jsonlName(sessionId)),
        codexTranscript({ sessionId, cwd, timestamp: new Date(nowMs - index).toISOString() }),
        nowMs - index,
      );
    }
    let resolveCallCount = 0;

    await discoverAgentResumeCandidates({
      invocationDir: cwd,
      homeDir,
      nowMs,
      scope: worktreeResumeScope(),
      fs,
      resolveWorktreeRoot: async (candidateCwd) => {
        resolveCallCount += 1;
        return isPathInsideOrEqual(worktreeRoot, candidateCwd) ? worktreeRoot : null;
      },
    });

    expect(resolveCallCount).toBe(1);
  });
});

describe("agent resume bounded-read compliance", () => {
  it("identifies a candidate from a bounded metadata head without reading the whole transcript", async () => {
    const fs = new MemoryAgentSessionFileSystem();
    const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), 90);
    const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 91);
    const worktreeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 92);
    const cwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), 93);
    const sessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 94);
    const transcriptPath = codexTranscriptPath(homeDir, jsonlName(sessionId));
    const oversizeBytes = AGENT_RESUME_LIMITS.METADATA_HEAD_BYTES * 2;
    fs.writeFile(
      transcriptPath,
      codexTranscript({ sessionId, cwd, timestamp: new Date(nowMs).toISOString(), padToBytes: oversizeBytes }),
      nowMs,
    );

    const candidates = await discoverAgentResumeCandidates({
      invocationDir: cwd,
      homeDir,
      nowMs,
      scope: worktreeResumeScope(),
      fs,
      resolveWorktreeRoot: worktreeRootResolver(worktreeRoot),
    });

    expect(candidates.map((candidate) => candidate.sessionId)).toEqual([sessionId]);
    expect(fs.maxHeadReadBytes(transcriptPath)).toBeLessThanOrEqual(AGENT_RESUME_LIMITS.METADATA_HEAD_BYTES);
  });
});

describe("agent resume deduplication compliance", () => {
  it("collapses sessions that share one session id to the most recently modified source", async () => {
    const fs = new MemoryAgentSessionFileSystem();
    const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), 110);
    const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 111);
    const worktreeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 112);
    const cwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), 113);
    const sessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 114);
    const rolloutCount = sampleAgentResumeValue(arbitraryAgentResumeOverCapCount(), 115);
    let newestMtimeMs = 0;
    for (let index = 0; index < rolloutCount; index += 1) {
      const rolloutId = sampleAgentResumeValue(arbitraryAgentSessionId(), 120 + index);
      const mtimeMs = nowMs - index;
      newestMtimeMs = Math.max(newestMtimeMs, mtimeMs);
      fs.writeFile(
        codexTranscriptPath(homeDir, jsonlName(rolloutId)),
        codexTranscript({ sessionId, cwd, timestamp: new Date(mtimeMs).toISOString() }),
        mtimeMs,
      );
    }

    const candidates = await discoverAgentResumeCandidates({
      invocationDir: cwd,
      homeDir,
      nowMs,
      scope: worktreeResumeScope(),
      fs,
      resolveWorktreeRoot: worktreeRootResolver(worktreeRoot),
    });

    expect(candidates.map((candidate) => [candidate.sessionId, candidate.modifiedAtMs])).toEqual([
      [sessionId, newestMtimeMs],
    ]);
  });

  it("keeps an in-scope session when a newer transcript of the same id is out of scope", async () => {
    const fs = new MemoryAgentSessionFileSystem();
    const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), 220);
    const timestamp = new Date(nowMs).toISOString();
    const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 221);
    const worktreeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 222);
    const siblingRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 223);
    const inScopeCwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), 224);
    const outOfScopeCwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(siblingRoot), 225);
    const sessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 226);
    const newerFile = sampleAgentResumeValue(arbitraryAgentSessionId(), 227);
    const olderFile = sampleAgentResumeValue(arbitraryAgentSessionId(), 228);
    fs.writeFile(
      codexTranscriptPath(homeDir, jsonlName(newerFile)),
      codexTranscript({ sessionId, cwd: outOfScopeCwd, timestamp }),
      nowMs,
    );
    fs.writeFile(
      codexTranscriptPath(homeDir, jsonlName(olderFile)),
      codexTranscript({ sessionId, cwd: inScopeCwd, timestamp }),
      nowMs - 1,
    );

    const candidates = await discoverAgentResumeCandidates({
      invocationDir: inScopeCwd,
      homeDir,
      nowMs,
      scope: worktreeResumeScope(),
      fs,
      resolveWorktreeRoot: async (candidateCwd) => {
        if (isPathInsideOrEqual(worktreeRoot, candidateCwd)) return worktreeRoot;
        if (isPathInsideOrEqual(siblingRoot, candidateCwd)) return siblingRoot;
        return null;
      },
    });

    expect(candidates.map((candidate) => [candidate.sessionId, candidate.cwd])).toEqual([[sessionId, inScopeCwd]]);
  });
});

describe("agent resume subagent-exclusion compliance", () => {
  it("excludes non-interactive exec and subagent-thread Codex transcripts", async () => {
    const fs = new MemoryAgentSessionFileSystem();
    const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), 140);
    const timestamp = new Date(nowMs).toISOString();
    const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 141);
    const worktreeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 142);
    const cwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), 143);
    const interactiveId = sampleAgentResumeValue(arbitraryAgentSessionId(), 144);
    const execId = sampleAgentResumeValue(arbitraryAgentSessionId(), 145);
    const subagentId = sampleAgentResumeValue(arbitraryAgentSessionId(), 146);
    fs.writeFile(
      codexTranscriptPath(homeDir, jsonlName(interactiveId)),
      codexTranscript({ sessionId: interactiveId, cwd, timestamp }),
      nowMs,
    );
    fs.writeFile(
      codexTranscriptPath(homeDir, jsonlName(execId)),
      codexTranscript({ sessionId: execId, cwd, timestamp, originator: CODEX_SESSION_ORIGINATOR.EXEC }),
      nowMs - 1,
    );
    fs.writeFile(
      codexTranscriptPath(homeDir, jsonlName(subagentId)),
      codexSubagentTranscript({ sessionId: subagentId, cwd, timestamp }),
      nowMs - 2,
    );

    const candidates = await discoverAgentResumeCandidates({
      invocationDir: cwd,
      homeDir,
      nowMs,
      scope: worktreeResumeScope(),
      fs,
      resolveWorktreeRoot: worktreeRootResolver(worktreeRoot),
    });

    expect(candidates.map((candidate) => candidate.sessionId)).toEqual([interactiveId]);
  });

  it("excludes Claude Code subagent transcripts from resume candidates", async () => {
    const fs = new MemoryAgentSessionFileSystem();
    const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), 160);
    const timestamp = new Date(nowMs).toISOString();
    const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 161);
    const worktreeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 162);
    const cwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), 163);
    const topLevelId = sampleAgentResumeValue(arbitraryAgentSessionId(), 164);
    const subagentId = sampleAgentResumeValue(arbitraryAgentSessionId(), 165);
    fs.writeFile(
      claudeProjectTranscriptPath(homeDir, cwd, jsonlName(topLevelId)),
      claudeCodeTranscript({ sessionId: topLevelId, cwd, timestamp }),
      nowMs,
    );
    fs.writeFile(
      claudeSubagentTranscriptPath(homeDir, cwd, jsonlName(subagentId)),
      claudeCodeTranscript({ sessionId: subagentId, cwd, timestamp }),
      nowMs - 1,
    );

    const candidates = await discoverAgentResumeCandidates({
      invocationDir: cwd,
      homeDir,
      nowMs,
      scope: worktreeResumeScope(),
      fs,
      resolveWorktreeRoot: worktreeRootResolver(worktreeRoot),
    });

    expect(candidates.map((candidate) => candidate.sessionId)).toEqual([topLevelId]);
  });

  it("includes Codex VS Code transcripts as interactive candidates", async () => {
    const fs = new MemoryAgentSessionFileSystem();
    const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), 250);
    const timestamp = new Date(nowMs).toISOString();
    const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 251);
    const worktreeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 252);
    const cwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), 253);
    const sessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 254);
    fs.writeFile(
      codexTranscriptPath(homeDir, jsonlName(sessionId)),
      codexTranscript({ sessionId, cwd, timestamp, originator: CODEX_SESSION_ORIGINATOR.VSCODE }),
      nowMs,
    );

    const candidates = await discoverAgentResumeCandidates({
      invocationDir: cwd,
      homeDir,
      nowMs,
      scope: worktreeResumeScope(),
      fs,
      resolveWorktreeRoot: worktreeRootResolver(worktreeRoot),
    });

    expect(candidates.map((candidate) => candidate.sessionId)).toEqual([sessionId]);
  });
});

describe("agent resume recency-window compliance", () => {
  it("excludes sessions modified before the recent-activity window", async () => {
    const fs = new MemoryAgentSessionFileSystem();
    const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), 180);
    const timestamp = new Date(nowMs).toISOString();
    const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 181);
    const worktreeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 182);
    const cwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), 183);
    const recentId = sampleAgentResumeValue(arbitraryAgentSessionId(), 184);
    const staleId = sampleAgentResumeValue(arbitraryAgentSessionId(), 185);
    fs.writeFile(
      codexTranscriptPath(homeDir, jsonlName(recentId)),
      codexTranscript({ sessionId: recentId, cwd, timestamp }),
      nowMs,
    );
    fs.writeFile(
      codexTranscriptPath(homeDir, jsonlName(staleId)),
      codexTranscript({ sessionId: staleId, cwd, timestamp }),
      nowMs - AGENT_RESUME_RECENT_WINDOW_MS - 1,
    );

    const candidates = await discoverAgentResumeCandidates({
      invocationDir: cwd,
      homeDir,
      nowMs,
      scope: worktreeResumeScope(),
      fs,
      resolveWorktreeRoot: worktreeRootResolver(worktreeRoot),
    });

    expect(candidates.map((candidate) => candidate.sessionId)).toEqual([recentId]);
  });

  it("excludes sessions carrying a future modification time", async () => {
    const fs = new MemoryAgentSessionFileSystem();
    const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), 210);
    const timestamp = new Date(nowMs).toISOString();
    const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 211);
    const worktreeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 212);
    const cwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), 213);
    const recentId = sampleAgentResumeValue(arbitraryAgentSessionId(), 214);
    const futureId = sampleAgentResumeValue(arbitraryAgentSessionId(), 215);
    fs.writeFile(
      codexTranscriptPath(homeDir, jsonlName(recentId)),
      codexTranscript({ sessionId: recentId, cwd, timestamp }),
      nowMs,
    );
    const futureTranscriptPath = codexTranscriptPath(homeDir, jsonlName(futureId));
    fs.writeFile(
      futureTranscriptPath,
      codexTranscript({ sessionId: futureId, cwd, timestamp }),
      nowMs + 1,
    );

    const candidates = await discoverAgentResumeCandidates({
      invocationDir: cwd,
      homeDir,
      nowMs,
      scope: worktreeResumeScope(),
      fs,
      resolveWorktreeRoot: worktreeRootResolver(worktreeRoot),
    });

    expect(candidates.map((candidate) => candidate.sessionId)).toEqual([recentId]);
    expect(fs.maxHeadReadBytes(futureTranscriptPath)).toBe(0);
  });
});

describe("agent resume Claude project-prefix compliance", () => {
  it("skips sibling worktree project directories that share the invocation prefix without a path boundary", async () => {
    const fs = new MemoryAgentSessionFileSystem();
    const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), 200);
    const timestamp = new Date(nowMs).toISOString();
    const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 201);
    const worktreeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 202);
    const siblingRoot = `${worktreeRoot}extra`;
    const invocationCwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), 203);
    const insideId = sampleAgentResumeValue(arbitraryAgentSessionId(), 204);
    const siblingCwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(siblingRoot), 205);
    const siblingId = sampleAgentResumeValue(arbitraryAgentSessionId(), 206);
    fs.writeFile(
      claudeProjectTranscriptPath(homeDir, invocationCwd, jsonlName(insideId)),
      claudeCodeTranscript({ sessionId: insideId, cwd: invocationCwd, timestamp }),
      nowMs,
    );
    const siblingTranscriptPath = claudeProjectTranscriptPath(homeDir, siblingCwd, jsonlName(siblingId));
    fs.writeFile(
      siblingTranscriptPath,
      claudeCodeTranscript({ sessionId: siblingId, cwd: siblingCwd, timestamp }),
      nowMs,
    );

    const candidates = await discoverAgentResumeCandidates({
      invocationDir: invocationCwd,
      homeDir,
      nowMs,
      scope: worktreeResumeScope(),
      fs,
      resolveWorktreeRoot: worktreeRootResolver(worktreeRoot),
    });

    expect(candidates.map((candidate) => candidate.sessionId)).toEqual([insideId]);
    expect(fs.maxHeadReadBytes(siblingTranscriptPath)).toBe(0);
  });
});

describe("agent resume tie-break compliance", () => {
  it("selects the per-agent cap deterministically by source path when modification times tie", async () => {
    const fs = new MemoryAgentSessionFileSystem();
    const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), 260);
    const timestamp = new Date(nowMs).toISOString();
    const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 261);
    const worktreeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 262);
    const cwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), 263);
    const total = sampleAgentResumeValue(arbitraryAgentResumeOverCapCount(), 264);
    const written: { readonly sessionId: string; readonly path: string }[] = [];
    for (let index = 0; index < total; index += 1) {
      const sessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 270 + index);
      const path = codexTranscriptPath(homeDir, jsonlName(sessionId));
      written.push({ sessionId, path });
      fs.writeFile(path, codexTranscript({ sessionId, cwd, timestamp }), nowMs);
    }
    const expected = [...written]
      .sort((left, right) => left.path.localeCompare(right.path))
      .slice(0, AGENT_RESUME_LIMITS.PER_AGENT_DISPLAYED_CANDIDATES)
      .map((entry) => entry.sessionId);

    const candidates = await discoverAgentResumeCandidates({
      invocationDir: cwd,
      homeDir,
      nowMs,
      scope: worktreeResumeScope(),
      fs,
      resolveWorktreeRoot: worktreeRootResolver(worktreeRoot),
    });

    expect(new Set(candidates.map((candidate) => candidate.sessionId))).toEqual(new Set(expected));
  });
});

describe("agent resume Claude branch-scan compliance", () => {
  it("reads the initial Claude branch from a later head row when the first row omits it", async () => {
    const fs = new MemoryAgentSessionFileSystem();
    const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), 240);
    const timestamp = new Date(nowMs).toISOString();
    const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 241);
    const worktreeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 242);
    const cwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), 243);
    const sessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 244);
    const targetBranch = sampleAgentResumeValue(arbitraryAgentBranch(), 245);
    fs.writeFile(
      claudeProjectTranscriptPath(homeDir, cwd, jsonlName(sessionId)),
      [
        claudeCodeTranscript({ sessionId, cwd, timestamp }),
        claudeCodeTranscript({ sessionId, cwd, timestamp, branch: targetBranch }),
      ].join("\n"),
      nowMs,
    );

    const candidates = await discoverAgentResumeCandidates({
      invocationDir: cwd,
      homeDir,
      nowMs,
      scope: branchResumeScope(targetBranch),
      fs,
      resolveWorktreeRoot: worktreeRootResolver(worktreeRoot),
    });

    expect(candidates.map((candidate) => candidate.sessionId)).toEqual([sessionId]);
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
