import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

import { showCommand } from "@/commands/config/show.js";
import type { Config, ConfigDescriptor, Result } from "@/config/types.js";
import { specTreeConfigDescriptor } from "@/spec/config.js";

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
  specTree: specTreeConfigDescriptor.defaults,
};

const SUBSET_CONFIG: Config = {
  specTree: {
    kinds: {
      enabler: specTreeConfigDescriptor.defaults.kinds.enabler,
      adr: specTreeConfigDescriptor.defaults.kinds.adr,
    },
  },
};

describe("showCommand — YAML output", () => {
  it("emits a YAML dump of the resolved Config when no yaml overrides apply, exit 0", async () => {
    const deps = makeDeps({ ok: true, value: DEFAULTS_CONFIG });

    const result = await showCommand({}, deps);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(parseYaml(result.stdout)).toEqual(DEFAULTS_CONFIG);
  });

  it("reflects yaml-driven overrides in the emitted YAML", async () => {
    const deps = makeDeps({ ok: true, value: SUBSET_CONFIG });

    const result = await showCommand({}, deps);

    expect(result.exitCode).toBe(0);
    const parsed = parseYaml(result.stdout) as Config;
    const specTree = parsed["specTree"] as typeof specTreeConfigDescriptor.defaults;
    expect(Object.keys(specTree.kinds).sort()).toEqual(["adr", "enabler"]);
  });
});

describe("showCommand — JSON output", () => {
  it("emits a JSON document when --json is set, exit 0", async () => {
    const deps = makeDeps({ ok: true, value: DEFAULTS_CONFIG });

    const result = await showCommand({ json: true }, deps);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(DEFAULTS_CONFIG);
  });

  it("JSON and YAML encodings of the same resolved Config round-trip to equal values", async () => {
    const deps = makeDeps({ ok: true, value: SUBSET_CONFIG });

    const yamlResult = await showCommand({}, deps);
    const jsonResult = await showCommand({ json: true }, deps);

    expect(parseYaml(yamlResult.stdout)).toEqual(JSON.parse(jsonResult.stdout));
  });
});

describe("showCommand — resolution failure", () => {
  it("surfaces a resolveConfig error with non-zero exit and a descriptor-qualified stderr message", async () => {
    const deps = makeDeps({ ok: false, error: "specTree: kinds.phantom contains unknown kind" });

    const result = await showCommand({}, deps);

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/specTree/);
  });
});
