import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { DEFAULT_CONFIG } from "@/config/defaults";
import { resolveProductDir } from "@/domains/config/root";
import { SESSION_STATUSES } from "@/domains/session/types";
import { CONFIG_CLI } from "@/interfaces/cli/config";
import { SPX_GLOBAL_OPTIONS } from "@/interfaces/cli/product-context";
import { SESSION_CLI } from "@/interfaces/cli/session";
import { validationCliDefinition, validationCommonCliOptions } from "@/interfaces/cli/validation-contract";
import { sessionsScopeDir } from "@/lib/state-store";
import { TSCONFIG_FILES } from "@/validation/config/scope";
import { VALIDATION_SCOPES } from "@/validation/types";
import {
  CONFIG_TEST_GENERATOR,
  type GeneratedResolutionScope,
  sampleConfigTestValue,
  sampleConfigTestValues,
} from "@testing/generators/config/descriptors";
import { sampleSessionId } from "@testing/generators/session/session";
import { GIT_TEST_FLAGS, GIT_TEST_SUBCOMMANDS, runGit } from "@testing/harnesses/git-test-constants";
import {
  parseProductContextJsonConfig,
  type ProductContextCliRun,
  ProductContextTempDirs,
  productContextTestingConfig,
  runProductContextCli,
} from "@testing/harnesses/product-context/cli";
import { createSessionHarness } from "@testing/harnesses/session/harness";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

const PRODUCT_CONTEXT_MAPPING_CASE_COUNT = 3;

export type ConfigContextMappingObservation = {
  readonly direct: ProductContextCliRun;
  readonly expectedTestingConfig: unknown;
  readonly productDir: string;
  readonly redirected: ProductContextCliRun;
  readonly scope: GeneratedResolutionScope;
};

export type CliContextMappingObservation = {
  readonly direct: ProductContextCliRun;
  readonly redirected: ProductContextCliRun;
  readonly scope: GeneratedResolutionScope;
};

export type SessionContextMappingObservation = CliContextMappingObservation & {
  readonly sessionId: string;
};

export type AbsentContextMappingObservation = {
  readonly expectedWarning: string;
  readonly processDir: string;
  readonly result: ProductContextCliRun;
  readonly scope: GeneratedResolutionScope;
};

function resolutionScopes(): readonly GeneratedResolutionScope[] {
  return sampleConfigTestValues(
    CONFIG_TEST_GENERATOR.resolutionScope(),
    PRODUCT_CONTEXT_MAPPING_CASE_COUNT,
  );
}

function configShowJsonArgs(): readonly string[] {
  return [CONFIG_CLI.commandName, CONFIG_CLI.commands.show, CONFIG_CLI.flags.json];
}

function sessionListJsonArgs(): readonly string[] {
  return [SESSION_CLI.commandName, SESSION_CLI.commands.list, SESSION_CLI.flags.json];
}

async function withProductContextTempDirs<T>(
  run: (tempDirs: ProductContextTempDirs) => Promise<T>,
): Promise<T> {
  const tempDirs = new ProductContextTempDirs();
  try {
    return await run(tempDirs);
  } finally {
    await tempDirs.cleanup();
  }
}

export async function observeConfigContextMappings(): Promise<readonly ConfigContextMappingObservation[]> {
  return withProductContextTempDirs(async (tempDirs) => {
    const observations: ConfigContextMappingObservation[] = [];
    for (const scope of resolutionScopes()) {
      const generated = sampleConfigTestValue(CONFIG_TEST_GENERATOR.testingConfig());
      const callerDir = await tempDirs.makeTempDir();
      await withTestEnv(generated.config, async ({ productDir }) => {
        await runGit(productDir, [GIT_TEST_SUBCOMMANDS.INIT, GIT_TEST_FLAGS.QUIET]);
        const nestedProductDir = join(productDir, scope.nestedDirectory);
        await mkdir(nestedProductDir, { recursive: true });
        observations.push({
          direct: await runProductContextCli(configShowJsonArgs(), { processCwd: nestedProductDir }),
          expectedTestingConfig: generated.expected,
          productDir,
          redirected: await runProductContextCli(
            [SPX_GLOBAL_OPTIONS.directory.short, nestedProductDir, ...configShowJsonArgs()],
            { processCwd: callerDir },
          ),
          scope,
        });
      });
    }
    return observations;
  });
}

export async function observeValidationContextMappings(): Promise<readonly CliContextMappingObservation[]> {
  return withProductContextTempDirs(async (tempDirs) => {
    const observations: CliContextMappingObservation[] = [];
    for (const scope of resolutionScopes()) {
      const callerDir = await tempDirs.makeTempDir();
      const productDir = await tempDirs.makeTempDir();
      await runGit(productDir, [GIT_TEST_SUBCOMMANDS.INIT, GIT_TEST_FLAGS.QUIET]);
      await mkdir(join(productDir, "src"), { recursive: true });
      await writeFile(
        join(productDir, TSCONFIG_FILES.full),
        JSON.stringify({ compilerOptions: { noEmit: true, strict: true }, include: ["src/**/*.ts"] }),
      );
      await writeFile(join(productDir, "src/index.ts"), "export const productContextValue: string = 'valid';\n");
      const nestedProductDir = join(productDir, scope.nestedDirectory);
      await mkdir(nestedProductDir, { recursive: true });
      const validationArgs = [
        validationCliDefinition.domain.commandName,
        validationCliDefinition.subcommands.typescript.commandName,
        validationCommonCliOptions.scope.flag,
        VALIDATION_SCOPES.FULL,
      ] as const;
      observations.push({
        direct: await runProductContextCli(validationArgs, { processCwd: nestedProductDir }),
        redirected: await runProductContextCli(
          [SPX_GLOBAL_OPTIONS.directory.short, nestedProductDir, ...validationArgs],
          { processCwd: callerDir },
        ),
        scope,
      });
    }
    return observations;
  });
}

export async function observeSessionContextMappings(): Promise<readonly SessionContextMappingObservation[]> {
  return withProductContextTempDirs(async (tempDirs) => {
    const observations: SessionContextMappingObservation[] = [];
    for (const scope of resolutionScopes()) {
      const sessionEnv = await createSessionHarness();
      try {
        const productDir = await tempDirs.makeTempDir();
        await runGit(productDir, [GIT_TEST_SUBCOMMANDS.INIT, GIT_TEST_FLAGS.QUIET]);
        const nestedProductDir = join(productDir, scope.nestedDirectory);
        await mkdir(nestedProductDir, { recursive: true });
        const callerRoot = await tempDirs.makeTempDir();
        const callerDir = join(callerRoot, scope.nestedDirectory);
        await mkdir(callerDir, { recursive: true });
        const sessionId = sampleSessionId();
        const sessionFile = await sessionEnv.writeSession(SESSION_STATUSES[0], sessionId);
        const sharedStatusDir = join(
          sessionsScopeDir(productDir),
          DEFAULT_CONFIG.sessions.statusDirs[SESSION_STATUSES[0]],
        );
        await mkdir(sharedStatusDir, { recursive: true });
        await copyFile(sessionFile, join(sharedStatusDir, basename(sessionFile)));
        observations.push({
          direct: await runProductContextCli(sessionListJsonArgs(), { processCwd: nestedProductDir }),
          redirected: await runProductContextCli(
            [SPX_GLOBAL_OPTIONS.directory.short, nestedProductDir, ...sessionListJsonArgs()],
            { processCwd: callerDir },
          ),
          scope,
          sessionId,
        });
      } finally {
        await sessionEnv.cleanup();
      }
    }
    return observations;
  });
}

export async function observeAbsentContextMappings(): Promise<readonly AbsentContextMappingObservation[]> {
  return withProductContextTempDirs(async (tempDirs) => {
    const observations: AbsentContextMappingObservation[] = [];
    for (const scope of resolutionScopes()) {
      const processRoot = await tempDirs.makeTempDir();
      const processDir = join(processRoot, scope.nestedDirectory);
      await mkdir(processDir, { recursive: true });
      const expectedWarning = resolveProductDir(processDir, { readGitToplevel: () => undefined }).warning;
      if (expectedWarning === undefined) throw new Error("non-git product directory must produce a warning");
      observations.push({
        expectedWarning,
        processDir,
        result: await runProductContextCli(
          [CONFIG_CLI.commandName, CONFIG_CLI.commands.validate],
          { processCwd: processDir },
        ),
        scope,
      });
    }
    return observations;
  });
}

export function parseObservedProductContextConfig(observation: ConfigContextMappingObservation): {
  readonly direct: ReturnType<typeof parseProductContextJsonConfig>;
  readonly redirected: ReturnType<typeof parseProductContextJsonConfig>;
} {
  return {
    direct: parseProductContextJsonConfig(observation.direct.stdout, observation.productDir),
    redirected: parseProductContextJsonConfig(observation.redirected.stdout, observation.productDir),
  };
}

export function observedTestingConfig(config: ReturnType<typeof parseProductContextJsonConfig>): unknown {
  return productContextTestingConfig(config);
}
