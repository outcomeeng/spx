import { mkdir, realpath } from "node:fs/promises";
import { resolve } from "node:path";

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

export type ProductRootObservation = {
  readonly actualProductDir: string;
  readonly expectedProductDir: string;
  readonly warning: string | undefined;
};

export type InvocationRootObservation = {
  readonly context: ReturnType<ReturnType<typeof createCliInvocation>["resolveProductContext"]>;
  readonly expectedInvocationDir: string;
  readonly observedInvocationDir: string;
  readonly writtenWarning?: string;
};

type ObservationConsumer<T> = (observation: T) => void | Promise<void>;

export async function withProductDirectoryRootObservation(
  consume: ObservationConsumer<ProductRootObservation>,
): Promise<void> {
  await withGitProduct(async (productDir) => {
    const resolved = resolveProductDir(productDir);
    await consume({
      actualProductDir: await realpath(resolved.productDir),
      expectedProductDir: await realpath(productDir),
      warning: resolved.warning,
    });
  });
}

export async function withSubdirectoryRootObservation(
  consume: ObservationConsumer<ProductRootObservation>,
): Promise<void> {
  await withGitProduct(async (productDir) => {
    const subdirectory = resolve(productDir, "nested", "deep");
    await mkdir(subdirectory, { recursive: true });
    const resolved = resolveProductDir(subdirectory);
    await consume({
      actualProductDir: await realpath(resolved.productDir),
      expectedProductDir: await realpath(productDir),
      warning: resolved.warning,
    });
  });
}

export function withDirectoryOptionObservation(consume: ObservationConsumer<InvocationRootObservation>): void {
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

  void consume({
    context: invocation.resolveProductContext(),
    expectedInvocationDir: expected,
    observedInvocationDir: observed,
  });
}

export function withInvocationDirectoryObservation(consume: ObservationConsumer<InvocationRootObservation>): void {
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

  void consume({
    context: invocation.resolveProductContext(),
    expectedInvocationDir: invocationDirectory,
    observedInvocationDir: observed,
  });
}

export async function withNonWorktreeRootObservation(
  consume: ObservationConsumer<InvocationRootObservation>,
): Promise<void> {
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
    await consume({
      context,
      expectedInvocationDir: invocationDirectory,
      observedInvocationDir: context.effectiveInvocationDir,
      writtenWarning,
    });
  });
}
