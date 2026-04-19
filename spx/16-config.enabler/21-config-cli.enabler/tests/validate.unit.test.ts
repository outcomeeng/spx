import { describe, expect, it } from "vitest";

import { validateCommand } from "@/commands/config/validate.js";
import type { Config, ConfigDescriptor, Result } from "@/config/types.js";
import { specTreeConfigDescriptor } from "@/spec/config.js";

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
    expect(result.stderr).toBe("");
  });

  it("the success line names the validated file", async () => {
    const deps = makeDeps({ ok: true, value: DEFAULTS_CONFIG });

    const result = await validateCommand({}, deps);

    expect(result.stdout).toMatch(/spx\.config\.yaml/);
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
    expect(result.stdout).toBe("");
  });

  it("exit code on rejection is exactly 1", async () => {
    const deps = makeDeps({ ok: false, error: "anySection: bad" });

    const result = await validateCommand({}, deps);

    expect(result.exitCode).toBe(1);
  });
});

describe("validateCommand — mapping contract", () => {
  it("resolves the projectRoot through deps before calling resolveConfig", async () => {
    let observedRoot = "";
    const deps: CliDeps = {
      resolveConfig: async (root) => {
        observedRoot = root;
        return { ok: true, value: DEFAULTS_CONFIG };
      },
      resolveProjectRoot: () => "/test-root",
      descriptors: [specTreeConfigDescriptor],
    };

    await validateCommand({}, deps);

    expect(observedRoot).toBe("/test-root");
  });
});
