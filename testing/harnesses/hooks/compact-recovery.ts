import { mkdir, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { CONFIG_FILENAMES } from "@/config/index";
import {
  DEFAULT_METHODOLOGY_SOURCE,
  METHODOLOGY_CONFIG_FIELDS,
  METHODOLOGY_SECTION,
  type MethodologyConfig,
} from "@/config/methodology";
import type { Result } from "@/config/types";
import {
  AGENT,
  HARNESS_ENVIRONMENT_CONFIG_FIELDS,
  HARNESS_ENVIRONMENT_SECTION,
} from "@/domains/agent-environment/config";
import {
  HOOK_SESSION_START_ENV,
  HOOK_SESSION_START_PAYLOAD,
  HOOK_SESSION_START_SOURCE,
  type HookSessionStartEnv,
} from "@/domains/hooks/session-start";
import { CONTROLLING_PID_ENV } from "@/domains/worktree/controlling-process";
import { HOOK_CLI } from "@/interfaces/cli/hook";
import { HOOK_EVENT } from "@/interfaces/hooks/registry";
import {
  type CompactDirectiveInput,
  runSessionStartHook,
  type SessionStartHookResult,
} from "@/interfaces/hooks/session-start";
import { defaultGitDependencies } from "@/lib/git/root";
import { METHODOLOGY_CODING_AGENT } from "@/lib/methodology/coding-agent";
import { resolveCompactRecoveryDirective } from "@/lib/methodology/compact-recovery";
import {
  FOUNDATION_MANIFEST_FIELDS,
  FOUNDATION_MANIFEST_RELATIVE_PATH,
  FOUNDATION_MANIFEST_SCHEMA_VERSION,
} from "@/lib/methodology/foundation-manifest";
import { FOUNDATION_PLUGIN_NAME, methodologyLine } from "@/lib/methodology/tree";
import { defaultMethodologyTreeFileSystem } from "@/lib/methodology/tree-resource";
import { arbitraryMethodologyVersion } from "@testing/generators/methodology/tree";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import { type HookCliWorktreeEnv, withHookCliWorktreeEnv } from "@testing/harnesses/hook-cli";
import {
  shippedCompactRecoveryText,
  shippedMethodologyVersion,
  shippedTreeRelativeDir,
} from "@testing/harnesses/methodology/shipped-tree";
import { withTempDir } from "@testing/harnesses/with-temp-dir";
import { runWorktreeCli, type SpxCliResult, withWorktreePool } from "@testing/harnesses/worktree/harness";

const CORE_PATH = "skills/understand/SKILL.md";
const COMPACT_RECOVERY_PATH = "skills/understand/compact-recovery.md";
const ESCAPE_TARGET_FILENAME = "outside-directive.md";
const TEMP_PREFIX = "compact-recovery-";

/** The shipped-tree states the directive resolution mapping exercises. */
export const COMPACT_RECOVERY_FIXTURE_VARIANT = {
  RESOLVED: "resolved",
  UNDECLARED_VERSION: "undeclared-version",
  LINE_UNSHIPPED: "line-unshipped",
  MANIFEST_ABSENT: "manifest-absent",
  MANIFEST_INVALID: "manifest-invalid",
  ENTRY_ABSENT: "entry-absent",
  RESOURCE_MISSING: "resource-missing",
  RESOURCE_ESCAPING: "resource-escaping",
  RESOURCE_INVALID_UTF8: "resource-invalid-utf8",
} as const;

export type CompactRecoveryFixtureVariant =
  (typeof COMPACT_RECOVERY_FIXTURE_VARIANT)[keyof typeof COMPACT_RECOVERY_FIXTURE_VARIANT];

export interface CompactRecoveryTreeFixture {
  /** The temp directory standing in for spx's `methodology/` directory. */
  readonly treeRoot: string;
  /** The payload product's methodology declaration the fixture tree serves. */
  readonly methodology: MethodologyConfig;
  /** The declared exact version. */
  readonly version: string;
  /** The line the declared version derives to. */
  readonly line: string;
  /** The coding agent the fixture tree belongs to. */
  readonly codingAgent: string;
  /** The absolute path of the written manifest file. */
  readonly manifestPath: string;
  /** The plugin-relative compact-recovery entry the manifest names. */
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

async function writeTreeFile(treeDir: string, relativePath: string, content: string): Promise<string> {
  const absolute = join(treeDir, relativePath);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, content, "utf8");
  return absolute;
}

/**
 * Materializes one shipped-tree state under a temp tree root and hands its
 * locations to the callback. The callback owns every assertion; the harness
 * only builds and removes the fixture.
 */
export async function withCompactRecoveryTree(
  options: { readonly directiveText: string; readonly variant: CompactRecoveryFixtureVariant },
  callback: (fixture: CompactRecoveryTreeFixture) => Promise<void>,
): Promise<void> {
  const version = sampleGeneratedValue(arbitraryMethodologyVersion());
  const line = methodologyLine(version.text);
  if (!line.ok) throw new Error(line.error);
  const codingAgent = METHODOLOGY_CODING_AGENT.CODEX;
  await withTempDir(TEMP_PREFIX, async (treeRoot) => {
    const treeDir = join(treeRoot, line.value, codingAgent, FOUNDATION_PLUGIN_NAME);
    const manifestPath = join(treeDir, FOUNDATION_MANIFEST_RELATIVE_PATH);
    if (options.variant !== COMPACT_RECOVERY_FIXTURE_VARIANT.LINE_UNSHIPPED) {
      await mkdir(treeDir, { recursive: true });
    }

    switch (options.variant) {
      // The undeclared-version tree is complete, so the declaration is the only step that can fail.
      case COMPACT_RECOVERY_FIXTURE_VARIANT.UNDECLARED_VERSION:
      case COMPACT_RECOVERY_FIXTURE_VARIANT.RESOLVED: {
        await writeTreeFile(treeDir, FOUNDATION_MANIFEST_RELATIVE_PATH, manifestJson(COMPACT_RECOVERY_PATH));
        await writeTreeFile(treeDir, CORE_PATH, options.directiveText);
        await writeTreeFile(treeDir, COMPACT_RECOVERY_PATH, options.directiveText);
        break;
      }
      case COMPACT_RECOVERY_FIXTURE_VARIANT.LINE_UNSHIPPED:
      case COMPACT_RECOVERY_FIXTURE_VARIANT.MANIFEST_ABSENT: {
        break;
      }
      case COMPACT_RECOVERY_FIXTURE_VARIANT.MANIFEST_INVALID: {
        // A leading brace with no closing structure cannot parse as JSON whatever the text.
        await writeTreeFile(treeDir, FOUNDATION_MANIFEST_RELATIVE_PATH, `{${options.directiveText}`);
        break;
      }
      case COMPACT_RECOVERY_FIXTURE_VARIANT.ENTRY_ABSENT: {
        await writeTreeFile(treeDir, FOUNDATION_MANIFEST_RELATIVE_PATH, manifestJson());
        await writeTreeFile(treeDir, CORE_PATH, options.directiveText);
        break;
      }
      case COMPACT_RECOVERY_FIXTURE_VARIANT.RESOURCE_MISSING: {
        await writeTreeFile(treeDir, FOUNDATION_MANIFEST_RELATIVE_PATH, manifestJson(COMPACT_RECOVERY_PATH));
        break;
      }
      case COMPACT_RECOVERY_FIXTURE_VARIANT.RESOURCE_INVALID_UTF8: {
        await writeTreeFile(treeDir, FOUNDATION_MANIFEST_RELATIVE_PATH, manifestJson(COMPACT_RECOVERY_PATH));
        const resourcePath = join(treeDir, COMPACT_RECOVERY_PATH);
        await mkdir(dirname(resourcePath), { recursive: true });
        // 0xff can begin no UTF-8 sequence, so a strict decode always rejects this content.
        await writeFile(resourcePath, Buffer.from([0xff, 0xfe, 0xfd]));
        break;
      }
      case COMPACT_RECOVERY_FIXTURE_VARIANT.RESOURCE_ESCAPING: {
        await writeTreeFile(treeDir, FOUNDATION_MANIFEST_RELATIVE_PATH, manifestJson(COMPACT_RECOVERY_PATH));
        const escapeTarget = join(treeRoot, ESCAPE_TARGET_FILENAME);
        await writeFile(escapeTarget, options.directiveText, "utf8");
        const linkPath = join(treeDir, COMPACT_RECOVERY_PATH);
        await mkdir(dirname(linkPath), { recursive: true });
        await symlink(escapeTarget, linkPath);
        break;
      }
    }

    await callback({
      treeRoot,
      methodology: options.variant === COMPACT_RECOVERY_FIXTURE_VARIANT.UNDECLARED_VERSION
        ? { source: DEFAULT_METHODOLOGY_SOURCE }
        : { source: DEFAULT_METHODOLOGY_SOURCE, version: version.text },
      version: version.text,
      line: line.value,
      codingAgent,
      manifestPath,
      entryPath: COMPACT_RECOVERY_PATH,
      directiveText: options.directiveText,
    });
  });
}

/**
 * Writes the payload product's config document declaring the Codex compact
 * stdout policy, optionally alongside a `methodology.version` declaration.
 */
export async function writeCodexCompactStdoutConfig(
  productDir: string,
  compactStdout: unknown = true,
  methodologyVersion?: string,
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
      ...(methodologyVersion === undefined ? {} : {
        [METHODOLOGY_SECTION]: {
          [METHODOLOGY_CONFIG_FIELDS.VERSION]: methodologyVersion,
        },
      }),
    }),
  );
}

/** Writes a config document whose `methodology` section fails typed resolution: `version` is not a string. */
export async function writeMalformedMethodologyConfig(productDir: string): Promise<void> {
  await writeFile(
    join(productDir, CONFIG_FILENAMES.json),
    JSON.stringify({
      [METHODOLOGY_SECTION]: {
        [METHODOLOGY_CONFIG_FIELDS.VERSION]: false,
      },
    }),
  );
}

/** Writes the payload product's config document declaring only `methodology.version`. */
export async function writeMethodologyOnlyConfig(productDir: string, methodologyVersion: string): Promise<void> {
  await writeFile(
    join(productDir, CONFIG_FILENAMES.json),
    JSON.stringify({
      [METHODOLOGY_SECTION]: {
        [METHODOLOGY_CONFIG_FIELDS.VERSION]: methodologyVersion,
      },
    }),
  );
}

export { shippedCompactRecoveryText, shippedMethodologyVersion, shippedTreeRelativeDir };

export interface CompactHookCaseOptions {
  readonly compactStdout: boolean;
  /** The payload lifecycle source the case exercises. */
  readonly source: string;
  readonly resolveCompactDirective: (input: CompactDirectiveInput) => Promise<Result<string>>;
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

/**
 * Materializes the resolved-variant tree for the supplied directive text and
 * runs one compact-source hook invocation through the real library resolver,
 * handing the raw result and fixture to the callback.
 */
export async function withResolvedCompactOutputCase(
  directiveText: string,
  callback: (
    result: Result<SessionStartHookResult>,
    fixture: CompactRecoveryTreeFixture,
  ) => Promise<void> | void,
): Promise<void> {
  await withCompactRecoveryTree(
    { directiveText, variant: COMPACT_RECOVERY_FIXTURE_VARIANT.RESOLVED },
    async (fixture) => {
      const result = await runCompactOutputHookCase({
        compactStdout: true,
        source: HOOK_SESSION_START_SOURCE.COMPACT,
        resolveCompactDirective: () =>
          resolveCompactRecoveryDirective({
            treeRoot: fixture.treeRoot,
            methodology: fixture.methodology,
            codingAgent: fixture.codingAgent,
            fs: defaultMethodologyTreeFileSystem,
          }),
      });
      await callback(result, fixture);
    },
  );
}

export interface RecordingCompactDirectiveResolver {
  readonly resolver: (input: CompactDirectiveInput) => Promise<Result<string>>;
  /** One entry per invocation: the product directory the adapter resolved against. */
  readonly invocations: readonly string[];
}

/** A recording resolver: returns the supplied directive and records each invocation for the test to judge. */
export function createRecordingCompactDirectiveResolver(directiveText: string): RecordingCompactDirectiveResolver {
  const invocations: string[] = [];
  return {
    invocations,
    resolver: (input: CompactDirectiveInput) => {
      invocations.push(input.productDir);
      return Promise.resolve({ ok: true, value: directiveText });
    },
  };
}
