import { execa } from "execa";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { defaultsCommand } from "@/commands/config/defaults";
import { showCommand } from "@/commands/config/show";
import type { CliDeps } from "@/commands/config/types";
import { validateCommand } from "@/commands/config/validate";
import {
  absentConfigFileReadResult,
  CONFIG_FILE_FORMAT,
  CONFIG_FILE_READ_KIND,
  configFileForFormat,
  type ConfigFileFormat,
  type ConfigFileReadResult,
  DEFAULT_CONFIG_FILE_FORMAT,
  parseConfigFileSections,
  readProductConfigFile,
  resolveConfig,
  resolveConfigFromReadResult,
} from "@/config/index";
import type { Config, ConfigDescriptor, Result } from "@/config/types";
import { CONFIG_CLI, configDomain } from "@/interfaces/cli/config";
import { createCliProgram } from "@/interfaces/cli/program";
import { specTreeConfigDescriptor } from "@/lib/spec-tree";
import {
  CONFIG_TEST_GENERATOR,
  type GeneratedConfigCliDeterminismCase,
  sampleConfigTestValue,
} from "@testing/generators/config/descriptors";
import { NODE_EXECUTABLE } from "@testing/harnesses/constants";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

export const CONFIG_EFFECT_SENTINEL_PROBE_EFFECTS = [
  "node:fs/promises.writeFile",
  "node:child_process.spawnSync",
] as const;

export type ConfigEffectSentinelObservation = {
  readonly changedEnvironmentKeys: readonly string[];
  readonly cwdAfter: string;
  readonly cwdBefore: string;
  readonly handlerAttemptedEffects: readonly string[];
  readonly handlerErrors: readonly string[];
  readonly probeAttemptedEffects: readonly string[];
};

type ConfigCliResult = Awaited<ReturnType<typeof showCommand>>;
type ConfigParseResult = ReturnType<typeof parseConfigFileSections>;
type ObservationConsumer<T> = (observation: T) => void | Promise<void>;
type SyncObservationConsumer<T> = (observation: T) => void;
type ResultObservation = { readonly result: ConfigCliResult };
type ProcessEffectsObservation = { readonly effects: readonly string[] };
type ParsedFormatsObservation = {
  readonly defaultParsed: ConfigParseResult;
  readonly jsonParsed: ConfigParseResult;
};

type ProcessOverrides = {
  restore: () => void;
  tripped: readonly string[];
};

type ConfigCliDepsOverrides = {
  readonly descriptors?: readonly ConfigDescriptor<unknown>[];
  readonly productDir?: string;
  readonly readResult?: Result<ConfigFileReadResult>;
};

function trapProcessSideEffects(): ProcessOverrides {
  const tripped: string[] = [];
  const originals = {
    exit: process.exit,
    chdir: process.chdir,
    stdoutWrite: process.stdout.write.bind(process.stdout),
    stderrWrite: process.stderr.write.bind(process.stderr),
  };

  process.exit = (code?: number) => {
    tripped.push(`process.exit(${code ?? ""})`);
    throw new Error(`process.exit(${code ?? ""}) called by handler`);
  };
  process.chdir = (directory: string) => {
    tripped.push(`process.chdir(${directory})`);
    throw new Error(`process.chdir(${directory}) called by handler`);
  };
  process.stdout.write = (..._args: readonly unknown[]) => {
    tripped.push("process.stdout.write");
    throw new Error("process.stdout.write called by handler");
  };
  process.stderr.write = (..._args: readonly unknown[]) => {
    tripped.push("process.stderr.write");
    throw new Error("process.stderr.write called by handler");
  };

  return {
    tripped,
    restore: () => {
      process.exit = originals.exit;
      process.chdir = originals.chdir;
      process.stdout.write = originals.stdoutWrite;
      process.stderr.write = originals.stderrWrite;
    },
  };
}

async function observeProcessSideEffects(operation: () => Promise<unknown>): Promise<readonly string[]> {
  const traps = trapProcessSideEffects();
  try {
    await operation();
  } finally {
    traps.restore();
  }
  return traps.tripped;
}

function configCliPropertyDeps(generated: GeneratedConfigCliDeterminismCase): CliDeps {
  const descriptors = generated.includeDescriptor ? [specTreeConfigDescriptor] : [];
  const defaults = resolveConfigFromReadResult(absentConfigFileReadResult().value, descriptors);
  const resolved: Result<Config> = generated.resolutionError === undefined
    ? defaults
    : { ok: false, error: generated.resolutionError };
  const readResult: Result<ConfigFileReadResult> = generated.readError === undefined
    ? absentConfigFileReadResult()
    : { ok: false, error: generated.readError };

  return configCliDeps(resolved, {
    descriptors,
    productDir: generated.productDir,
    readResult,
  });
}

export function configCliDeps(resolved: Result<Config>, overrides: ConfigCliDepsOverrides = {}): CliDeps {
  const productDir = overrides.productDir ?? sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
  return {
    resolveConfig: async () => resolved,
    readProductConfigFile: async () => overrides.readResult ?? absentConfigFileReadResult(),
    resolveConfigFromReadResult: () => resolved,
    resolveProductDir: () => productDir,
    descriptors: overrides.descriptors ?? [specTreeConfigDescriptor],
  };
}

export function configCliDefaults(): Config {
  const resolved = resolveConfigFromReadResult(absentConfigFileReadResult().value, [specTreeConfigDescriptor]);
  if (!resolved.ok) {
    throw new Error(resolved.error);
  }
  return resolved.value;
}

export async function observeConfigHandlerDeterminism(
  generated: GeneratedConfigCliDeterminismCase,
): Promise<{
  readonly defaults: ConfigCliResult;
  readonly defaultsAgain: ConfigCliResult;
  readonly show: ConfigCliResult;
  readonly showAgain: ConfigCliResult;
  readonly validate: ConfigCliResult;
  readonly validateAgain: ConfigCliResult;
}> {
  const deps = configCliPropertyDeps(generated);
  return {
    defaults: await defaultsCommand({ json: generated.asJson }, deps),
    defaultsAgain: await defaultsCommand({ json: generated.asJson }, deps),
    show: await showCommand({ json: generated.asJson }, deps),
    showAgain: await showCommand({ json: generated.asJson }, deps),
    validate: await validateCommand({}, deps),
    validateAgain: await validateCommand({}, deps),
  };
}

export async function withShowProcessEffectsObservation(
  consume: ObservationConsumer<ProcessEffectsObservation>,
): Promise<void> {
  const deps = configCliDeps({ ok: true, value: configCliDefaults() });
  await consume({
    effects: await observeProcessSideEffects(async () => {
      await showCommand({}, deps);
      await showCommand({ json: true }, deps);
    }),
  });
}

export async function withValidateSuccessProcessEffectsObservation(
  consume: ObservationConsumer<ProcessEffectsObservation>,
): Promise<void> {
  const deps = configCliDeps({ ok: true, value: configCliDefaults() });
  await consume({ effects: await observeProcessSideEffects(async () => validateCommand({}, deps)) });
}

export async function withValidateRejectionProcessEffectsObservation(
  consume: ObservationConsumer<ProcessEffectsObservation>,
): Promise<void> {
  const deps = configCliDeps({
    ok: false,
    error: sampleConfigTestValue(CONFIG_TEST_GENERATOR.specTreeUnknownKindError()),
  });
  await consume({ effects: await observeProcessSideEffects(async () => validateCommand({}, deps)) });
}

export async function withDefaultsProcessEffectsObservation(
  consume: ObservationConsumer<ProcessEffectsObservation>,
): Promise<void> {
  const deps = configCliDeps({ ok: true, value: configCliDefaults() });
  await consume({
    effects: await observeProcessSideEffects(async () => {
      await defaultsCommand({}, deps);
      await defaultsCommand({ json: true }, deps);
    }),
  });
}

export async function withHandlerEffectSentinelObservation(
  consume: ObservationConsumer<{
    readonly observation: ConfigEffectSentinelObservation;
    readonly sentinelResult: Awaited<ReturnType<typeof execa>>;
  }>,
): Promise<void> {
  const sentinelPath = join(dirname(fileURLToPath(import.meta.url)), "effect-sentinel.ts");
  const result = await execa(
    NODE_EXECUTABLE,
    ["--no-warnings", "--permission", "--allow-fs-read=*", "--allow-worker", "--import", "tsx", sentinelPath],
    { env: { TSX_DISABLE_CACHE: "1" }, reject: false },
  );
  await consume({
    observation: JSON.parse(result.stdout) as ConfigEffectSentinelObservation,
    sentinelResult: result,
  });
}

export function withConfigCommandOptionsObservation(
  consume: SyncObservationConsumer<{ readonly optionFlags: readonly string[] }>,
): void {
  const configCommand = createCliProgram({ domains: [configDomain] }).commands
    .find((command) => command.name() === CONFIG_CLI.commandName);
  consume({
    optionFlags: [configCommand, ...(configCommand?.commands ?? [])]
      .flatMap((command) => command?.options.map((option) => option.long) ?? [])
      .filter((flag): flag is string => flag !== undefined),
  });
}

export async function withConfigHandlerResultsObservation(
  consume: ObservationConsumer<{
    readonly defaults: ConfigCliResult;
    readonly show: ConfigCliResult;
    readonly showAgain: ConfigCliResult;
    readonly validate: ConfigCliResult;
    readonly validateAgain: ConfigCliResult;
  }>,
): Promise<void> {
  const okDeps = configCliDeps({ ok: true, value: configCliDefaults() });
  const failDeps = configCliDeps({
    ok: false,
    error: sampleConfigTestValue(CONFIG_TEST_GENERATOR.specTreeUnknownKindError()),
  });

  await consume({
    defaults: await defaultsCommand({}, okDeps),
    show: await showCommand({}, okDeps),
    showAgain: await showCommand({}, failDeps),
    validate: await validateCommand({}, okDeps),
    validateAgain: await validateCommand({}, failDeps),
  });
}

export async function withSuccessfulOutputObservation(
  consume: ObservationConsumer<{ readonly defaults: ConfigCliResult; readonly show: ConfigCliResult }>,
): Promise<void> {
  const defaults = configCliDefaults();
  const deps = configCliDeps({ ok: true, value: defaults });
  const show = await showCommand({}, deps);
  const listedDefaults = await defaultsCommand({}, deps);
  await consume({ defaults: listedDefaults, show });
}

export async function withFailedResolutionOutputObservation(
  consume: ObservationConsumer<{ readonly show: ConfigCliResult; readonly validate: ConfigCliResult }>,
): Promise<void> {
  const deps = configCliDeps({
    ok: false,
    error: sampleConfigTestValue(CONFIG_TEST_GENERATOR.specTreeUnknownKindError()),
  });
  const show = await showCommand({}, deps);
  const validate = await validateCommand({}, deps);
  await consume({ show, validate });
}

export async function withSuccessfulValidateOutputObservation(
  consume: ObservationConsumer<ResultObservation & { readonly productDir: string }>,
): Promise<void> {
  const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
  const result = await validateCommand(
    {},
    configCliDeps({ ok: true, value: configCliDefaults() }, { productDir }),
  );
  await consume({ productDir, result });
}

function parseConfigOutput(format: ConfigFileFormat, raw: string): ReturnType<typeof parseConfigFileSections> {
  return parseConfigFileSections(
    configFileForFormat(sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir()), format, raw),
  );
}

function configSubset(): Config {
  return sampleConfigTestValue(CONFIG_TEST_GENERATOR.specTreeSubsetConfig());
}

function defaultsOnlyDeps(descriptors: readonly ConfigDescriptor<unknown>[]): CliDeps {
  return {
    resolveConfig: async () => {
      throw new Error("defaultsCommand must not call resolveConfig");
    },
    readProductConfigFile: async () => {
      throw new Error("defaultsCommand must not call readProductConfigFile");
    },
    resolveConfigFromReadResult: () => {
      throw new Error("defaultsCommand must not call resolveConfigFromReadResult");
    },
    resolveProductDir: () => sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir()),
    descriptors,
  };
}

export async function withDefaultsOutputObservation(
  consume: ObservationConsumer<
    ResultObservation & {
      readonly defaultParsed: ConfigParseResult;
      readonly generatedDefaults: unknown;
      readonly generatedSection: string;
    }
  >,
): Promise<void> {
  const generated = sampleConfigTestValue(CONFIG_TEST_GENERATOR.modeDescriptor());
  const result = await defaultsCommand({}, defaultsOnlyDeps([specTreeConfigDescriptor, generated.descriptor]));
  await consume({
    defaultParsed: parseConfigOutput(DEFAULT_CONFIG_FILE_FORMAT, result.stdout),
    generatedDefaults: generated.defaults,
    generatedSection: generated.section,
    result,
  });
}

export async function withDefaultsIndependenceObservation(
  consume: ObservationConsumer<ResultObservation & { readonly defaultParsed: ConfigParseResult }>,
): Promise<void> {
  const result = await defaultsCommand({}, defaultsOnlyDeps([specTreeConfigDescriptor]));
  await consume({ defaultParsed: parseConfigOutput(DEFAULT_CONFIG_FILE_FORMAT, result.stdout), result });
}

export async function withDefaultsJsonObservation(
  consume: ObservationConsumer<
    ResultObservation & {
      readonly generatedDefaults: unknown;
      readonly generatedSection: string;
      readonly jsonParsed: ConfigParseResult;
    }
  >,
): Promise<void> {
  const generated = sampleConfigTestValue(CONFIG_TEST_GENERATOR.modeDescriptor());
  const result = await defaultsCommand(
    { json: true },
    defaultsOnlyDeps([specTreeConfigDescriptor, generated.descriptor]),
  );
  await consume({
    generatedDefaults: generated.defaults,
    generatedSection: generated.section,
    jsonParsed: parseConfigOutput(CONFIG_FILE_FORMAT.JSON, result.stdout),
    result,
  });
}

export async function withDefaultsFormatEquivalenceObservation(
  consume: ObservationConsumer<ParsedFormatsObservation>,
): Promise<void> {
  const generated = sampleConfigTestValue(CONFIG_TEST_GENERATOR.modeDescriptor());
  const deps = defaultsOnlyDeps([specTreeConfigDescriptor, generated.descriptor]);
  await consume({
    defaultParsed: parseConfigOutput(DEFAULT_CONFIG_FILE_FORMAT, (await defaultsCommand({}, deps)).stdout),
    jsonParsed: parseConfigOutput(CONFIG_FILE_FORMAT.JSON, (await defaultsCommand({ json: true }, deps)).stdout),
  });
}

export async function withDefaultsRegistryObservation(
  consume: ObservationConsumer<{ readonly defaultParsed: ConfigParseResult; readonly generatedSection: string }>,
): Promise<void> {
  const generated = sampleConfigTestValue(CONFIG_TEST_GENERATOR.modeDescriptor());
  const result = await defaultsCommand({}, defaultsOnlyDeps([specTreeConfigDescriptor, generated.descriptor]));
  await consume({
    defaultParsed: parseConfigOutput(DEFAULT_CONFIG_FILE_FORMAT, result.stdout),
    generatedSection: generated.section,
  });
}

export async function withShowDefaultConfigObservation(
  consume: ObservationConsumer<
    ResultObservation & { readonly config: Config; readonly defaultParsed: ConfigParseResult }
  >,
): Promise<void> {
  const config = configCliDefaults();
  const result = await showCommand({}, configCliDeps({ ok: true, value: config }));
  await consume({ config, defaultParsed: parseConfigOutput(DEFAULT_CONFIG_FILE_FORMAT, result.stdout), result });
}

export async function withShowOverrideObservation(
  consume: ObservationConsumer<
    ResultObservation & { readonly config: Config; readonly defaultParsed: ConfigParseResult }
  >,
): Promise<void> {
  const config = configSubset();
  await withTestEnv(config, async ({ productDir }) => {
    const deps: CliDeps = {
      resolveConfig: (resolvedProductDir) => resolveConfig(resolvedProductDir, [specTreeConfigDescriptor]),
      readProductConfigFile,
      resolveConfigFromReadResult,
      resolveProductDir: () => productDir,
      descriptors: [specTreeConfigDescriptor],
    };
    const result = await showCommand({}, deps);
    await consume({ config, defaultParsed: parseConfigOutput(DEFAULT_CONFIG_FILE_FORMAT, result.stdout), result });
  });
}

export async function withShowJsonConfigObservation(
  consume: ObservationConsumer<ResultObservation & { readonly config: Config; readonly jsonParsed: ConfigParseResult }>,
): Promise<void> {
  const config = configCliDefaults();
  const result = await showCommand({ json: true }, configCliDeps({ ok: true, value: config }));
  await consume({ config, jsonParsed: parseConfigOutput(CONFIG_FILE_FORMAT.JSON, result.stdout), result });
}

export async function withShowFormatEquivalenceObservation(
  consume: ObservationConsumer<ParsedFormatsObservation>,
): Promise<void> {
  const deps = configCliDeps({ ok: true, value: configSubset() });
  const defaultResult = await showCommand({}, deps);
  const jsonResult = await showCommand({ json: true }, deps);
  await consume({
    defaultParsed: parseConfigOutput(DEFAULT_CONFIG_FILE_FORMAT, defaultResult.stdout),
    jsonParsed: parseConfigOutput(CONFIG_FILE_FORMAT.JSON, jsonResult.stdout),
  });
}

export async function withShowResolutionFailureObservation(
  consume: ObservationConsumer<ResultObservation>,
): Promise<void> {
  const result = await showCommand(
    {},
    configCliDeps({
      ok: false,
      error: sampleConfigTestValue(CONFIG_TEST_GENERATOR.specTreeUnknownKindError()),
    }),
  );
  await consume({ result });
}

export async function withValidateDefaultsSuccessObservation(
  consume: ObservationConsumer<ResultObservation & { readonly productDir: string }>,
): Promise<void> {
  const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
  const result = await validateCommand(
    {},
    configCliDeps({ ok: true, value: configCliDefaults() }, { productDir }),
  );
  await consume({ productDir, result });
}

export async function withValidatePresentConfigObservation(
  consume: ObservationConsumer<ResultObservation>,
): Promise<void> {
  const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
  const fileResult: Result<ConfigFileReadResult> = {
    ok: true,
    value: {
      kind: CONFIG_FILE_READ_KIND.OK,
      file: configFileForFormat(productDir, CONFIG_FILE_FORMAT.TOML),
    },
  };
  const result = await validateCommand(
    {},
    configCliDeps({ ok: true, value: configCliDefaults() }, { productDir, readResult: fileResult }),
  );
  await consume({ result });
}

export async function withValidateResolutionErrorObservation(
  consume: ObservationConsumer<ResultObservation>,
): Promise<void> {
  const result = await validateCommand(
    {},
    configCliDeps({
      ok: false,
      error: sampleConfigTestValue(CONFIG_TEST_GENERATOR.specTreeUnknownKindError()),
    }),
  );
  await consume({ result });
}

export async function withValidateDescriptorErrorObservation(
  consume: ObservationConsumer<ResultObservation & { readonly offendingKind: string }>,
): Promise<void> {
  const generated = sampleConfigTestValue(CONFIG_TEST_GENERATOR.invalidSpecTreeConfig());
  const result = await validateCommand({}, configCliDeps({ ok: false, error: generated.error }));
  await consume({ offendingKind: generated.offendingKind, result });
}

export async function withValidateRejectionCodeObservation(
  consume: ObservationConsumer<ResultObservation>,
): Promise<void> {
  const result = await validateCommand(
    {},
    configCliDeps({
      ok: false,
      error: sampleConfigTestValue(CONFIG_TEST_GENERATOR.specTreeUnknownKindError()),
    }),
  );
  await consume({ result });
}

export async function withValidateProductDirectoryObservation(
  consume: ObservationConsumer<{
    readonly observedProductDir: string | undefined;
    readonly productDir: string;
  }>,
): Promise<void> {
  const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
  let observedProductDir: string | undefined;
  const deps: CliDeps = {
    resolveConfig: async () => {
      throw new Error(sampleConfigTestValue(CONFIG_TEST_GENERATOR.scalar()));
    },
    readProductConfigFile: async (resolvedProductDir) => {
      observedProductDir = resolvedProductDir;
      return absentConfigFileReadResult();
    },
    resolveConfigFromReadResult: () => ({ ok: true, value: configCliDefaults() }),
    resolveProductDir: () => productDir,
    descriptors: [specTreeConfigDescriptor],
  };
  await validateCommand({}, deps);
  await consume({ observedProductDir, productDir });
}

export async function withValidateReadResultObservation(
  consume: ObservationConsumer<{
    readonly expectedReadResult: ConfigFileReadResult;
    readonly observedReadResult: ConfigFileReadResult | undefined;
    readonly result: ConfigCliResult;
  }>,
): Promise<void> {
  const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
  const fileResult: Result<ConfigFileReadResult> = {
    ok: true,
    value: {
      kind: CONFIG_FILE_READ_KIND.OK,
      file: configFileForFormat(productDir, CONFIG_FILE_FORMAT.JSON),
    },
  };
  let observedReadResult: ConfigFileReadResult | undefined;
  const deps: CliDeps = {
    resolveConfig: async () => {
      throw new Error(sampleConfigTestValue(CONFIG_TEST_GENERATOR.scalar()));
    },
    readProductConfigFile: async () => fileResult,
    resolveConfigFromReadResult: (readResult, descriptors) => {
      observedReadResult = readResult;
      return resolveConfigFromReadResult(readResult, descriptors);
    },
    resolveProductDir: () => productDir,
    descriptors: [specTreeConfigDescriptor],
  };
  const result = await validateCommand({}, deps);
  await consume({ expectedReadResult: fileResult.value, observedReadResult, result });
}
