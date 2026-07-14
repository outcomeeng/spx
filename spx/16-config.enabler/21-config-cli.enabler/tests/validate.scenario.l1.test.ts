import { describe, expect, it } from "vitest";

import type { CliDeps } from "@/commands/config/types";
import { VALIDATE_SUCCESS_TOKENS, validateCommand } from "@/commands/config/validate";
import {
  CONFIG_FILE_FORMAT,
  CONFIG_FILENAMES,
  configFileForFormat,
  type ConfigFileReadResult,
  resolveConfigFromReadResult,
} from "@/config/index";
import type { Config, Result } from "@/config/types";
import { specTreeConfigDescriptor } from "@/lib/spec-tree";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";

function makeDeps(
  resolved: Result<Config>,
  productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir()),
  fileResult: Result<ConfigFileReadResult> = sampleConfigTestValue(CONFIG_TEST_GENERATOR.absentConfigFileReadResult()),
): CliDeps {
  return {
    resolveConfig: async () => {
      throw new Error(sampleConfigTestValue(CONFIG_TEST_GENERATOR.scalar()));
    },
    readProductConfigFile: async () => fileResult,
    resolveConfigFromReadResult: () => resolved,
    resolveProductDir: () => productDir,
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

  it("the success line reports that no config file was found and that defaults were validated when the read result is absent", async () => {
    const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
    const deps = makeDeps({ ok: true, value: defaultsConfig() }, productDir);

    const result = await validateCommand({}, deps);

    expect(result.stdout).toContain(productDir);
    expect(result.stdout).toContain(VALIDATE_SUCCESS_TOKENS.ABSENT_PREFIX);
    expect(result.stdout).toContain(VALIDATE_SUCCESS_TOKENS.ABSENT_SUBJECT);
    for (const filename of Object.values(CONFIG_FILENAMES)) {
      expect(result.stdout).not.toContain(filename);
    }
  });

  it("the success line names the present config file when the project uses a non-default format", async () => {
    const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
    const fileResult: Result<ConfigFileReadResult> = {
      ok: true,
      value: {
        kind: "ok",
        file: configFileForFormat(productDir, CONFIG_FILE_FORMAT.TOML),
      },
    };
    const deps = makeDeps({ ok: true, value: defaultsConfig() }, productDir, fileResult);

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

    expect(result.stderr).toContain(specTreeConfigDescriptor.section);
    expect(result.stderr).toContain(generated.offendingKind);
    expect(result.stdout).toHaveLength(0);
  });

  it("exit code on rejection is exactly 1", async () => {
    const deps = makeDeps({
      ok: false,
      error: sampleConfigTestValue(CONFIG_TEST_GENERATOR.specTreeUnknownKindError()),
    });

    const result = await validateCommand({}, deps);

    expect(result.exitCode).toBe(1);
  });
});

describe("validateCommand — mapping contract", () => {
  it("resolves the product directory through deps before reading the config file", async () => {
    let observedProductDir: string | undefined;
    const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
    const deps: CliDeps = {
      resolveConfig: async () => {
        throw new Error(sampleConfigTestValue(CONFIG_TEST_GENERATOR.scalar()));
      },
      readProductConfigFile: async (resolvedProductDir) => {
        observedProductDir = resolvedProductDir;
        return sampleConfigTestValue(CONFIG_TEST_GENERATOR.absentConfigFileReadResult());
      },
      resolveConfigFromReadResult: () => ({ ok: true, value: defaultsConfig() }),
      resolveProductDir: () => productDir,
      descriptors: [specTreeConfigDescriptor],
    };

    await validateCommand({}, deps);

    expect(observedProductDir).toBe(productDir);
  });

  it("validates the same config-file read result that supplies the success filename", async () => {
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

    expect(observedReadResult).toBe(fileResult.value);
    expect(result.stdout).toContain(CONFIG_FILENAMES.json);
  });
});
