import { join } from "node:path";

import * as fc from "fast-check";
import { expect } from "vitest";

import {
  COMPACT_MARKER,
  COMPACT_RECORD_FIELDS,
  COMPACT_STORE_PATH,
  compactStashPath,
  extractCompactRecord,
} from "@/domains/compact";
import { resolveWorktreeScopeDir, STATE_STORE_DOMAIN, STATE_STORE_SCOPE_PATH } from "@/lib/state-store";
import { COMPACT_TEST_GENERATOR, sampleCompactTestValue } from "@testing/generators/compact/compact";
import { createSessionGitDeps, SESSION_GIT_DEPS_PATHS, WORKTREE_KIND } from "@testing/harnesses/session/harness";

function escapedMarker(nodePath: string): string {
  return `${COMPACT_MARKER.CONTEXT} ${COMPACT_MARKER.TARGET_ATTRIBUTE}=${COMPACT_MARKER.ESCAPED_TARGET_QUOTE}${nodePath}${COMPACT_MARKER.ESCAPED_TARGET_QUOTE}`;
}

function unescapedMarker(nodePath: string): string {
  return `${COMPACT_MARKER.CONTEXT} ${COMPACT_MARKER.TARGET_ATTRIBUTE}=${COMPACT_MARKER.UNESCAPED_TARGET_QUOTE}${nodePath}${COMPACT_MARKER.UNESCAPED_TARGET_QUOTE}`;
}

function jsonlStringRecord(content: string): string {
  return JSON.stringify({ content });
}

function jsonlNestedStringRecord(content: string): string {
  return jsonlStringRecord(JSON.stringify({ content }));
}

export function assertEscapedTranscriptUsesLatestNode(): void {
  const [firstNode, latestNode] = sampleCompactTestValue(COMPACT_TEST_GENERATOR.distinctNodePaths());
  const transcript = [
    jsonlStringRecord(COMPACT_MARKER.FOUNDATION),
    jsonlStringRecord(escapedMarker(firstNode)),
    jsonlStringRecord(escapedMarker(latestNode)),
  ].join("\n");
  expect(extractCompactRecord(transcript)).toEqual({
    [COMPACT_RECORD_FIELDS.ACTIVE_NODE]: latestNode,
    [COMPACT_RECORD_FIELDS.HAS_FOUNDATION]: true,
  });
}

export function assertUnescapedTranscriptUsesLatestNode(): void {
  const [firstNode, latestNode] = sampleCompactTestValue(COMPACT_TEST_GENERATOR.distinctNodePaths());
  const transcript = [
    jsonlStringRecord(COMPACT_MARKER.FOUNDATION),
    jsonlStringRecord(unescapedMarker(firstNode)),
    jsonlStringRecord(unescapedMarker(latestNode)),
  ].join("\n");
  expect(extractCompactRecord(transcript)).toEqual({
    [COMPACT_RECORD_FIELDS.ACTIVE_NODE]: latestNode,
    [COMPACT_RECORD_FIELDS.HAS_FOUNDATION]: true,
  });
}

export function assertNestedTranscriptUsesLatestNode(): void {
  fc.assert(
    fc.property(COMPACT_TEST_GENERATOR.distinctNodePaths(), ([firstNode, latestNode]) => {
      const transcript = [
        jsonlStringRecord(COMPACT_MARKER.FOUNDATION),
        jsonlNestedStringRecord(unescapedMarker(firstNode)),
        jsonlNestedStringRecord(unescapedMarker(latestNode)),
      ].join("\n");
      expect(extractCompactRecord(transcript)).toEqual({
        [COMPACT_RECORD_FIELDS.ACTIVE_NODE]: latestNode,
        [COMPACT_RECORD_FIELDS.HAS_FOUNDATION]: true,
      });
    }),
  );
}

export function assertMarkerTextOutsideStringValuesIsIgnored(): void {
  const node = sampleCompactTestValue(COMPACT_TEST_GENERATOR.nodePath());
  const transcript = JSON.stringify({
    [COMPACT_MARKER.FOUNDATION]: true,
    [unescapedMarker(node)]: true,
  });
  expect(extractCompactRecord(transcript)).toBeUndefined();
}

export function assertTranscriptWithoutFoundationHasNoRecord(): void {
  const node = sampleCompactTestValue(COMPACT_TEST_GENERATOR.nodePath());
  expect(extractCompactRecord(jsonlStringRecord(escapedMarker(node)))).toBeUndefined();
}

export async function assertCompactPathUsesLocalWorktreeSessionScope(): Promise<void> {
  const sessionToken = sampleCompactTestValue(COMPACT_TEST_GENERATOR.sessionToken());
  const mainCheckoutScope = await resolveWorktreeScopeDir({
    deps: createSessionGitDeps({ worktreeKind: WORKTREE_KIND.MAIN_CHECKOUT }),
  });
  const nonMainScope = await resolveWorktreeScopeDir({
    deps: createSessionGitDeps({ worktreeKind: WORKTREE_KIND.NON_MAIN }),
  });
  const mainCheckout = compactStashPath(mainCheckoutScope, sessionToken);
  const nonMain = compactStashPath(nonMainScope, sessionToken);

  expect(mainCheckout.ok).toBe(true);
  expect(nonMain.ok).toBe(true);
  if (!mainCheckout.ok) throw new Error(mainCheckout.error);
  if (!nonMain.ok) throw new Error(nonMain.error);
  expect(mainCheckout.value).toBe(join(
    SESSION_GIT_DEPS_PATHS.MAIN_CHECKOUT_TOPLEVEL,
    STATE_STORE_SCOPE_PATH.SPX_DIR,
    STATE_STORE_SCOPE_PATH.WORKTREE_SCOPE,
    sessionToken,
    STATE_STORE_DOMAIN.COMPACT,
    COMPACT_STORE_PATH.STASH_FILE,
  ));
  expect(nonMain.value).toBe(join(
    SESSION_GIT_DEPS_PATHS.NON_MAIN_TOPLEVEL,
    STATE_STORE_SCOPE_PATH.SPX_DIR,
    STATE_STORE_SCOPE_PATH.WORKTREE_SCOPE,
    sessionToken,
    STATE_STORE_DOMAIN.COMPACT,
    COMPACT_STORE_PATH.STASH_FILE,
  ));
}
