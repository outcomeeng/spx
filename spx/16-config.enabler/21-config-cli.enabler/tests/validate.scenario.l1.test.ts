import { describe, expect, it } from "vitest";

import { validateCommand } from "@/commands/config/validate";
import {
  CONFIG_FILE_FORMAT,
  CONFIG_FILENAMES,
  configFileForFormat,
  type ConfigFileReadResult,
  DEFAULT_CONFIG_FILENAME,
  resolveConfigFromReadResult,
} from "@/config/index";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@/config/testing";
import type { Config, ConfigDescriptor, Result } from "@/config/types";
import { specTreeConfigDescriptor } from "@/lib/spec-tree/config";

type CliDeps = {
  resolveConfig: (projectRoot: string) => Promise<Result<Config>>;
  readProjectConfigFile: (projectRoot: string) => Promise<Result<ConfigFileReadResult>>;
  resolveConfigFromReadResult: (
    readResult: ConfigFileReadResult,
    descriptors: readonly ConfigDescriptor<unknown>[],
  ) => Result<Config>;
  resolveProjectRoot: () => string;
  descriptors: readonly ConfigDescriptor<unknown>[];
};

function makeDeps(
  resolved: Result<Config>,
  projectRoot = sampleConfigTestValue(CONFIG_TEST_GENERATOR.projectRoot()),
  fileResult: Result<ConfigFileReadResult> = sampleConfigTestValue(CONFIG_TEST_GENERATOR.absentConfigFileReadResult()),
): CliDeps {
  return {
    resolveConfig: async () => {
      throw new Error(sampleConfigTestValue(CONFIG_TEST_GENERATOR.scalar()));
    },
    readProjectConfigFile: async () => fileResult,
    resolveConfigFromReadResult: () => resolved,
    resolveProjectRoot: () => projectRoot,
    descriptors: [specTreeConfigDescriptor],
  };
}

function defaultsConfig(): Config {
  return sampleConfigTestValue(CONFIG_TEST_GENERATOR.specTreeDefaultsConfig());
}

describe("validateCommand — success path", () => {
  it("exits 0 and emits a success line to stdout when resolution succeeds", async () => {
    const deps = makeDeps({ ok: true, value: defaultsConfig() });

    const result = await validateCommand({}, deps);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.length).toBeGreaterThan(0);
    expect(result.stderr).toHaveLength(0);
  });

  it("the success line names the validated file", async () => {
    const deps = makeDeps({ ok: true, value: defaultsConfig() });

    const result = await validateCommand({}, deps);

    expect(result.stdout).toContain(DEFAULT_CONFIG_FILENAME);
  });

  it("the success line names the present config file when the project uses a non-default format", async () => {
    const projectRoot = sampleConfigTestValue(CONFIG_TEST_GENERATOR.projectRoot());
    const fileResult: Result<ConfigFileReadResult> = {
      ok: true,
      value: {
        kind: "ok",
        file: configFileForFormat(projectRoot, CONFIG_FILE_FORMAT.TOML),
      },
    };
    const deps = makeDeps({ ok: true, value: defaultsConfig() }, projectRoot, fileResult);

    const result = await validateCommand({}, deps);

    expect(result.stdout).toContain(CONFIG_FILENAMES.toml);
  });
});

describe("validateCommand — rejection path", () => {
  it("exits non-zero when resolution returns an error", async () => {
    const deps = makeDeps({
      ok: false,
      error: sampleConfigTestValue(CONFIG_TEST_GENERATOR.specTreeUnknownKindError()),
    });

    const result = await validateCommand({}, deps);

    expect(result.exitCode).not.toBe(0);
  });

  it("routes the error to stderr with descriptor-qualified context", async () => {
    const generated = sampleConfigTestValue(CONFIG_TEST_GENERATOR.invalidSpecTreeConfig());
    const deps = makeDeps({
      ok: false,
      error: generated.error,
    });

    const result = await validateCommand({}, deps);

    expect(result.stderr).toMatch(/specTree/);
    expect(result.stderr).toContain(generated.offendingKind);
    expect(result.stdout).toHaveLength(0);
  });

  it("exit code on rejection is exactly 1", async () => {
    const deps = makeDeps({ ok: false, error: "anySection: bad" });

    const result = await validateCommand({}, deps);

    expect(result.exitCode).toBe(1);
  });
});

describe("validateCommand — mapping contract", () => {
  it("resolves the projectRoot through deps before reading the config file", async () => {
    let observedRoot: string | undefined;
    const projectRoot = sampleConfigTestValue(CONFIG_TEST_GENERATOR.projectRoot());
    const deps: CliDeps = {
      resolveConfig: async () => {
        throw new Error(sampleConfigTestValue(CONFIG_TEST_GENERATOR.scalar()));
      },
      readProjectConfigFile: async (root) => {
        observedRoot = root;
        return sampleConfigTestValue(CONFIG_TEST_GENERATOR.absentConfigFileReadResult());
      },
      resolveConfigFromReadResult: () => ({ ok: true, value: defaultsConfig() }),
      resolveProjectRoot: () => projectRoot,
      descriptors: [specTreeConfigDescriptor],
    };

    await validateCommand({}, deps);

    expect(observedRoot).toBe(projectRoot);
  });

  it("validates the same config-file read result that supplies the success filename", async () => {
    const projectRoot = sampleConfigTestValue(CONFIG_TEST_GENERATOR.projectRoot());
    const fileResult: Result<ConfigFileReadResult> = {
      ok: true,
      value: {
        kind: "ok",
        file: configFileForFormat(projectRoot, CONFIG_FILE_FORMAT.JSON),
      },
    };
    let observedReadResult: ConfigFileReadResult | undefined;
    const deps: CliDeps = {
      resolveConfig: async () => {
        throw new Error(sampleConfigTestValue(CONFIG_TEST_GENERATOR.scalar()));
      },
      readProjectConfigFile: async () => fileResult,
      resolveConfigFromReadResult: (readResult, descriptors) => {
        observedReadResult = readResult;
        return resolveConfigFromReadResult(readResult, descriptors);
      },
      resolveProjectRoot: () => projectRoot,
      descriptors: [specTreeConfigDescriptor],
    };

    const result = await validateCommand({}, deps);

    expect(observedReadResult).toBe(fileResult.value);
    expect(result.stdout).toContain(CONFIG_FILENAMES.json);
  });
});
