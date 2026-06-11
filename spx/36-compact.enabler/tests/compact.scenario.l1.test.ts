import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  COMPACT_MARKER,
  COMPACT_RECORD_FIELDS,
  COMPACT_STORE_PATH,
  compactStashPath,
  extractCompactRecord,
} from "@/domains/compact";
import { resolveWorktreeScopeDir, STATE_STORE_DOMAIN, STATE_STORE_PATH } from "@/lib/state-store";
import { COMPACT_TEST_GENERATOR, sampleCompactTestValue } from "@testing/generators/compact/compact";
import { createSessionGitDeps, SESSION_GIT_DEPS_PATHS, WORKTREE_KIND } from "@testing/harnesses/session/harness";

function escapedMarker(nodePath: string): string {
  return `${COMPACT_MARKER.CONTEXT} ${COMPACT_MARKER.TARGET_ATTRIBUTE}=${
    COMPACT_MARKER.ESCAPED_TARGET_QUOTE
  }${nodePath}${COMPACT_MARKER.ESCAPED_TARGET_QUOTE}`;
}

function unescapedMarker(nodePath: string): string {
  return `${COMPACT_MARKER.CONTEXT} ${COMPACT_MARKER.TARGET_ATTRIBUTE}=${
    COMPACT_MARKER.UNESCAPED_TARGET_QUOTE
  }${nodePath}${COMPACT_MARKER.UNESCAPED_TARGET_QUOTE}`;
}

describe("compact transcript extraction", () => {
  it("extracts the last active node from escaped transcript markers", () => {
    const [firstNode, latestNode] = sampleCompactTestValue(COMPACT_TEST_GENERATOR.distinctNodePaths());
    const transcript = [
      COMPACT_MARKER.FOUNDATION,
      escapedMarker(firstNode),
      escapedMarker(latestNode),
    ].join("\n");

    expect(extractCompactRecord(transcript)).toEqual({
      [COMPACT_RECORD_FIELDS.ACTIVE_NODE]: latestNode,
      [COMPACT_RECORD_FIELDS.HAS_FOUNDATION]: true,
    });
  });

  it("extracts the last active node from unescaped transcript markers", () => {
    const [firstNode, latestNode] = sampleCompactTestValue(COMPACT_TEST_GENERATOR.distinctNodePaths());
    const transcript = [
      COMPACT_MARKER.FOUNDATION,
      unescapedMarker(firstNode),
      unescapedMarker(latestNode),
    ].join("\n");

    expect(extractCompactRecord(transcript)).toEqual({
      [COMPACT_RECORD_FIELDS.ACTIVE_NODE]: latestNode,
      [COMPACT_RECORD_FIELDS.HAS_FOUNDATION]: true,
    });
  });

  it("returns no record when the foundation marker is absent", () => {
    const node = sampleCompactTestValue(COMPACT_TEST_GENERATOR.nodePath());

    expect(extractCompactRecord(escapedMarker(node))).toBeUndefined();
  });

  it("stores compact state under the local worktree session scope", async () => {
    const sessionToken = sampleCompactTestValue(COMPACT_TEST_GENERATOR.sessionToken());
    const rootScope = await resolveWorktreeScopeDir({
      deps: createSessionGitDeps({ worktreeKind: WORKTREE_KIND.ROOT }),
    });
    const linkedScope = await resolveWorktreeScopeDir({
      deps: createSessionGitDeps({ worktreeKind: WORKTREE_KIND.LINKED }),
    });
    expect(rootScope.ok).toBe(true);
    expect(linkedScope.ok).toBe(true);
    if (!rootScope.ok) throw new Error(rootScope.error);
    if (!linkedScope.ok) throw new Error(linkedScope.error);
    const root = compactStashPath(rootScope.value, sessionToken);
    const linked = compactStashPath(linkedScope.value, sessionToken);

    expect(root.ok).toBe(true);
    expect(linked.ok).toBe(true);
    if (!root.ok) throw new Error(root.error);
    if (!linked.ok) throw new Error(linked.error);
    expect(root.value).toBe(join(
      SESSION_GIT_DEPS_PATHS.ROOT_TOPLEVEL,
      STATE_STORE_PATH.SPX_DIR,
      STATE_STORE_PATH.WORKTREE_SCOPE,
      sessionToken,
      STATE_STORE_DOMAIN.COMPACT,
      COMPACT_STORE_PATH.STASH_FILE,
    ));
    expect(linked.value).toBe(join(
      SESSION_GIT_DEPS_PATHS.LINKED_TOPLEVEL,
      STATE_STORE_PATH.SPX_DIR,
      STATE_STORE_PATH.WORKTREE_SCOPE,
      sessionToken,
      STATE_STORE_DOMAIN.COMPACT,
      COMPACT_STORE_PATH.STASH_FILE,
    ));
  });
});
