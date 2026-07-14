import {
  assertNodeStatusClassificationIsDeterministic,
  assertNodeStatusRoundTripPreservesVerification,
  assertNodeStatusSerializationParses,
} from "@testing/harnesses/node-status/node-status-property";
import { describe, it } from "vitest";

describe("node-status writer output", () => {
  it("always serializes to a schema-versioned JSON object with verification data", () => {
    assertNodeStatusSerializationParses();
  });

  it("preserves every mechanism and evidence reference across parse and serialize", () => {
    assertNodeStatusRoundTripPreservesVerification();
  });

  it("classifies deterministically: identical facts always map to the same state", () => {
    assertNodeStatusClassificationIsDeterministic();
  });
});
