import { join } from "node:path";

import { stringify as stringifyToml } from "smol-toml";
import { parseDocument as parseYamlDocument, stringify as stringifyYaml } from "yaml";

import { toMessage } from "@/lib/error-message";

import { CONFIG_FILE_DEFINITIONS, CONFIG_FILE_FORMAT, DEFAULT_CONFIG_FILE_FORMAT } from "./filenames";
import type { ConfigFileFormat } from "./filenames";
import {
  type ConfigFile,
  type ConfigFileReadResult,
  parseConfigFileSections,
  readProductConfigFile,
  resolveDescriptorSectionsFromReadResult,
} from "./product-file";
import { productionRegistry } from "./registry";
import type { Config, ConfigDescriptor, Result } from "./types";

export {
  absentConfigFileReadResult,
  CONFIG_FILE_READ_KIND,
  type ConfigFile,
  type ConfigFileReadResult,
  type ConfigFileTextReader,
  detectProductConfigFile,
  formatConfigFileAmbiguityError,
  parseConfigFileSections,
  readConfigSectionFromReadResult,
  readProductConfigFile,
} from "./product-file";

export {
  CONFIG_FILE_DEFINITIONS,
  CONFIG_FILE_FORMAT,
  CONFIG_FILE_FORMAT_ORDER,
  CONFIG_FILENAMES,
  DEFAULT_CONFIG_FILE_FORMAT,
  DEFAULT_CONFIG_FILENAME,
} from "./filenames";
export type { ConfigFileFormat, ConfigFilename } from "./filenames";

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
  return resolveDescriptorSectionsFromReadResult(detected, descriptors);
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

export {
  canonicalDescriptorJson,
  type DescriptorJsonValue,
  type DescriptorSectionDigest,
  digestDescriptorSection,
} from "./descriptor-digest";
