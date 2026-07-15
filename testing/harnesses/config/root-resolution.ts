import { mkdir, realpath } from "node:fs/promises";
import { resolve } from "node:path";

import { expect } from "vitest";

import { resolveProductDir } from "@/domains/config/root";
import { type CliIo, createCliInvocation } from "@/interfaces/cli/product-context";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { GIT_TEST_FLAGS, GIT_TEST_SUBCOMMANDS, runGit } from "@testing/harnesses/git-test-constants";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const TEST_IO: CliIo = {
  writeStdout: () => undefined,
  writeStderr: () => undefined,
  setExitCode: () => undefined,
  exit: (exitCode) => {
    throw new Error(`unexpected config root test exit ${exitCode}`);
  },
};

async function withGitProduct(callback: (productDir: string) => Promise<void>): Promise<void> {
  await withTempDir(sampleConfigTestValue(CONFIG_TEST_GENERATOR.tempPrefix()), async (productDir) => {
    await runGit(productDir, [GIT_TEST_SUBCOMMANDS.INIT, GIT_TEST_FLAGS.QUIET]);
    await callback(productDir);
  });
}

export async function assertProductDirectoryResolvesWorktreeRoot(): Promise<void> {
  await withGitProduct(async (productDir) => {
    const resolved = resolveProductDir(productDir);
    expect(await realpath(resolved.productDir)).toBe(await realpath(productDir));
    expect(resolved.warning).toBeUndefined();
  });
}

export async function assertSubdirectoryResolvesWorktreeRoot(): Promise<void> {
  await withGitProduct(async (productDir) => {
    const subdirectory = resolve(productDir, "nested", "deep");
    await mkdir(subdirectory, { recursive: true });
    const resolved = resolveProductDir(subdirectory);
    expect(await realpath(resolved.productDir)).toBe(await realpath(productDir));
    expect(resolved.warning).toBeUndefined();
  });
}

export function assertDirectoryOptionDeterminesEffectiveInvocationDirectory(): void {
  const invocationDirectory = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
  const directoryOption = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
  const expected = resolve(invocationDirectory, directoryOption);
  let observed = "";
  const invocation = createCliInvocation({
    readDirectoryOption: () => directoryOption,
    processCwd: () => invocationDirectory,
    resolveProductDir: (effectiveInvocationDir) => {
      observed = effectiveInvocationDir;
      return { productDir: effectiveInvocationDir };
    },
    writeWarning: () => undefined,
    io: TEST_IO,
  });

  expect(invocation.resolveProductContext()).toEqual({
    effectiveInvocationDir: expected,
    productDir: expected,
  });
  expect(observed).toBe(expected);
}

export function assertInvocationDirectoryDeterminesEffectiveInvocationDirectory(): void {
  const invocationDirectory = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
  let observed = "";
  const invocation = createCliInvocation({
    readDirectoryOption: () => undefined,
    processCwd: () => invocationDirectory,
    resolveProductDir: (effectiveInvocationDir) => {
      observed = effectiveInvocationDir;
      return { productDir: effectiveInvocationDir };
    },
    writeWarning: () => undefined,
    io: TEST_IO,
  });

  expect(invocation.resolveProductContext()).toEqual({
    effectiveInvocationDir: invocationDirectory,
    productDir: invocationDirectory,
  });
  expect(observed).toBe(invocationDirectory);
}

export async function assertNonWorktreeInvocationFallsBackWithWarning(): Promise<void> {
  await withTempDir(sampleConfigTestValue(CONFIG_TEST_GENERATOR.tempPrefix()), async (invocationDirectory) => {
    let writtenWarning: string | undefined;
    const invocation = createCliInvocation({
      readDirectoryOption: () => undefined,
      processCwd: () => invocationDirectory,
      writeWarning: (warning) => {
        writtenWarning = warning;
      },
      io: TEST_IO,
    });

    const context = invocation.resolveProductContext();
    expect(await realpath(context.productDir)).toBe(await realpath(invocationDirectory));
    expect(context.effectiveInvocationDir).toBe(invocationDirectory);
    expect(context.warning).toBeDefined();
    expect(writtenWarning).toBe(context.warning);
  });
}
