import { describe, expect, it } from "vitest";

import { EVIDENCE_REQUIREMENT } from "@/domains/verify/evidence-rejection";
import {
  evidenceValidatorFor,
  VERIFY_EVIDENCE_KIND,
  VERIFY_SCOPE_TYPE,
  VERIFY_VERIFICATION_TYPE,
} from "@/domains/verify/verify";
import { STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import { JOURNAL_REPORTER_TEST_GENERATOR } from "@testing/generators/testing/journal-reporter";
import { sampleVerifyTestValue } from "@testing/generators/verify/verify";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import {
  assertInvalidTestFindingRejectedBeforeAppend,
  assertInvalidTestScopeRejectedBeforeAppend,
  assertTestTerminalRejectsAgenticDisposition,
  assertTestTerminalRejectsPassedWithFindings,
  assertTestTerminalRejectsSuppliedMetadata,
} from "@testing/harnesses/verify/harness";

describe("test evidence validation", () => {
  it("rejects invalid test scope payloads before append", async () => {
    await assertInvalidTestScopeRejectedBeforeAppend();
  });

  it("rejects invalid test finding payloads before append", async () => {
    await assertInvalidTestFindingRejectedBeforeAppend();
  });

  it("rejects an agentic terminal disposition, sealing only with a runner-mapped status", async () => {
    await assertTestTerminalRejectsAgenticDisposition();
  });

  it("rejects supplied terminal metadata, since a deterministic run produces none", async () => {
    await assertTestTerminalRejectsSuppliedMetadata();
  });

  it("rejects a passed terminal when findings exist, since a passing run produces none", async () => {
    await assertTestTerminalRejectsPassedWithFindings();
  });

  it("names the missing required field when it rejects a test scope payload", () => {
    assertProperty(
      JOURNAL_REPORTER_TEST_GENERATOR.scopeUnitMissingRequiredField(),
      (scenario) => {
        const result = evidenceValidatorFor(VERIFY_VERIFICATION_TYPE.TEST, VERIFY_EVIDENCE_KIND.SCOPE)?.({
          payload: scenario.payload,
          events: [],
          selector: { scopeType: VERIFY_SCOPE_TYPE.CHANGESET, scopeIdentity: sampleScopeIdentity() },
        });
        expect(result?.ok).toBe(false);
        expect(result?.ok === false ? result.reason : "").toContain(scenario.missingField);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("names the missing required field when it rejects a test finding payload", () => {
    assertProperty(
      JOURNAL_REPORTER_TEST_GENERATOR.findingMissingRequiredField(),
      (scenario) => {
        const result = evidenceValidatorFor(VERIFY_VERIFICATION_TYPE.TEST, VERIFY_EVIDENCE_KIND.FINDING)?.({
          payload: scenario.payload,
          events: [],
          selector: { scopeType: VERIFY_SCOPE_TYPE.CHANGESET, scopeIdentity: sampleScopeIdentity() },
        });
        expect(result?.ok).toBe(false);
        expect(result?.ok === false ? result.reason : "").toContain(scenario.missingField);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("names the unmet structural requirement when a test payload is not a JSON object", () => {
    const result = evidenceValidatorFor(VERIFY_VERIFICATION_TYPE.TEST, VERIFY_EVIDENCE_KIND.SCOPE)?.({
      payload: sampleScopeIdentity(),
      events: [],
      selector: { scopeType: VERIFY_SCOPE_TYPE.CHANGESET, scopeIdentity: sampleScopeIdentity() },
    });
    expect(result?.ok).toBe(false);
    expect(result?.ok === false ? result.reason : "").toContain(EVIDENCE_REQUIREMENT.PAYLOAD_IS_OBJECT);
  });
});

function sampleScopeIdentity(): string {
  return sampleVerifyTestValue(STATE_STORE_TEST_GENERATOR.scopeToken());
}
