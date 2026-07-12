/** Source-owned ESLint invocation vocabulary shared by orchestration and evidence. */
export const DEFAULT_ESLINT_CONFIG_FILE = "eslint.config.ts";

export const ESLINT_COMMAND_TOKENS = {
  COMMAND: "eslint",
  CONFIG_FLAG: "--config",
  CURRENT_DIRECTORY: ".",
  FILE_SEPARATOR: "--",
  FIX_FLAG: "--fix",
  IGNORE_PATTERN_FLAG: "--ignore-pattern",
} as const;

export const ESLINT_LOCAL_BIN_SEGMENTS = ["node_modules", ".bin", ESLINT_COMMAND_TOKENS.COMMAND] as const;
