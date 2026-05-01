import { describe, expect, it } from "vitest";

import { showCommand } from "@/commands/config/show";
import {
  CONFIG_FILE_FORMAT,
  configFileForFormat,
  type ConfigFileFormat,
  DEFAULT_CONFIG_FILE_FORMAT,
  parseConfigFileSections,
} from "@/config/index";
import type { Config, ConfigDescriptor, Result } from "@/config/types";
import { specTreeConfigDescriptor } from "@/spec/config";

type CliDeps = {
  resolveConfig: (projectRoot: string) => Promise<Result<Config>>;
  resolveProjectRoot: () => string;
  descriptors: readonly ConfigDescriptor<unknown>[];
};

const PROJECT_ROOT = "/virtual/project";

function makeDeps(resolved: Result<Config>): CliDeps {
  return {
    resolveConfig: async () => resolved,
    resolveProjectRoot: () => PROJECT_ROOT,
    descriptors: [specTreeConfigDescriptor],
  };
}

const DEFAULTS_CONFIG: Config = {
  [specTreeConfigDescriptor.section]: specTreeConfigDescriptor.defaults,
};

const SUBSET_CONFIG: Config = {
  [specTreeConfigDescriptor.section]: {
    kinds: {
      enabler: specTreeConfigDescriptor.defaults.kinds.enabler,
      adr: specTreeConfigDescriptor.defaults.kinds.adr,
    },
  },
};

function parseOutput(format: ConfigFileFormat, raw: string): Config {
  const parsed = parseConfigFileSections(configFileForFormat(PROJECT_ROOT, format, raw));
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return parsed.value;
}

describe("showCommand — default-format output", () => {
  it("emits a default-format dump of the resolved Config when no overrides apply, exit 0", async () => {
    const deps = makeDeps({ ok: true, value: DEFAULTS_CONFIG });

    const result = await showCommand({}, deps);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toHaveLength(0);
    expect(parseOutput(DEFAULT_CONFIG_FILE_FORMAT, result.stdout)).toEqual(DEFAULTS_CONFIG);
  });

  it("reflects config-driven overrides in the emitted default format", async () => {
    const deps = makeDeps({ ok: true, value: SUBSET_CONFIG });

    const result = await showCommand({}, deps);

    expect(result.exitCode).toBe(0);
    const parsed = parseOutput(DEFAULT_CONFIG_FILE_FORMAT, result.stdout);
    const specTree = parsed[specTreeConfigDescriptor.section] as typeof specTreeConfigDescriptor.defaults;
    expect(Object.keys(specTree.kinds).sort()).toEqual(["adr", "enabler"]);
  });
});

describe("showCommand — JSON output", () => {
  it("emits a JSON document when --json is set, exit 0", async () => {
    const deps = makeDeps({ ok: true, value: DEFAULTS_CONFIG });

    const result = await showCommand({ json: true }, deps);

    expect(result.exitCode).toBe(0);
    expect(parseOutput(CONFIG_FILE_FORMAT.JSON, result.stdout)).toEqual(DEFAULTS_CONFIG);
  });

  it("JSON and default-format encodings of the same resolved Config round-trip to equal values", async () => {
    const deps = makeDeps({ ok: true, value: SUBSET_CONFIG });

    const defaultResult = await showCommand({}, deps);
    const jsonResult = await showCommand({ json: true }, deps);

    expect(parseOutput(DEFAULT_CONFIG_FILE_FORMAT, defaultResult.stdout)).toEqual(
      parseOutput(CONFIG_FILE_FORMAT.JSON, jsonResult.stdout),
    );
  });
});

describe("showCommand — resolution failure", () => {
  it("surfaces a resolveConfig error with non-zero exit and a descriptor-qualified stderr message", async () => {
    const deps = makeDeps({ ok: false, error: "specTree: kinds.phantom contains unknown kind" });

    const result = await showCommand({}, deps);

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toHaveLength(0);
    expect(result.stderr).toMatch(/specTree/);
  });
});
