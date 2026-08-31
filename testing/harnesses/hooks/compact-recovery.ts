import { mkdir, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { CONFIG_FILENAMES } from "@/config/index";
import { METHODOLOGY_CONFIG_FIELDS, METHODOLOGY_SECTION } from "@/config/methodology";
import type { Result } from "@/config/types";
import {
  AGENT,
  HARNESS_ENVIRONMENT_CONFIG_FIELDS,
  HARNESS_ENVIRONMENT_SECTION,
} from "@/domains/agent-environment/config";
import {
  HOOK_SESSION_START_ENV,
  HOOK_SESSION_START_PAYLOAD,
  type HookSessionStartEnv,
} from "@/domains/hooks/session-start";
import { CONTROLLING_PID_ENV } from "@/domains/worktree/controlling-process";
import { HOOK_CLI } from "@/interfaces/cli/hook";
import { HOOK_EVENT } from "@/interfaces/hooks/registry";
import { runSessionStartHook, type SessionStartHookResult } from "@/interfaces/hooks/session-start";
import { defaultGitDependencies } from "@/lib/git/root";
import {
  FOUNDATION_MANIFEST_FIELDS,
  FOUNDATION_MANIFEST_RELATIVE_PATH,
  FOUNDATION_MANIFEST_SCHEMA_VERSION,
} from "@/lib/methodology/foundation-manifest";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import { type HookCliWorktreeEnv, withHookCliWorktreeEnv } from "@testing/harnesses/hook-cli";
import { withTempDir } from "@testing/harnesses/with-temp-dir";
import { runWorktreeCli, type SpxCliResult, withWorktreePool } from "@testing/harnesses/worktree/harness";

const PACKAGE_DIRECTORY = "methodology-package";
const CORE_PATH = "skills/understand/SKILL.md";
const COMPACT_RECOVERY_PATH = "skills/understand/compact-recovery.md";
const ESCAPE_TARGET_FILENAME = "outside-directive.md";
const TEMP_PREFIX = "compact-recovery-";

/** The materialized-package states the directive resolution mapping exercises. */
export const COMPACT_RECOVERY_FIXTURE_VARIANT = {
  RESOLVED: "resolved",
  PACKAGE_UNCONFIGURED: "package-unconfigured",
  MANIFEST_ABSENT: "manifest-absent",
  MANIFEST_INVALID: "manifest-invalid",
  ENTRY_ABSENT: "entry-absent",
  RESOURCE_MISSING: "resource-missing",
  RESOURCE_ESCAPING: "resource-escaping",
} as const;

export type CompactRecoveryFixtureVariant =
  (typeof COMPACT_RECOVERY_FIXTURE_VARIANT)[keyof typeof COMPACT_RECOVERY_FIXTURE_VARIANT];

export interface CompactRecoveryPackageFixture {
  /** The temp product directory the package sits under. */
  readonly productDir: string;
  /** The product-relative package directory, or undefined for the unconfigured variant. */
  readonly packageDir: string | undefined;
  /** The absolute path of the written manifest file. */
  readonly manifestPath: string;
  /** The package-relative compact-recovery entry the manifest names. */
  readonly entryPath: string;
  /** The exact directive text the resolved variant's resource carries. */
  readonly directiveText: string;
}

function manifestJson(compactRecovery?: string): string {
  return JSON.stringify({
    [FOUNDATION_MANIFEST_FIELDS.SCHEMA_VERSION]: FOUNDATION_MANIFEST_SCHEMA_VERSION,
    [FOUNDATION_MANIFEST_FIELDS.CORE]: CORE_PATH,
    [FOUNDATION_MANIFEST_FIELDS.REFERENCES]: [],
    [FOUNDATION_MANIFEST_FIELDS.TEMPLATES]: [],
    [FOUNDATION_MANIFEST_FIELDS.EXAMPLES]: [],
    ...(compactRecovery === undefined ? {} : { [FOUNDATION_MANIFEST_FIELDS.COMPACT_RECOVERY]: compactRecovery }),
  });
}

async function writePackageFile(packageRoot: string, relativePath: string, content: string): Promise<string> {
  const absolute = join(packageRoot, relativePath);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, content, "utf8");
  return absolute;
}

/**
 * Materializes one installed-methodology-package state under a temp product
 * directory and hands its locations to the callback. The callback owns every
 * assertion; the harness only builds and removes the fixture.
 */
export async function withCompactRecoveryPackage(
  options: { readonly directiveText: string; readonly variant: CompactRecoveryFixtureVariant },
  callback: (fixture: CompactRecoveryPackageFixture) => Promise<void>,
): Promise<void> {
  await withTempDir(TEMP_PREFIX, async (productDir) => {
    const packageRoot = join(productDir, PACKAGE_DIRECTORY);
    const manifestPath = join(packageRoot, FOUNDATION_MANIFEST_RELATIVE_PATH);
    await mkdir(packageRoot, { recursive: true });

    switch (options.variant) {
      case COMPACT_RECOVERY_FIXTURE_VARIANT.RESOLVED: {
        await writePackageFile(packageRoot, FOUNDATION_MANIFEST_RELATIVE_PATH, manifestJson(COMPACT_RECOVERY_PATH));
        await writePackageFile(packageRoot, CORE_PATH, options.directiveText);
        await writePackageFile(packageRoot, COMPACT_RECOVERY_PATH, options.directiveText);
        break;
      }
      case COMPACT_RECOVERY_FIXTURE_VARIANT.PACKAGE_UNCONFIGURED:
      case COMPACT_RECOVERY_FIXTURE_VARIANT.MANIFEST_ABSENT: {
        break;
      }
      case COMPACT_RECOVERY_FIXTURE_VARIANT.MANIFEST_INVALID: {
        // A leading brace with no closing structure cannot parse as JSON whatever the text.
        await writePackageFile(packageRoot, FOUNDATION_MANIFEST_RELATIVE_PATH, `{${options.directiveText}`);
        break;
      }
      case COMPACT_RECOVERY_FIXTURE_VARIANT.ENTRY_ABSENT: {
        await writePackageFile(packageRoot, FOUNDATION_MANIFEST_RELATIVE_PATH, manifestJson());
        await writePackageFile(packageRoot, CORE_PATH, options.directiveText);
        break;
      }
      case COMPACT_RECOVERY_FIXTURE_VARIANT.RESOURCE_MISSING: {
        await writePackageFile(packageRoot, FOUNDATION_MANIFEST_RELATIVE_PATH, manifestJson(COMPACT_RECOVERY_PATH));
        break;
      }
      case COMPACT_RECOVERY_FIXTURE_VARIANT.RESOURCE_ESCAPING: {
        await writePackageFile(packageRoot, FOUNDATION_MANIFEST_RELATIVE_PATH, manifestJson(COMPACT_RECOVERY_PATH));
        const escapeTarget = join(productDir, ESCAPE_TARGET_FILENAME);
        await writeFile(escapeTarget, options.directiveText, "utf8");
        const linkPath = join(packageRoot, COMPACT_RECOVERY_PATH);
        await mkdir(dirname(linkPath), { recursive: true });
        await symlink(escapeTarget, linkPath);
        break;
      }
    }

    await callback({
      productDir,
      packageDir: options.variant === COMPACT_RECOVERY_FIXTURE_VARIANT.PACKAGE_UNCONFIGURED
        ? undefined
        : PACKAGE_DIRECTORY,
      manifestPath,
      entryPath: COMPACT_RECOVERY_PATH,
      directiveText: options.directiveText,
    });
  });
}

/**
 * Materializes the resolved-variant installed methodology package under an
 * existing product directory and returns the product-relative package
 * directory a `methodology.packageDir` declaration points at.
 */
export async function writeResolvedCompactRecoveryPackage(
  productDir: string,
  directiveText: string,
): Promise<{ readonly packageDir: string }> {
  const packageRoot = join(productDir, PACKAGE_DIRECTORY);
  await writePackageFile(packageRoot, FOUNDATION_MANIFEST_RELATIVE_PATH, manifestJson(COMPACT_RECOVERY_PATH));
  await writePackageFile(packageRoot, CORE_PATH, directiveText);
  await writePackageFile(packageRoot, COMPACT_RECOVERY_PATH, directiveText);
  return { packageDir: PACKAGE_DIRECTORY };
}

/**
 * Writes the payload product's config document declaring the Codex compact
 * stdout policy, optionally alongside a `methodology.packageDir` declaration.
 */
export async function writeCodexCompactStdoutConfig(
  productDir: string,
  compactStdout: unknown = true,
  methodologyPackageDir?: string,
): Promise<void> {
  await writeFile(
    join(productDir, CONFIG_FILENAMES.json),
    JSON.stringify({
      [HARNESS_ENVIRONMENT_SECTION]: {
        [HARNESS_ENVIRONMENT_CONFIG_FIELDS.AGENTS]: {
          [AGENT.CODEX]: {
            [HARNESS_ENVIRONMENT_CONFIG_FIELDS.HOOKS]: {
              [HARNESS_ENVIRONMENT_CONFIG_FIELDS.SESSION_START]: {
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.COMPACT_STDOUT]: compactStdout,
              },
            },
          },
        },
      },
      ...(methodologyPackageDir === undefined ? {} : {
        [METHODOLOGY_SECTION]: {
          [METHODOLOGY_CONFIG_FIELDS.PACKAGE_DIR]: methodologyPackageDir,
        },
      }),
    }),
  );
}

/** Writes a config document whose `methodology` section fails typed resolution: `packageDir` is not a string. */
export async function writeMalformedMethodologyConfig(productDir: string): Promise<void> {
  await writeFile(
    join(productDir, CONFIG_FILENAMES.json),
    JSON.stringify({
      [METHODOLOGY_SECTION]: {
        [METHODOLOGY_CONFIG_FIELDS.PACKAGE_DIR]: false,
      },
    }),
  );
}

/** Writes the payload product's config document declaring only `methodology.packageDir`. */
export async function writeMethodologyOnlyConfig(
  productDir: string,
  methodologyPackageDir: string,
): Promise<void> {
  await writeFile(
    join(productDir, CONFIG_FILENAMES.json),
    JSON.stringify({
      [METHODOLOGY_SECTION]: {
        [METHODOLOGY_CONFIG_FIELDS.PACKAGE_DIR]: methodologyPackageDir,
      },
    }),
  );
}

export interface CompactHookCaseOptions {
  readonly compactStdout: boolean;
  /** The payload lifecycle source the case exercises. */
  readonly source: string;
  readonly resolveCompactDirective: (productDir: string) => Promise<Result<string>>;
}

/**
 * Runs one `session-start` hook invocation against a sampled worktree pool with
 * the fixed compact-output wiring — payload, environment, claim inputs, and the
 * injected directive resolver — and returns the raw hook result for the test to
 * judge.
 */
export async function runCompactOutputHookCase(
  options: CompactHookCaseOptions,
): Promise<Result<SessionStartHookResult>> {
  const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
  const holder = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolHolder());
  const sessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
  const envFileName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.envFileName());
  const claimRandomBytes = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes());

  let result: Result<SessionStartHookResult> | undefined;
  await withWorktreePool({ worktreeName, holder }, async (env) => {
    const hookEnv: HookSessionStartEnv = {
      [CONTROLLING_PID_ENV]: String(env.holder.pid),
      [HOOK_SESSION_START_ENV.CODEX_THREAD_ID]: sessionId,
    };
    result = await runSessionStartHook({
      claimRandomBytes,
      compactStdout: options.compactStdout,
      content: JSON.stringify({
        [HOOK_SESSION_START_PAYLOAD.CWD]: env.worktreePath,
        [HOOK_SESSION_START_PAYLOAD.SOURCE]: options.source,
      }),
      cwd: env.container,
      envFile: join(env.container, envFileName),
      fs: env.fs,
      gitDeps: defaultGitDependencies,
      worktreesDir: env.worktreesDir,
      processTable: env.processTable,
      resolveCompactDirective: options.resolveCompactDirective,
      selfPid: env.holder.pid,
      env: hookEnv,
    });
  });
  if (result === undefined) throw new Error("compact hook case produced no result");
  return result;
}

export interface CompactSessionStartCliCase {
  /** Environment variables the CLI process receives. */
  readonly env: Record<string, string>;
  /** The process invocation directory; defaults to the payload product (the pool worktree). */
  readonly invocationDir?: string;
}

/**
 * Runs the built `spx hook run session-start` with the fixed compact-source
 * argument and payload shape against a hook CLI worktree environment.
 */
export async function runCompactSessionStartCli(
  env: HookCliWorktreeEnv,
  compactSource: string,
  cliCase: CompactSessionStartCliCase,
): Promise<SpxCliResult> {
  return runWorktreeCli(
    [
      HOOK_CLI.COMMAND,
      HOOK_CLI.RUN,
      HOOK_EVENT.SESSION_START,
      HOOK_CLI.ENV_FILE_FLAG,
      env.envFile,
      HOOK_CLI.WORKTREES_DIR_FLAG,
      env.worktreesDir,
    ],
    cliCase.env,
    cliCase.invocationDir ?? env.worktreePath,
    JSON.stringify({
      [HOOK_SESSION_START_PAYLOAD.CWD]: env.worktreePath,
      [HOOK_SESSION_START_PAYLOAD.SOURCE]: compactSource,
    }),
  );
}

/** Samples the hook CLI worktree-environment inputs and runs the callback inside that environment. */
export async function withCompactSessionStartCliEnv(
  callback: (env: HookCliWorktreeEnv) => Promise<void>,
): Promise<void> {
  await withHookCliWorktreeEnv(
    {
      envFileName: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.envFileName()),
      prefix: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix()),
      worktreeName: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName()),
    },
    callback,
  );
}

export interface RecordingCompactDirectiveResolver {
  readonly resolver: (productDir: string) => Promise<Result<string>>;
  /** One entry per invocation: the product directory the adapter resolved against. */
  readonly invocations: readonly string[];
}

/** A recording resolver: returns the supplied directive and records each invocation for the test to judge. */
export function createRecordingCompactDirectiveResolver(directiveText: string): RecordingCompactDirectiveResolver {
  const invocations: string[] = [];
  return {
    invocations,
    resolver: (productDir: string) => {
      invocations.push(productDir);
      return Promise.resolve({ ok: true, value: directiveText });
    },
  };
}
