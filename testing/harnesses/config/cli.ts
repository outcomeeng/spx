import { execa } from "execa";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect } from "vitest";

import { defaultsCommand } from "@/commands/config/defaults";
import { showCommand } from "@/commands/config/show";
import type { CliDeps } from "@/commands/config/types";
import { validateCommand } from "@/commands/config/validate";
import { absentConfigFileReadResult, type ConfigFileReadResult, resolveConfigFromReadResult } from "@/config/index";
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

export async function assertConfigHandlersDeterministic(): Promise<void> {
  await assertProperty(
    CONFIG_TEST_GENERATOR.configCliDeterminismCase(),
    async (generated) => {
      const deps = configCliPropertyDeps(generated);
      expect(await showCommand({ json: generated.asJson }, deps)).toEqual(
        await showCommand({ json: generated.asJson }, deps),
      );
      expect(await validateCommand({}, deps)).toEqual(await validateCommand({}, deps));
      expect(await defaultsCommand({ json: generated.asJson }, deps)).toEqual(
        await defaultsCommand({ json: generated.asJson }, deps),
      );
    },
    { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
  );
}

export async function assertShowHasNoDirectProcessEffects(): Promise<void> {
  const deps = configCliDeps({ ok: true, value: configCliDefaults() });
  expect(
    await observeProcessSideEffects(async () => {
      await showCommand({}, deps);
      await showCommand({ json: true }, deps);
    }),
  ).toEqual([]);
}

export async function assertValidateSuccessHasNoDirectProcessEffects(): Promise<void> {
  const deps = configCliDeps({ ok: true, value: configCliDefaults() });
  expect(await observeProcessSideEffects(async () => validateCommand({}, deps))).toEqual([]);
}

export async function assertValidateRejectionHasNoDirectProcessEffects(): Promise<void> {
  const deps = configCliDeps({
    ok: false,
    error: sampleConfigTestValue(CONFIG_TEST_GENERATOR.specTreeUnknownKindError()),
  });
  expect(await observeProcessSideEffects(async () => validateCommand({}, deps))).toEqual([]);
}

export async function assertDefaultsHasNoDirectProcessEffects(): Promise<void> {
  const deps = configCliDeps({ ok: true, value: configCliDefaults() });
  expect(
    await observeProcessSideEffects(async () => {
      await defaultsCommand({}, deps);
      await defaultsCommand({ json: true }, deps);
    }),
  ).toEqual([]);
}

export async function assertHandlersCannotWriteFilesOrSpawnAndPreserveEnvironment(): Promise<void> {
  const sentinelPath = join(dirname(fileURLToPath(import.meta.url)), "effect-sentinel.ts");
  const result = await execa(
    NODE_EXECUTABLE,
    ["--no-warnings", "--permission", "--allow-fs-read=*", "--allow-worker", "--import", "tsx", sentinelPath],
    { env: { TSX_DISABLE_CACHE: "1" }, reject: false },
  );
  expect(result.exitCode).toBe(0);
  expect(result.stderr).toHaveLength(0);
  expect(result.stdout).toBe(EFFECT_SENTINEL_SUCCESS);
}

export function assertConfigCommandsExposePresentationOptionsOnly(): void {
  const configCommand = createCliProgram({ domains: [configDomain] }).commands
    .find((command) => command.name() === CONFIG_CLI.commandName);
  expect(configCommand).toBeDefined();
  expect(
    [configCommand, ...(configCommand?.commands ?? [])]
      .flatMap((command) => command?.options.map((option) => option.long) ?? []),
  ).toEqual([CONFIG_CLI.flags.json, CONFIG_CLI.flags.json]);
}

export async function assertConfigHandlersResolveResults(): Promise<void> {
  const okDeps = configCliDeps({ ok: true, value: configCliDefaults() });
  const failDeps = configCliDeps({
    ok: false,
    error: sampleConfigTestValue(CONFIG_TEST_GENERATOR.specTreeUnknownKindError()),
  });

  await expect(showCommand({}, okDeps)).resolves.toMatchObject({ exitCode: 0 });
  await expect(showCommand({}, failDeps)).resolves.toMatchObject({ exitCode: expect.any(Number) });
  await expect(validateCommand({}, okDeps)).resolves.toMatchObject({ exitCode: 0 });
  await expect(validateCommand({}, failDeps)).resolves.toMatchObject({ exitCode: expect.any(Number) });
  await expect(defaultsCommand({}, okDeps)).resolves.toMatchObject({ exitCode: 0 });
}

export async function assertSuccessfulShowAndDefaultsUseStdout(): Promise<void> {
  const deps = configCliDeps({ ok: true, value: configCliDefaults() });
  const show = await showCommand({}, deps);
  const defaults = await defaultsCommand({}, deps);
  expect(show.stdout.length).toBeGreaterThan(0);
  expect(show.stderr).toHaveLength(0);
  expect(defaults.stdout.length).toBeGreaterThan(0);
  expect(defaults.stderr).toHaveLength(0);
}

export async function assertFailedResolutionUsesStderr(): Promise<void> {
  const deps = configCliDeps({
    ok: false,
    error: sampleConfigTestValue(CONFIG_TEST_GENERATOR.specTreeUnknownKindError()),
  });
  const show = await showCommand({}, deps);
  const validate = await validateCommand({}, deps);
  expect(show.stdout).toHaveLength(0);
  expect(show.stderr.length).toBeGreaterThan(0);
  expect(validate.stdout).toHaveLength(0);
  expect(validate.stderr.length).toBeGreaterThan(0);
}

export async function assertSuccessfulValidateUsesStdout(): Promise<void> {
  const result = await validateCommand({}, configCliDeps({ ok: true, value: configCliDefaults() }));
  expect(result.stdout.length).toBeGreaterThan(0);
  expect(result.stderr).toHaveLength(0);
}
