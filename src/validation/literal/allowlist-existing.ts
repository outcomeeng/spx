import { randomBytes } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";

import {
  CONFIG_FILE_READ_KIND,
  type ConfigFile,
  configFileForFormat,
  type ConfigFileReadResult,
  DEFAULT_CONFIG_FILE_FORMAT,
  formatConfigFileAmbiguityError,
  readProductConfigFile,
  resolveConfigFromReadResult,
  serializeConfigFileSectionsWithSetIn,
} from "@/config/index";
import type { Result } from "@/config/types";
import {
  VALIDATION_LITERAL_SUBSECTION,
  VALIDATION_LITERAL_VALUES_SUBSECTION,
  VALIDATION_PATH_TOOL_SUBSECTIONS,
  VALIDATION_SECTION,
  type ValidationConfig,
  validationConfigDescriptor,
} from "@/validation/config/descriptor";
import { validationPathFilterForTool } from "@/validation/config/path-filter";

import { writeFileAtomic } from "@/lib/atomic-file-write";
import { compareAsciiStrings } from "@/lib/state-store";
import { validateLiteralReuse } from "./index";

export interface ConfigReader {
  read(productDir: string): Promise<Result<ConfigFileReadResult>>;
}

export interface ConfigWriter {
  write(filePath: string, content: string): Promise<void>;
}

export interface AllowlistExistingOptions {
  readonly productDir: string;
  readonly reader?: ConfigReader;
  readonly writer?: ConfigWriter;
}

export interface AllowlistExistingResult {
  readonly exitCode: number;
  readonly output: string;
}

const EXIT_OK = 0;
const EXIT_ERROR = 1;
const INCLUDE_FIELD = "include";
const ALLOWLIST_INCLUDE_PATH = [
  VALIDATION_SECTION,
  VALIDATION_LITERAL_SUBSECTION,
  VALIDATION_LITERAL_VALUES_SUBSECTION,
  INCLUDE_FIELD,
] as const;
export const productionReader: ConfigReader = {
  read: readProductConfigFile,
};

export const productionWriter: ConfigWriter = {
  async write(filePath: string, content: string): Promise<void> {
    await writeFileAtomic(filePath, content, {
      fs: {
        writeFile: async (path, data) => {
          await writeFile(path, data, "utf8");
        },
        rename,
        rm: async (path, options) => {
          await rm(path, options);
        },
      },
      randomBytes,
    });
  },
};

export async function allowlistExisting(
  options: AllowlistExistingOptions,
): Promise<AllowlistExistingResult> {
  const reader = options.reader ?? productionReader;
  const writer = options.writer ?? productionWriter;

  const readResult = await reader.read(options.productDir);
  if (!readResult.ok) {
    return { exitCode: EXIT_ERROR, output: readResult.error };
  }

  const configRead = readResult.value;
  if (configRead.kind === CONFIG_FILE_READ_KIND.AMBIGUOUS) {
    return { exitCode: EXIT_ERROR, output: formatConfigFileAmbiguityError(configRead.detected) };
  }

  const resolvedConfig = resolveConfigFromReadResult(configRead, [validationConfigDescriptor]);
  if (!resolvedConfig.ok) {
    return { exitCode: EXIT_ERROR, output: resolvedConfig.error };
  }
  const validationConfig = resolvedConfig.value[validationConfigDescriptor.section] as ValidationConfig;

  const detection = await validateLiteralReuse({
    productDir: options.productDir,
    config: validationConfig.literal.values,
    pathConfig: validationPathFilterForTool(
      validationConfig.paths,
      VALIDATION_PATH_TOOL_SUBSECTIONS.LITERAL,
    ),
  });

  const findingValues = collectFindingValues(detection.findings);
  const updatedInclude = computeUpdatedInclude(
    validationConfig.literal.values.include,
    findingValues,
  );

  const target: ConfigFile = configRead.kind === CONFIG_FILE_READ_KIND.OK
    ? configRead.file
    : configFileForFormat(options.productDir, DEFAULT_CONFIG_FILE_FORMAT);

  const serialized = serializeWithUpdatedInclude(target, updatedInclude);
  if (!serialized.ok) {
    return { exitCode: EXIT_ERROR, output: serialized.error };
  }
  await writer.write(target.path, serialized.value);

  return { exitCode: EXIT_OK, output: "" };
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
  const additions = findingValues.filter((value) => !existingSet.has(value)).sort(compareAsciiStrings);
  return [...existingArr, ...additions];
}

function serializeWithUpdatedInclude(target: ConfigFile, include: readonly string[]): Result<string> {
  return serializeConfigFileSectionsWithSetIn(target, ALLOWLIST_INCLUDE_PATH, [...include]);
}
