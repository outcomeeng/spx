import { describe, expect, it } from "vitest";

import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import {
  TERMINAL_REQUIREMENT,
  terminalMetadataValidatorFor,
  type TerminalValidationInput,
  VERIFY_SCOPE_TYPE,
  VERIFY_VERIFICATION_TYPE,
} from "@/domains/verify/verify";
import type { JournalEvent, JsonValue } from "@/lib/agent-run-journal";
import { STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import { arbitraryFileAuditScopeScenario } from "@testing/generators/verify/audit";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import { AUDIT_FIXTURE, readVerificationFixture, withAuditFixtureRun } from "@testing/harnesses/verify/audit-fixtures";
import { finishTestRunWithSuppliedMetadata } from "@testing/harnesses/verify/harness";

/** Project one terminal-completion validation, so a case reads the refusal class and its reason. */
function validateTerminal(
  verificationType: string,
  terminalStatus: string,
  metadata: JsonValue | undefined,
  events: readonly JournalEvent[],
) {
  return terminalMetadataValidatorFor(verificationType)?.({
    terminalStatus,
    metadata,
    events,
    selector: {
      scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
      scopeIdentity: sampleVerifyTestValue(STATE_STORE_TEST_GENERATOR.scopeToken()),
    },
  });
}

describe("verify terminal rejection reasons", () => {
  it("reports vocabulary, evidence, and metadata refusals through finish without sealing or appending", async () => {
    await withAuditFixtureRun(async (env) => {
      expect((await env.appendScope(AUDIT_FIXTURE.ROOT)).exitCode).toBe(0);
      const before = await env.events();
      const vocabulary = await env.finish({ terminalStatus: JOURNAL_RUN_STATE_STATUS.PASSED });
      expect(vocabulary.exitCode).not.toBe(0);
      expect(vocabulary.output).toContain(TERMINAL_REQUIREMENT.STATUS_IN_TYPE_VOCABULARY);
      expect(await env.events()).toEqual(before);
      const evidence = await env.finish({ terminalStatus: JOURNAL_RUN_STATE_STATUS.REJECTED });
      expect(evidence.exitCode).not.toBe(0);
      expect(evidence.output).toContain(TERMINAL_REQUIREMENT.STATUS_MATCHES_EVIDENCE);
      expect(await env.events()).toEqual(before);
      const metadata = await env.finish({ terminalStatus: JOURNAL_RUN_STATE_STATUS.APPROVED, terminalMetadata: AUDIT_FIXTURE.TERMINAL_METADATA });
      expect(metadata.exitCode).not.toBe(0);
      expect(metadata.output).toContain(TERMINAL_REQUIREMENT.NO_METADATA_ACCEPTED);
      expect(await env.events()).toEqual(before);
      expect((await env.appendScope(AUDIT_FIXTURE.CHILD)).exitCode).toBe(0);
      expect((await env.events()).length).toBeGreaterThan(before.length);
    });
  });
  it("identifies the violated terminal requirement in complete file-backed input", async () => {
    const result = terminalMetadataValidatorFor(VERIFY_VERIFICATION_TYPE.AUDIT)?.(
      await readVerificationFixture<TerminalValidationInput>(AUDIT_FIXTURE.TERMINAL_METADATA),
    );
    expect(result?.ok).toBe(false);
    expect(result?.ok === false ? result.reason : "").toContain(TERMINAL_REQUIREMENT.NO_METADATA_ACCEPTED);
  });
  it("names the no-metadata requirement when a deterministic type is handed terminal metadata", () => {
    const metadata = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewApprovedTerminalMetadata());
    const result = validateTerminal(
      VERIFY_VERIFICATION_TYPE.TEST,
      JOURNAL_RUN_STATE_STATUS.PASSED,
      metadata as unknown as JsonValue,
      [],
    );
    expect(result?.ok).toBe(false);
    expect(result?.ok === false ? result.reason : "").toContain(TERMINAL_REQUIREMENT.NO_METADATA_ACCEPTED);
  });

  it("names the type-vocabulary requirement when a status outside the type's vocabulary seals a run", () => {
    const result = validateTerminal(
      VERIFY_VERIFICATION_TYPE.TEST,
      JOURNAL_RUN_STATE_STATUS.APPROVED,
      undefined,
      [],
    );
    expect(result?.ok).toBe(false);
    expect(result?.ok === false ? result.reason : "").toContain(TERMINAL_REQUIREMENT.STATUS_IN_TYPE_VOCABULARY);
  });

  it("names the no-findings requirement when a run sealing as passed recorded findings", () => {
    const scenario = sampleVerifyTestValue(arbitraryFileAuditScopeScenario());
    const result = validateTerminal(
      VERIFY_VERIFICATION_TYPE.TEST,
      JOURNAL_RUN_STATE_STATUS.PASSED,
      undefined,
      scenario.findingEvents,
    );
    expect(result?.ok).toBe(false);
    expect(result?.ok === false ? result.reason : "").toContain(TERMINAL_REQUIREMENT.PASSED_HAS_NO_FINDINGS);
  });

  it("names the type-vocabulary requirement when a review run seals with a runner-mapped status", () => {
    const result = validateTerminal(
      VERIFY_VERIFICATION_TYPE.REVIEW,
      JOURNAL_RUN_STATE_STATUS.PASSED,
      undefined,
      [],
    );
    expect(result?.ok).toBe(false);
    expect(result?.ok === false ? result.reason : "").toContain(TERMINAL_REQUIREMENT.STATUS_IN_TYPE_VOCABULARY);
  });

  it("names the evidence-agreement requirement when an audit status contradicts its recorded evidence", () => {
    const scenario = sampleVerifyTestValue(arbitraryFileAuditScopeScenario());
    const result = validateTerminal(
      VERIFY_VERIFICATION_TYPE.AUDIT,
      JOURNAL_RUN_STATE_STATUS.APPROVED,
      undefined,
      scenario.findingEvents,
    );
    expect(result?.ok).toBe(false);
    expect(result?.ok === false ? result.reason : "").toContain(TERMINAL_REQUIREMENT.STATUS_MATCHES_EVIDENCE);
  });

  it("names the no-metadata requirement when an audit run is handed terminal metadata", () => {
    const metadata = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewApprovedTerminalMetadata());
    const result = validateTerminal(
      VERIFY_VERIFICATION_TYPE.AUDIT,
      JOURNAL_RUN_STATE_STATUS.APPROVED,
      metadata as unknown as JsonValue,
      [],
    );
    expect(result?.ok).toBe(false);
    expect(result?.ok === false ? result.reason : "").toContain(TERMINAL_REQUIREMENT.NO_METADATA_ACCEPTED);
  });

  it("names the metadata-agreement requirement when review metadata contradicts the run's evidence", () => {
    const scenario = sampleVerifyTestValue(arbitraryFileAuditScopeScenario());
    const metadata = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewApprovedTerminalMetadata());
    const result = validateTerminal(
      VERIFY_VERIFICATION_TYPE.REVIEW,
      JOURNAL_RUN_STATE_STATUS.APPROVED,
      metadata as unknown as JsonValue,
      scenario.findingEvents,
    );
    expect(result?.ok).toBe(false);
    expect(result?.ok === false ? result.reason : "").toContain(TERMINAL_REQUIREMENT.METADATA_MATCHES_EVIDENCE);
  });
  it("reports the terminal validator's reason in the command layer's rejection diagnostic", async () => {
    const rejected = await finishTestRunWithSuppliedMetadata();
    expect(rejected.exitCode).not.toBe(0);
    expect(rejected.output).toContain(TERMINAL_REQUIREMENT.NO_METADATA_ACCEPTED);
  });
});
