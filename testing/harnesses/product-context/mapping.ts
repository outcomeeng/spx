import * as fc from "fast-check";
import { randomInt } from "node:crypto";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { DEFAULT_CONFIG } from "@/config/defaults";
import { configFileForFormat, DEFAULT_CONFIG_FILE_FORMAT, serializeConfigFileSections } from "@/config/index";
import { DIAGNOSE_FORMAT } from "@/domains/diagnose/report";
import { SESSION_STATUSES } from "@/domains/session/types";
import { DIAGNOSE_CLI } from "@/interfaces/cli/diagnose";
import { sessionsScopeDir } from "@/lib/state-store";
import { TSCONFIG_FILES } from "@/validation/config/scope";
import type {
  GeneratedProductContextCase,
  RedirectedProductContextCommand,
} from "@testing/generators/config/product-context";
import { GIT_TEST_FLAGS, GIT_TEST_SUBCOMMANDS, runGit } from "@testing/harnesses/git-test-constants";
import { type ProductContextCliRun, runProductContextCli } from "@testing/harnesses/product-context/cli";
import { PROPERTY_LEVEL, PROPERTY_TIMEOUTS_MS, resolveSeed } from "@testing/harnesses/property/property";
import { createSessionHarness } from "@testing/harnesses/session/harness";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const PRODUCT_CONTEXT_MAPPING_CASE_COUNT = 3;
const PRODUCT_CONTEXT_SEED_BOUND = 2 ** 32;
const PRODUCT_CONTEXT_TEMP_PREFIX = "spx-product-context-";

export const PRODUCT_CONTEXT_MAPPING_TEST_OPTIONS = {
  timeout: PRODUCT_CONTEXT_MAPPING_CASE_COUNT * PROPERTY_TIMEOUTS_MS[PROPERTY_LEVEL.L1],
} as const;

export async function runProductContextCases<T>(
  arbitrary: fc.Arbitrary<T>,
  predicate: (scenario: T) => Promise<void>,
): Promise<void> {
  const seed = resolveSeed(process.env, () => randomInt(PRODUCT_CONTEXT_SEED_BOUND));
  const result = await fc.check(fc.asyncProperty(arbitrary, predicate), {
    seed,
    numRuns: PRODUCT_CONTEXT_MAPPING_CASE_COUNT,
    timeout: PROPERTY_TIMEOUTS_MS[PROPERTY_LEVEL.L1],
  });
  if (result.failed) {
    throw new Error(
      `Product-context mapping failed after ${result.numRuns} runs; seed ${seed}; replay path ${result.counterexamplePath}; counterexample ${
        JSON.stringify(result.counterexample)
      }`,
      { cause: result.errorInstance },
    );
  }
}

export interface ProductContextMappingObservation {
  readonly productDir: string;
  readonly direct: ProductContextCliRun;
  readonly redirected: ProductContextCliRun;
}

export async function observeProductContextMapping(
  command: RedirectedProductContextCommand,
  scenario: GeneratedProductContextCase,
): Promise<ProductContextMappingObservation> {
  return withTestEnv(DEFAULT_CONFIG, async (env) => {
    const productDir = join(env.productDir, scenario.target.productDirectory);
    const nestedProductDir = join(productDir, scenario.target.nestedDirectory);
    await mkdir(nestedProductDir, { recursive: true });
    await runGit(productDir, [GIT_TEST_SUBCOMMANDS.INIT, GIT_TEST_FLAGS.QUIET]);
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
        const direct = await runProductContextCli(command.args, { processCwd: nestedProductDir });
        const redirected = await runProductContextCli(
          [command.directoryOption, nestedProductDir, ...command.args],
          { processCwd: callerDir },
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

export async function observeDeferredProductContextExit(): Promise<ProductContextCliRun> {
  return withTempDir(PRODUCT_CONTEXT_TEMP_PREFIX, (processDir) =>
    runProductContextCli(
      [DIAGNOSE_CLI.COMMAND, DIAGNOSE_CLI.FORMAT_FLAG, DIAGNOSE_FORMAT.JSON],
      { processCwd: processDir },
    ));
}
