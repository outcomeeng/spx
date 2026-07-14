import {
  assertMissingNodeStatusRoutesToLiveDerivation,
  assertNodeStatusUpdateRemovesStaleStatusFile,
  assertNodeStatusUpdateWritesVerificationProjection,
} from "@testing/harnesses/node-status/node-status-scenario";
import { describe, it } from "vitest";

describe("spx spec status --update", () => {
  it("writes each node's verification projection to its co-located spx.status.json", async () => {
    await assertNodeStatusUpdateWritesVerificationProjection();
  });

  it("removes a stale status file outside the live node set", async () => {
    await assertNodeStatusUpdateRemovesStaleStatusFile();
  });

  it("routes a node with no spx.status.json to live derivation rather than reading a file", async () => {
    await assertMissingNodeStatusRoutesToLiveDerivation();
  });
});
