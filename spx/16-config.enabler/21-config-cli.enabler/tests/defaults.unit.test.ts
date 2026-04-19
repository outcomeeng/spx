import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

import { defaultsCommand } from "@/commands/config/defaults.js";
import type { Config, ConfigDescriptor, Result } from "@/config/types.js";
import { specTreeConfigDescriptor } from "@/spec/config.js";

type CliDeps = {
  resolveConfig: (projectRoot: string) => Promise<Result<Config>>;
  resolveProjectRoot: () => string;
  descriptors: readonly ConfigDescriptor<unknown>[];
};

type TrivialSectionConfig = { readonly mode: "strict" | "lenient" };

const fakeDescriptor: ConfigDescriptor<TrivialSectionConfig> = {
  section: "fakeDomain",
  defaults: { mode: "strict" },
  validate(value: unknown): Result<TrivialSectionConfig> {
    return { ok: true, value: value as TrivialSectionConfig };
  },
};

const PROJECT_ROOT = "/virtual/project";

function makeDeps(descriptors: readonly ConfigDescriptor<unknown>[]): CliDeps {
  return {
    resolveConfig: async () => {
      throw new Error("defaultsCommand must not call resolveConfig");
    },
    resolveProjectRoot: () => PROJECT_ROOT,
    descriptors,
  };
}

describe("defaultsCommand — YAML output", () => {
  it("emits a YAML dump of every registered descriptor's defaults, exit 0", async () => {
    const deps = makeDeps([specTreeConfigDescriptor, fakeDescriptor]);

    const result = await defaultsCommand({}, deps);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");

    const parsed = parseYaml(result.stdout) as Config;
    expect(parsed["specTree"]).toEqual(specTreeConfigDescriptor.defaults);
    expect(parsed["fakeDomain"]).toEqual(fakeDescriptor.defaults);
  });

  it("does not call resolveConfig — output is independent of any spx.config.yaml present at the root", async () => {
    const deps = makeDeps([specTreeConfigDescriptor]);

    const result = await defaultsCommand({}, deps);

    expect(result.exitCode).toBe(0);
    const parsed = parseYaml(result.stdout) as Config;
    expect(parsed["specTree"]).toEqual(specTreeConfigDescriptor.defaults);
  });
});

describe("defaultsCommand — JSON output", () => {
  it("emits a JSON document when --json is set, exit 0", async () => {
    const deps = makeDeps([specTreeConfigDescriptor, fakeDescriptor]);

    const result = await defaultsCommand({ json: true }, deps);

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Config;
    expect(parsed["specTree"]).toEqual(specTreeConfigDescriptor.defaults);
    expect(parsed["fakeDomain"]).toEqual(fakeDescriptor.defaults);
  });

  it("JSON and YAML encodings round-trip to equal Configs", async () => {
    const deps = makeDeps([specTreeConfigDescriptor, fakeDescriptor]);

    const yamlResult = await defaultsCommand({}, deps);
    const jsonResult = await defaultsCommand({ json: true }, deps);

    expect(parseYaml(yamlResult.stdout)).toEqual(JSON.parse(jsonResult.stdout));
  });
});

describe("defaultsCommand — registry iteration", () => {
  it("emits one section per descriptor in the supplied list — no more, no fewer", async () => {
    const deps = makeDeps([specTreeConfigDescriptor, fakeDescriptor]);

    const result = await defaultsCommand({}, deps);

    const parsed = parseYaml(result.stdout) as Config;
    expect(Object.keys(parsed).sort()).toEqual(
      ["fakeDomain", "specTree"].sort(),
    );
  });
});
