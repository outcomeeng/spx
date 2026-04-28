import { describe, expect, it } from "vitest";

import { defaultsCommand } from "@/commands/config/defaults";
import {
  CONFIG_FILE_FORMAT,
  configFileForFormat,
  type ConfigFileFormat,
  DEFAULT_CONFIG_FILE_FORMAT,
  parseConfigFileSections,
} from "@/config/index";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@/config/testing";
import type { Config, ConfigDescriptor, Result } from "@/config/types";
import { specTreeConfigDescriptor } from "@/spec/config";

type CliDeps = {
  resolveConfig: (projectRoot: string) => Promise<Result<Config>>;
  resolveProjectRoot: () => string;
  descriptors: readonly ConfigDescriptor<unknown>[];
};

function makeDeps(descriptors: readonly ConfigDescriptor<unknown>[]): CliDeps {
  return {
    resolveConfig: async () => {
      throw new Error("defaultsCommand must not call resolveConfig");
    },
    resolveProjectRoot: () => sampleConfigTestValue(CONFIG_TEST_GENERATOR.projectRoot()),
    descriptors,
  };
}

function parseOutput(format: ConfigFileFormat, raw: string): Config {
  const parsed = parseConfigFileSections(
    configFileForFormat(sampleConfigTestValue(CONFIG_TEST_GENERATOR.projectRoot()), format, raw),
  );
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return parsed.value;
}

describe("defaultsCommand — default-format output", () => {
  it("emits a default-format dump of every registered descriptor's defaults, exit 0", async () => {
    const generated = sampleConfigTestValue(CONFIG_TEST_GENERATOR.modeDescriptor());
    const deps = makeDeps([specTreeConfigDescriptor, generated.descriptor]);

    const result = await defaultsCommand({}, deps);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toHaveLength(0);

    const parsed = parseOutput(DEFAULT_CONFIG_FILE_FORMAT, result.stdout);
    expect(parsed[specTreeConfigDescriptor.section]).toEqual(specTreeConfigDescriptor.defaults);
    expect(parsed[generated.section]).toEqual(generated.defaults);
  });

  it("does not call resolveConfig — output is independent of any project config file present at the root", async () => {
    const deps = makeDeps([specTreeConfigDescriptor]);

    const result = await defaultsCommand({}, deps);

    expect(result.exitCode).toBe(0);
    const parsed = parseOutput(DEFAULT_CONFIG_FILE_FORMAT, result.stdout);
    expect(parsed[specTreeConfigDescriptor.section]).toEqual(specTreeConfigDescriptor.defaults);
  });
});

describe("defaultsCommand — JSON output", () => {
  it("emits a JSON document when --json is set, exit 0", async () => {
    const generated = sampleConfigTestValue(CONFIG_TEST_GENERATOR.modeDescriptor());
    const deps = makeDeps([specTreeConfigDescriptor, generated.descriptor]);

    const result = await defaultsCommand({ json: true }, deps);

    expect(result.exitCode).toBe(0);
    const parsed = parseOutput(CONFIG_FILE_FORMAT.JSON, result.stdout);
    expect(parsed[specTreeConfigDescriptor.section]).toEqual(specTreeConfigDescriptor.defaults);
    expect(parsed[generated.section]).toEqual(generated.defaults);
  });

  it("JSON and default-format encodings round-trip to equal Configs", async () => {
    const generated = sampleConfigTestValue(CONFIG_TEST_GENERATOR.modeDescriptor());
    const deps = makeDeps([specTreeConfigDescriptor, generated.descriptor]);

    const defaultResult = await defaultsCommand({}, deps);
    const jsonResult = await defaultsCommand({ json: true }, deps);

    expect(parseOutput(DEFAULT_CONFIG_FILE_FORMAT, defaultResult.stdout)).toEqual(
      parseOutput(CONFIG_FILE_FORMAT.JSON, jsonResult.stdout),
    );
  });
});

describe("defaultsCommand — registry iteration", () => {
  it("emits one section per descriptor in the supplied list — no more, no fewer", async () => {
    const generated = sampleConfigTestValue(CONFIG_TEST_GENERATOR.modeDescriptor());
    const deps = makeDeps([specTreeConfigDescriptor, generated.descriptor]);

    const result = await defaultsCommand({}, deps);

    const parsed = parseOutput(DEFAULT_CONFIG_FILE_FORMAT, result.stdout);
    expect(Object.keys(parsed).sort()).toEqual(
      [generated.section, specTreeConfigDescriptor.section].sort(),
    );
  });
});
