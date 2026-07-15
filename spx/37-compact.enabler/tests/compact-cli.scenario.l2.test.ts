import { describe, it } from "vitest";

import {
  assertAgentSessionEnvironmentRetrievesLatestRecord,
  assertCodexUnsafeSessionIdentityStoresRecord,
  assertEmptySessionIdUsesAgentSessionEnvironment,
  assertExplicitSessionIdOverridesAgentSessionEnvironment,
  assertExplicitSessionIdRetrievesLatestRecord,
  assertMissingCompactRecordReturnsNoOutput,
  assertMissingSessionIdentityFailsWithoutWriting,
  assertTranscriptWithoutFoundationStoresNothing,
  assertUnsafeExplicitSessionIdStoresRecord,
} from "@testing/harnesses/compact/cli";

describe("compact CLI", () => {
  it("stores and retrieves the latest record from the agent-session environment without --session-id", async () => {
    await assertAgentSessionEnvironmentRetrievesLatestRecord();
  });

  it("stores nothing and exits successfully when the transcript has no foundation marker", async () => {
    await assertTranscriptWithoutFoundationStoresNothing();
  });

  it("stores and retrieves records when Codex provides a path-unsafe thread identity", async () => {
    await assertCodexUnsafeSessionIdentityStoresRecord();
  });

  it("returns no output and exits non-zero when no compact record exists", async () => {
    await assertMissingCompactRecordReturnsNoOutput();
  });

  it("stores and retrieves the latest record under the --session-id token without an agent-session environment", async () => {
    await assertExplicitSessionIdRetrievesLatestRecord();
  });

  it("stores and retrieves under an unsafe --session-id value", async () => {
    await assertUnsafeExplicitSessionIdStoresRecord();
  });

  it("falls through to the agent-session environment when --session-id is empty", async () => {
    await assertEmptySessionIdUsesAgentSessionEnvironment();
  });

  it("prefers the --session-id token over the agent-session environment identity", async () => {
    await assertExplicitSessionIdOverridesAgentSessionEnvironment();
  });

  it("returns no output and exits non-zero when neither a --session-id nor an agent-session environment identity is available", async () => {
    await assertMissingSessionIdentityFailsWithoutWriting();
  });
});
