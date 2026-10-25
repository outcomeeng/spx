import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";

import { DEFAULT_CONFIG } from "@/config/defaults";
import { configFileForFormat, DEFAULT_CONFIG_FILE_FORMAT, serializeConfigFileSections } from "@/config/index";
import { SESSION_STATUSES } from "@/domains/session/types";
import { sessionsScopeDir } from "@/lib/state-store";
import { TSCONFIG_FILES } from "@/validation/config/scope";
import type {
  GeneratedProductContextCase,
  RedirectedProductContextCommand,
} from "@testing/generators/config/product-context";
import { GIT_TEST_FLAGS, GIT_TEST_SUBCOMMANDS, runGit } from "@testing/harnesses/git-test-constants";
import { type ProductContextCliRun, runProductContextCli } from "@testing/harnesses/product-context/cli";
import { PROPERTY_CLASSIFICATION, propertyTestEnvelopeTimeoutMs } from "@testing/harnesses/property/property";
import { createSessionHarness } from "@testing/harnesses/session/harness";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const PRODUCT_CONTEXT_TEMP_PREFIX = "spx-product-context-";

export const PRODUCT_CONTEXT_CLASSIFICATION = PROPERTY_CLASSIFICATION.SMALL_L1;

export const PRODUCT_CONTEXT_TEST_OPTIONS = {
  timeout: propertyTestEnvelopeTimeoutMs(PRODUCT_CONTEXT_CLASSIFICATION),
} as const;

export const PRODUCT_CONTEXT_RESOLUTION = {
  /** The real Git resolver: the observation spawns Git, so a case claims the Git contract once. */
  GIT: "git",
  /** The injected resolver: the observation spawns no Git, so a case may run as a property. */
  INJECTED: "injected",
} as const;

export type ProductContextResolution = (typeof PRODUCT_CONTEXT_RESOLUTION)[keyof typeof PRODUCT_CONTEXT_RESOLUTION];

/**
 * Resolves the product directory from the directory it receives: a directory inside the product
 * resolves to the product, any other directory resolves to itself, as the fallback of the real
 * resolver does. A directory flag that fails to reach the resolver changes the result.
 */
function resolverWithinProduct(productDir: string): (cwd: string) => { readonly productDir: string } {
  return (cwd) => {
    const relativePath = relative(productDir, resolve(cwd));
    const inside = relativePath === "" || (!relativePath.startsWith("..") && !relativePath.startsWith(sep));
    return { productDir: inside ? productDir : resolve(cwd) };
  };
}

export interface ProductContextMappingObservation {
  readonly productDir: string;
  readonly direct: ProductContextCliRun;
  readonly redirected: ProductContextCliRun;
}

export async function observeProductContextMapping(
  command: RedirectedProductContextCommand,
  scenario: GeneratedProductContextCase,
  resolution: ProductContextResolution,
): Promise<ProductContextMappingObservation> {
  return withTestEnv(DEFAULT_CONFIG, async (env) => {
    const productDir = join(env.productDir, scenario.target.productDirectory);
    const nestedProductDir = join(productDir, scenario.target.nestedDirectory);
    await mkdir(nestedProductDir, { recursive: true });
    const claimsGitContract = resolution === PRODUCT_CONTEXT_RESOLUTION.GIT;
    if (claimsGitContract) await runGit(productDir, [GIT_TEST_SUBCOMMANDS.INIT, GIT_TEST_FLAGS.QUIET]);
    const cliOptions = claimsGitContract ? {} : { resolveProductDir: resolverWithinProduct(productDir) };
    const configFile = configFileForFormat(productDir, DEFAULT_CONFIG_FILE_FORMAT);
    const serialized = serializeConfigFileSections(configFile.format, scenario.testing.config);
    if (!serialized.ok) throw new Error(serialized.error);
    await writeFile(join(productDir, configFile.filename), serialized.value);
    await writeFile(join(productDir, scenario.source.filename), scenario.source.contents);
    await writeFile(
      join(productDir, TSCONFIG_FILES.full),
      JSON.stringify({ compilerOptions: { noEmit: true, strict: true }, files: [scenario.source.filename] }),
    );

    const sessionEnv = await createSessionHarness();
    try {
      const sessionFile = await sessionEnv.writeSession(SESSION_STATUSES[0], scenario.sessionId);
      const sharedStatusDir = join(
        sessionsScopeDir(productDir),
        DEFAULT_CONFIG.sessions.statusDirs[SESSION_STATUSES[0]],
      );
      await mkdir(sharedStatusDir, { recursive: true });
      await copyFile(sessionFile, join(sharedStatusDir, basename(sessionFile)));

      return await withTempDir(PRODUCT_CONTEXT_TEMP_PREFIX, async (callerRoot) => {
        const callerDir = join(callerRoot, scenario.caller.productDirectory, scenario.caller.nestedDirectory);
        await mkdir(callerDir, { recursive: true });
        const direct = await runProductContextCli(command.args, { processCwd: nestedProductDir, ...cliOptions });
        const redirected = await runProductContextCli(
          [command.directoryOption, nestedProductDir, ...command.args],
          { processCwd: callerDir, ...cliOptions },
        );
        return { productDir, direct, redirected };
      });
    } finally {
      await sessionEnv.cleanup();
    }
  });
}

export async function observeAbsentProductContext(
  args: readonly string[],
  scenario: GeneratedProductContextCase,
): Promise<{
  readonly processDir: string;
  readonly result: ProductContextCliRun;
}> {
  return withTempDir(PRODUCT_CONTEXT_TEMP_PREFIX, async (root) => {
    const processDir = join(root, scenario.caller.productDirectory, scenario.caller.nestedDirectory);
    await mkdir(processDir, { recursive: true });
    const result = await runProductContextCli(args, { processCwd: processDir });
    return { processDir, result };
  });
}
