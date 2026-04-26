import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { parse as tomlParse, stringify as tomlStringify } from "smol-toml";
import { Document, isMap, parseDocument } from "yaml";

import { CONFIG_FILENAMES } from "@/config/index.js";

import { LITERAL_SECTION, type LiteralConfig, literalConfigDescriptor } from "./config.js";
import { validateLiteralReuse } from "./index.js";

export type ConfigFormat = "json" | "yaml" | "toml";

export interface ConfigFileInfo {
  readonly path: string;
  readonly format: ConfigFormat;
  readonly raw: string;
}

export type ConfigReadResult =
  | { readonly kind: "ok"; readonly file: ConfigFileInfo }
  | { readonly kind: "ambiguous"; readonly detected: readonly string[] }
  | { readonly kind: "absent" };

export interface ConfigReader {
  read(projectRoot: string): Promise<ConfigReadResult>;
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
const DEFAULT_FORMAT: ConfigFormat = "yaml";
const ALLOWLIST_INCLUDE_PATH = [LITERAL_SECTION, "allowlist", "include"] as const;
const TEMP_FILE_PREFIX = ".spx-allowlist-existing-";
const TEMP_FILE_SUFFIX = ".tmp";
const RANDOM_BASE = 36;
const RANDOM_PREFIX_SLICE = 2;
const RANDOM_TOKEN_LENGTH = 10;
const JSON_INDENT = 2;
const FORMAT_FILENAMES: Readonly<Record<ConfigFormat, string>> = {
  json: CONFIG_FILENAMES.json,
  yaml: CONFIG_FILENAMES.yaml,
  toml: CONFIG_FILENAMES.toml,
};
const DETECTION_ORDER: readonly ConfigFormat[] = ["json", "yaml", "toml"];

export const productionReader: ConfigReader = {
  async read(projectRoot: string): Promise<ConfigReadResult> {
    const detected: ConfigFileInfo[] = [];
    for (const format of DETECTION_ORDER) {
      const filename = FORMAT_FILENAMES[format];
      const path = join(projectRoot, filename);
      try {
        const raw = await readFile(path, "utf8");
        detected.push({ path, format, raw });
      } catch (error: unknown) {
        if (!isFileNotFound(error)) throw error;
      }
    }
    if (detected.length === 0) return { kind: "absent" };
    if (detected.length > 1) {
      return { kind: "ambiguous", detected: detected.map((file) => FORMAT_FILENAMES[file.format]) };
    }
    return { kind: "ok", file: detected[0] };
  },
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
  if (readResult.kind === "ambiguous") {
    const names = readResult.detected.join(", ");
    return { exitCode: EXIT_ERROR, output: `multiple config files found: ${names}` };
  }

  const currentLiteralConfig = readCurrentLiteralConfig(readResult);

  const detection = await validateLiteralReuse({
    projectRoot: options.projectRoot,
    config: currentLiteralConfig,
  });

  const findingValues = collectFindingValues(detection.findings);
  const updatedInclude = computeUpdatedInclude(
    currentLiteralConfig.allowlist.include,
    findingValues,
  );

  const target: ConfigFileInfo = readResult.kind === "ok"
    ? readResult.file
    : {
      path: join(options.projectRoot, FORMAT_FILENAMES[DEFAULT_FORMAT]),
      format: DEFAULT_FORMAT,
      raw: "",
    };

  const serialized = serializeWithUpdatedInclude(target, updatedInclude);
  await writer.write(target.path, serialized);

  return { exitCode: EXIT_OK, output: "" };
}

function readCurrentLiteralConfig(read: ConfigReadResult): LiteralConfig {
  if (read.kind !== "ok") return literalConfigDescriptor.defaults;
  const sections = parseSections(read.file);
  const literalRaw = sections[LITERAL_SECTION];
  if (literalRaw === undefined) return literalConfigDescriptor.defaults;
  const validated = literalConfigDescriptor.validate(literalRaw);
  return validated.ok ? validated.value : literalConfigDescriptor.defaults;
}

function parseSections(file: ConfigFileInfo): Record<string, unknown> {
  if (file.raw.trim() === "") return {};
  switch (file.format) {
    case "json":
      return JSON.parse(file.raw) as Record<string, unknown>;
    case "yaml": {
      const parsed = parseDocument(file.raw).toJS({ maxAliasCount: 0 }) as Record<string, unknown> | null;
      return parsed ?? {};
    }
    case "toml":
      return tomlParse(file.raw) as Record<string, unknown>;
  }
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

function serializeWithUpdatedInclude(target: ConfigFileInfo, include: readonly string[]): string {
  switch (target.format) {
    case "yaml":
      return serializeYaml(target.raw, include);
    case "json":
      return serializeJson(target.raw, include);
    case "toml":
      return serializeToml(target.raw, include);
  }
}

function serializeYaml(raw: string, include: readonly string[]): string {
  const doc = isEffectivelyEmpty(raw, "yaml") ? new Document({}) : parseDocument(raw);
  doc.setIn([...ALLOWLIST_INCLUDE_PATH], [...include]);
  return doc.toString();
}

function serializeJson(raw: string, include: readonly string[]): string {
  const obj = isEffectivelyEmpty(raw, "json")
    ? {}
    : (JSON.parse(raw) as Record<string, unknown>);
  setNested(obj, [...ALLOWLIST_INCLUDE_PATH], [...include]);
  return JSON.stringify(obj, null, JSON_INDENT) + "\n";
}

function serializeToml(raw: string, include: readonly string[]): string {
  const obj = isEffectivelyEmpty(raw, "toml")
    ? {}
    : (tomlParse(raw) as Record<string, unknown>);
  setNested(obj, [...ALLOWLIST_INCLUDE_PATH], [...include]);
  return tomlStringify(obj);
}

function isEffectivelyEmpty(raw: string, format: ConfigFormat): boolean {
  if (raw.trim() === "") return true;
  if (format === "yaml") {
    const doc = parseDocument(raw);
    if (doc.contents === null) return true;
    if (isMap(doc.contents) && doc.contents.items.length === 0) return true;
  }
  return false;
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

function isFileNotFound(error: unknown): boolean {
  return error instanceof Error
    && "code" in error
    && (error as NodeJS.ErrnoException).code === "ENOENT";
}
