import {
  formatDocumentationSyncOutput,
  formatReleaseNotesOutput,
  formatReleasePublicationOutput,
  RELEASE_CLI_OUTPUT,
} from "@/interfaces/cli/release-output";
import { arbitraryTerminalEscapingCase } from "@testing/generators/terminal-text/terminal-text";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
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
