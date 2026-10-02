/** Tool names a file-inclusion consumer passes to `toToolArguments` to select a registered adapter. */
export const TOOL_NAMES = {
  ESLINT: "eslint",
  TSC: "tsc",
  KNIP: "knip",
  MARKDOWNLINT: "markdownlint",
  PYTEST: "pytest",
  VITEST: "vitest",
} as const;
