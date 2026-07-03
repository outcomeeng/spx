import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DEFAULT_CONFIG } from "@/config/defaults";
import { AGENT_SESSION_KIND, AGENT_SESSION_STORE } from "@/domains/agent/protocol";
import {
  AGENT_SEARCH_DEFAULT_LIMIT,
  AGENT_SEARCH_MATCH_REASON,
  agentSearchQueryFromOptions,
  pickupIdSearchLiteral,
  searchAgentSessions,
} from "@/domains/agent/search";
import { STATE_STORE_SCOPE_PATH } from "@/lib/state-store";
import {
  arbitraryAgentResumeNowMs,
  arbitraryAgentResumeRecentOffsetMs,
  arbitraryAgentSessionCwd,
  arbitraryAgentSessionId,
  arbitraryAgentWorktreeRoot,
  sampleAgentResumeValue,
} from "@testing/generators/agent/resume";
import { arbitraryDomainLiteral } from "@testing/generators/literal/literal";
import {
  claudeCodeTranscript,
  claudeProjectTranscriptPath,
  codexSubagentTranscript,
  codexTranscript,
  codexTranscriptPath,
  MemoryAgentSessionFileSystem,
} from "@testing/harnesses/agent/resume";

function jsonlName(sessionId: string): string {
  return `${sessionId}${AGENT_SESSION_STORE.JSONL_EXTENSION}`;
}

describe("agent session search compliance", () => {
  it("matches all scoped recent agent sessions when no selector is provided", async () => {
    const fs = new MemoryAgentSessionFileSystem();
    const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 70);
    const productScopeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 71);
    const foreignProductRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 72);
    const codexCwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(productScopeRoot), 73);
    const claudeCwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(productScopeRoot), 74);
    const foreignCwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(foreignProductRoot), 75);
    const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), 76);
    const recentOffsetMs = sampleAgentResumeValue(arbitraryAgentResumeRecentOffsetMs(), 77);
    const timestamp = new Date(nowMs - recentOffsetMs).toISOString();
    const codexSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 78);
    const claudeSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 79);
    const staleSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 80);
    const foreignSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 81);

    fs.writeFile(
      codexTranscriptPath(homeDir, jsonlName(codexSessionId)),
      codexTranscript({ sessionId: codexSessionId, cwd: codexCwd, timestamp }),
      nowMs,
    );
    fs.writeFile(
      claudeProjectTranscriptPath(homeDir, claudeCwd, jsonlName(claudeSessionId)),
      claudeCodeTranscript({ sessionId: claudeSessionId, cwd: claudeCwd, timestamp }),
      nowMs - recentOffsetMs,
    );
    fs.writeFile(
      codexTranscriptPath(homeDir, jsonlName(staleSessionId)),
      codexTranscript({ sessionId: staleSessionId, cwd: codexCwd, timestamp: new Date(0).toISOString() }),
      0,
    );
    fs.writeFile(
      codexTranscriptPath(homeDir, jsonlName(foreignSessionId)),
      codexTranscript({ sessionId: foreignSessionId, cwd: foreignCwd, timestamp }),
      nowMs,
    );

    const results = await searchAgentSessions({
      homeDir,
      nowMs,
      productScopeRoot,
      fs,
      query: agentSearchQueryFromOptions({}),
    });

    expect(results.map((result) => [result.agent, result.sessionId, result.matches])).toEqual([
      [AGENT_SESSION_KIND.CODEX, codexSessionId, [AGENT_SEARCH_MATCH_REASON.ALL]],
      [AGENT_SESSION_KIND.CLAUDE_CODE, claudeSessionId, [AGENT_SEARCH_MATCH_REASON.ALL]],
    ]);
  });

  it("matches only the selected agent kind for agent-only searches", async () => {
    const fs = new MemoryAgentSessionFileSystem();
    const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 90);
    const productScopeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 91);
    const codexCwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(productScopeRoot), 92);
    const claudeCwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(productScopeRoot), 93);
    const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), 94);
    const timestamp = new Date(nowMs).toISOString();
    const codexSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 95);
    const claudeSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 96);

    fs.writeFile(
      codexTranscriptPath(homeDir, jsonlName(codexSessionId)),
      codexTranscript({ sessionId: codexSessionId, cwd: codexCwd, timestamp }),
      nowMs,
    );
    fs.writeFile(
      claudeProjectTranscriptPath(homeDir, claudeCwd, jsonlName(claudeSessionId)),
      claudeCodeTranscript({ sessionId: claudeSessionId, cwd: claudeCwd, timestamp }),
      nowMs,
    );

    const results = await searchAgentSessions({
      homeDir,
      nowMs,
      productScopeRoot,
      fs,
      query: agentSearchQueryFromOptions({ agent: AGENT_SESSION_KIND.CODEX }),
    });

    expect(results.map((result) => [result.agent, result.sessionId, result.matches])).toEqual([
      [AGENT_SESSION_KIND.CODEX, codexSessionId, [AGENT_SEARCH_MATCH_REASON.AGENT]],
    ]);
  });

  it("requires every supplied selector to match the same session", async () => {
    const fs = new MemoryAgentSessionFileSystem();
    const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 100);
    const productScopeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 101);
    const cwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(productScopeRoot), 102);
    const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), 103);
    const timestamp = new Date(nowMs).toISOString();
    const matchingLiteral = sampleAgentResumeValue(arbitraryDomainLiteral(), 104);
    const otherLiteral = sampleAgentResumeValue(arbitraryDomainLiteral(), 105);
    const targetBranch = sampleAgentResumeValue(arbitraryDomainLiteral(), 106);
    const otherBranch = sampleAgentResumeValue(arbitraryDomainLiteral(), 107);
    const codexWithoutLiteral = sampleAgentResumeValue(arbitraryAgentSessionId(), 108);
    const codexWithLiteral = sampleAgentResumeValue(arbitraryAgentSessionId(), 109);
    const sessionWrongBranch = sampleAgentResumeValue(arbitraryAgentSessionId(), 110);
    const sessionRightBranch = sampleAgentResumeValue(arbitraryAgentSessionId(), 111);

    fs.writeFile(
      codexTranscriptPath(homeDir, jsonlName(codexWithoutLiteral)),
      `${codexTranscript({ sessionId: codexWithoutLiteral, cwd, timestamp })}\n${otherLiteral}`,
      nowMs,
    );
    fs.writeFile(
      codexTranscriptPath(homeDir, jsonlName(codexWithLiteral)),
      `${codexTranscript({ sessionId: codexWithLiteral, cwd, timestamp })}\n${matchingLiteral}`,
      nowMs - 1,
    );
    fs.writeFile(
      codexTranscriptPath(homeDir, jsonlName(sessionWrongBranch)),
      codexTranscript({ sessionId: sessionWrongBranch, cwd, timestamp, branch: otherBranch }),
      nowMs - 2,
    );
    fs.writeFile(
      codexTranscriptPath(homeDir, jsonlName(sessionRightBranch)),
      codexTranscript({ sessionId: sessionRightBranch, cwd, timestamp, branch: targetBranch }),
      nowMs - 3,
    );

    const agentAndContent = await searchAgentSessions({
      homeDir,
      nowMs,
      productScopeRoot,
      fs,
      query: agentSearchQueryFromOptions({ agent: AGENT_SESSION_KIND.CODEX, contains: matchingLiteral }),
    });
    const sessionAndBranch = await searchAgentSessions({
      homeDir,
      nowMs,
      productScopeRoot,
      fs,
      query: agentSearchQueryFromOptions({ sessionId: sessionRightBranch, branch: targetBranch }),
    });

    expect(agentAndContent.map((result) => [result.sessionId, result.matches])).toEqual([
      [codexWithLiteral, [AGENT_SEARCH_MATCH_REASON.AGENT, AGENT_SEARCH_MATCH_REASON.CONTAINS]],
    ]);
    expect(sessionAndBranch.map((result) => [result.sessionId, result.matches])).toEqual([
      [sessionRightBranch, [AGENT_SEARCH_MATCH_REASON.SESSION_ID, AGENT_SEARCH_MATCH_REASON.BRANCH]],
    ]);
  });

  it("bounds default output by result limit", async () => {
    const fs = new MemoryAgentSessionFileSystem();
    const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot());
    const productScopeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 1);
    const cwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(productScopeRoot), 2);
    const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), 3);
    const pickupId = sampleAgentResumeValue(arbitraryDomainLiteral(), 4);
    const marker = pickupIdSearchLiteral(pickupId);
    const sessionCount = AGENT_SEARCH_DEFAULT_LIMIT + 1;
    const matchingSessionIds = Array.from(
      { length: sessionCount },
      (_, index) => sampleAgentResumeValue(arbitraryAgentSessionId(), 10 + index),
    );

    for (const [index, sessionId] of matchingSessionIds.entries()) {
      const modifiedAtMs = nowMs - index;
      fs.writeFile(
        codexTranscriptPath(homeDir, jsonlName(sessionId)),
        `${codexTranscript({ sessionId, cwd, timestamp: new Date(modifiedAtMs).toISOString() })}\n${marker}`,
        modifiedAtMs,
      );
    }

    const results = await searchAgentSessions({
      homeDir,
      nowMs,
      productScopeRoot,
      fs,
      query: agentSearchQueryFromOptions({ pickupId }),
    });

    expect(results).toHaveLength(AGENT_SEARCH_DEFAULT_LIMIT);
    expect(results.map((result) => result.agent)).toEqual(
      Array.from({ length: AGENT_SEARCH_DEFAULT_LIMIT }, () => AGENT_SESSION_KIND.CODEX),
    );
    expect(results.map((result) => result.sessionId)).toEqual(matchingSessionIds.slice(0, AGENT_SEARCH_DEFAULT_LIMIT));
  });

  it("excludes stale, out-of-scope, subagent, and SPX handoff session files", async () => {
    const fs = new MemoryAgentSessionFileSystem();
    const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 50);
    const productScopeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 51);
    const foreignProductRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 52);
    const cwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(productScopeRoot), 53);
    const foreignCwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(foreignProductRoot), 54);
    const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), 55);
    const recentOffsetMs = sampleAgentResumeValue(arbitraryAgentResumeRecentOffsetMs(), 56);
    const pickupId = sampleAgentResumeValue(arbitraryDomainLiteral(), 57);
    const marker = pickupIdSearchLiteral(pickupId);
    const includedSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 58);
    const subagentSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 59);
    const staleSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 60);
    const foreignSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 61);
    const handoffSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 62);
    const recentTimestamp = new Date(nowMs - recentOffsetMs).toISOString();

    fs.writeFile(
      codexTranscriptPath(homeDir, jsonlName(includedSessionId)),
      `${codexTranscript({ sessionId: includedSessionId, cwd, timestamp: recentTimestamp })}\n${marker}`,
      nowMs - recentOffsetMs,
    );
    fs.writeFile(
      codexTranscriptPath(homeDir, jsonlName(subagentSessionId)),
      `${codexSubagentTranscript({ sessionId: subagentSessionId, cwd, timestamp: recentTimestamp })}\n${marker}`,
      nowMs - recentOffsetMs,
    );
    fs.writeFile(
      codexTranscriptPath(homeDir, jsonlName(staleSessionId)),
      `${codexTranscript({ sessionId: staleSessionId, cwd, timestamp: new Date(0).toISOString() })}\n${marker}`,
      0,
    );
    fs.writeFile(
      codexTranscriptPath(homeDir, jsonlName(foreignSessionId)),
      `${codexTranscript({ sessionId: foreignSessionId, cwd: foreignCwd, timestamp: recentTimestamp })}\n${marker}`,
      nowMs - recentOffsetMs,
    );
    fs.writeFile(
      join(
        productScopeRoot,
        STATE_STORE_SCOPE_PATH.SPX_DIR,
        STATE_STORE_SCOPE_PATH.SESSIONS_SCOPE,
        DEFAULT_CONFIG.sessions.statusDirs.doing,
        jsonlName(handoffSessionId),
      ),
      `${codexTranscript({ sessionId: handoffSessionId, cwd, timestamp: recentTimestamp })}\n${marker}`,
      nowMs - recentOffsetMs,
    );

    const results = await searchAgentSessions({
      homeDir,
      nowMs,
      productScopeRoot,
      fs,
      query: agentSearchQueryFromOptions({ pickupId }),
    });

    expect(results.map((result) => result.sessionId)).toEqual([includedSessionId]);
  });
});
