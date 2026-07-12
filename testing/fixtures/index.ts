import { join, resolve } from "path/posix";

/**
 * Test fixtures directory (absolute path)
 */

export const FIXTURES_PATH = resolve(__dirname);

export const FIXTURES_PATHS = {
  PROJECTS: join(FIXTURES_PATH, "projects"),
  VALIDATION_CLI_CONTRACT: join(FIXTURES_PATH, "validation-cli", "contract.json"),
} as const;
