import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { parse as parseYaml, parseDocument as parseYamlDocument, stringify as stringifyYaml } from "yaml";

import { productionRegistry } from "./registry";
import type { Config, ConfigDescriptor, Result } from "./types";

export const CONFIG_FILE_FORMAT = {
  JSON: "json",
  YAML: "yaml",
  TOML: "toml",
} as const;

export type ConfigFileFormat = (typeof CONFIG_FILE_FORMAT)[keyof typeof CONFIG_FILE_FORMAT];

export const CONFIG_FILE_DEFINITIONS = {
  [CONFIG_FILE_FORMAT.JSON]: {
    format: CONFIG_FILE_FORMAT.JSON,
    filename: "spx.config.json",
  },
  [CONFIG_FILE_FORMAT.YAML]: {
    format: CONFIG_FILE_FORMAT.YAML,
    filename: "spx.config.yaml",
  },
  [CONFIG_FILE_FORMAT.TOML]: {
    format: CONFIG_FILE_FORMAT.TOML,
    filename: "spx.config.toml",
  },
} as const;

export const CONFIG_FILE_FORMAT_ORDER = [
  CONFIG_FILE_FORMAT.JSON,
  CONFIG_FILE_FORMAT.YAML,
  CONFIG_FILE_FORMAT.TOML,
] as const;

export const DEFAULT_CONFIG_FILE_FORMAT = CONFIG_FILE_FORMAT.YAML;

export const CONFIG_FILENAMES = {
  json: CONFIG_FILE_DEFINITIONS[CONFIG_FILE_FORMAT.JSON].filename,
  yaml: CONFIG_FILE_DEFINITIONS[CONFIG_FILE_FORMAT.YAML].filename,
  toml: CONFIG_FILE_DEFINITIONS[CONFIG_FILE_FORMAT.TOML].filename,
} as const;

export type ConfigFilename = (typeof CONFIG_FILENAMES)[keyof typeof CONFIG_FILENAMES];

export const DEFAULT_CONFIG_FILENAME = CONFIG_FILE_DEFINITIONS[DEFAULT_CONFIG_FILE_FORMAT].filename;

export type ConfigFile = {
  readonly filename: ConfigFilename;
  readonly format: ConfigFileFormat;
  readonly path: string;
  readonly raw: string;
};

export type ConfigFileReadResult =
  | { readonly kind: "ok"; readonly file: ConfigFile }
  | { readonly kind: "ambiguous"; readonly detected: readonly ConfigFilename[] }
  | { readonly kind: "absent" };

const JSON_INDENT = 2;

export async function resolveConfig(
  projectRoot: string,
  descriptors: readonly ConfigDescriptor<unknown>[] = productionRegistry,
): Promise<Result<Config>> {
  const detectedResult = await readProjectConfigFile(projectRoot);
  if (!detectedResult.ok) return detectedResult;

  const detected = detectedResult.value;
  if (detected.kind === "ambiguous") {
    return { ok: false, error: formatConfigFileAmbiguityError(detected.detected) };
  }

  const sectionsResult = detected.kind === "absent"
    ? ({ ok: true as const, value: {} as Record<string, unknown> })
    : parseConfigFileSections(detected.file);
  if (!sectionsResult.ok) {
    return sectionsResult;
  }
  const sections = sectionsResult.value;

  const resolved: Record<string, unknown> = {};
  for (const descriptor of descriptors) {
    const sectionValue = sections[descriptor.section];
    if (sectionValue === undefined) {
      resolved[descriptor.section] = descriptor.defaults;
      continue;
    }
    const validated = descriptor.validate(sectionValue);
    if (!validated.ok) {
      return { ok: false, error: `${descriptor.section}: ${validated.error}` };
    }
    resolved[descriptor.section] = validated.value;
  }

  return { ok: true, value: resolved };
}

export async function readProjectConfigFile(projectRoot: string): Promise<Result<ConfigFileReadResult>> {
  const detected: ConfigFile[] = [];
  for (const format of CONFIG_FILE_FORMAT_ORDER) {
    const filename = CONFIG_FILE_DEFINITIONS[format].filename;
    const path = join(projectRoot, filename);
    let raw: string;
    try {
      raw = await readFile(path, "utf8");
    } catch (error) {
      if (isFileNotFound(error)) continue;
      return { ok: false, error: `failed to read ${filename}: ${toMessage(error)}` };
    }
    detected.push({ filename, format, path, raw });
  }
  if (detected.length === 0) return { ok: true, value: { kind: "absent" } };
  if (detected.length > 1) {
    return {
      ok: true,
      value: {
        kind: "ambiguous",
        detected: detected.map((file) => file.filename),
      },
    };
  }
  return { ok: true, value: { kind: "ok", file: detected[0] } };
}

export function configFileForFormat(
  projectRoot: string,
  format: ConfigFileFormat = DEFAULT_CONFIG_FILE_FORMAT,
  raw = "",
): ConfigFile {
  const filename = CONFIG_FILE_DEFINITIONS[format].filename;
  return {
    filename,
    format,
    path: join(projectRoot, filename),
    raw,
  };
}

export function formatConfigFileAmbiguityError(detected: readonly ConfigFilename[]): string {
  return `multiple config files found: ${detected.join(", ")}`;
}

export function parseConfigFileSections(file: ConfigFile): Result<Record<string, unknown>> {
  if (file.raw.trim() === "") return { ok: true, value: {} };
  switch (file.format) {
    case CONFIG_FILE_FORMAT.JSON:
      return parseJsonSections(file.filename, file.raw);
    case CONFIG_FILE_FORMAT.YAML:
      return parseYamlSections(file.filename, file.raw);
    case CONFIG_FILE_FORMAT.TOML:
      return parseTomlSections(file.filename, file.raw);
  }
}

export function serializeConfigFileSections(
  format: ConfigFileFormat,
  sections: Record<string, unknown>,
): Result<string> {
  switch (format) {
    case CONFIG_FILE_FORMAT.JSON:
      return { ok: true, value: JSON.stringify(sections, null, JSON_INDENT) + "\n" };
    case CONFIG_FILE_FORMAT.YAML:
      return { ok: true, value: stringifyYaml(sections) };
    case CONFIG_FILE_FORMAT.TOML:
      return serializeTomlSections(sections);
  }
}

export function serializeConfigFileSectionsWithSetIn(
  file: ConfigFile,
  path: readonly string[],
  value: unknown,
): Result<string> {
  if (path.length === 0) {
    return { ok: false, error: "config mutation path must not be empty" };
  }
  switch (file.format) {
    case CONFIG_FILE_FORMAT.YAML:
      return serializeYamlSectionsWithSetIn(file, path, value);
    case CONFIG_FILE_FORMAT.JSON:
    case CONFIG_FILE_FORMAT.TOML: {
      const sections = parseConfigFileSections(file);
      if (!sections.ok) return sections;
      setNested(sections.value, path, value);
      return serializeConfigFileSections(file.format, sections.value);
    }
  }
}

function parseJsonSections(filename: string, raw: string): Result<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    return { ok: false, error: `${filename} is not valid ${CONFIG_FILE_FORMAT.JSON}: ${toMessage(error)}` };
  }
  return validateParsedSections(filename, parsed);
}

function parseYamlSections(filename: string, raw: string): Result<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = parseYaml(raw) as unknown;
  } catch (error) {
    return { ok: false, error: `${filename} is not valid ${CONFIG_FILE_FORMAT.YAML}: ${toMessage(error)}` };
  }
  if (parsed === null || parsed === undefined) {
    return { ok: true, value: {} };
  }
  return validateParsedSections(filename, parsed);
}

function parseTomlSections(filename: string, raw: string): Result<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = parseToml(raw) as unknown;
  } catch (error) {
    return { ok: false, error: `${filename} is not valid ${CONFIG_FILE_FORMAT.TOML}: ${toMessage(error)}` };
  }
  return validateParsedSections(filename, parsed);
}

function serializeTomlSections(sections: Record<string, unknown>): Result<string> {
  try {
    return { ok: true, value: stringifyToml(sections) };
  } catch (error) {
    return {
      ok: false,
      error: `config is not serializable as ${CONFIG_FILE_FORMAT.TOML}: ${toMessage(error)}`,
    };
  }
}

function serializeYamlSectionsWithSetIn(
  file: ConfigFile,
  path: readonly string[],
  value: unknown,
): Result<string> {
  try {
    const doc = parseYamlDocument(file.raw.trim() === "" ? "{}\n" : file.raw);
    if (doc.errors.length > 0) {
      return {
        ok: false,
        error: `${file.filename} is not valid ${CONFIG_FILE_FORMAT.YAML}: ${doc.errors[0].message}`,
      };
    }
    doc.setIn([...path], value);
    return { ok: true, value: String(doc) };
  } catch (error) {
    return { ok: false, error: `${file.filename} is not valid ${CONFIG_FILE_FORMAT.YAML}: ${toMessage(error)}` };
  }
}

function setNested(target: Record<string, unknown>, path: readonly string[], value: unknown): void {
  let cursor: Record<string, unknown> = target;
  for (let i = 0; i < path.length - 1; i += 1) {
    const key = path[i];
    const existing = cursor[key];
    if (typeof existing === "object" && existing !== null && !Array.isArray(existing)) {
      cursor = existing as Record<string, unknown>;
    } else {
      const fresh: Record<string, unknown> = {};
      cursor[key] = fresh;
      cursor = fresh;
    }
  }
  cursor[path[path.length - 1]] = value;
}

function validateParsedSections(filename: string, parsed: unknown): Result<Record<string, unknown>> {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: `${filename} must parse to a mapping of descriptor sections` };
  }
  return { ok: true, value: parsed as Record<string, unknown> };
}

function isFileNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
