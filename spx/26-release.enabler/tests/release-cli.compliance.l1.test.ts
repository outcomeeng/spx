import {
  formatDocumentationSyncOutput,
  formatReleaseNotesOutput,
  RELEASE_CLI_OUTPUT,
} from "@/interfaces/cli/release-output";
import { externalValue, renderTerminalText } from "@/lib/terminal-text/terminal-text";
import { arbitraryTerminalUnsafeText } from "@testing/generators/terminal-text/terminal-text";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { describe, expect, it } from "vitest";

describe("release CLI terminal output compliance", () => {
  it("escapes external release-note output while preserving the authored line ending", () => {
    assertProperty(
      arbitraryTerminalUnsafeText(),
      (output) => {
        expect(formatReleaseNotesOutput(output)).toBe(
          `${renderTerminalText(externalValue(output))}${RELEASE_CLI_OUTPUT.LINE_SEPARATOR}`,
        );
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });

  it("escapes documentation paths while preserving the authored label and line ending", () => {
    assertProperty(
      arbitraryTerminalUnsafeText(),
      (path) => {
        expect(formatDocumentationSyncOutput(path)).toBe(
          `${RELEASE_CLI_OUTPUT.DOCUMENTATION_UPDATED_PREFIX}${RELEASE_CLI_OUTPUT.LABEL_SEPARATOR}${
            renderTerminalText(externalValue(path))
          }${RELEASE_CLI_OUTPUT.LINE_SEPARATOR}`,
        );
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });
});
