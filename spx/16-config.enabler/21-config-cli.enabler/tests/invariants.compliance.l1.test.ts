import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { defaultsCommand } from "@/commands/config/defaults";
import { showCommand } from "@/commands/config/show";
import type { CliDeps } from "@/commands/config/types";
import { validateCommand } from "@/commands/config/validate";
import type { Config, Result } from "@/config/types";
import { CONFIG_CLI, configDomain } from "@/interfaces/cli/config";
import { createCliProgram } from "@/interfaces/cli/program";
import { specTreeConfigDescriptor } from "@/lib/spec-tree";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";

function makeDeps(resolved: Result<Config>): CliDeps {
  const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());

  return {
    resolveConfig: async () => resolved,
    readProductConfigFile: async () => sampleConfigTestValue(CONFIG_TEST_GENERATOR.absentConfigFileReadResult()),
    resolveConfigFromReadResult: () => resolved,
    resolveProductDir: () => productDir,
    descriptors: [specTreeConfigDescriptor],
  };
}

function defaultsConfig(): Config {
  return sampleConfigTestValue(CONFIG_TEST_GENERATOR.specTreeDefaultsConfig());
}

type ProcessOverrides = {
  restore: () => void;
  tripped: readonly string[];
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

describe("invariants — handlers trigger no process side effects (P1)", () => {
  it("showCommand does not call process.exit, process.chdir, or write to process streams", async () => {
    const deps = makeDeps({ ok: true, value: defaultsConfig() });
    const traps = trapProcessSideEffects();

    try {
      await showCommand({}, deps);
      await showCommand({ json: true }, deps);
    } finally {
      traps.restore();
    }

    expect(traps.tripped).toEqual([]);
  });

  it("validateCommand does not call process.exit, process.chdir, or write to process streams on the success path", async () => {
    const deps = makeDeps({ ok: true, value: defaultsConfig() });
    const traps = trapProcessSideEffects();

    try {
      await validateCommand({}, deps);
    } finally {
      traps.restore();
    }

    expect(traps.tripped).toEqual([]);
  });

  it("validateCommand does not call process.exit, process.chdir, or write to process streams on the rejection path", async () => {
    const deps = makeDeps({
      ok: false,
      error: sampleConfigTestValue(CONFIG_TEST_GENERATOR.specTreeUnknownKindError()),
    });
    const traps = trapProcessSideEffects();

    try {
      await validateCommand({}, deps);
    } finally {
      traps.restore();
    }

    expect(traps.tripped).toEqual([]);
  });

  it("defaultsCommand does not call process.exit, process.chdir, or write to process streams", async () => {
    const deps = makeDeps({ ok: true, value: defaultsConfig() });
    const traps = trapProcessSideEffects();

    try {
      await defaultsCommand({}, deps);
      await defaultsCommand({ json: true }, deps);
    } finally {
      traps.restore();
    }

    expect(traps.tripped).toEqual([]);
  });
});

describe("invariants — config source scope", () => {
  it("registers presentation options only, with no alternate config source", () => {
    expect(
      createCliProgram({ domains: [configDomain] }).commands
        .find((command) => command.name() === CONFIG_CLI.commandName)
        ?.commands.flatMap((command) => command.options.map((option) => option.long)),
    ).toEqual([CONFIG_CLI.flags.json, CONFIG_CLI.flags.json]);
  });
});

describe("invariants — handlers do not throw, even on rejection", () => {
  it("every handler resolves to a CliResult for both ok and error inputs — no thrown exceptions", async () => {
    const okDeps = makeDeps({ ok: true, value: defaultsConfig() });
    const failDeps = makeDeps({
      ok: false,
      error: sampleConfigTestValue(CONFIG_TEST_GENERATOR.specTreeUnknownKindError()),
    });

    await expect(showCommand({}, okDeps)).resolves.toMatchObject({ exitCode: 0 });
    await expect(showCommand({}, failDeps)).resolves.toMatchObject({ exitCode: expect.any(Number) });
    await expect(validateCommand({}, okDeps)).resolves.toMatchObject({ exitCode: 0 });
    await expect(validateCommand({}, failDeps)).resolves.toMatchObject({ exitCode: expect.any(Number) });
    await expect(defaultsCommand({}, okDeps)).resolves.toMatchObject({ exitCode: 0 });
  });
});

describe("invariants — determinism across handler invocations", () => {
  it("show, validate, and defaults each produce identical CliResult across identical inputs", async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), async (asJson) => {
        const deps = makeDeps({ ok: true, value: defaultsConfig() });

        const showA = await showCommand({ json: asJson }, deps);
        const showB = await showCommand({ json: asJson }, deps);
        expect(showA).toEqual(showB);

        const validateA = await validateCommand({}, deps);
        const validateB = await validateCommand({}, deps);
        expect(validateA).toEqual(validateB);

        const defaultsA = await defaultsCommand({ json: asJson }, deps);
        const defaultsB = await defaultsCommand({ json: asJson }, deps);
        expect(defaultsA).toEqual(defaultsB);
      }),
      { numRuns: 10 },
    );
  });
});

describe("invariants — stream discipline (C2)", () => {
  it("successful show/defaults route the resolved Config to stdout; stderr is empty", async () => {
    const deps = makeDeps({ ok: true, value: defaultsConfig() });

    const show = await showCommand({}, deps);
    const defs = await defaultsCommand({}, deps);

    expect(show.stdout.length).toBeGreaterThan(0);
    expect(show.stderr).toHaveLength(0);
    expect(defs.stdout.length).toBeGreaterThan(0);
    expect(defs.stderr).toHaveLength(0);
  });

  it("failed resolution in show/validate routes diagnostics to stderr and leaves stdout empty", async () => {
    const deps = makeDeps({
      ok: false,
      error: sampleConfigTestValue(CONFIG_TEST_GENERATOR.specTreeUnknownKindError()),
    });

    const show = await showCommand({}, deps);
    const validate = await validateCommand({}, deps);

    expect(show.stdout).toHaveLength(0);
    expect(show.stderr.length).toBeGreaterThan(0);
    expect(validate.stdout).toHaveLength(0);
    expect(validate.stderr.length).toBeGreaterThan(0);
  });

  it("successful validate emits the success line on stdout, not stderr", async () => {
    const deps = makeDeps({ ok: true, value: defaultsConfig() });

    const result = await validateCommand({}, deps);

    expect(result.stdout.length).toBeGreaterThan(0);
    expect(result.stderr).toHaveLength(0);
  });
});
