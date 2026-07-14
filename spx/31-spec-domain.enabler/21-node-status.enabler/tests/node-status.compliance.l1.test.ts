import {
  assertCiRejectsNodeStatusProjectionDrift,
  assertMalformedExcludeEntriesAreRejected,
  assertMissingNodeStatusReturnsUndefined,
  assertNodeOutcomeResolverConsultationIsScoped,
  assertNodeStatusFilesOnlyWrittenByUpdate,
  assertUnstagedEvidenceInTrackedNodeIsRecorded,
  assertUntrackedNodeStatusIsRemoved,
} from "@testing/harnesses/node-status/node-status-compliance";
import { describe, it } from "vitest";

describe("node-status write authority", () => {
  it("ALWAYS: spx.status.json appears only after the --update path runs", async () => {
    await assertNodeStatusFilesOnlyWrittenByUpdate();
  });
});

describe("node-status CI drift check", () => {
  it("ALWAYS: CI refreshes committed status projections and rejects spx drift", async () => {
    await assertCiRejectsNodeStatusProjectionDrift();
  });
});

describe("node-status absence semantics", () => {
  it("NEVER: a missing spx.status.json is treated as an error; absence returns undefined", async () => {
    await assertMissingNodeStatusReturnsUndefined();
  });
});

describe("node-status EXCLUDE validation", () => {
  it("ALWAYS: malformed EXCLUDE entries fail before consumers can use them", async () => {
    await assertMalformedExcludeEntriesAreRejected();
  });
});

describe("node-status delegation to the outcome resolver", () => {
  it("ALWAYS: --update consults the resolver only for test-outcome-stage nodes", async () => {
    await assertNodeOutcomeResolverConsultationIsScoped();
  });
});

describe("node-status tracked-tree write boundary", () => {
  it("NEVER: --update writes into an untracked node-shaped directory; a stale status file there is removed", async () => {
    await assertUntrackedNodeStatusIsRemoved();
  });

  it("ALWAYS: --update records a tracked node's not-yet-staged evidence in its projection", async () => {
    await assertUnstagedEvidenceInTrackedNodeIsRecorded();
  });
});
