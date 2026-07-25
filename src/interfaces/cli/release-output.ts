import { authoredText, renderTerminalText, terminal } from "@/lib/terminal-text/terminal-text";

export const RELEASE_CLI_OUTPUT = {
  DOCUMENTATION_UPDATED_PREFIX: "Updated documentation",
  LABEL_SEPARATOR: ": ",
  LINE_SEPARATOR: "\n",
  RELEASE_PUBLISHED_PREFIX: "Published release",
} as const;

export function formatReleaseNotesOutput(output: string): string {
  return renderTerminalText(terminal`${output}${authoredText(RELEASE_CLI_OUTPUT.LINE_SEPARATOR)}`);
}

export function formatDocumentationSyncOutput(path: string): string {
  return renderTerminalText(
    terminal`${authoredText(RELEASE_CLI_OUTPUT.DOCUMENTATION_UPDATED_PREFIX)}${
      authoredText(RELEASE_CLI_OUTPUT.LABEL_SEPARATOR)
    }${path}${authoredText(RELEASE_CLI_OUTPUT.LINE_SEPARATOR)}`,
  );
}

export function formatReleasePublicationOutput(tag: string): string {
  return renderTerminalText(
    terminal`${authoredText(RELEASE_CLI_OUTPUT.RELEASE_PUBLISHED_PREFIX)}${
      authoredText(RELEASE_CLI_OUTPUT.LABEL_SEPARATOR)
    }${tag}${authoredText(RELEASE_CLI_OUTPUT.LINE_SEPARATOR)}`,
  );
}
