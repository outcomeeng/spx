export const RELEASE_CLI_OUTPUT = {
  DOCUMENTATION_UPDATED_PREFIX: "Updated documentation",
  LABEL_SEPARATOR: ": ",
  LINE_SEPARATOR: "\n",
} as const;

export function formatReleaseNotesOutput(_output: string): string {
  throw new Error("Release notes terminal output is not implemented");
}

export function formatDocumentationSyncOutput(_path: string): string {
  throw new Error("Documentation terminal output is not implemented");
}
