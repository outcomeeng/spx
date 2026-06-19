/**
 * Knip command for detecting unused code.
 *
 * Runs knip to find unused exports, dependencies, and files.
 */
import { statSync } from "node:fs";
import { join } from "node:path";

import { resolveConfig } from "@/config/index";
import {
  VALIDATION_PATH_TOOL_SUBSECTIONS,
  type ValidationConfig,
  validationConfigDescriptor,
} from "@/validation/config/descriptor";
import {
  applyValidationPathFilterToScope,
  pathPassesValidationFilter,
  validationPathFilterForTool,
} from "@/validation/config/path-filter";
import {
  constrainTypeScriptScopeToExplicitTargets,
  EXPLICIT_TYPESCRIPT_SCOPE_TARGET_KIND,
  explicitTypeScriptScopeTargetPassesScope,
  explicitTypeScriptScopeTargetPassesSourceKind,
  type ExplicitTypeScriptScopeTarget,
  getTypeScriptScope,
  pathStaysInsideTypeScriptScopeRoot,
  toProjectRelativeTypeScriptScopePath,
} from "@/validation/config/scope";
import { discoverTool, formatSkipMessage } from "@/validation/discovery/index";
import { validateKnip } from "@/validation/steps/knip";
import { VALIDATION_COMMAND_OUTPUT } from "./messages";
import type { KnipCommandOptions, ValidationCommandResult } from "./types";

export interface KnipCommandDeps {
  readonly discoverTool: typeof discoverTool;
  readonly validateKnip: typeof validateKnip;
}

export const defaultKnipCommandDeps: KnipCommandDeps = {
  discoverTool,
  validateKnip,
};

/**
 * Detect unused code with knip.
 *
 * @param options - Command options
 * @returns Command result with exit code and output
 */
export async function knipCommand(
  options: KnipCommandOptions,
  deps: KnipCommandDeps = defaultKnipCommandDeps,
): Promise<ValidationCommandResult> {
  const { cwd, files, quiet } = options;
  const startTime = Date.now();

  const loaded = await resolveConfig(cwd, [validationConfigDescriptor]);
  if (!loaded.ok) {
    return {
      exitCode: 1,
      output: `${VALIDATION_COMMAND_OUTPUT.KNIP_CONFIG_ERROR} — ${loaded.error}`,
      durationMs: Date.now() - startTime,
    };
  }
  const validationConfig = loaded.value[validationConfigDescriptor.section] as ValidationConfig;

  if (!validationConfig.knip.enabled) {
    const output = quiet ? "" : VALIDATION_COMMAND_OUTPUT.KNIP_DISABLED;
    return { exitCode: 0, output, durationMs: Date.now() - startTime };
  }

  // Discover knip
  const toolResult = await deps.discoverTool("knip", { projectRoot: cwd });
  if (!toolResult.found) {
    const skipMessage = formatSkipMessage("unused code detection", toolResult);
    return { exitCode: 0, output: skipMessage, durationMs: Date.now() - startTime };
  }

  const validationPathFilter = validationPathFilterForTool(
    validationConfig.paths,
    VALIDATION_PATH_TOOL_SUBSECTIONS.KNIP,
  );
  const scopeConfig = applyExplicitFilesToKnipScope(
    applyValidationPathFilterToScope(
      getTypeScriptScope("full", cwd),
      validationPathFilter,
    ),
    cwd,
    files,
    validationPathFilter,
  );

  // Run knip validation
  const result = await deps.validateKnip({ projectRoot: cwd, typescriptScope: scopeConfig });
  const durationMs = Date.now() - startTime;

  // Map result to command output
  if (result.success) {
    const output = quiet ? "" : VALIDATION_COMMAND_OUTPUT.KNIP_SUCCESS;
    return { exitCode: 0, output, durationMs };
  } else {
    const output = result.error ?? VALIDATION_COMMAND_OUTPUT.KNIP_FAILURE;
    return { exitCode: 1, output, durationMs };
  }
}

function applyExplicitFilesToKnipScope(
  scopeConfig: ReturnType<typeof getTypeScriptScope>,
  projectRoot: string,
  files: readonly string[] | undefined,
  validationPathFilter: ReturnType<typeof validationPathFilterForTool>,
): ReturnType<typeof getTypeScriptScope> {
  if (files === undefined) {
    return scopeConfig;
  }
  const explicitTargets = files
    .filter((file) => pathStaysInsideTypeScriptScopeRoot(projectRoot, file))
    .map((file) => toExplicitTypeScriptScopeTarget(projectRoot, file))
    .filter((target) => explicitTypeScriptScopeTargetPassesSourceKind(target))
    .filter((target) => pathPassesValidationFilter(target.path, validationPathFilter))
    .filter((target) => explicitTypeScriptScopeTargetPassesScope(target, scopeConfig));

  if (explicitTargets.length === 0) {
    return {
      ...scopeConfig,
      directories: [],
      filePatterns: [],
      filteredByValidationPaths: true,
      filteredByValidationPathIncludes: true,
      filteredByValidationPathNoMatches: files.length > 0,
    };
  }

  return {
    ...constrainTypeScriptScopeToExplicitTargets(scopeConfig, explicitTargets),
    filteredByValidationPaths: true,
    filteredByValidationPathIncludes: true,
    filteredByValidationPathNoMatches: false,
  };
}

function toExplicitTypeScriptScopeTarget(projectRoot: string, originalPath: string): ExplicitTypeScriptScopeTarget {
  const path = toProjectRelativeTypeScriptScopePath(projectRoot, originalPath);
  return {
    kind: pathIsDirectoryOperand(projectRoot, path)
      ? EXPLICIT_TYPESCRIPT_SCOPE_TARGET_KIND.DIRECTORY
      : EXPLICIT_TYPESCRIPT_SCOPE_TARGET_KIND.FILE,
    path,
  };
}

function pathIsDirectoryOperand(projectRoot: string, relativePath: string): boolean {
  try {
    return statSync(join(projectRoot, relativePath)).isDirectory();
  } catch {
    return false;
  }
}
