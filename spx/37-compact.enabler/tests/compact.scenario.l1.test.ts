import { describe, it } from "vitest";

import {
  assertCompactPathUsesLocalWorktreeSessionScope,
  assertEscapedTranscriptUsesLatestNode,
  assertMarkerTextOutsideStringValuesIsIgnored,
  assertNestedTranscriptUsesLatestNode,
  assertTranscriptWithoutFoundationHasNoRecord,
  assertUnescapedTranscriptUsesLatestNode,
} from "@testing/harnesses/compact/compact";

describe("compact transcript extraction", () => {
  it("extracts the last active node from JSONL string fields with escaped transcript markers", () => {
    assertEscapedTranscriptUsesLatestNode();
  });

  it("extracts the last active node from JSONL string fields with unescaped transcript markers", () => {
    assertUnescapedTranscriptUsesLatestNode();
  });

  it("extracts the last active node from JSONL nested string-encoded transcript markers", () => {
    assertNestedTranscriptUsesLatestNode();
  });

  it("ignores marker text outside JSON string field values", () => {
    assertMarkerTextOutsideStringValuesIsIgnored();
  });

  it("returns no record when the foundation marker is absent", () => {
    assertTranscriptWithoutFoundationHasNoRecord();
  });

  it("stores compact state under the local worktree session scope", async () => {
    await assertCompactPathUsesLocalWorktreeSessionScope();
  });
});
