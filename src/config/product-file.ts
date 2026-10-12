import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { parse as parseToml } from "smol-toml";
import { parse as parseYaml } from "yaml";

import { toMessage } from "../lib/error-message";

import { CONFIG_FILE_DEFINITIONS, CONFIG_FILE_FORMAT, CONFIG_FILE_FORMAT_ORDER } from "./filenames";
import type { ConfigFileFormat, ConfigFilename } from "./filenames";
import type { Config, ConfigDescriptor, Result } from "./types";

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

/**
 * Merges each descriptor's section with its declared defaults and runs the
 * descriptor's own validator over what the file declares. Takes the descriptors
 * as a parameter, so it reaches no registry.
 */
export function resolveDescriptorSectionsFromReadResult(
  detected: ConfigFileReadResult,
  descriptors: readonly ConfigDescriptor<unknown>[],
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

/** Reads one config file's text by filename; resolves to null when the product does not hold that file. */
export type ConfigFileTextReader = (filename: ConfigFilename) => Promise<string | null>;

/**
 * Probes for every config filename and reports the single file found, every file found
 * when more than one is, or absence. `committedPaths` narrows the probe to the filenames
 * a path list contains; omitted, every filename is probed through the reader.
 */
export async function detectProductConfigFile(
  productDir: string,
  readText: ConfigFileTextReader,
  committedPaths?: readonly string[],
): Promise<Result<ConfigFileReadResult>> {
  const detected: ConfigFile[] = [];
  for (const format of CONFIG_FILE_FORMAT_ORDER) {
    const filename = CONFIG_FILE_DEFINITIONS[format].filename;
    if (committedPaths !== undefined && !committedPaths.includes(filename)) continue;
    let raw: string | null;
    try {
      raw = await readText(filename);
    } catch (error) {
      return { ok: false, error: `failed to read ${filename}: ${toMessage(error)}` };
    }
    if (raw === null) continue;
    detected.push({ filename, format, path: join(productDir, filename), raw });
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

export async function readProductConfigFile(productDir: string): Promise<Result<ConfigFileReadResult>> {
  return detectProductConfigFile(productDir, async (filename) => {
    try {
      return await readFile(join(productDir, filename), "utf8");
    } catch (error) {
      if (isFileNotFound(error)) return null;
      throw error;
    }
  });
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

function validateParsedSections(filename: string, parsed: unknown): Result<Record<string, unknown>> {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: `${filename} must parse to a mapping of descriptor sections` };
  }
  return { ok: true, value: parsed as Record<string, unknown> };
}

function isFileNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}
