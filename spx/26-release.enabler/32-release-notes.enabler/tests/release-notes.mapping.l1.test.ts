import {
  RELEASE_NOTES_FAITHFULNESS_APPROVED,
  RELEASE_NOTES_FAITHFULNESS_INVALID_VERDICT_MESSAGE,
  RELEASE_NOTES_FAITHFULNESS_REJECTED,
  RELEASE_NOTES_FAITHFULNESS_REJECTION_MESSAGE,
} from "@/domains/release/release-notes";
import { arbitraryAuditVerdictCases, AUDIT_VERDICT_OUTCOME } from "@testing/generators/release/audit-verdict";
import { sampleReleaseTestValue } from "@testing/generators/release/release";
import {
  RELEASE_NOTES_FAITHFULNESS_CASE,
  sampleReleaseNotesFaithfulnessScenario,
} from "@testing/generators/release/release-notes";
import { observeReleaseNotesAuditVerdict } from "@testing/harnesses/release/release-notes-compliance";
import { expect, it } from "vitest";

it.each(
  sampleReleaseTestValue(
    arbitraryAuditVerdictCases({
      approved: RELEASE_NOTES_FAITHFULNESS_APPROVED,
      rejected: RELEASE_NOTES_FAITHFULNESS_REJECTED,
    }),
  ),
)("maps release notes audit verdict $verdict by its first whitespace-delimited token", async (verdictCase) => {
  const observation = await observeReleaseNotesAuditVerdict(
    sampleReleaseNotesFaithfulnessScenario(RELEASE_NOTES_FAITHFULNESS_CASE.PRODUCTION_AUDITOR).input,
    verdictCase.verdict,
  );

  if (verdictCase.outcome === AUDIT_VERDICT_OUTCOME.APPROVED) {
    expect(observation.error).toBeUndefined();
  } else {
    expect(observation.error).toBeInstanceOf(Error);
    expect(String(observation.error)).toContain(
      verdictCase.outcome === AUDIT_VERDICT_OUTCOME.REJECTED
        ? RELEASE_NOTES_FAITHFULNESS_REJECTION_MESSAGE
        : RELEASE_NOTES_FAITHFULNESS_INVALID_VERDICT_MESSAGE,
    );
  }
});
