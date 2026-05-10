import type { ConfigDescriptor, Result } from "@/config/types";
import { SPEC_TREE_CONFIG } from "@/lib/spec-tree/config";

import { TOOL_DEFAULT_FLAGS } from "./adapters";
import { IGNORE_SOURCE_FILENAME_DEFAULT } from "./ignore-source";
import { ARTIFACT_DIRECTORIES_DEFAULT } from "./predicates/artifact-directory";
import { HIDDEN_PREFIX_DEFAULT } from "./predicates/hidden-prefix";
import type { ScopeResolverConfig, ToolAdaptersConfig } from "./types";

export const FILE_INCLUSION_SECTION = "fileInclusion";

export const FILE_INCLUSION_CONFIG_FIELDS = {
  SCOPE: "scope",
  TOOLS: "tools",
  ARTIFACT_DIRECTORIES: "artifactDirectories",
  HIDDEN_PREFIX: "hiddenPrefix",
  IGNORE_SOURCE_FILENAME: "ignoreSourceFilename",
  SPEC_TREE_ROOT_SEGMENT: "specTreeRootSegment",
  IGNORE_FLAG: "ignoreFlag",
} as const;

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

export const DEFAULT_TOOLS_CONFIG: ToolAdaptersConfig = Object.fromEntries(
  Object.entries(TOOL_DEFAULT_FLAGS).map(([name, flag]) => [name, { ignoreFlag: flag }]),
);

const defaults: FileInclusionConfig = {
  scope: DEFAULT_SCOPE_CONFIG,
  tools: DEFAULT_TOOLS_CONFIG,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateStringField(
  section: string,
  field: string,
  value: unknown,
): Result<string> {
  if (typeof value !== "string" || value.length === 0) {
    return { ok: false, error: `${section}.${field} must be a non-empty string` };
  }
  return { ok: true, value };
}

function validateStringArrayField(
  section: string,
  field: string,
  value: unknown,
): Result<readonly string[]> {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.length === 0)) {
    return { ok: false, error: `${section}.${field} must be an array of non-empty strings` };
  }
  return { ok: true, value };
}

function rejectUnknownFields(
  section: string,
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): Result<undefined> {
  const unknownField = Object.keys(value).find((field) => !allowed.has(field));
  if (unknownField !== undefined) {
    return { ok: false, error: `${section}.${unknownField} is not a recognized config field` };
  }
  return { ok: true, value: undefined };
}

function validateScope(raw: unknown): Result<ScopeResolverConfig> {
  if (!isRecord(raw)) {
    return {
      ok: false,
      error: `${FILE_INCLUSION_SECTION}.${FILE_INCLUSION_CONFIG_FIELDS.SCOPE} must be an object`,
    };
  }

  const allowed = new Set<string>([
    FILE_INCLUSION_CONFIG_FIELDS.ARTIFACT_DIRECTORIES,
    FILE_INCLUSION_CONFIG_FIELDS.HIDDEN_PREFIX,
    FILE_INCLUSION_CONFIG_FIELDS.IGNORE_SOURCE_FILENAME,
    FILE_INCLUSION_CONFIG_FIELDS.SPEC_TREE_ROOT_SEGMENT,
  ]);
  const scopeUnknownFieldResult = rejectUnknownFields(
    `${FILE_INCLUSION_SECTION}.${FILE_INCLUSION_CONFIG_FIELDS.SCOPE}`,
    raw,
    allowed,
  );
  if (!scopeUnknownFieldResult.ok) return scopeUnknownFieldResult;

  const artifactDirectoriesRaw = raw[FILE_INCLUSION_CONFIG_FIELDS.ARTIFACT_DIRECTORIES];
  const artifactDirectories = artifactDirectoriesRaw === undefined
    ? { ok: true as const, value: DEFAULT_SCOPE_CONFIG.artifactDirectories }
    : validateStringArrayField(
      `${FILE_INCLUSION_SECTION}.${FILE_INCLUSION_CONFIG_FIELDS.SCOPE}`,
      FILE_INCLUSION_CONFIG_FIELDS.ARTIFACT_DIRECTORIES,
      artifactDirectoriesRaw,
    );
  if (!artifactDirectories.ok) return artifactDirectories;

  const hiddenPrefixRaw = raw[FILE_INCLUSION_CONFIG_FIELDS.HIDDEN_PREFIX];
  const hiddenPrefix = hiddenPrefixRaw === undefined
    ? { ok: true as const, value: DEFAULT_SCOPE_CONFIG.hiddenPrefix }
    : validateStringField(
      `${FILE_INCLUSION_SECTION}.${FILE_INCLUSION_CONFIG_FIELDS.SCOPE}`,
      FILE_INCLUSION_CONFIG_FIELDS.HIDDEN_PREFIX,
      hiddenPrefixRaw,
    );
  if (!hiddenPrefix.ok) return hiddenPrefix;

  const ignoreSourceFilenameRaw = raw[FILE_INCLUSION_CONFIG_FIELDS.IGNORE_SOURCE_FILENAME];
  const ignoreSourceFilename = ignoreSourceFilenameRaw === undefined
    ? { ok: true as const, value: DEFAULT_SCOPE_CONFIG.ignoreSourceFilename }
    : validateStringField(
      `${FILE_INCLUSION_SECTION}.${FILE_INCLUSION_CONFIG_FIELDS.SCOPE}`,
      FILE_INCLUSION_CONFIG_FIELDS.IGNORE_SOURCE_FILENAME,
      ignoreSourceFilenameRaw,
    );
  if (!ignoreSourceFilename.ok) return ignoreSourceFilename;

  const specTreeRootSegmentRaw = raw[FILE_INCLUSION_CONFIG_FIELDS.SPEC_TREE_ROOT_SEGMENT];
  const specTreeRootSegment = specTreeRootSegmentRaw === undefined
    ? { ok: true as const, value: DEFAULT_SCOPE_CONFIG.specTreeRootSegment }
    : validateStringField(
      `${FILE_INCLUSION_SECTION}.${FILE_INCLUSION_CONFIG_FIELDS.SCOPE}`,
      FILE_INCLUSION_CONFIG_FIELDS.SPEC_TREE_ROOT_SEGMENT,
      specTreeRootSegmentRaw,
    );
  if (!specTreeRootSegment.ok) return specTreeRootSegment;

  return {
    ok: true,
    value: {
      artifactDirectories: artifactDirectories.value,
      hiddenPrefix: hiddenPrefix.value,
      ignoreSourceFilename: ignoreSourceFilename.value,
      specTreeRootSegment: specTreeRootSegment.value,
    },
  };
}

function validateTools(raw: unknown): Result<ToolAdaptersConfig> {
  if (!isRecord(raw)) {
    return {
      ok: false,
      error: `${FILE_INCLUSION_SECTION}.${FILE_INCLUSION_CONFIG_FIELDS.TOOLS} must be an object`,
    };
  }

  const tools: Record<string, { readonly ignoreFlag: string }> = { ...DEFAULT_TOOLS_CONFIG };
  for (const [toolName, adapterRaw] of Object.entries(raw)) {
    const defaultToolConfig = DEFAULT_TOOLS_CONFIG[toolName];
    if (defaultToolConfig === undefined) {
      return {
        ok: false,
        error: `${FILE_INCLUSION_SECTION}.${FILE_INCLUSION_CONFIG_FIELDS.TOOLS}.${toolName} is not a recognized tool`,
      };
    }
    if (!isRecord(adapterRaw)) {
      return {
        ok: false,
        error: `${FILE_INCLUSION_SECTION}.${FILE_INCLUSION_CONFIG_FIELDS.TOOLS}.${toolName} must be an object`,
      };
    }
    const toolPath = `${FILE_INCLUSION_SECTION}.${FILE_INCLUSION_CONFIG_FIELDS.TOOLS}.${toolName}`;
    const adapterUnknownFieldResult = rejectUnknownFields(
      toolPath,
      adapterRaw,
      new Set<string>([FILE_INCLUSION_CONFIG_FIELDS.IGNORE_FLAG]),
    );
    if (!adapterUnknownFieldResult.ok) return adapterUnknownFieldResult;
    const ignoreFlagRaw = adapterRaw[FILE_INCLUSION_CONFIG_FIELDS.IGNORE_FLAG];
    const ignoreFlag = ignoreFlagRaw === undefined
      ? { ok: true as const, value: defaultToolConfig.ignoreFlag }
      : validateStringField(toolPath, FILE_INCLUSION_CONFIG_FIELDS.IGNORE_FLAG, ignoreFlagRaw);
    if (!ignoreFlag.ok) return ignoreFlag;
    tools[toolName] = { ignoreFlag: ignoreFlag.value };
  }

  return { ok: true, value: tools };
}

function validate(value: unknown): Result<FileInclusionConfig> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, error: `${FILE_INCLUSION_SECTION} section must be an object` };
  }
  const candidate = value as Record<string, unknown>;
  const sectionUnknownFieldResult = rejectUnknownFields(
    FILE_INCLUSION_SECTION,
    candidate,
    new Set<string>([FILE_INCLUSION_CONFIG_FIELDS.SCOPE, FILE_INCLUSION_CONFIG_FIELDS.TOOLS]),
  );
  if (!sectionUnknownFieldResult.ok) return sectionUnknownFieldResult;

  const scopeRaw = candidate[FILE_INCLUSION_CONFIG_FIELDS.SCOPE] ?? {};
  const scope = validateScope(scopeRaw);
  if (!scope.ok) return scope;

  const toolsRaw = candidate[FILE_INCLUSION_CONFIG_FIELDS.TOOLS] ?? {};
  const tools = validateTools(toolsRaw);
  if (!tools.ok) return tools;

  return {
    ok: true,
    value: {
      [FILE_INCLUSION_CONFIG_FIELDS.SCOPE]: scope.value,
      [FILE_INCLUSION_CONFIG_FIELDS.TOOLS]: tools.value,
    },
  };
}

export const fileInclusionConfigDescriptor: ConfigDescriptor<FileInclusionConfig> = {
  section: FILE_INCLUSION_SECTION,
  defaults,
  validate,
};
