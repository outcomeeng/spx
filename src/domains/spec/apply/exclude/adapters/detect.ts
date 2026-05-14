/**
 * Language detection for apply-exclude.
 *
 * Checks which config files exist in the product to determine the language
 * and return the appropriate adapter.
 */
import { join } from "node:path";

import type { ApplyExcludeDeps } from "../types";
import { pythonAdapter } from "./python";
import type { LanguageAdapter } from "./types";

/** All registered language adapters, checked in order */
export const ADAPTERS: readonly LanguageAdapter[] = [pythonAdapter] as const;

/**
 * Detect the product language by checking for config files.
 *
 * @param productDir - Absolute path to the product root
 * @param deps - Injected file system dependencies
 * @returns The first matching adapter, or null if no config file is found
 */
export async function detectLanguage(
  productDir: string,
  deps: Pick<ApplyExcludeDeps, "fileExists">,
): Promise<LanguageAdapter | null> {
  for (const adapter of ADAPTERS) {
    const configPath = join(productDir, adapter.configFile);
    const exists = await deps.fileExists(configPath);
    if (exists) {
      return adapter;
    }
  }
  return null;
}
