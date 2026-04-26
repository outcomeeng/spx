import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { parse as parseToml } from "smol-toml";
import { parse as parseYaml } from "yaml";

import { productionRegistry } from "./registry.js";
import type { Config, ConfigDescriptor, Result } from "./types.js";

export const CONFIG_FILENAMES = {
  json: "spx.config.json",
  yaml: "spx.config.yaml",
  toml: "spx.config.toml",
} as const;

type ConfigFile = { readonly filename: string; readonly raw: string };

export async function resolveConfig(
  projectRoot: string,
  descriptors: readonly ConfigDescriptor<unknown>[] = productionRegistry,
): Promise<Result<Config>> {
  const detectedResult = await detectConfigFiles(projectRoot);
  if (!detectedResult.ok) {
    return detectedResult;
  }
  const detected = detectedResult.value;

  if (detected.length > 1) {
    const names = detected.map((f) => f.filename).join(", ");
    return { ok: false, error: `multiple config files found: ${names}` };
  }

  const sectionsResult = detected.length === 0
    ? ({ ok: true as const, value: {} as Record<string, unknown> })
    : parseSections(detected[0]);
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

async function detectConfigFiles(projectRoot: string): Promise<Result<ConfigFile[]>> {
  const detected: ConfigFile[] = [];
  for (const filename of Object.values(CONFIG_FILENAMES)) {
    let raw: string;
    try {
      raw = await readFile(join(projectRoot, filename), "utf8");
    } catch (error) {
      if (isFileNotFound(error)) continue;
      return { ok: false, error: `failed to read ${filename}: ${toMessage(error)}` };
    }
    detected.push({ filename, raw });
  }
  return { ok: true, value: detected };
}

function parseSections(file: ConfigFile): Result<Record<string, unknown>> {
  switch (file.filename) {
    case CONFIG_FILENAMES.json:
      return parseJsonSections(file.filename, file.raw);
    case CONFIG_FILENAMES.yaml:
      return parseYamlSections(file.filename, file.raw);
    default:
      return parseTomlSections(file.filename, file.raw);
  }
}

function parseJsonSections(filename: string, raw: string): Result<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    return { ok: false, error: `${filename} is not valid json: ${toMessage(error)}` };
  }
  return validateParsedSections(filename, parsed);
}

function parseYamlSections(filename: string, raw: string): Result<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = parseYaml(raw) as unknown;
  } catch (error) {
    return { ok: false, error: `${filename} is not valid yaml: ${toMessage(error)}` };
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
    return { ok: false, error: `${filename} is not valid toml: ${toMessage(error)}` };
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

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
