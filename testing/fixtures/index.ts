import { join, resolve } from "path/posix";

/**
 * Test fixtures directory (absolute path)
 */

export const FIXTURES_PATH = resolve(__dirname);

export const FIXTURES_PATHS = {
  PROJECTS: join(FIXTURES_PATH, "projects"),
  SPEC_LEGACY: join(FIXTURES_PATH, "spec-legacy"),
} as const;
