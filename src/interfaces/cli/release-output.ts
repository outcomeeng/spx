import { authoredText, externalValue, renderTerminalText, terminal } from "@/lib/terminal-text/terminal-text";

export const RELEASE_CLI_OUTPUT = {
  DOCUMENTATION_UPDATED_PREFIX: "Updated documentation",
  ERROR_PREFIX: "Error",
  LABEL_SEPARATOR: ": ",
  LINE_SEPARATOR: "\n",
  RELEASE_NOTES_PREFIX: "Generated release notes",
  RELEASE_PUBLISHED_PREFIX: "Published release",
} as const;

/**
 * The diagnostic a failed release command writes to standard error. The message
 * is a caught-error reading, so it is escaped as an external segment and kept
 * whole: a faithfulness-audit reason or a git failure is only useful in full.
 */
export function formatReleaseErrorOutput(message: string): string {
  return renderTerminalText(
    terminal`${authoredText(RELEASE_CLI_OUTPUT.ERROR_PREFIX)}${
      authoredText(RELEASE_CLI_OUTPUT.LABEL_SEPARATOR)
    }${message}${authoredText(RELEASE_CLI_OUTPUT.LINE_SEPARATOR)}`,
  );
}

export function formatReleaseNotesOutput(changelogPath: string): string {
  return renderTerminalText(
    terminal`${authoredText(RELEASE_CLI_OUTPUT.RELEASE_NOTES_PREFIX)}${
      authoredText(RELEASE_CLI_OUTPUT.LABEL_SEPARATOR)
    }${externalValue(changelogPath)}${authoredText(RELEASE_CLI_OUTPUT.LINE_SEPARATOR)}`,
  );
}

export function formatDocumentationSyncOutput(path: string): string {
  return renderTerminalText(
    terminal`${authoredText(RELEASE_CLI_OUTPUT.DOCUMENTATION_UPDATED_PREFIX)}${
      authoredText(RELEASE_CLI_OUTPUT.LABEL_SEPARATOR)
    }${externalValue(path)}${authoredText(RELEASE_CLI_OUTPUT.LINE_SEPARATOR)}`,
  );
}

export function formatReleasePublicationOutput(tag: string): string {
  return renderTerminalText(
    terminal`${authoredText(RELEASE_CLI_OUTPUT.RELEASE_PUBLISHED_PREFIX)}${
      authoredText(RELEASE_CLI_OUTPUT.LABEL_SEPARATOR)
    }${externalValue(tag)}${authoredText(RELEASE_CLI_OUTPUT.LINE_SEPARATOR)}`,
  );
}
