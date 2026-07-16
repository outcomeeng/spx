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
  configFileForFormat,
  type ConfigFileFormat,
  type ConfigFileReadResult,
  DEFAULT_CONFIG_FILE_FORMAT,
  parseConfigFileSections,
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
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";

const EFFECT_SENTINEL_SUCCESS = "CONFIG_EFFECT_SENTINEL_OK";

type ConfigCliResult = Awaited<ReturnType<typeof showCommand>>;

export type ConfigCliObservation = {
  readonly config?: Config;
  readonly defaultParsed?: ReturnType<typeof parseConfigFileSections>;
  readonly defaults?: ConfigCliResult;
  readonly defaultsAgain?: ConfigCliResult;
  readonly effects?: readonly string[];
  readonly expectedReadResult?: ConfigFileReadResult;
  readonly generatedDefaults?: unknown;
  readonly generatedSection?: string;
  readonly jsonParsed?: ReturnType<typeof parseConfigFileSections>;
  readonly observedProductDir?: string;
  readonly observedReadResult?: ConfigFileReadResult;
  readonly offendingKind?: string;
  readonly optionFlags?: readonly string[];
  readonly productDir?: string;
  readonly result?: ConfigCliResult;
  readonly sentinelResult?: Awaited<ReturnType<typeof execa>>;
  readonly sentinelSuccess?: string;
  readonly show?: ConfigCliResult;
  readonly showAgain?: ConfigCliResult;
  readonly validate?: ConfigCliResult;
  readonly validateAgain?: ConfigCliResult;
};

type ObservationConsumer = (observation: ConfigCliObservation) => void | Promise<void>;

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

export async function forEachConfigHandlerDeterminismObservation(consume: ObservationConsumer): Promise<void> {
  await assertProperty(
    CONFIG_TEST_GENERATOR.configCliDeterminismCase(),
    async (generated) => {
      const deps = configCliPropertyDeps(generated);
      await consume({
        defaults: await defaultsCommand({ json: generated.asJson }, deps),
        defaultsAgain: await defaultsCommand({ json: generated.asJson }, deps),
        show: await showCommand({ json: generated.asJson }, deps),
        showAgain: await showCommand({ json: generated.asJson }, deps),
        validate: await validateCommand({}, deps),
        validateAgain: await validateCommand({}, deps),
      });
    },
    { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
  );
}

export async function withShowProcessEffectsObservation(consume: ObservationConsumer): Promise<void> {
  const deps = configCliDeps({ ok: true, value: configCliDefaults() });
  await consume({
    effects: await observeProcessSideEffects(async () => {
      await showCommand({}, deps);
      await showCommand({ json: true }, deps);
    }),
  });
}

export async function withValidateSuccessProcessEffectsObservation(consume: ObservationConsumer): Promise<void> {
  const deps = configCliDeps({ ok: true, value: configCliDefaults() });
  await consume({ effects: await observeProcessSideEffects(async () => validateCommand({}, deps)) });
}

export async function withValidateRejectionProcessEffectsObservation(consume: ObservationConsumer): Promise<void> {
  const deps = configCliDeps({
    ok: false,
    error: sampleConfigTestValue(CONFIG_TEST_GENERATOR.specTreeUnknownKindError()),
  });
  await consume({ effects: await observeProcessSideEffects(async () => validateCommand({}, deps)) });
}

export async function withDefaultsProcessEffectsObservation(consume: ObservationConsumer): Promise<void> {
  const deps = configCliDeps({ ok: true, value: configCliDefaults() });
  await consume({
    effects: await observeProcessSideEffects(async () => {
      await defaultsCommand({}, deps);
      await defaultsCommand({ json: true }, deps);
    }),
  });
}

export async function withHandlerEffectSentinelObservation(consume: ObservationConsumer): Promise<void> {
  const sentinelPath = join(dirname(fileURLToPath(import.meta.url)), "effect-sentinel.ts");
  const result = await execa(
    NODE_EXECUTABLE,
    ["--no-warnings", "--permission", "--allow-fs-read=*", "--allow-worker", "--import", "tsx", sentinelPath],
    { env: { TSX_DISABLE_CACHE: "1" }, reject: false },
  );
  await consume({ sentinelResult: result, sentinelSuccess: EFFECT_SENTINEL_SUCCESS });
}

export function withConfigCommandOptionsObservation(consume: ObservationConsumer): void {
  const configCommand = createCliProgram({ domains: [configDomain] }).commands
    .find((command) => command.name() === CONFIG_CLI.commandName);
  void consume({
    optionFlags: [configCommand, ...(configCommand?.commands ?? [])]
      .flatMap((command) => command?.options.map((option) => option.long) ?? [])
      .filter((flag): flag is string => flag !== undefined),
  });
}

export async function withConfigHandlerResultsObservation(consume: ObservationConsumer): Promise<void> {
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

export async function withSuccessfulOutputObservation(consume: ObservationConsumer): Promise<void> {
  const defaults = configCliDefaults();
  const deps = configCliDeps({ ok: true, value: defaults });
  const show = await showCommand({}, deps);
  const listedDefaults = await defaultsCommand({}, deps);
  await consume({ defaults: listedDefaults, show });
}

export async function withFailedResolutionOutputObservation(consume: ObservationConsumer): Promise<void> {
  const deps = configCliDeps({
    ok: false,
    error: sampleConfigTestValue(CONFIG_TEST_GENERATOR.specTreeUnknownKindError()),
  });
  const show = await showCommand({}, deps);
  const validate = await validateCommand({}, deps);
  await consume({ show, validate });
}

export async function withSuccessfulValidateOutputObservation(consume: ObservationConsumer): Promise<void> {
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

export async function withDefaultsOutputObservation(consume: ObservationConsumer): Promise<void> {
  const generated = sampleConfigTestValue(CONFIG_TEST_GENERATOR.modeDescriptor());
  const result = await defaultsCommand({}, defaultsOnlyDeps([specTreeConfigDescriptor, generated.descriptor]));
  await consume({
    defaultParsed: parseConfigOutput(DEFAULT_CONFIG_FILE_FORMAT, result.stdout),
    generatedDefaults: generated.defaults,
    generatedSection: generated.section,
    result,
  });
}

export async function withDefaultsIndependenceObservation(consume: ObservationConsumer): Promise<void> {
  const result = await defaultsCommand({}, defaultsOnlyDeps([specTreeConfigDescriptor]));
  await consume({ defaultParsed: parseConfigOutput(DEFAULT_CONFIG_FILE_FORMAT, result.stdout), result });
}

export async function withDefaultsJsonObservation(consume: ObservationConsumer): Promise<void> {
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

export async function withDefaultsFormatEquivalenceObservation(consume: ObservationConsumer): Promise<void> {
  const generated = sampleConfigTestValue(CONFIG_TEST_GENERATOR.modeDescriptor());
  const deps = defaultsOnlyDeps([specTreeConfigDescriptor, generated.descriptor]);
  await consume({
    defaultParsed: parseConfigOutput(DEFAULT_CONFIG_FILE_FORMAT, (await defaultsCommand({}, deps)).stdout),
    jsonParsed: parseConfigOutput(CONFIG_FILE_FORMAT.JSON, (await defaultsCommand({ json: true }, deps)).stdout),
  });
}

export async function withDefaultsRegistryObservation(consume: ObservationConsumer): Promise<void> {
  const generated = sampleConfigTestValue(CONFIG_TEST_GENERATOR.modeDescriptor());
  const result = await defaultsCommand({}, defaultsOnlyDeps([specTreeConfigDescriptor, generated.descriptor]));
  await consume({
    defaultParsed: parseConfigOutput(DEFAULT_CONFIG_FILE_FORMAT, result.stdout),
    generatedSection: generated.section,
  });
}

export async function withShowDefaultConfigObservation(consume: ObservationConsumer): Promise<void> {
  const config = configCliDefaults();
  const result = await showCommand({}, configCliDeps({ ok: true, value: config }));
  await consume({ config, defaultParsed: parseConfigOutput(DEFAULT_CONFIG_FILE_FORMAT, result.stdout), result });
}

export async function withShowOverrideObservation(consume: ObservationConsumer): Promise<void> {
  const config = configSubset();
  const result = await showCommand({}, configCliDeps({ ok: true, value: config }));
  await consume({ config, defaultParsed: parseConfigOutput(DEFAULT_CONFIG_FILE_FORMAT, result.stdout), result });
}

export async function withShowJsonConfigObservation(consume: ObservationConsumer): Promise<void> {
  const config = configCliDefaults();
  const result = await showCommand({ json: true }, configCliDeps({ ok: true, value: config }));
  await consume({ config, jsonParsed: parseConfigOutput(CONFIG_FILE_FORMAT.JSON, result.stdout), result });
}

export async function withShowFormatEquivalenceObservation(consume: ObservationConsumer): Promise<void> {
  const deps = configCliDeps({ ok: true, value: configSubset() });
  const defaultResult = await showCommand({}, deps);
  const jsonResult = await showCommand({ json: true }, deps);
  await consume({
    defaultParsed: parseConfigOutput(DEFAULT_CONFIG_FILE_FORMAT, defaultResult.stdout),
    jsonParsed: parseConfigOutput(CONFIG_FILE_FORMAT.JSON, jsonResult.stdout),
  });
}

export async function withShowResolutionFailureObservation(consume: ObservationConsumer): Promise<void> {
  const result = await showCommand(
    {},
    configCliDeps({
      ok: false,
      error: sampleConfigTestValue(CONFIG_TEST_GENERATOR.specTreeUnknownKindError()),
    }),
  );
  await consume({ result });
}

export async function withValidateDefaultsSuccessObservation(consume: ObservationConsumer): Promise<void> {
  const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
  const result = await validateCommand(
    {},
    configCliDeps({ ok: true, value: configCliDefaults() }, { productDir }),
  );
  await consume({ productDir, result });
}

export async function withValidatePresentConfigObservation(consume: ObservationConsumer): Promise<void> {
  const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
  const fileResult: Result<ConfigFileReadResult> = {
    ok: true,
    value: {
      kind: "ok",
      file: configFileForFormat(productDir, CONFIG_FILE_FORMAT.TOML),
    },
  };
  const result = await validateCommand(
    {},
    configCliDeps({ ok: true, value: configCliDefaults() }, { productDir, readResult: fileResult }),
  );
  await consume({ result });
}

export async function withValidateResolutionErrorObservation(consume: ObservationConsumer): Promise<void> {
  const result = await validateCommand(
    {},
    configCliDeps({
      ok: false,
      error: sampleConfigTestValue(CONFIG_TEST_GENERATOR.specTreeUnknownKindError()),
    }),
  );
  await consume({ result });
}

export async function withValidateDescriptorErrorObservation(consume: ObservationConsumer): Promise<void> {
  const generated = sampleConfigTestValue(CONFIG_TEST_GENERATOR.invalidSpecTreeConfig());
  const result = await validateCommand({}, configCliDeps({ ok: false, error: generated.error }));
  await consume({ offendingKind: generated.offendingKind, result });
}

export async function withValidateRejectionCodeObservation(consume: ObservationConsumer): Promise<void> {
  const result = await validateCommand(
    {},
    configCliDeps({
      ok: false,
      error: sampleConfigTestValue(CONFIG_TEST_GENERATOR.specTreeUnknownKindError()),
    }),
  );
  await consume({ result });
}

export async function withValidateProductDirectoryObservation(consume: ObservationConsumer): Promise<void> {
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

export async function withValidateReadResultObservation(consume: ObservationConsumer): Promise<void> {
  const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
  const fileResult: Result<ConfigFileReadResult> = {
    ok: true,
    value: {
      kind: "ok",
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
