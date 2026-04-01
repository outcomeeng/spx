/**
 * Command handler for spx spec apply.
 *
 * Reads spx/EXCLUDE and applies exclusions to the project's language-specific
 * config file using the detected language adapter.
 */
import { join } from "node:path";

import { detectLanguage } from "./adapters/index.js";
import { EXCLUDE_FILENAME, SPX_PREFIX } from "./constants.js";
import { readExcludedNodes } from "./exclude-file.js";
import type { ApplyExcludeOptions, ApplyExcludeResult } from "./types.js";

/**
 * Run the apply-exclude command.
 *
 * @param options - Command options with injected dependencies
 * @returns Command result with exit code and output message
 */
export async function applyExcludeCommand(options: ApplyExcludeOptions): Promise<ApplyExcludeResult> {
  const { cwd, deps } = options;
  const excludePath = join(cwd, SPX_PREFIX, EXCLUDE_FILENAME);

  // Check spx/EXCLUDE exists
  const excludeExists = await deps.fileExists(excludePath);
  if (!excludeExists) {
    return { exitCode: 1, output: `error: ${excludePath} not found` };
  }

  // Detect project language
  const adapter = await detectLanguage(cwd, deps);
  if (!adapter) {
    return { exitCode: 1, output: "error: no supported config file found (checked: pyproject.toml)" };
  }

  const configPath = join(cwd, adapter.configFile);

  // Read both files
  const excludeContent = await deps.readFile(excludePath);
  const configContent = await deps.readFile(configPath);

  // Parse excluded nodes
  const nodes = readExcludedNodes(excludeContent);
  if (nodes.length === 0) {
    return { exitCode: 0, output: "spx/EXCLUDE is empty — no excluded nodes to apply." };
  }

  // Apply exclusions
  const result = adapter.applyExclusions(configContent, nodes);

  if (result.changed) {
    await deps.writeFile(configPath, result.content);
    return {
      exitCode: 0,
      output: `Updated ${adapter.configFile} from spx/EXCLUDE (${nodes.length} nodes).`,
    };
  }

  return { exitCode: 0, output: `${adapter.configFile} is already in sync with spx/EXCLUDE.` };
}
