import { describe, expect, it } from "vitest";

import { validateCommand } from "@/commands/config/validate";
import { DEFAULT_CONFIG_FILENAME } from "@/config/index";
import type { Config, ConfigDescriptor, Result } from "@/config/types";
import { specTreeConfigDescriptor } from "@/spec/config";

type CliDeps = {
  resolveConfig: (projectRoot: string) => Promise<Result<Config>>;
  resolveProjectRoot: () => string;
  descriptors: readonly ConfigDescriptor<unknown>[];
};

const PROJECT_ROOT = "/virtual/project";

function makeDeps(resolved: Result<Config>, projectRoot = PROJECT_ROOT): CliDeps {
  return {
    resolveConfig: async () => resolved,
    resolveProjectRoot: () => projectRoot,
    descriptors: [specTreeConfigDescriptor],
  };
}

const DEFAULTS_CONFIG: Config = {
  specTree: specTreeConfigDescriptor.defaults,
};

describe("validateCommand — success path", () => {
  it("exits 0 and emits a success line to stdout when resolution succeeds", async () => {
    const deps = makeDeps({ ok: true, value: DEFAULTS_CONFIG });

    const result = await validateCommand({}, deps);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.length).toBeGreaterThan(0);
    expect(result.stderr).toHaveLength(0);
  });

  it("the success line names the validated file", async () => {
    const deps = makeDeps({ ok: true, value: DEFAULTS_CONFIG });

    const result = await validateCommand({}, deps);

    expect(result.stdout).toContain(DEFAULT_CONFIG_FILENAME);
  });
});

describe("validateCommand — rejection path", () => {
  it("exits non-zero when resolution returns an error", async () => {
    const deps = makeDeps({ ok: false, error: "specTree: kinds.phantom contains unknown kind" });

    const result = await validateCommand({}, deps);

    expect(result.exitCode).not.toBe(0);
  });

  it("routes the error to stderr with descriptor-qualified context", async () => {
    const deps = makeDeps({
      ok: false,
      error: "specTree: kinds.phantom contains unknown kind \"phantom\"",
    });

    const result = await validateCommand({}, deps);

    expect(result.stderr).toMatch(/specTree/);
    expect(result.stderr).toMatch(/phantom/);
    expect(result.stdout).toHaveLength(0);
  });

  it("exit code on rejection is exactly 1", async () => {
    const deps = makeDeps({ ok: false, error: "anySection: bad" });

    const result = await validateCommand({}, deps);

    expect(result.exitCode).toBe(1);
  });
});

describe("validateCommand — mapping contract", () => {
  it("resolves the projectRoot through deps before calling resolveConfig", async () => {
    let observedRoot: string | undefined;
    const deps: CliDeps = {
      resolveConfig: async (root) => {
        observedRoot = root;
        return { ok: true, value: DEFAULTS_CONFIG };
      },
      resolveProjectRoot: () => PROJECT_ROOT,
      descriptors: [specTreeConfigDescriptor],
    };

    await validateCommand({}, deps);

    expect(observedRoot).toBe(PROJECT_ROOT);
  });
});
