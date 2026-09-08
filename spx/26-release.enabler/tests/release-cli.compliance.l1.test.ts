import {
  formatDocumentationSyncOutput,
  formatReleaseErrorOutput,
  formatReleaseNotesOutput,
  formatReleasePublicationOutput,
  RELEASE_CLI_OUTPUT,
} from "@/interfaces/cli/release-output";
import { MAX_CLI_ARGUMENT_DISPLAY_LENGTH } from "@/lib/sanitize-cli-argument";
import { arbitraryPathSegment } from "@testing/generators/git-name/git-name";
import { RELEASE_TEST_GENERATOR, sampleReleaseTestValue } from "@testing/generators/release/release";
import { arbitraryTerminalEscapingCase } from "@testing/generators/terminal-text/terminal-text";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { observeReleaseCliFailure, releaseCliFailureDrives } from "@testing/harnesses/release/cli";
import { describe, expect, it } from "vitest";

describe("release CLI terminal output compliance", () => {
  it("escapes changelog paths while preserving the authored label and line ending", () => {
    assertProperty(
      arbitraryTerminalEscapingCase(),
      ({ input, escaped }) => {
        expect(formatReleaseNotesOutput(input)).toBe(
          `${RELEASE_CLI_OUTPUT.RELEASE_NOTES_PREFIX}${RELEASE_CLI_OUTPUT.LABEL_SEPARATOR}${escaped}${RELEASE_CLI_OUTPUT.LINE_SEPARATOR}`,
        );
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });

  it("escapes documentation paths while preserving the authored label and line ending", () => {
    assertProperty(
      arbitraryTerminalEscapingCase(),
      ({ input, escaped }) => {
        expect(formatDocumentationSyncOutput(input)).toBe(
          `${RELEASE_CLI_OUTPUT.DOCUMENTATION_UPDATED_PREFIX}${RELEASE_CLI_OUTPUT.LABEL_SEPARATOR}${escaped}${RELEASE_CLI_OUTPUT.LINE_SEPARATOR}`,
        );
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });

  it("escapes error messages unabridged at any length while preserving the authored label and line ending", () => {
    assertProperty(
      arbitraryTerminalEscapingCase(),
      ({ input, escaped }) => {
        expect(formatReleaseErrorOutput(input)).toBe(
          `${RELEASE_CLI_OUTPUT.ERROR_PREFIX}${RELEASE_CLI_OUTPUT.LABEL_SEPARATOR}${escaped}${RELEASE_CLI_OUTPUT.LINE_SEPARATOR}`,
        );
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
    assertProperty(
      arbitraryTerminalEscapingCase({ minLength: MAX_CLI_ARGUMENT_DISPLAY_LENGTH }),
      ({ input, escaped }) => {
        expect(formatReleaseErrorOutput(input)).toBe(
          `${RELEASE_CLI_OUTPUT.ERROR_PREFIX}${RELEASE_CLI_OUTPUT.LABEL_SEPARATOR}${escaped}${RELEASE_CLI_OUTPUT.LINE_SEPARATOR}`,
        );
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });

  it("reports every verb's failed command unabridged on standard error and exits non-zero", async () => {
    for (const drive of releaseCliFailureDrives(sampleReleaseTestValue(RELEASE_TEST_GENERATOR.releaseTag()))) {
      await assertProperty(
        arbitraryTerminalEscapingCase({ minLength: MAX_CLI_ARGUMENT_DISPLAY_LENGTH }),
        async ({ input, escaped }) => {
          const observation = await observeReleaseCliFailure(
            sampleReleaseTestValue(arbitraryPathSegment()),
            drive,
            new Error(input),
          );
          expect(observation.stdout).toHaveLength(0);
          expect(observation.stderr).toBe(
            `${RELEASE_CLI_OUTPUT.ERROR_PREFIX}${RELEASE_CLI_OUTPUT.LABEL_SEPARATOR}${escaped}${RELEASE_CLI_OUTPUT.LINE_SEPARATOR}`,
          );
          expect(observation.exitCodes).toEqual([1]);
        },
        { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
      );
    }
  });

  it("escapes publication tags while preserving the authored label and line ending", () => {
    assertProperty(
      arbitraryTerminalEscapingCase(),
      ({ input, escaped }) => {
        expect(formatReleasePublicationOutput(input)).toBe(
          `${RELEASE_CLI_OUTPUT.RELEASE_PUBLISHED_PREFIX}${RELEASE_CLI_OUTPUT.LABEL_SEPARATOR}${escaped}${RELEASE_CLI_OUTPUT.LINE_SEPARATOR}`,
        );
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });
});
