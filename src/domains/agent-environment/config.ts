import type { ConfigDescriptor, Result } from "@/config/types";

export const AGENT_ENVIRONMENT_SECTION = "agentEnvironment";

export const AGENT_RUNTIME = {
  CODEX: "codex",
  CLAUDE_CODE: "claudeCode",
} as const;

export type AgentRuntime = (typeof AGENT_RUNTIME)[keyof typeof AGENT_RUNTIME];

export const AGENT_ENVIRONMENT_CONFIG_FIELDS = {
  INSTRUCTIONS: "instructions",
  RUNTIMES: "runtimes",
  PLUGIN_BOOTSTRAP: "pluginBootstrap",
  FILES: "files",
  PATH: "path",
  TARGET_RUNTIMES: "targetRuntimes",
  ENABLED: "enabled",
  MARKETPLACES: "marketplaces",
  PLUGINS: "plugins",
  SKILLS: "skills",
  RUNTIME: "runtime",
  NAME: "name",
  SOURCE: "source",
  VERSION: "version",
  MARKETPLACE: "marketplace",
} as const;

export interface AgentInstructionFileConfig {
  readonly path: string;
  readonly targetRuntimes: readonly AgentRuntime[];
}

export interface AgentRuntimeConfig {
  readonly enabled: boolean;
}

export interface AgentMarketplaceConfig {
  readonly runtime: AgentRuntime;
  readonly name: string;
  readonly source: string;
}

export interface AgentPluginConfig {
  readonly runtime: AgentRuntime;
  readonly name: string;
  readonly marketplace?: string;
  readonly version?: string;
}

export interface AgentSkillConfig {
  readonly runtime: AgentRuntime;
  readonly name: string;
  readonly source?: string;
  readonly version?: string;
}

export interface AgentEnvironmentConfig {
  readonly instructions: {
    readonly files: readonly AgentInstructionFileConfig[];
  };
  readonly runtimes: { readonly [K in AgentRuntime]: AgentRuntimeConfig };
  readonly pluginBootstrap: {
    readonly marketplaces: readonly AgentMarketplaceConfig[];
    readonly plugins: readonly AgentPluginConfig[];
    readonly skills: readonly AgentSkillConfig[];
  };
}

const AGENT_RUNTIME_SET: ReadonlySet<string> = new Set(Object.values(AGENT_RUNTIME));
const DEFAULT_AGENT_INSTRUCTION_TARGET_RUNTIMES = [
  AGENT_RUNTIME.CODEX,
  AGENT_RUNTIME.CLAUDE_CODE,
] as const satisfies readonly AgentRuntime[];

export const DEFAULT_AGENT_INSTRUCTION_FILE_PATH = "AGENTS.md";

export const DEFAULT_AGENT_ENVIRONMENT_CONFIG: AgentEnvironmentConfig = {
  instructions: {
    files: [
      {
        path: DEFAULT_AGENT_INSTRUCTION_FILE_PATH,
        targetRuntimes: DEFAULT_AGENT_INSTRUCTION_TARGET_RUNTIMES,
      },
    ],
  },
  runtimes: {
    [AGENT_RUNTIME.CODEX]: { enabled: true },
    [AGENT_RUNTIME.CLAUDE_CODE]: { enabled: true },
  },
  pluginBootstrap: {
    marketplaces: [],
    plugins: [],
    skills: [],
  },
};

const AGENT_ENVIRONMENT_ALLOWED_FIELDS = new Set([
  AGENT_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS,
  AGENT_ENVIRONMENT_CONFIG_FIELDS.RUNTIMES,
  AGENT_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP,
]);

const AGENT_ENVIRONMENT_INSTRUCTIONS_ALLOWED_FIELDS = new Set([
  AGENT_ENVIRONMENT_CONFIG_FIELDS.FILES,
]);

const AGENT_ENVIRONMENT_INSTRUCTION_FILE_ALLOWED_FIELDS = new Set([
  AGENT_ENVIRONMENT_CONFIG_FIELDS.PATH,
  AGENT_ENVIRONMENT_CONFIG_FIELDS.TARGET_RUNTIMES,
]);

const AGENT_ENVIRONMENT_RUNTIME_CONFIG_ALLOWED_FIELDS = new Set([
  AGENT_ENVIRONMENT_CONFIG_FIELDS.ENABLED,
]);

const AGENT_ENVIRONMENT_PLUGIN_BOOTSTRAP_ALLOWED_FIELDS = new Set([
  AGENT_ENVIRONMENT_CONFIG_FIELDS.MARKETPLACES,
  AGENT_ENVIRONMENT_CONFIG_FIELDS.PLUGINS,
  AGENT_ENVIRONMENT_CONFIG_FIELDS.SKILLS,
]);

const AGENT_ENVIRONMENT_MARKETPLACE_ALLOWED_FIELDS = new Set([
  AGENT_ENVIRONMENT_CONFIG_FIELDS.RUNTIME,
  AGENT_ENVIRONMENT_CONFIG_FIELDS.NAME,
  AGENT_ENVIRONMENT_CONFIG_FIELDS.SOURCE,
]);

const AGENT_ENVIRONMENT_PLUGIN_ALLOWED_FIELDS = new Set([
  AGENT_ENVIRONMENT_CONFIG_FIELDS.RUNTIME,
  AGENT_ENVIRONMENT_CONFIG_FIELDS.NAME,
  AGENT_ENVIRONMENT_CONFIG_FIELDS.MARKETPLACE,
  AGENT_ENVIRONMENT_CONFIG_FIELDS.VERSION,
]);

const AGENT_ENVIRONMENT_SKILL_ALLOWED_FIELDS = new Set([
  AGENT_ENVIRONMENT_CONFIG_FIELDS.RUNTIME,
  AGENT_ENVIRONMENT_CONFIG_FIELDS.NAME,
  AGENT_ENVIRONMENT_CONFIG_FIELDS.SOURCE,
  AGENT_ENVIRONMENT_CONFIG_FIELDS.VERSION,
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rejectUnknownFields(
  path: string,
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): Result<undefined> {
  const unknownFields = Object.keys(value).filter((field) => !allowed.has(field));
  if (unknownFields.length === 1) {
    return { ok: false, error: `${path}.${unknownFields[0]} is not a recognized config field` };
  }
  if (unknownFields.length > 1) {
    return { ok: false, error: `${path} has unrecognized config fields: ${unknownFields.join(", ")}` };
  }
  return { ok: true, value: undefined };
}

function validateNonEmptyString(path: string, value: unknown): Result<string> {
  if (typeof value !== "string" || value.length === 0) {
    return { ok: false, error: `${path} must be a non-empty string` };
  }
  return { ok: true, value };
}

function validateBoolean(path: string, value: unknown): Result<boolean> {
  if (typeof value !== "boolean") {
    return { ok: false, error: `${path} must be a boolean` };
  }
  return { ok: true, value };
}

function validateRuntime(path: string, value: unknown): Result<AgentRuntime> {
  if (typeof value !== "string" || !isAgentRuntime(value)) {
    return { ok: false, error: `${path} must be a registered agent runtime` };
  }
  return { ok: true, value };
}

function isAgentRuntime(value: string): value is AgentRuntime {
  return AGENT_RUNTIME_SET.has(value);
}

function validateRuntimeArray(path: string, value: unknown): Result<readonly AgentRuntime[]> {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, error: `${path} must be a non-empty array of registered agent runtimes` };
  }

  const runtimes: AgentRuntime[] = [];
  const seen = new Set<AgentRuntime>();
  for (const [index, entry] of value.entries()) {
    const runtime = validateRuntime(`${path}.${index}`, entry);
    if (!runtime.ok) return runtime;
    if (seen.has(runtime.value)) {
      return { ok: false, error: `${path}.${index} repeats registered agent runtime ${runtime.value}` };
    }
    seen.add(runtime.value);
    runtimes.push(runtime.value);
  }
  return { ok: true, value: runtimes };
}

function validateInstructions(raw: unknown): Result<AgentEnvironmentConfig["instructions"]> {
  const sectionPath = `${AGENT_ENVIRONMENT_SECTION}.${AGENT_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS}`;
  if (!isRecord(raw)) {
    return { ok: false, error: `${sectionPath} must be an object` };
  }

  const unknown = rejectUnknownFields(sectionPath, raw, AGENT_ENVIRONMENT_INSTRUCTIONS_ALLOWED_FIELDS);
  if (!unknown.ok) return unknown;

  const filesRaw = raw[AGENT_ENVIRONMENT_CONFIG_FIELDS.FILES];
  if (filesRaw === undefined) return { ok: true, value: DEFAULT_AGENT_ENVIRONMENT_CONFIG.instructions };
  if (!Array.isArray(filesRaw)) {
    return { ok: false, error: `${sectionPath}.${AGENT_ENVIRONMENT_CONFIG_FIELDS.FILES} must be an array` };
  }

  const files: AgentInstructionFileConfig[] = [];
  for (const [index, entry] of filesRaw.entries()) {
    const file = validateInstructionFile(`${sectionPath}.${AGENT_ENVIRONMENT_CONFIG_FIELDS.FILES}.${index}`, entry);
    if (!file.ok) return file;
    files.push(file.value);
  }
  const filePathUniqueness = validateInstructionFilePathUniqueness(
    `${sectionPath}.${AGENT_ENVIRONMENT_CONFIG_FIELDS.FILES}`,
    files,
  );
  if (!filePathUniqueness.ok) return filePathUniqueness;
  return { ok: true, value: { files } };
}

function validateInstructionFile(path: string, raw: unknown): Result<AgentInstructionFileConfig> {
  if (!isRecord(raw)) return { ok: false, error: `${path} must be an object` };
  const unknown = rejectUnknownFields(
    path,
    raw,
    AGENT_ENVIRONMENT_INSTRUCTION_FILE_ALLOWED_FIELDS,
  );
  if (!unknown.ok) return unknown;

  const filePath = validateNonEmptyString(
    `${path}.${AGENT_ENVIRONMENT_CONFIG_FIELDS.PATH}`,
    raw[AGENT_ENVIRONMENT_CONFIG_FIELDS.PATH],
  );
  if (!filePath.ok) return filePath;

  const targetRuntimes = validateRuntimeArray(
    `${path}.${AGENT_ENVIRONMENT_CONFIG_FIELDS.TARGET_RUNTIMES}`,
    raw[AGENT_ENVIRONMENT_CONFIG_FIELDS.TARGET_RUNTIMES],
  );
  if (!targetRuntimes.ok) return targetRuntimes;

  return { ok: true, value: { path: filePath.value, targetRuntimes: targetRuntimes.value } };
}

function validateRuntimes(raw: unknown): Result<AgentEnvironmentConfig["runtimes"]> {
  const sectionPath = `${AGENT_ENVIRONMENT_SECTION}.${AGENT_ENVIRONMENT_CONFIG_FIELDS.RUNTIMES}`;
  if (!isRecord(raw)) {
    return { ok: false, error: `${sectionPath} must be an object` };
  }

  const runtimes: Record<AgentRuntime, AgentRuntimeConfig> = { ...DEFAULT_AGENT_ENVIRONMENT_CONFIG.runtimes };
  for (const [runtimeName, runtimeRaw] of Object.entries(raw)) {
    // Runtime ids are the field names, so unknown-field rejection is the runtime-id validation below.
    const runtime = validateRuntime(`${sectionPath}.${runtimeName}`, runtimeName);
    if (!runtime.ok) return runtime;
    const config = validateRuntimeConfig(`${sectionPath}.${runtimeName}`, runtimeRaw, runtimes[runtime.value]);
    if (!config.ok) return config;
    runtimes[runtime.value] = config.value;
  }

  return { ok: true, value: runtimes };
}

function validateRuntimeConfig(
  path: string,
  raw: unknown,
  defaults: AgentRuntimeConfig,
): Result<AgentRuntimeConfig> {
  if (!isRecord(raw)) return { ok: false, error: `${path} must be an object` };
  const unknown = rejectUnknownFields(path, raw, AGENT_ENVIRONMENT_RUNTIME_CONFIG_ALLOWED_FIELDS);
  if (!unknown.ok) return unknown;

  const enabledRaw = raw[AGENT_ENVIRONMENT_CONFIG_FIELDS.ENABLED];
  if (enabledRaw === undefined) return { ok: true, value: defaults };
  const enabled = validateBoolean(`${path}.${AGENT_ENVIRONMENT_CONFIG_FIELDS.ENABLED}`, enabledRaw);
  if (!enabled.ok) return enabled;
  return { ok: true, value: { ...defaults, enabled: enabled.value } };
}

function validatePluginBootstrap(raw: unknown): Result<AgentEnvironmentConfig["pluginBootstrap"]> {
  const sectionPath = `${AGENT_ENVIRONMENT_SECTION}.${AGENT_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP}`;
  if (!isRecord(raw)) {
    return { ok: false, error: `${sectionPath} must be an object` };
  }

  const unknown = rejectUnknownFields(
    sectionPath,
    raw,
    AGENT_ENVIRONMENT_PLUGIN_BOOTSTRAP_ALLOWED_FIELDS,
  );
  if (!unknown.ok) return unknown;

  const marketplaces = validateEntryArray(
    `${sectionPath}.${AGENT_ENVIRONMENT_CONFIG_FIELDS.MARKETPLACES}`,
    raw[AGENT_ENVIRONMENT_CONFIG_FIELDS.MARKETPLACES],
    validateMarketplace,
    DEFAULT_AGENT_ENVIRONMENT_CONFIG.pluginBootstrap.marketplaces,
  );
  if (!marketplaces.ok) return marketplaces;

  const marketplaceUniqueness = validateNamedRuntimeEntryUniqueness(
    `${sectionPath}.${AGENT_ENVIRONMENT_CONFIG_FIELDS.MARKETPLACES}`,
    marketplaces.value,
  );
  if (!marketplaceUniqueness.ok) return marketplaceUniqueness;

  const plugins = validateEntryArray(
    `${sectionPath}.${AGENT_ENVIRONMENT_CONFIG_FIELDS.PLUGINS}`,
    raw[AGENT_ENVIRONMENT_CONFIG_FIELDS.PLUGINS],
    validatePlugin,
    DEFAULT_AGENT_ENVIRONMENT_CONFIG.pluginBootstrap.plugins,
  );
  if (!plugins.ok) return plugins;

  const pluginUniqueness = validateNamedRuntimeEntryUniqueness(
    `${sectionPath}.${AGENT_ENVIRONMENT_CONFIG_FIELDS.PLUGINS}`,
    plugins.value,
  );
  if (!pluginUniqueness.ok) return pluginUniqueness;

  const pluginMarketplaceReferences = validatePluginMarketplaceReferences(
    sectionPath,
    marketplaces.value,
    plugins.value,
  );
  if (!pluginMarketplaceReferences.ok) return pluginMarketplaceReferences;

  const skills = validateEntryArray(
    `${sectionPath}.${AGENT_ENVIRONMENT_CONFIG_FIELDS.SKILLS}`,
    raw[AGENT_ENVIRONMENT_CONFIG_FIELDS.SKILLS],
    validateSkill,
    DEFAULT_AGENT_ENVIRONMENT_CONFIG.pluginBootstrap.skills,
  );
  if (!skills.ok) return skills;

  const skillUniqueness = validateNamedRuntimeEntryUniqueness(
    `${sectionPath}.${AGENT_ENVIRONMENT_CONFIG_FIELDS.SKILLS}`,
    skills.value,
  );
  if (!skillUniqueness.ok) return skillUniqueness;

  return {
    ok: true,
    value: {
      marketplaces: marketplaces.value,
      plugins: plugins.value,
      skills: skills.value,
    },
  };
}

function validateEntryArray<T>(
  path: string,
  raw: unknown,
  validateEntry: (path: string, raw: unknown) => Result<T>,
  defaults: readonly T[],
): Result<readonly T[]> {
  if (raw === undefined) return { ok: true, value: defaults };
  if (!Array.isArray(raw)) return { ok: false, error: `${path} must be an array` };

  const entries: T[] = [];
  for (const [index, entry] of raw.entries()) {
    const result = validateEntry(`${path}.${index}`, entry);
    if (!result.ok) return result;
    entries.push(result.value);
  }
  return { ok: true, value: entries };
}

function validateInstructionFilePathUniqueness(
  path: string,
  files: readonly AgentInstructionFileConfig[],
): Result<undefined> {
  const paths = new Set<string>();
  for (const [index, file] of files.entries()) {
    if (paths.has(file.path)) {
      return {
        ok: false,
        error: `${path}.${index}.${AGENT_ENVIRONMENT_CONFIG_FIELDS.PATH} ${
          JSON.stringify(file.path)
        } is already used by another instruction file entry`,
      };
    }
    paths.add(file.path);
  }
  return { ok: true, value: undefined };
}

function validateNamedRuntimeEntryUniqueness(
  path: string,
  entries: readonly { readonly runtime: AgentRuntime; readonly name: string }[],
): Result<undefined> {
  const namesByRuntime = new Map<AgentRuntime, Set<string>>();
  for (const [index, entry] of entries.entries()) {
    const runtimeNames = namesByRuntime.get(entry.runtime) ?? new Set<string>();
    if (runtimeNames.has(entry.name)) {
      return {
        ok: false,
        error: `${path}.${index}.${AGENT_ENVIRONMENT_CONFIG_FIELDS.NAME} ${
          JSON.stringify(entry.name)
        } is already used by another ${entry.runtime} entry`,
      };
    }
    runtimeNames.add(entry.name);
    namesByRuntime.set(entry.runtime, runtimeNames);
  }
  return { ok: true, value: undefined };
}

function validatePluginMarketplaceReferences(
  path: string,
  marketplaces: readonly AgentMarketplaceConfig[],
  plugins: readonly AgentPluginConfig[],
): Result<undefined> {
  const marketplacesByRuntime = new Map<AgentRuntime, Set<string>>();
  for (const marketplace of marketplaces) {
    const runtimeMarketplaces = marketplacesByRuntime.get(marketplace.runtime) ?? new Set<string>();
    runtimeMarketplaces.add(marketplace.name);
    marketplacesByRuntime.set(marketplace.runtime, runtimeMarketplaces);
  }

  for (const [index, plugin] of plugins.entries()) {
    if (plugin.marketplace === undefined) continue;
    const runtimeMarketplaces = marketplacesByRuntime.get(plugin.runtime);
    if (!runtimeMarketplaces?.has(plugin.marketplace)) {
      return {
        ok: false,
        error:
          `${path}.${AGENT_ENVIRONMENT_CONFIG_FIELDS.PLUGINS}.${index}.${AGENT_ENVIRONMENT_CONFIG_FIELDS.MARKETPLACE} must reference a configured marketplace for the same runtime`,
      };
    }
  }

  return { ok: true, value: undefined };
}

function validateMarketplace(path: string, raw: unknown): Result<AgentMarketplaceConfig> {
  if (!isRecord(raw)) return { ok: false, error: `${path} must be an object` };
  const unknown = rejectUnknownFields(
    path,
    raw,
    AGENT_ENVIRONMENT_MARKETPLACE_ALLOWED_FIELDS,
  );
  if (!unknown.ok) return unknown;

  const base = validateNamedRuntimeEntry(path, raw);
  if (!base.ok) return base;
  const source = validateNonEmptyString(
    `${path}.${AGENT_ENVIRONMENT_CONFIG_FIELDS.SOURCE}`,
    raw[AGENT_ENVIRONMENT_CONFIG_FIELDS.SOURCE],
  );
  if (!source.ok) return source;
  return { ok: true, value: { ...base.value, source: source.value } };
}

function validatePlugin(path: string, raw: unknown): Result<AgentPluginConfig> {
  if (!isRecord(raw)) return { ok: false, error: `${path} must be an object` };
  const unknown = rejectUnknownFields(
    path,
    raw,
    AGENT_ENVIRONMENT_PLUGIN_ALLOWED_FIELDS,
  );
  if (!unknown.ok) return unknown;

  const base = validateNamedRuntimeEntry(path, raw);
  if (!base.ok) return base;
  const marketplace = validateOptionalString(
    `${path}.${AGENT_ENVIRONMENT_CONFIG_FIELDS.MARKETPLACE}`,
    raw[AGENT_ENVIRONMENT_CONFIG_FIELDS.MARKETPLACE],
  );
  if (!marketplace.ok) return marketplace;
  const version = validateOptionalString(
    `${path}.${AGENT_ENVIRONMENT_CONFIG_FIELDS.VERSION}`,
    raw[AGENT_ENVIRONMENT_CONFIG_FIELDS.VERSION],
  );
  if (!version.ok) return version;
  return {
    ok: true,
    value: {
      ...base.value,
      ...(marketplace.value === undefined ? {} : { marketplace: marketplace.value }),
      ...(version.value === undefined ? {} : { version: version.value }),
    },
  };
}

function validateSkill(path: string, raw: unknown): Result<AgentSkillConfig> {
  if (!isRecord(raw)) return { ok: false, error: `${path} must be an object` };
  const unknown = rejectUnknownFields(
    path,
    raw,
    AGENT_ENVIRONMENT_SKILL_ALLOWED_FIELDS,
  );
  if (!unknown.ok) return unknown;

  const base = validateNamedRuntimeEntry(path, raw);
  if (!base.ok) return base;
  const source = validateOptionalString(
    `${path}.${AGENT_ENVIRONMENT_CONFIG_FIELDS.SOURCE}`,
    raw[AGENT_ENVIRONMENT_CONFIG_FIELDS.SOURCE],
  );
  if (!source.ok) return source;
  const version = validateOptionalString(
    `${path}.${AGENT_ENVIRONMENT_CONFIG_FIELDS.VERSION}`,
    raw[AGENT_ENVIRONMENT_CONFIG_FIELDS.VERSION],
  );
  if (!version.ok) return version;
  return {
    ok: true,
    value: {
      ...base.value,
      ...(source.value === undefined ? {} : { source: source.value }),
      ...(version.value === undefined ? {} : { version: version.value }),
    },
  };
}

function validateNamedRuntimeEntry(
  path: string,
  raw: Record<string, unknown>,
): Result<{ readonly runtime: AgentRuntime; readonly name: string }> {
  const runtime = validateRuntime(
    `${path}.${AGENT_ENVIRONMENT_CONFIG_FIELDS.RUNTIME}`,
    raw[AGENT_ENVIRONMENT_CONFIG_FIELDS.RUNTIME],
  );
  if (!runtime.ok) return runtime;
  const name = validateNonEmptyString(
    `${path}.${AGENT_ENVIRONMENT_CONFIG_FIELDS.NAME}`,
    raw[AGENT_ENVIRONMENT_CONFIG_FIELDS.NAME],
  );
  if (!name.ok) return name;
  return { ok: true, value: { runtime: runtime.value, name: name.value } };
}

function validateOptionalString(path: string, value: unknown): Result<string | undefined> {
  if (value === undefined) return { ok: true, value: undefined };
  return validateNonEmptyString(path, value);
}

function validate(value: unknown): Result<AgentEnvironmentConfig> {
  if (!isRecord(value)) {
    return { ok: false, error: `${AGENT_ENVIRONMENT_SECTION} section must be an object` };
  }

  const unknown = rejectUnknownFields(
    AGENT_ENVIRONMENT_SECTION,
    value,
    AGENT_ENVIRONMENT_ALLOWED_FIELDS,
  );
  if (!unknown.ok) return unknown;

  const instructionsRaw = value[AGENT_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS];
  const instructions = instructionsRaw === undefined
    ? { ok: true as const, value: DEFAULT_AGENT_ENVIRONMENT_CONFIG.instructions }
    : validateInstructions(instructionsRaw);
  if (!instructions.ok) return instructions;

  const runtimesRaw = value[AGENT_ENVIRONMENT_CONFIG_FIELDS.RUNTIMES];
  const runtimes = runtimesRaw === undefined
    ? { ok: true as const, value: DEFAULT_AGENT_ENVIRONMENT_CONFIG.runtimes }
    : validateRuntimes(runtimesRaw);
  if (!runtimes.ok) return runtimes;

  const pluginBootstrapRaw = value[AGENT_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP];
  const pluginBootstrap = pluginBootstrapRaw === undefined
    ? { ok: true as const, value: DEFAULT_AGENT_ENVIRONMENT_CONFIG.pluginBootstrap }
    : validatePluginBootstrap(pluginBootstrapRaw);
  if (!pluginBootstrap.ok) return pluginBootstrap;

  return {
    ok: true,
    value: {
      instructions: instructions.value,
      runtimes: runtimes.value,
      pluginBootstrap: pluginBootstrap.value,
    },
  };
}

export const agentEnvironmentConfigDescriptor: ConfigDescriptor<AgentEnvironmentConfig> = {
  section: AGENT_ENVIRONMENT_SECTION,
  defaults: DEFAULT_AGENT_ENVIRONMENT_CONFIG,
  validate,
};
