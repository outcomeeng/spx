import type { ConfigDescriptor, Result } from "@/config/types";

export const HARNESS_ENVIRONMENT_SECTION = "harnessEnvironment";

export const AGENT = {
  CODEX: "codex",
  CLAUDE_CODE: "claudeCode",
} as const;

export type Agent = (typeof AGENT)[keyof typeof AGENT];

export const HARNESS_ENVIRONMENT_CONFIG_FIELDS = {
  INSTRUCTIONS: "instructions",
  AGENTS: "agents",
  PLUGIN_BOOTSTRAP: "pluginBootstrap",
  HOOKS: "hooks",
  SESSION_START: "sessionStart",
  COMPACT_STDOUT: "compactStdout",
  FILES: "files",
  PATH: "path",
  TARGET_AGENTS: "targetAgents",
  ENABLED: "enabled",
  MARKETPLACES: "marketplaces",
  PLUGINS: "plugins",
  SKILLS: "skills",
  AGENT: "agent",
  NAME: "name",
  SOURCE: "source",
  VERSION: "version",
  MARKETPLACE: "marketplace",
} as const;

export interface AgentInstructionFileConfig {
  readonly path: string;
  readonly targetAgents: readonly Agent[];
}

export interface AgentSessionStartHookConfig {
  readonly compactStdout: boolean;
}

export interface AgentHooksConfig {
  readonly sessionStart: AgentSessionStartHookConfig;
}

export interface AgentConfig {
  readonly enabled: boolean;
  readonly hooks: AgentHooksConfig;
}

export interface AgentMarketplaceConfig {
  readonly agent: Agent;
  readonly name: string;
  readonly source: string;
}

export interface AgentPluginConfig {
  readonly agent: Agent;
  readonly name: string;
  readonly marketplace?: string;
  readonly version?: string;
}

export interface AgentSkillConfig {
  readonly agent: Agent;
  readonly name: string;
  readonly source?: string;
  readonly version?: string;
}

export interface HarnessEnvironmentConfig {
  readonly instructions: {
    readonly files: readonly AgentInstructionFileConfig[];
  };
  readonly agents: { readonly [K in Agent]: AgentConfig };
  readonly pluginBootstrap: {
    readonly marketplaces: readonly AgentMarketplaceConfig[];
    readonly plugins: readonly AgentPluginConfig[];
    readonly skills: readonly AgentSkillConfig[];
  };
}

const AGENT_SET: ReadonlySet<string> = new Set(Object.values(AGENT));
const DEFAULT_AGENT_INSTRUCTION_TARGET_AGENTS = [
  AGENT.CODEX,
  AGENT.CLAUDE_CODE,
] as const satisfies readonly Agent[];

export const DEFAULT_AGENT_INSTRUCTION_FILE_PATH = "AGENTS.md";

export const DEFAULT_HARNESS_ENVIRONMENT_CONFIG: HarnessEnvironmentConfig = {
  instructions: {
    files: [
      {
        path: DEFAULT_AGENT_INSTRUCTION_FILE_PATH,
        targetAgents: DEFAULT_AGENT_INSTRUCTION_TARGET_AGENTS,
      },
    ],
  },
  agents: {
    [AGENT.CODEX]: {
      enabled: true,
      hooks: {
        sessionStart: {
          compactStdout: false,
        },
      },
    },
    [AGENT.CLAUDE_CODE]: {
      enabled: true,
      hooks: {
        sessionStart: {
          compactStdout: true,
        },
      },
    },
  },
  pluginBootstrap: {
    marketplaces: [],
    plugins: [],
    skills: [],
  },
};

const HARNESS_ENVIRONMENT_ALLOWED_FIELDS = new Set([
  HARNESS_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS,
  HARNESS_ENVIRONMENT_CONFIG_FIELDS.AGENTS,
  HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP,
]);

const HARNESS_ENVIRONMENT_INSTRUCTIONS_ALLOWED_FIELDS = new Set([
  HARNESS_ENVIRONMENT_CONFIG_FIELDS.FILES,
]);

const HARNESS_ENVIRONMENT_INSTRUCTION_FILE_ALLOWED_FIELDS = new Set([
  HARNESS_ENVIRONMENT_CONFIG_FIELDS.PATH,
  HARNESS_ENVIRONMENT_CONFIG_FIELDS.TARGET_AGENTS,
]);

const HARNESS_ENVIRONMENT_AGENT_CONFIG_ALLOWED_FIELDS = new Set([
  HARNESS_ENVIRONMENT_CONFIG_FIELDS.ENABLED,
  HARNESS_ENVIRONMENT_CONFIG_FIELDS.HOOKS,
]);

const HARNESS_ENVIRONMENT_AGENT_HOOKS_ALLOWED_FIELDS = new Set([
  HARNESS_ENVIRONMENT_CONFIG_FIELDS.SESSION_START,
]);

const HARNESS_ENVIRONMENT_SESSION_START_HOOKS_ALLOWED_FIELDS = new Set([
  HARNESS_ENVIRONMENT_CONFIG_FIELDS.COMPACT_STDOUT,
]);

const HARNESS_ENVIRONMENT_PLUGIN_BOOTSTRAP_ALLOWED_FIELDS = new Set([
  HARNESS_ENVIRONMENT_CONFIG_FIELDS.MARKETPLACES,
  HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGINS,
  HARNESS_ENVIRONMENT_CONFIG_FIELDS.SKILLS,
]);

const HARNESS_ENVIRONMENT_MARKETPLACE_ALLOWED_FIELDS = new Set([
  HARNESS_ENVIRONMENT_CONFIG_FIELDS.AGENT,
  HARNESS_ENVIRONMENT_CONFIG_FIELDS.NAME,
  HARNESS_ENVIRONMENT_CONFIG_FIELDS.SOURCE,
]);

const HARNESS_ENVIRONMENT_PLUGIN_ALLOWED_FIELDS = new Set([
  HARNESS_ENVIRONMENT_CONFIG_FIELDS.AGENT,
  HARNESS_ENVIRONMENT_CONFIG_FIELDS.NAME,
  HARNESS_ENVIRONMENT_CONFIG_FIELDS.MARKETPLACE,
  HARNESS_ENVIRONMENT_CONFIG_FIELDS.VERSION,
]);

const HARNESS_ENVIRONMENT_SKILL_ALLOWED_FIELDS = new Set([
  HARNESS_ENVIRONMENT_CONFIG_FIELDS.AGENT,
  HARNESS_ENVIRONMENT_CONFIG_FIELDS.NAME,
  HARNESS_ENVIRONMENT_CONFIG_FIELDS.SOURCE,
  HARNESS_ENVIRONMENT_CONFIG_FIELDS.VERSION,
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unknownConfigFieldError(path: string, field: string): string {
  return `${path}.${field} is not a recognized config field`;
}

function unknownConfigFieldsErrorPrefix(path: string): string {
  return `${path} has unrecognized config fields: `;
}

function unknownConfigFieldsError(path: string, fields: readonly string[]): string {
  return `${unknownConfigFieldsErrorPrefix(path)}${fields.join(", ")}`;
}

export function isHarnessEnvironmentUnknownConfigFieldError(error: string, field: string): boolean {
  const descriptorPrefix = `${HARNESS_ENVIRONMENT_SECTION}: `;
  const normalized = error.startsWith(descriptorPrefix) ? error.slice(descriptorPrefix.length) : error;
  if (normalized === unknownConfigFieldError(HARNESS_ENVIRONMENT_SECTION, field)) {
    return true;
  }
  const fieldsPrefix = unknownConfigFieldsErrorPrefix(HARNESS_ENVIRONMENT_SECTION);
  if (!normalized.startsWith(fieldsPrefix)) return false;
  return normalized
    .slice(fieldsPrefix.length)
    .split(",")
    .map((candidate) => candidate.trim())
    .includes(field);
}

function rejectUnknownFields(
  path: string,
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): Result<undefined> {
  const unknownFields = Object.keys(value).filter((field) => !allowed.has(field));
  if (unknownFields.length === 1) {
    const [unknownField] = unknownFields;
    return { ok: false, error: unknownConfigFieldError(path, unknownField) };
  }
  if (unknownFields.length > 1) {
    return { ok: false, error: unknownConfigFieldsError(path, unknownFields) };
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

function validateAgent(path: string, value: unknown): Result<Agent> {
  if (typeof value !== "string" || !isAgent(value)) {
    return { ok: false, error: `${path} must be a registered agent` };
  }
  return { ok: true, value };
}

function isAgent(value: string): value is Agent {
  return AGENT_SET.has(value);
}

function validateAgentArray(path: string, value: unknown): Result<readonly Agent[]> {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, error: `${path} must be a non-empty array of registered agents` };
  }

  const agents: Agent[] = [];
  const seen = new Set<Agent>();
  for (const [index, entry] of value.entries()) {
    const agent = validateAgent(`${path}.${index}`, entry);
    if (!agent.ok) return agent;
    if (seen.has(agent.value)) {
      return { ok: false, error: `${path}.${index} repeats registered agent ${agent.value}` };
    }
    seen.add(agent.value);
    agents.push(agent.value);
  }
  return { ok: true, value: agents };
}

function validateInstructions(raw: unknown): Result<HarnessEnvironmentConfig["instructions"]> {
  const sectionPath = `${HARNESS_ENVIRONMENT_SECTION}.${HARNESS_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS}`;
  if (!isRecord(raw)) {
    return { ok: false, error: `${sectionPath} must be an object` };
  }

  const unknown = rejectUnknownFields(sectionPath, raw, HARNESS_ENVIRONMENT_INSTRUCTIONS_ALLOWED_FIELDS);
  if (!unknown.ok) return unknown;

  const filesRaw = raw[HARNESS_ENVIRONMENT_CONFIG_FIELDS.FILES];
  if (filesRaw === undefined) return { ok: true, value: DEFAULT_HARNESS_ENVIRONMENT_CONFIG.instructions };
  if (!Array.isArray(filesRaw)) {
    return { ok: false, error: `${sectionPath}.${HARNESS_ENVIRONMENT_CONFIG_FIELDS.FILES} must be an array` };
  }

  const files: AgentInstructionFileConfig[] = [];
  for (const [index, entry] of filesRaw.entries()) {
    const file = validateInstructionFile(`${sectionPath}.${HARNESS_ENVIRONMENT_CONFIG_FIELDS.FILES}.${index}`, entry);
    if (!file.ok) return file;
    files.push(file.value);
  }
  const filePathUniqueness = validateInstructionFilePathUniqueness(
    `${sectionPath}.${HARNESS_ENVIRONMENT_CONFIG_FIELDS.FILES}`,
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
    HARNESS_ENVIRONMENT_INSTRUCTION_FILE_ALLOWED_FIELDS,
  );
  if (!unknown.ok) return unknown;

  const filePath = validateNonEmptyString(
    `${path}.${HARNESS_ENVIRONMENT_CONFIG_FIELDS.PATH}`,
    raw[HARNESS_ENVIRONMENT_CONFIG_FIELDS.PATH],
  );
  if (!filePath.ok) return filePath;

  const targetAgents = validateAgentArray(
    `${path}.${HARNESS_ENVIRONMENT_CONFIG_FIELDS.TARGET_AGENTS}`,
    raw[HARNESS_ENVIRONMENT_CONFIG_FIELDS.TARGET_AGENTS],
  );
  if (!targetAgents.ok) return targetAgents;

  return { ok: true, value: { path: filePath.value, targetAgents: targetAgents.value } };
}

function validateAgents(raw: unknown): Result<HarnessEnvironmentConfig["agents"]> {
  const sectionPath = `${HARNESS_ENVIRONMENT_SECTION}.${HARNESS_ENVIRONMENT_CONFIG_FIELDS.AGENTS}`;
  if (!isRecord(raw)) {
    return { ok: false, error: `${sectionPath} must be an object` };
  }

  const agents: Record<Agent, AgentConfig> = { ...DEFAULT_HARNESS_ENVIRONMENT_CONFIG.agents };
  for (const [agentName, agentRaw] of Object.entries(raw)) {
    // Agent ids are the field names, so unknown-field rejection is the agent-id validation below.
    const agent = validateAgent(`${sectionPath}.${agentName}`, agentName);
    if (!agent.ok) return agent;
    const config = validateAgentConfig(`${sectionPath}.${agentName}`, agentRaw, agents[agent.value]);
    if (!config.ok) return config;
    agents[agent.value] = config.value;
  }

  return { ok: true, value: agents };
}

function validateAgentConfig(
  path: string,
  raw: unknown,
  defaults: AgentConfig,
): Result<AgentConfig> {
  if (!isRecord(raw)) return { ok: false, error: `${path} must be an object` };
  const unknown = rejectUnknownFields(path, raw, HARNESS_ENVIRONMENT_AGENT_CONFIG_ALLOWED_FIELDS);
  if (!unknown.ok) return unknown;

  const enabledRaw = raw[HARNESS_ENVIRONMENT_CONFIG_FIELDS.ENABLED];
  const enabled = enabledRaw === undefined
    ? { ok: true as const, value: defaults.enabled }
    : validateBoolean(`${path}.${HARNESS_ENVIRONMENT_CONFIG_FIELDS.ENABLED}`, enabledRaw);
  if (!enabled.ok) return enabled;

  const hooksRaw = raw[HARNESS_ENVIRONMENT_CONFIG_FIELDS.HOOKS];
  const hooks = hooksRaw === undefined
    ? { ok: true as const, value: defaults.hooks }
    : validateAgentHooks(`${path}.${HARNESS_ENVIRONMENT_CONFIG_FIELDS.HOOKS}`, hooksRaw, defaults.hooks);
  if (!hooks.ok) return hooks;

  return { ok: true, value: { enabled: enabled.value, hooks: hooks.value } };
}

function validateAgentHooks(
  path: string,
  raw: unknown,
  defaults: AgentHooksConfig,
): Result<AgentHooksConfig> {
  if (!isRecord(raw)) return { ok: false, error: `${path} must be an object` };
  const unknown = rejectUnknownFields(path, raw, HARNESS_ENVIRONMENT_AGENT_HOOKS_ALLOWED_FIELDS);
  if (!unknown.ok) return unknown;

  const sessionStartRaw = raw[HARNESS_ENVIRONMENT_CONFIG_FIELDS.SESSION_START];
  const sessionStart = sessionStartRaw === undefined
    ? { ok: true as const, value: defaults.sessionStart }
    : validateSessionStartHooks(
      `${path}.${HARNESS_ENVIRONMENT_CONFIG_FIELDS.SESSION_START}`,
      sessionStartRaw,
      defaults.sessionStart,
    );
  if (!sessionStart.ok) return sessionStart;

  return { ok: true, value: { sessionStart: sessionStart.value } };
}

function validateSessionStartHooks(
  path: string,
  raw: unknown,
  defaults: AgentSessionStartHookConfig,
): Result<AgentSessionStartHookConfig> {
  if (!isRecord(raw)) return { ok: false, error: `${path} must be an object` };
  const unknown = rejectUnknownFields(path, raw, HARNESS_ENVIRONMENT_SESSION_START_HOOKS_ALLOWED_FIELDS);
  if (!unknown.ok) return unknown;

  const compactStdoutRaw = raw[HARNESS_ENVIRONMENT_CONFIG_FIELDS.COMPACT_STDOUT];
  const compactStdout = compactStdoutRaw === undefined
    ? { ok: true as const, value: defaults.compactStdout }
    : validateBoolean(`${path}.${HARNESS_ENVIRONMENT_CONFIG_FIELDS.COMPACT_STDOUT}`, compactStdoutRaw);
  if (!compactStdout.ok) return compactStdout;

  return { ok: true, value: { compactStdout: compactStdout.value } };
}

function validatePluginBootstrap(raw: unknown): Result<HarnessEnvironmentConfig["pluginBootstrap"]> {
  const sectionPath = `${HARNESS_ENVIRONMENT_SECTION}.${HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP}`;
  if (!isRecord(raw)) {
    return { ok: false, error: `${sectionPath} must be an object` };
  }

  const unknown = rejectUnknownFields(
    sectionPath,
    raw,
    HARNESS_ENVIRONMENT_PLUGIN_BOOTSTRAP_ALLOWED_FIELDS,
  );
  if (!unknown.ok) return unknown;

  const marketplaces = validateEntryArray(
    `${sectionPath}.${HARNESS_ENVIRONMENT_CONFIG_FIELDS.MARKETPLACES}`,
    raw[HARNESS_ENVIRONMENT_CONFIG_FIELDS.MARKETPLACES],
    validateMarketplace,
    DEFAULT_HARNESS_ENVIRONMENT_CONFIG.pluginBootstrap.marketplaces,
  );
  if (!marketplaces.ok) return marketplaces;

  const marketplaceUniqueness = validateNamedAgentEntryUniqueness(
    `${sectionPath}.${HARNESS_ENVIRONMENT_CONFIG_FIELDS.MARKETPLACES}`,
    marketplaces.value,
  );
  if (!marketplaceUniqueness.ok) return marketplaceUniqueness;

  const plugins = validateEntryArray(
    `${sectionPath}.${HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGINS}`,
    raw[HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGINS],
    validatePlugin,
    DEFAULT_HARNESS_ENVIRONMENT_CONFIG.pluginBootstrap.plugins,
  );
  if (!plugins.ok) return plugins;

  const pluginUniqueness = validateNamedAgentEntryUniqueness(
    `${sectionPath}.${HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGINS}`,
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
    `${sectionPath}.${HARNESS_ENVIRONMENT_CONFIG_FIELDS.SKILLS}`,
    raw[HARNESS_ENVIRONMENT_CONFIG_FIELDS.SKILLS],
    validateSkill,
    DEFAULT_HARNESS_ENVIRONMENT_CONFIG.pluginBootstrap.skills,
  );
  if (!skills.ok) return skills;

  const skillUniqueness = validateNamedAgentEntryUniqueness(
    `${sectionPath}.${HARNESS_ENVIRONMENT_CONFIG_FIELDS.SKILLS}`,
    skills.value,
  );
  if (!skillUniqueness.ok) return skillUniqueness;

  const bootstrapNameUniqueness = validatePluginBootstrapNameUniqueness(
    sectionPath,
    marketplaces.value,
    plugins.value,
    skills.value,
  );
  if (!bootstrapNameUniqueness.ok) return bootstrapNameUniqueness;

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
        error: `${path}.${index}.${HARNESS_ENVIRONMENT_CONFIG_FIELDS.PATH} ${
          JSON.stringify(file.path)
        } is already used by another instruction file entry`,
      };
    }
    paths.add(file.path);
  }
  return { ok: true, value: undefined };
}

function validateNamedAgentEntryUniqueness(
  path: string,
  entries: readonly { readonly agent: Agent; readonly name: string }[],
): Result<undefined> {
  const namesByAgent = new Map<Agent, Set<string>>();
  for (const [index, entry] of entries.entries()) {
    const agentNames = namesByAgent.get(entry.agent) ?? new Set<string>();
    if (agentNames.has(entry.name)) {
      return {
        ok: false,
        error: `${path}.${index}.${HARNESS_ENVIRONMENT_CONFIG_FIELDS.NAME} ${
          JSON.stringify(entry.name)
        } is already used by another ${entry.agent} entry`,
      };
    }
    agentNames.add(entry.name);
    namesByAgent.set(entry.agent, agentNames);
  }
  return { ok: true, value: undefined };
}

function validatePluginBootstrapNameUniqueness(
  sectionPath: string,
  marketplaces: readonly AgentMarketplaceConfig[],
  plugins: readonly AgentPluginConfig[],
  skills: readonly AgentSkillConfig[],
): Result<undefined> {
  const namesByAgent = new Map<Agent, Set<string>>();
  const entries = [
    ...marketplaces.map((entry, index) => ({
      agent: entry.agent,
      name: entry.name,
      path: `${sectionPath}.${HARNESS_ENVIRONMENT_CONFIG_FIELDS.MARKETPLACES}.${index}`,
    })),
    ...plugins.map((entry, index) => ({
      agent: entry.agent,
      name: entry.name,
      path: `${sectionPath}.${HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGINS}.${index}`,
    })),
    ...skills.map((entry, index) => ({
      agent: entry.agent,
      name: entry.name,
      path: `${sectionPath}.${HARNESS_ENVIRONMENT_CONFIG_FIELDS.SKILLS}.${index}`,
    })),
  ] as const;

  for (const entry of entries) {
    const agentNames = namesByAgent.get(entry.agent) ?? new Set<string>();
    if (agentNames.has(entry.name)) {
      return {
        ok: false,
        error: `${entry.path}.${HARNESS_ENVIRONMENT_CONFIG_FIELDS.NAME} ${
          JSON.stringify(entry.name)
        } is already used by another ${entry.agent} bootstrap entry`,
      };
    }
    agentNames.add(entry.name);
    namesByAgent.set(entry.agent, agentNames);
  }

  return { ok: true, value: undefined };
}

function validatePluginMarketplaceReferences(
  path: string,
  marketplaces: readonly AgentMarketplaceConfig[],
  plugins: readonly AgentPluginConfig[],
): Result<undefined> {
  const marketplacesByAgent = new Map<Agent, Set<string>>();
  for (const marketplace of marketplaces) {
    const agentMarketplaces = marketplacesByAgent.get(marketplace.agent) ?? new Set<string>();
    agentMarketplaces.add(marketplace.name);
    marketplacesByAgent.set(marketplace.agent, agentMarketplaces);
  }

  for (const [index, plugin] of plugins.entries()) {
    if (plugin.marketplace === undefined) continue;
    const agentMarketplaces = marketplacesByAgent.get(plugin.agent);
    if (!agentMarketplaces?.has(plugin.marketplace)) {
      return {
        ok: false,
        error:
          `${path}.${HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGINS}.${index}.${HARNESS_ENVIRONMENT_CONFIG_FIELDS.MARKETPLACE} must reference a configured marketplace for the same agent`,
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
    HARNESS_ENVIRONMENT_MARKETPLACE_ALLOWED_FIELDS,
  );
  if (!unknown.ok) return unknown;

  const base = validateNamedAgentEntry(path, raw);
  if (!base.ok) return base;
  const source = validateNonEmptyString(
    `${path}.${HARNESS_ENVIRONMENT_CONFIG_FIELDS.SOURCE}`,
    raw[HARNESS_ENVIRONMENT_CONFIG_FIELDS.SOURCE],
  );
  if (!source.ok) return source;
  return { ok: true, value: { ...base.value, source: source.value } };
}

function validatePlugin(path: string, raw: unknown): Result<AgentPluginConfig> {
  if (!isRecord(raw)) return { ok: false, error: `${path} must be an object` };
  const unknown = rejectUnknownFields(
    path,
    raw,
    HARNESS_ENVIRONMENT_PLUGIN_ALLOWED_FIELDS,
  );
  if (!unknown.ok) return unknown;

  const base = validateNamedAgentEntry(path, raw);
  if (!base.ok) return base;
  const marketplace = validateOptionalString(
    `${path}.${HARNESS_ENVIRONMENT_CONFIG_FIELDS.MARKETPLACE}`,
    raw[HARNESS_ENVIRONMENT_CONFIG_FIELDS.MARKETPLACE],
  );
  if (!marketplace.ok) return marketplace;
  const version = validateOptionalString(
    `${path}.${HARNESS_ENVIRONMENT_CONFIG_FIELDS.VERSION}`,
    raw[HARNESS_ENVIRONMENT_CONFIG_FIELDS.VERSION],
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
    HARNESS_ENVIRONMENT_SKILL_ALLOWED_FIELDS,
  );
  if (!unknown.ok) return unknown;

  const base = validateNamedAgentEntry(path, raw);
  if (!base.ok) return base;
  const source = validateOptionalString(
    `${path}.${HARNESS_ENVIRONMENT_CONFIG_FIELDS.SOURCE}`,
    raw[HARNESS_ENVIRONMENT_CONFIG_FIELDS.SOURCE],
  );
  if (!source.ok) return source;
  const version = validateOptionalString(
    `${path}.${HARNESS_ENVIRONMENT_CONFIG_FIELDS.VERSION}`,
    raw[HARNESS_ENVIRONMENT_CONFIG_FIELDS.VERSION],
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

function validateNamedAgentEntry(
  path: string,
  raw: Record<string, unknown>,
): Result<{ readonly agent: Agent; readonly name: string }> {
  const agent = validateAgent(
    `${path}.${HARNESS_ENVIRONMENT_CONFIG_FIELDS.AGENT}`,
    raw[HARNESS_ENVIRONMENT_CONFIG_FIELDS.AGENT],
  );
  if (!agent.ok) return agent;
  const name = validateNonEmptyString(
    `${path}.${HARNESS_ENVIRONMENT_CONFIG_FIELDS.NAME}`,
    raw[HARNESS_ENVIRONMENT_CONFIG_FIELDS.NAME],
  );
  if (!name.ok) return name;
  return { ok: true, value: { agent: agent.value, name: name.value } };
}

function validateOptionalString(path: string, value: unknown): Result<string | undefined> {
  if (value === undefined) return { ok: true, value: undefined };
  return validateNonEmptyString(path, value);
}

function validate(value: unknown): Result<HarnessEnvironmentConfig> {
  if (!isRecord(value)) {
    return { ok: false, error: `${HARNESS_ENVIRONMENT_SECTION} section must be an object` };
  }

  const unknown = rejectUnknownFields(
    HARNESS_ENVIRONMENT_SECTION,
    value,
    HARNESS_ENVIRONMENT_ALLOWED_FIELDS,
  );
  if (!unknown.ok) return unknown;

  const instructionsRaw = value[HARNESS_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS];
  const instructions = instructionsRaw === undefined
    ? { ok: true as const, value: DEFAULT_HARNESS_ENVIRONMENT_CONFIG.instructions }
    : validateInstructions(instructionsRaw);
  if (!instructions.ok) return instructions;

  const agentsRaw = value[HARNESS_ENVIRONMENT_CONFIG_FIELDS.AGENTS];
  const agents = agentsRaw === undefined
    ? { ok: true as const, value: DEFAULT_HARNESS_ENVIRONMENT_CONFIG.agents }
    : validateAgents(agentsRaw);
  if (!agents.ok) return agents;

  const pluginBootstrapRaw = value[HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP];
  const pluginBootstrap = pluginBootstrapRaw === undefined
    ? { ok: true as const, value: DEFAULT_HARNESS_ENVIRONMENT_CONFIG.pluginBootstrap }
    : validatePluginBootstrap(pluginBootstrapRaw);
  if (!pluginBootstrap.ok) return pluginBootstrap;

  return {
    ok: true,
    value: {
      instructions: instructions.value,
      agents: agents.value,
      pluginBootstrap: pluginBootstrap.value,
    },
  };
}

export const harnessEnvironmentConfigDescriptor: ConfigDescriptor<HarnessEnvironmentConfig> = {
  section: HARNESS_ENVIRONMENT_SECTION,
  defaults: DEFAULT_HARNESS_ENVIRONMENT_CONFIG,
  validate,
};
