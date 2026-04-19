import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { parse as parseYaml } from "yaml";

import { productionRegistry } from "./registry.js";
import type { Config, ConfigDescriptor, Result } from "./types.js";

const CONFIG_FILENAME = "spx.config.yaml";

export async function resolveConfig(
  projectRoot: string,
  descriptors: readonly ConfigDescriptor<unknown>[] = productionRegistry,
): Promise<Result<Config>> {
  const yamlResult = await loadYamlSections(projectRoot);
  if (!yamlResult.ok) {
    return yamlResult;
  }
  const yamlSections = yamlResult.value;

  const resolved: Record<string, unknown> = {};
  for (const descriptor of descriptors) {
    const sectionValue = yamlSections[descriptor.section];
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

async function loadYamlSections(projectRoot: string): Promise<Result<Record<string, unknown>>> {
  const path = join(projectRoot, CONFIG_FILENAME);

  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if (isFileNotFound(error)) {
      return { ok: true, value: {} };
    }
    return { ok: false, error: `failed to read ${CONFIG_FILENAME}: ${toMessage(error)}` };
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (error) {
    return { ok: false, error: `${CONFIG_FILENAME} is not valid yaml: ${toMessage(error)}` };
  }

  if (parsed === null || parsed === undefined) {
    return { ok: true, value: {} };
  }
  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: `${CONFIG_FILENAME} must parse to a mapping of descriptor sections` };
  }

  return { ok: true, value: parsed as Record<string, unknown> };
}

function isFileNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
