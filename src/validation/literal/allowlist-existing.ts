import { rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  type ConfigFile,
  configFileForFormat,
  type ConfigFileReadResult,
  DEFAULT_CONFIG_FILE_FORMAT,
  formatConfigFileAmbiguityError,
  parseConfigFileSections,
  readProjectConfigFile,
  serializeConfigFileSections,
} from "@/config/index";
import type { Result } from "@/config/types";

import { LITERAL_SECTION, type LiteralConfig, literalConfigDescriptor } from "./config";
import { validateLiteralReuse } from "./index";

export interface ConfigReader {
  read(projectRoot: string): Promise<Result<ConfigFileReadResult>>;
}

export interface ConfigWriter {
  write(filePath: string, content: string): Promise<void>;
}

export interface AllowlistExistingOptions {
  readonly projectRoot: string;
  readonly reader?: ConfigReader;
  readonly writer?: ConfigWriter;
}

export interface AllowlistExistingResult {
  readonly exitCode: number;
  readonly output: string;
}

const EXIT_OK = 0;
const EXIT_ERROR = 1;
const ALLOWLIST_INCLUDE_PATH = [LITERAL_SECTION, "allowlist", "include"] as const;
const TEMP_FILE_PREFIX = ".spx-allowlist-existing-";
const TEMP_FILE_SUFFIX = ".tmp";
const RANDOM_BASE = 36;
const RANDOM_PREFIX_SLICE = 2;
const RANDOM_TOKEN_LENGTH = 10;

export const productionReader: ConfigReader = {
  read: readProjectConfigFile,
};

export const productionWriter: ConfigWriter = {
  async write(filePath: string, content: string): Promise<void> {
    const dir = dirname(filePath);
    const random = Math.random()
      .toString(RANDOM_BASE)
      .slice(RANDOM_PREFIX_SLICE, RANDOM_PREFIX_SLICE + RANDOM_TOKEN_LENGTH);
    const tmpPath = join(dir, `${TEMP_FILE_PREFIX}${random}${TEMP_FILE_SUFFIX}`);
    await writeFile(tmpPath, content, "utf8");
    await rename(tmpPath, filePath);
  },
};

export async function allowlistExisting(
  options: AllowlistExistingOptions,
): Promise<AllowlistExistingResult> {
  const reader = options.reader ?? productionReader;
  const writer = options.writer ?? productionWriter;

  const readResult = await reader.read(options.projectRoot);
  if (!readResult.ok) {
    return { exitCode: EXIT_ERROR, output: readResult.error };
  }

  const configRead = readResult.value;
  if (configRead.kind === "ambiguous") {
    return { exitCode: EXIT_ERROR, output: formatConfigFileAmbiguityError(configRead.detected) };
  }

  const currentLiteralConfig = readCurrentLiteralConfig(configRead);
  if (!currentLiteralConfig.ok) {
    return { exitCode: EXIT_ERROR, output: currentLiteralConfig.error };
  }

  const detection = await validateLiteralReuse({
    projectRoot: options.projectRoot,
    config: currentLiteralConfig.value,
  });

  const findingValues = collectFindingValues(detection.findings);
  const updatedInclude = computeUpdatedInclude(
    currentLiteralConfig.value.allowlist.include,
    findingValues,
  );

  const target: ConfigFile = configRead.kind === "ok"
    ? configRead.file
    : configFileForFormat(options.projectRoot, DEFAULT_CONFIG_FILE_FORMAT);

  const serialized = serializeWithUpdatedInclude(target, updatedInclude);
  if (!serialized.ok) {
    return { exitCode: EXIT_ERROR, output: serialized.error };
  }
  await writer.write(target.path, serialized.value);

  return { exitCode: EXIT_OK, output: "" };
}

function readCurrentLiteralConfig(read: ConfigFileReadResult): Result<LiteralConfig> {
  if (read.kind !== "ok") return { ok: true, value: literalConfigDescriptor.defaults };
  const sections = parseConfigFileSections(read.file);
  if (!sections.ok) return sections;
  const literalRaw = sections.value[LITERAL_SECTION];
  if (literalRaw === undefined) return { ok: true, value: literalConfigDescriptor.defaults };
  const validated = literalConfigDescriptor.validate(literalRaw);
  return validated.ok ? validated : { ok: true, value: literalConfigDescriptor.defaults };
}

function collectFindingValues(
  findings: {
    readonly srcReuse: readonly { readonly value: string }[];
    readonly testDupe: readonly { readonly value: string }[];
  },
): readonly string[] {
  const values = new Set<string>();
  for (const finding of findings.srcReuse) values.add(finding.value);
  for (const finding of findings.testDupe) values.add(finding.value);
  return [...values];
}

function computeUpdatedInclude(
  existing: readonly string[] | undefined,
  findingValues: readonly string[],
): readonly string[] {
  const existingArr = existing ?? [];
  const existingSet = new Set(existingArr);
  const additions = findingValues.filter((value) => !existingSet.has(value)).sort();
  return [...existingArr, ...additions];
}

function serializeWithUpdatedInclude(target: ConfigFile, include: readonly string[]): Result<string> {
  const sections = parseConfigFileSections(target);
  if (!sections.ok) return sections;

  setNested(sections.value, [...ALLOWLIST_INCLUDE_PATH], [...include]);
  return serializeConfigFileSections(target.format, sections.value);
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
