import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { TYPESCRIPT_TEST_FILE_PATTERNS } from "@/test/languages/typescript";

/**
 * The Vitest config file a fixture product carries at its root. Vitest finds its config by walking up from
 * the root it starts with, so a fixture product inside a worktree without a config of its own inherits the
 * worktree's config and its worktree-rooted include globs; its own config stops that walk at the fixture root.
 */
export const VITEST_FIXTURE_CONFIG_FILENAME = "vitest.config.ts";

const ANY_DIRECTORY_GLOB_PREFIX = "**/";

/** The config text: the include pattern that collects the suites copied into the fixture product, and nothing else. */
export function vitestFixtureConfigText(): string {
  const include = TYPESCRIPT_TEST_FILE_PATTERNS.map((pattern) => `${ANY_DIRECTORY_GLOB_PREFIX}${pattern}`);
  return `export default { test: { include: ${JSON.stringify(include)} } };\n`;
}

/** Writes the fixture config at the root of a fixture product that runs real Vitest. */
export async function writeVitestFixtureConfig(productDir: string): Promise<void> {
  await writeFile(join(productDir, VITEST_FIXTURE_CONFIG_FILENAME), vitestFixtureConfigText());
}
