import type { ConfigDescriptor, Result } from "@/config/types";
import { SPEC_TREE_CONFIG } from "@/lib/spec-tree/config";

import { TOOL_DEFAULT_FLAGS } from "./adapters";
import { IGNORE_SOURCE_FILENAME_DEFAULT } from "./ignore-source";
import { ARTIFACT_DIRECTORIES_DEFAULT } from "./predicates/artifact-directory";
import { HIDDEN_PREFIX_DEFAULT } from "./predicates/hidden-prefix";
import type { ScopeResolverConfig, ToolAdaptersConfig } from "./types";

export const FILE_INCLUSION_SECTION = "fileInclusion";

export type FileInclusionConfig = {
  readonly scope: ScopeResolverConfig;
  readonly tools: ToolAdaptersConfig;
};

export const DEFAULT_SCOPE_CONFIG: ScopeResolverConfig = {
  artifactDirectories: ARTIFACT_DIRECTORIES_DEFAULT,
  hiddenPrefix: HIDDEN_PREFIX_DEFAULT,
  ignoreSourceFilename: IGNORE_SOURCE_FILENAME_DEFAULT,
  specTreeRootSegment: SPEC_TREE_CONFIG.ROOT_DIRECTORY,
};

export const DEFAULT_TOOLS_CONFIG: ToolAdaptersConfig = {
  tools: Object.fromEntries(
    Object.entries(TOOL_DEFAULT_FLAGS).map(([name, flag]) => [name, { ignoreFlag: flag }]),
  ),
};

const defaults: FileInclusionConfig = {
  scope: DEFAULT_SCOPE_CONFIG,
  tools: DEFAULT_TOOLS_CONFIG,
};

function validate(value: unknown): Result<FileInclusionConfig> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, error: `${FILE_INCLUSION_SECTION} section must be an object` };
  }
  return { ok: true, value: defaults };
}

export const fileInclusionConfigDescriptor: ConfigDescriptor<FileInclusionConfig> = {
  section: FILE_INCLUSION_SECTION,
  defaults,
  validate,
};
