import { describe, it } from "vitest";

import { assertAgentSearchUsesConfiguredAgentHomes } from "@testing/harnesses/agent/resume";
import {
  assertAgentSearchBoundsDefaultOutputByLimit,
  assertAgentSearchBranchExistenceAloneReturnsNoSessions,
  assertAgentSearchExcludesStaleOutOfScopeSubagentAndHandoffFiles,
  assertAgentSearchExcludesSubagentsFromBranchAssociatedResults,
  assertAgentSearchFindsSessionByAcceptedBranchCommandEvidence,
  assertAgentSearchIncludesTranscriptMetadataBranchAssociation,
  assertAgentSearchIncludesWorktreeRootBranchAssociation,
  assertAgentSearchMatchesAllScopedRecentSessionsWithoutSelector,
  assertAgentSearchMatchesOnlySelectedAgentKind,
  assertAgentSearchRequiresEverySelectorOnSameSession,
} from "@testing/harnesses/agent/search";

describe("agent session search compliance", () => {
  it("reads Codex and Claude Code sessions from configured agent session stores", async () => {
    await assertAgentSearchUsesConfiguredAgentHomes();
  });

  it("matches all scoped recent agent sessions when no selector is provided", async () => {
    await assertAgentSearchMatchesAllScopedRecentSessionsWithoutSelector();
  });

  it("matches only the selected agent kind for agent-only searches", async () => {
    await assertAgentSearchMatchesOnlySelectedAgentKind();
  });

  it("requires every supplied selector to match the same session", async () => {
    await assertAgentSearchRequiresEverySelectorOnSameSession();
  });

  it("bounds default output by result limit", async () => {
    await assertAgentSearchBoundsDefaultOutputByLimit();
  });

  it("excludes stale, out-of-scope, subagent, and SPX handoff session files", async () => {
    await assertAgentSearchExcludesStaleOutOfScopeSubagentAndHandoffFiles();
  });

  it("returns no session for branch existence alone", async () => {
    await assertAgentSearchBranchExistenceAloneReturnsNoSessions();
  });

  it("includes sessions associated by branch metadata", async () => {
    await assertAgentSearchIncludesTranscriptMetadataBranchAssociation();
  });

  it("includes sessions associated by same-product worktree root", async () => {
    await assertAgentSearchIncludesWorktreeRootBranchAssociation();
  });

  it("includes sessions associated by accepted transcript command evidence", async () => {
    await assertAgentSearchFindsSessionByAcceptedBranchCommandEvidence();
  });

  it("excludes subagent rows from branch-associated search results", async () => {
    await assertAgentSearchExcludesSubagentsFromBranchAssociatedResults();
  });
});
