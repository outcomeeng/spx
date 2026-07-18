import {
  buildReleaseNotesPrompt,
  DEFAULT_CHANGELOG_PATH,
  RELEASE_NOTES_USER_FACING_INSTRUCTION,
} from "@/domains/release/release-notes";
import { sampleReleaseNotesCompositionFixture } from "@testing/harnesses/release/release-notes-assertions";
import { releaseNotesComplianceCases } from "@testing/harnesses/release/release-notes-compliance";
import { registerHarnessTestCases } from "@testing/harnesses/vitest-registration";
import { expect, it } from "vitest";

it("instructs the producer to describe user-visible release behavior", () => {
  expect(buildReleaseNotesPrompt(
    sampleReleaseNotesCompositionFixture().releaseData,
    DEFAULT_CHANGELOG_PATH,
  )).toContain(RELEASE_NOTES_USER_FACING_INSTRUCTION);
});

registerHarnessTestCases(releaseNotesComplianceCases);
