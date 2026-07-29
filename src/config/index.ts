import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { parse as parseYaml, parseDocument as parseYamlDocument, stringify as stringifyYaml } from "yaml";

import { toMessage } from "@/lib/error-message";

import {
  CONFIG_FILE_DEFINITIONS,
  CONFIG_FILE_FORMAT,
  CONFIG_FILE_FORMAT_ORDER,
  DEFAULT_CONFIG_FILE_FORMAT,
} from "./filenames";
import type { ConfigFileFormat, ConfigFilename } from "./filenames";
import { productionRegistry } from "./registry";
import type { Config, ConfigDescriptor, Result } from "./types";

export {
  CONFIG_FILE_DEFINITIONS,
  CONFIG_FILE_FORMAT,
  CONFIG_FILE_FORMAT_ORDER,
  CONFIG_FILENAMES,
  DEFAULT_CONFIG_FILE_FORMAT,
  DEFAULT_CONFIG_FILENAME,
} from "./filenames";
export type { ConfigFileFormat, ConfigFilename } from "./filenames";

export type ConfigFile = {
  readonly filename: ConfigFilename;
  readonly format: ConfigFileFormat;
  readonly path: string;
  readonly raw: string;
};

export const CONFIG_FILE_READ_KIND = {
  OK: "ok",
  AMBIGUOUS: "ambiguous",
  ABSENT: "absent",
} as const;

export type ConfigFileReadResult =
  | { readonly kind: typeof CONFIG_FILE_READ_KIND.OK; readonly file: ConfigFile }
  | { readonly kind: typeof CONFIG_FILE_READ_KIND.AMBIGUOUS; readonly detected: readonly ConfigFilename[] }
  | { readonly kind: typeof CONFIG_FILE_READ_KIND.ABSENT };

export function absentConfigFileReadResult(): { readonly ok: true; readonly value: ConfigFileReadResult } {
  return { ok: true, value: { kind: CONFIG_FILE_READ_KIND.ABSENT } };
}

const JSON_INDENT = 2;

export async function resolveConfig(
  productDir: string,
  descriptors: readonly ConfigDescriptor<unknown>[] = productionRegistry,
): Promise<Result<Config>> {
  const detectedResult = await readProductConfigFile(productDir);
  if (!detectedResult.ok) return detectedResult;

  return resolveConfigFromReadResult(detectedResult.value, descriptors);
}

export function resolveConfigFromReadResult(
  detected: ConfigFileReadResult,
  descriptors: readonly ConfigDescriptor<unknown>[] = productionRegistry,
): Result<Config> {
  if (detected.kind === CONFIG_FILE_READ_KIND.AMBIGUOUS) {
    return { ok: false, error: formatConfigFileAmbiguityError(detected.detected) };
  }

  const sectionsResult = detected.kind === CONFIG_FILE_READ_KIND.ABSENT
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

export function readConfigSectionFromReadResult(
  detected: ConfigFileReadResult,
  section: string,
): Result<unknown> {
  if (detected.kind === CONFIG_FILE_READ_KIND.AMBIGUOUS) {
    return { ok: false, error: formatConfigFileAmbiguityError(detected.detected) };
  }

  if (detected.kind === CONFIG_FILE_READ_KIND.ABSENT) {
    return { ok: true, value: undefined };
  }

  const sectionsResult = parseConfigFileSections(detected.file);
  if (!sectionsResult.ok) return sectionsResult;
  return { ok: true, value: sectionsResult.value[section] };
}

export async function readProductConfigFile(productDir: string): Promise<Result<ConfigFileReadResult>> {
  const detected: ConfigFile[] = [];
  for (const format of CONFIG_FILE_FORMAT_ORDER) {
    const filename = CONFIG_FILE_DEFINITIONS[format].filename;
    const path = join(productDir, filename);
    let raw: string;
    try {
      raw = await readFile(path, "utf8");
    } catch (error) {
      if (isFileNotFound(error)) continue;
      return { ok: false, error: `failed to read ${filename}: ${toMessage(error)}` };
    }
    detected.push({ filename, format, path, raw });
  }
  if (detected.length === 0) return absentConfigFileReadResult();
  if (detected.length > 1) {
    return {
      ok: true,
      value: {
        kind: CONFIG_FILE_READ_KIND.AMBIGUOUS,
        detected: detected.map((file) => file.filename),
      },
    };
  }
  return { ok: true, value: { kind: CONFIG_FILE_READ_KIND.OK, file: detected[0] } };
}

export function configFileForFormat(
  productDir: string,
  format: ConfigFileFormat = DEFAULT_CONFIG_FILE_FORMAT,
  raw = "",
): ConfigFile {
  const filename = CONFIG_FILE_DEFINITIONS[format].filename;
  return {
    filename,
    format,
    path: join(productDir, filename),
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
  format: typeof CONFIG_FILE_FORMAT.JSON | typeof CONFIG_FILE_FORMAT.YAML,
  sections: Record<string, unknown>,
): { readonly ok: true; readonly value: string };
export function serializeConfigFileSections(
  format: ConfigFileFormat,
  sections: Record<string, unknown>,
): Result<string>;
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
    parsed = parseToml(raw);
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
  cursor[path.at(-1)!] = value;
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

export {
  canonicalDescriptorJson,
  type DescriptorJsonValue,
  type DescriptorSectionDigest,
  digestDescriptorSection,
} from "./descriptor-digest";
