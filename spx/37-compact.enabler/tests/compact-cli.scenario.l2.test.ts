import { describe, expect, it } from "vitest";

import { COMPACT_RECORD_FIELDS } from "@/domains/compact";
import {
  withAgentSessionLatestRecordObservation,
  withCodexUnsafeIdentityObservation,
  withEmptySessionIdObservation,
  withExplicitSessionLatestRecordObservation,
  withExplicitSessionOverrideObservation,
  withMissingCompactRecordObservation,
  withMissingFoundationStoreObservation,
  withMissingSessionIdentityObservation,
  withUnsafeExplicitSessionObservation,
} from "@testing/harnesses/compact/cli";

describe("compact CLI", () => {
  it("stores and retrieves the latest record from the agent-session environment without --session-id", async () => {
    await withAgentSessionLatestRecordObservation(({
      expectedRecord,
      firstStored,
      latestStored,
      retrieved,
      stashLineCount,
    }) => {
      expect(firstStored).toMatchObject({ exitCode: 0, stderr: "", stdout: "" });
      expect(latestStored).toMatchObject({ exitCode: 0, stderr: "", stdout: "" });
      expect(retrieved).toMatchObject({ exitCode: 0, stderr: "" });
      expect(JSON.parse(retrieved.stdout)).toEqual(expectedRecord);
      expect(stashLineCount).toBe(2);
    });
  });

  it("stores nothing and exits successfully when the transcript has no foundation marker", async () => {
    await withMissingFoundationStoreObservation(({ retrieved, stored }) => {
      expect(stored).toMatchObject({ exitCode: 0, stderr: "", stdout: "" });
      expect(retrieved).toMatchObject({ exitCode: 1, stderr: "", stdout: "" });
    });
  });

  it("stores and retrieves records when Codex provides a path-unsafe thread identity", async () => {
    await withCodexUnsafeIdentityObservation(({ expectedRecord, retrieved, stashText, stored }) => {
      expect(stored).toMatchObject({ exitCode: 0, stdout: "" });
      expect(retrieved.exitCode).toBe(0);
      expect(JSON.parse(retrieved.stdout)).toEqual(expectedRecord);
      expect(stashText).toContain(expectedRecord[COMPACT_RECORD_FIELDS.ACTIVE_NODE]);
    });
  });

  it("returns no output and exits non-zero when no compact record exists", async () => {
    await withMissingCompactRecordObservation(({ retrieved }) => {
      expect(retrieved).toMatchObject({ exitCode: 1, stderr: "", stdout: "" });
    });
  });

  it("stores and retrieves the latest record under the --session-id token without an agent-session environment", async () => {
    await withExplicitSessionLatestRecordObservation(({
      expectedRecord,
      firstStored,
      latestStored,
      retrieved,
      stashLineCount,
    }) => {
      expect(firstStored.exitCode).toBe(0);
      expect(latestStored.exitCode).toBe(0);
      expect(retrieved.exitCode).toBe(0);
      expect(JSON.parse(retrieved.stdout)).toEqual(expectedRecord);
      expect(stashLineCount).toBe(2);
    });
  });

  it("stores and retrieves under an unsafe --session-id value", async () => {
    await withUnsafeExplicitSessionObservation(({ expectedRecord, retrieved, stored }) => {
      expect(stored.exitCode).toBe(0);
      expect(retrieved.exitCode).toBe(0);
      expect(JSON.parse(retrieved.stdout)).toEqual(expectedRecord);
    });
  });

  it("falls through to the agent-session environment when --session-id is empty", async () => {
    await withEmptySessionIdObservation(({ expectedRecord, retrieved, stashText, stored }) => {
      expect(stored.exitCode).toBe(0);
      expect(retrieved.exitCode).toBe(0);
      expect(JSON.parse(retrieved.stdout)).toEqual(expectedRecord);
      expect(stashText).toContain(expectedRecord[COMPACT_RECORD_FIELDS.ACTIVE_NODE]);
    });
  });

  it("prefers the --session-id token over the agent-session environment identity", async () => {
    await withExplicitSessionOverrideObservation(({
      expectedRecord,
      readEnvironmentStash,
      retrieved,
      stashText,
      stored,
    }) => {
      expect(stored.exitCode).toBe(0);
      expect(retrieved.exitCode).toBe(0);
      expect(JSON.parse(retrieved.stdout)).toEqual(expectedRecord);
      expect(stashText).toContain(expectedRecord[COMPACT_RECORD_FIELDS.ACTIVE_NODE]);
      return expect(readEnvironmentStash()).rejects.toThrow();
    });
  });

  it("returns no output and exits non-zero when neither a --session-id nor an agent-session environment identity is available", async () => {
    await withMissingSessionIdentityObservation(({ readScope, retrieved, stored }) => {
      expect(stored).toMatchObject({ exitCode: 1, stderr: "", stdout: "" });
      expect(retrieved).toMatchObject({ exitCode: 1, stderr: "", stdout: "" });
      return expect(readScope()).rejects.toThrow();
    });
  });
});
