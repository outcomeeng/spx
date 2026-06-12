import { join } from "node:path";

import * as fc from "fast-check";
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

function jsonlStringRecord(content: string): string {
  return JSON.stringify({ content });
}

function jsonlNestedStringRecord(content: string): string {
  return jsonlStringRecord(JSON.stringify({ content }));
}

describe("compact transcript extraction", () => {
  it("extracts the last active node from JSONL string fields with escaped transcript markers", () => {
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
  });

  it("extracts the last active node from JSONL string fields with unescaped transcript markers", () => {
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
  });

  it("extracts the last active node from JSONL nested string-encoded transcript markers", () => {
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
  });

  it("ignores marker text outside JSON string field values", () => {
    const node = sampleCompactTestValue(COMPACT_TEST_GENERATOR.nodePath());
    const transcript = JSON.stringify({
      [COMPACT_MARKER.FOUNDATION]: true,
      [unescapedMarker(node)]: true,
    });

    expect(extractCompactRecord(transcript)).toBeUndefined();
  });

  it("returns no record when the foundation marker is absent", () => {
    const node = sampleCompactTestValue(COMPACT_TEST_GENERATOR.nodePath());

    expect(extractCompactRecord(jsonlStringRecord(escapedMarker(node)))).toBeUndefined();
  });

  it("stores compact state under the local worktree session scope", async () => {
    const sessionToken = sampleCompactTestValue(COMPACT_TEST_GENERATOR.sessionToken());
    const mainCheckoutScope = await resolveWorktreeScopeDir({
      deps: createSessionGitDeps({ worktreeKind: WORKTREE_KIND.MAIN_CHECKOUT }),
    });
    const nonMainScope = await resolveWorktreeScopeDir({
      deps: createSessionGitDeps({ worktreeKind: WORKTREE_KIND.NON_MAIN }),
    });
    expect(mainCheckoutScope.ok).toBe(true);
    expect(nonMainScope.ok).toBe(true);
    if (!mainCheckoutScope.ok) throw new Error(mainCheckoutScope.error);
    if (!nonMainScope.ok) throw new Error(nonMainScope.error);
    const mainCheckout = compactStashPath(mainCheckoutScope.value, sessionToken);
    const nonMain = compactStashPath(nonMainScope.value, sessionToken);

    expect(mainCheckout.ok).toBe(true);
    expect(nonMain.ok).toBe(true);
    if (!mainCheckout.ok) throw new Error(mainCheckout.error);
    if (!nonMain.ok) throw new Error(nonMain.error);
    expect(mainCheckout.value).toBe(join(
      SESSION_GIT_DEPS_PATHS.MAIN_CHECKOUT_TOPLEVEL,
      STATE_STORE_PATH.SPX_DIR,
      STATE_STORE_PATH.WORKTREE_SCOPE,
      sessionToken,
      STATE_STORE_DOMAIN.COMPACT,
      COMPACT_STORE_PATH.STASH_FILE,
    ));
    expect(nonMain.value).toBe(join(
      SESSION_GIT_DEPS_PATHS.NON_MAIN_TOPLEVEL,
      STATE_STORE_PATH.SPX_DIR,
      STATE_STORE_PATH.WORKTREE_SCOPE,
      sessionToken,
      STATE_STORE_DOMAIN.COMPACT,
      COMPACT_STORE_PATH.STASH_FILE,
    ));
  });
});
