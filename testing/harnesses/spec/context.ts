import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, realpath, symlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, parse, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

import { execa } from "execa";
import * as fc from "fast-check";
import { build } from "tsup";
import { expect, it } from "vitest";

import { type ContextOptions, SPEC_CONTEXT_TEXT_LABEL } from "@/commands/spec/context";
import { SPEC_NEXT_MESSAGE } from "@/commands/spec/next";
import { OUTPUT_FORMAT } from "@/commands/spec/status";
import { METHODOLOGY_CONFIG_FIELDS, METHODOLOGY_SECTION } from "@/config/methodology";
import { LEGACY_METHODOLOGY_CONFIG_SECTION } from "@/config/methodology-placement";
import type { Config } from "@/config/types";
import {
  decodeContextDocumentUtf8,
  formatInvalidContextDocumentError,
  formatMissingCitedDecisionError,
  formatUnreadableContextDocumentError,
  SPEC_CONTEXT_DIGEST_ALGORITHM,
  SPEC_CONTEXT_LIFECYCLE_OVERLAY_PATH,
  SPEC_CONTEXT_LISTED_ROLE,
  SPEC_CONTEXT_MANIFEST_SCHEMA_VERSION,
  SPEC_CONTEXT_READ_ROLE,
  SPEC_CONTEXT_READ_ROLE_ORDER,
  specContextBootstrap,
  specContextDigest,
  type SpecContextListedRole,
  type SpecContextManifest,
} from "@/domains/spec/context-manifest";
import { resolveSpecContextTarget, SPEC_CONTEXT_TARGET_FAILURE_KIND } from "@/domains/spec/context-target";
import {
  contextOutputForFormat,
  formatSpecContextTargetFailure,
  SPEC_CONTEXT_CONTENT_MESSAGE,
  SPEC_CONTEXT_OUTPUT_FORMAT,
  SPEC_DOMAIN_CLI,
} from "@/interfaces/cli/spec";
import { SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX } from "@/interfaces/cli/spec-context-contract";
import { GIT_LS_FILES_COMMAND } from "@/lib/git/changed-paths";
import { GIT_ROOT_COMMAND, type GitDependencies } from "@/lib/git/root";
import { TRACKED_PATH_NUL_SEPARATOR } from "@/lib/git/tracked-paths";
import { NODE_STATUS_FILENAME } from "@/lib/node-status";
import { sanitizeCliArgument } from "@/lib/sanitize-cli-argument";
import { type SpecTreeNode, type SpecTreeSnapshot } from "@/lib/spec-tree";
import { KIND_REGISTRY, SPEC_TREE_CONFIG, SPEC_TREE_CONFIG_FIELDS, SPEC_TREE_GRAMMAR } from "@/lib/spec-tree";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import { GIT_WORKTREE_TEST_GENERATOR, sampleGitWorktreeTestValue } from "@testing/generators/git-worktree/git-worktree";
import {
  SPEC_CONTEXT_EMPTY_SEGMENT_TOPOLOGY,
  SPEC_CONTEXT_FILESYSTEM_ARTIFACT_TYPE,
  SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND,
  specContextAbbreviatedTarget as abbreviatedTarget,
  specContextAmbiguousTargetFixture as ambiguousTargetFixture,
  type SpecContextArtifactMappingCase,
  specContextArtifactTargetFixture as artifactTargetFixture,
  type SpecContextEmptySegmentMappingCase,
  specContextEmptySegmentSourceFixture as emptySegmentSourceFixture,
  specContextEmptySegmentTargetFixture as emptySegmentTargetFixture,
  specContextExactPrefixTargetFixture as exactPrefixTargetFixture,
  specContextLowerSiblingDirectoryName as lowerSiblingDirectoryName,
  specContextNestedAmbiguousTarget as nestedAmbiguousTarget,
  specContextSameIndexSiblingDirectoryName as sameIndexSiblingDirectoryName,
  type SpecContextTargetDiagnosticSafetyCase,
  specContextTargetDiagnosticSafetyCases,
  type SpecContextTargetMappingCase,
  specContextTargetMappingCases,
  specContextUnrecognizedNodeDirectoryTarget as unrecognizedNodeDirectoryTarget,
} from "@testing/generators/spec-tree/context-target";
import {
  specCliApplyProtectionFixture,
  specCliContextTargetFixture,
  specCliDeclaredStatusRows,
  specCliUnsupportedStatusFormatFixture,
} from "@testing/generators/spec-tree/spec-cli";
import {
  RETIRED_SPEC_APPLY_FIXTURE,
  sampleSpecTreeTestValue,
  SPEC_TREE_TEST_GENERATOR,
  specTreeFixtureNodeDirectoryName,
} from "@testing/generators/spec-tree/spec-tree";
import { generatedMethodologySection } from "@testing/harnesses/config/methodology";
import { CLI_PATH, NODE_EXECUTABLE } from "@testing/harnesses/constants";
import { GIT_TEST_CONFIG, GIT_TEST_FLAGS, GIT_TEST_SUBCOMMANDS, runGit } from "@testing/harnesses/git-test-constants";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import {
  arbitraryDecisionPath,
  arbitraryNodePath,
  type CurrentSpecTreeEnv,
  withSpecTreeEnv,
} from "@testing/harnesses/spec-tree/spec-tree";
import { SPEC_CLI_ISOLATION } from "@testing/harnesses/spec/spec-cli-isolation-contract";
import { SPEC_CLI_NETWORK_GUARD_SOURCE_PATH } from "@testing/harnesses/spec/spec-cli-network-guard";
import { createTempDir, removeTempDir } from "@testing/harnesses/with-temp-dir";

const PARAMETERIZED_CONTEXT_CASE_TITLE = "$title";

export function registerSpecContextTargetMappingEvidence(): void {
  it.each(specContextTargetMappingCases())(
    PARAMETERIZED_CONTEXT_CASE_TITLE,
    assertSpecContextTargetMappingCase,
  );
  it.each(specContextTargetDiagnosticSafetyCases())(
    PARAMETERIZED_CONTEXT_CASE_TITLE,
    assertSpecContextTargetDiagnosticSafetyCase,
  );
  it("orders ambiguous-segment candidates by code units where locale collation disagrees", async () => {
    await assertSpecContextOrdersAmbiguousCandidatesByCodeUnits();
  });
}

function parseContextManifest(output: string): SpecContextManifest {
  return JSON.parse(output) as SpecContextManifest;
}

function contextCommand(options: ContextOptions): Promise<string> {
  return contextOutputForFormat(SPEC_CONTEXT_OUTPUT_FORMAT.JSON, options);
}

function contextTextCommand(options: ContextOptions): Promise<string> {
  return contextOutputForFormat(SPEC_CONTEXT_OUTPUT_FORMAT.TEXT, options);
}

function trackedSpecContextGitDependencies(productDir: string, trackedPaths: readonly string[]): GitDependencies {
  return {
    execa: async (command, args) => {
      if (
        command === GIT_ROOT_COMMAND.EXECUTABLE
        && args.includes(GIT_ROOT_COMMAND.REV_PARSE)
        && args.includes(GIT_ROOT_COMMAND.SHOW_TOPLEVEL)
      ) {
        return { exitCode: 0, stdout: productDir, stderr: "" };
      }
      if (command === GIT_ROOT_COMMAND.EXECUTABLE && args.includes("ls-files")) {
        return { exitCode: 0, stdout: trackedPaths.join(TRACKED_PATH_NUL_SEPARATOR), stderr: "" };
      }
      return { exitCode: 128, stdout: "", stderr: "" };
    },
  };
}

async function rejectedContextMessage(target: string, productDir: string): Promise<string> {
  try {
    await contextCommand({ target, cwd: productDir });
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error(`Expected spec context target to be rejected: ${target}`);
}

async function buildSpecCliNetworkGuard(isolationDir: string): Promise<string> {
  await build({
    bundle: true,
    clean: false,
    entry: {
      [parse(SPEC_CLI_ISOLATION.NETWORK_GUARD_MODULE).name]: SPEC_CLI_NETWORK_GUARD_SOURCE_PATH,
    },
    format: "esm",
    outDir: isolationDir,
    outExtension: () => ({ js: parse(SPEC_CLI_ISOLATION.NETWORK_GUARD_MODULE).ext }),
    silent: true,
    splitting: false,
    target: "node24",
  });
  return pathToFileURL(join(isolationDir, SPEC_CLI_ISOLATION.NETWORK_GUARD_MODULE)).href;
}

async function runSpecCli(productDir: string, ...args: readonly string[]) {
  return (await runSpecCliWithIsolation(productDir, ...args)).result;
}

async function runSpecCliWithIsolation(productDir: string, ...args: readonly string[]) {
  const isolationDir = join(productDir, SPEC_CLI_ISOLATION.DIRECTORY);
  const homeDir = join(isolationDir, SPEC_CLI_ISOLATION.HOME_DIRECTORY);
  const tempDir = join(isolationDir, SPEC_CLI_ISOLATION.TEMP_DIRECTORY);
  const xdgCacheDir = join(isolationDir, SPEC_CLI_ISOLATION.XDG_CACHE_DIRECTORY);
  const xdgConfigDir = join(isolationDir, SPEC_CLI_ISOLATION.XDG_CONFIG_DIRECTORY);
  const xdgDataDir = join(isolationDir, SPEC_CLI_ISOLATION.XDG_DATA_DIRECTORY);
  const xdgStateDir = join(isolationDir, SPEC_CLI_ISOLATION.XDG_STATE_DIRECTORY);
  const mutableStateDirectories = [homeDir, tempDir, xdgCacheDir, xdgConfigDir, xdgDataDir, xdgStateDir];
  const networkAttemptsFile = join(isolationDir, SPEC_CLI_ISOLATION.NETWORK_ATTEMPTS_FILE);
  await Promise.all(
    mutableStateDirectories.map((path) => mkdir(path, { recursive: true })),
  );
  const networkGuardModule = await buildSpecCliNetworkGuard(isolationDir);
  const writableProductDir = await realpath(productDir);
  const result = await execa(
    NODE_EXECUTABLE,
    [
      "--no-warnings",
      "--permission",
      "--allow-fs-read=*",
      `--allow-fs-write=${productDir}`,
      `--allow-fs-write=${writableProductDir}`,
      "--allow-child-process",
      "--allow-worker",
      "--import",
      networkGuardModule,
      CLI_PATH,
      ...args,
    ],
    {
      cwd: productDir,
      env: {
        HOME: homeDir,
        PATH: process.env.PATH,
        [SPEC_CLI_ISOLATION.GIT_EXECUTABLE_ENV]: GIT_ROOT_COMMAND.EXECUTABLE,
        [SPEC_CLI_ISOLATION.GIT_READ_SUBCOMMANDS_ENV]: JSON.stringify([
          GIT_ROOT_COMMAND.REV_PARSE,
          GIT_LS_FILES_COMMAND,
        ]),
        [SPEC_CLI_ISOLATION.NETWORK_ATTEMPTS_ENV]: networkAttemptsFile,
        TEMP: tempDir,
        TMP: tempDir,
        TMPDIR: tempDir,
        XDG_CACHE_HOME: xdgCacheDir,
        XDG_CONFIG_HOME: xdgConfigDir,
        XDG_DATA_HOME: xdgDataDir,
        XDG_STATE_HOME: xdgStateDir,
      },
      extendEnv: false,
      reject: false,
    },
  );
  expect(JSON.parse(await readFile(networkAttemptsFile, "utf8"))).toEqual([]);
  return {
    mutableStateDirectories: await Promise.all(mutableStateDirectories.map((path) => realpath(path))),
    productDirectory: writableProductDir,
    result,
    writableDirectories: [
      ...new Set(await Promise.all([productDir, writableProductDir].map((path) => realpath(path)))),
    ],
  };
}

function isWithinProductDirectory(productDir: string, candidate: string): boolean {
  const relativePath = relative(productDir, candidate);
  return relativePath.length > 0
    && relativePath !== ".."
    && !relativePath.startsWith(`..${sep}`)
    && !isAbsolute(relativePath);
}

function assertDeclaredStatusRows(
  output: string,
  fixture: Parameters<typeof specCliDeclaredStatusRows>[0],
): void {
  const expectedRows = specCliDeclaredStatusRows(fixture);
  expect(output.split("\n")).toEqual(expectedRows.map((row) => row.output));
  for (const row of expectedRows) {
    expect(output).toContain(row.nodeId);
    expect(output).toContain(`[${row.state}]`);
  }
}

async function assertSpecContextResolvesTarget(
  selectInput: (snapshot: SpecTreeSnapshot, target: SpecTreeNode) => string,
): Promise<void> {
  await withSpecTreeEnv({
    [SPEC_TREE_CONFIG.SECTION]: {
      [SPEC_TREE_CONFIG_FIELDS.KINDS]: KIND_REGISTRY,
    },
  }, async (env) => {
    await env.materialize();
    const snapshot = await env.readFilesystemSnapshot();
    const target = snapshot.allNodes.find((node) => node.parentId !== undefined) ?? snapshot.allNodes[0];
    const manifest = parseContextManifest(
      await contextCommand({ target: selectInput(snapshot, target), cwd: env.productDir }),
    );
    expect(manifest.target).toBe(`spx/${target.id}`);
  });
}

export function assertSpecContextResolvesCanonicalTarget(): Promise<void> {
  return assertSpecContextResolvesTarget((_snapshot, target) => target.id);
}

export function assertSpecContextResolvesRootedTarget(): Promise<void> {
  return assertSpecContextResolvesTarget((_snapshot, target) => `spx/${target.id}`);
}

export function assertSpecContextResolvesTrailingSeparatorTarget(): Promise<void> {
  return assertSpecContextResolvesTarget((_snapshot, target) => `${target.id}/`);
}

export function assertSpecContextResolvesAbbreviatedTarget(): Promise<void> {
  return assertSpecContextResolvesTarget((snapshot, target) => abbreviatedTarget(snapshot, target));
}

export async function assertSpecContextRejectsUnknownTarget(): Promise<void> {
  await withSpecTreeEnv({
    [SPEC_TREE_CONFIG.SECTION]: {
      [SPEC_TREE_CONFIG_FIELDS.KINDS]: KIND_REGISTRY,
    },
  }, async (env) => {
    await env.materialize();
    const target = `${specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.root)}-unknown`;
    const message = await rejectedContextMessage(target, env.productDir);
    expect(message).toContain(target);
    expect(message).toContain(
      SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX[SPEC_CONTEXT_TARGET_FAILURE_KIND.UNKNOWN_SEGMENT],
    );
  });
}

export async function assertSpecContextPrefersExactTarget(): Promise<void> {
  await withSpecTreeEnv({
    [SPEC_TREE_CONFIG.SECTION]: {
      [SPEC_TREE_CONFIG_FIELDS.KINDS]: KIND_REGISTRY,
    },
  }, async (env) => {
    await env.materialize();
    const fixture = exactPrefixTargetFixture(env.fixture);
    await env.writeRaw(fixture.candidateSpecPath, "# Exact-prefix sibling\n");
    const manifest = parseContextManifest(await contextCommand({ target: fixture.target, cwd: env.productDir }));
    expect(manifest.target).toBe(`spx/${fixture.target}`);
  });
}

export async function assertSpecContextRejectsAmbiguousTarget(): Promise<void> {
  await withSpecTreeEnv({
    [SPEC_TREE_CONFIG.SECTION]: {
      [SPEC_TREE_CONFIG_FIELDS.KINDS]: KIND_REGISTRY,
    },
  }, async (env) => {
    await env.materialize();
    const ambiguity = ambiguousTargetFixture(env.fixture);
    await env.writeRaw(ambiguity.specPath, "# Ambiguous sibling\n");
    const message = await rejectedContextMessage(ambiguity.prefix, env.productDir);
    expect(message).toContain(ambiguity.prefix);
    expect(message).toContain(
      SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX[SPEC_CONTEXT_TARGET_FAILURE_KIND.AMBIGUOUS_SEGMENT],
    );
    expect(message).toContain(ambiguity.candidate);
    expect(message).toContain(specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.root));
  });
}

export async function assertSpecContextRejectsNestedWholePathDisambiguation(): Promise<void> {
  await withSpecTreeEnv({
    [SPEC_TREE_CONFIG.SECTION]: {
      [SPEC_TREE_CONFIG_FIELDS.KINDS]: KIND_REGISTRY,
    },
  }, async (env) => {
    await env.materialize();
    const ambiguity = ambiguousTargetFixture(env.fixture);
    await env.writeRaw(ambiguity.specPath, "# Ambiguous sibling\n");
    const snapshot = await env.readFilesystemSnapshot();
    const target = nestedAmbiguousTarget(snapshot, ambiguity);
    const message = await rejectedContextMessage(target, env.productDir);
    expect(message).toContain(ambiguity.candidate);
    expect(message).toContain(specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.root));
  });
}

async function assertSpecContextRejectsArtifactTarget(
  mappingCase: SpecContextArtifactMappingCase,
): Promise<void> {
  await withSpecTreeEnv({
    [SPEC_TREE_CONFIG.SECTION]: {
      [SPEC_TREE_CONFIG_FIELDS.KINDS]: KIND_REGISTRY,
    },
  }, async (env) => {
    const fixture = artifactTargetFixture(env.fixture, mappingCase);
    let message: string;
    if (fixture.filesystemArtifact === undefined) {
      const snapshot = await env.readMemorySnapshot(fixture.sourceFixture);
      expect(resolveSpecContextTarget(snapshot, fixture.target)).toMatchObject({
        failure: fixture.failure,
        ok: false,
      });
      message = formatSpecContextTargetFailure(fixture.failure);
    } else {
      await env.materialize(fixture.sourceFixture);
      if (fixture.filesystemArtifact.type === SPEC_CONTEXT_FILESYSTEM_ARTIFACT_TYPE.DIRECTORY) {
        await mkdir(join(env.productDir, fixture.target), { recursive: true });
      } else {
        await env.writeRaw(fixture.target, fixture.filesystemArtifact.content);
      }
      message = await rejectedContextMessage(fixture.target, env.productDir);
    }
    expect(message).toContain(fixture.target);
    expect(message).toContain(SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX[fixture.failure.kind]);
    if (fixture.failure.kind === SPEC_CONTEXT_TARGET_FAILURE_KIND.ARTIFACT_PATH) {
      expect(message).toContain(fixture.failure.ownerId);
    }
  });
}

async function assertSpecContextRejectsUnrecognizedNodeDirectoryTarget(
  mappingCase: Extract<
    SpecContextTargetMappingCase,
    {
      readonly kind:
        | typeof SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.INVALID_DIRECTORY
        | typeof SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.SUPERSEDED_DIRECTORY;
    }
  >,
): Promise<void> {
  await withSpecTreeEnv({
    [SPEC_TREE_CONFIG.SECTION]: {
      [SPEC_TREE_CONFIG_FIELDS.KINDS]: KIND_REGISTRY,
    },
  }, async (env) => {
    const target = unrecognizedNodeDirectoryTarget(env.fixture, mappingCase.kind);
    await env.materialize();
    await mkdir(join(env.productDir, SPEC_TREE_CONFIG.ROOT_DIRECTORY, target), { recursive: true });
    const message = await rejectedContextMessage(target, env.productDir);
    expect(message).toContain(target);
    expect(message).toContain(
      SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX[SPEC_CONTEXT_TARGET_FAILURE_KIND.UNKNOWN_SEGMENT],
    );
  });
}

async function assertSpecContextRejectsEmptySegmentTarget(
  mappingCase: SpecContextEmptySegmentMappingCase,
): Promise<void> {
  await withSpecTreeEnv({
    [SPEC_TREE_CONFIG.SECTION]: {
      [SPEC_TREE_CONFIG_FIELDS.KINDS]: KIND_REGISTRY,
    },
  }, async (env) => {
    const sourceFixture = emptySegmentSourceFixture(env.fixture, mappingCase.topology);
    let snapshot: SpecTreeSnapshot;
    if (mappingCase.topology === SPEC_CONTEXT_EMPTY_SEGMENT_TOPOLOGY.SINGLE_ROOT) {
      snapshot = await env.readMemorySnapshot(sourceFixture);
    } else {
      await env.materialize(sourceFixture);
      snapshot = await env.readFilesystemSnapshot();
    }
    const fixture = emptySegmentTargetFixture(snapshot, mappingCase.position);
    expect(resolveSpecContextTarget(snapshot, fixture.target)).toMatchObject({
      failure: {
        input: fixture.target,
        kind: SPEC_CONTEXT_TARGET_FAILURE_KIND.UNKNOWN_SEGMENT,
        segment: fixture.segment,
      },
      ok: false,
    });
  });
}

export function assertSpecContextTargetDiagnosticSafetyCase(
  safetyCase: SpecContextTargetDiagnosticSafetyCase,
): void {
  const message = formatSpecContextTargetFailure(safetyCase.failure);
  expect(message).toContain(sanitizeCliArgument(safetyCase.unsafeValue));
  expect(message).not.toContain(safetyCase.unsafeValue);
}

export async function assertSpecContextTargetMappingCase(mappingCase: SpecContextTargetMappingCase): Promise<void> {
  switch (mappingCase.kind) {
    case SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.CANONICAL:
      await assertSpecContextResolvesCanonicalTarget();
      return;
    case SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.ROOTED:
      await assertSpecContextResolvesRootedTarget();
      return;
    case SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.TRAILING_SEPARATOR:
      await assertSpecContextResolvesTrailingSeparatorTarget();
      return;
    case SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.ABBREVIATED:
      await assertSpecContextResolvesAbbreviatedTarget();
      return;
    case SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.EMPTY_SEGMENT:
      await assertSpecContextRejectsEmptySegmentTarget(mappingCase);
      return;
    case SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.UNKNOWN:
      await assertSpecContextRejectsUnknownTarget();
      return;
    case SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.AMBIGUOUS:
      await assertSpecContextRejectsAmbiguousTarget();
      return;
    case SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.ARTIFACT:
      await assertSpecContextRejectsArtifactTarget(mappingCase);
      return;
    case SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.INVALID_DIRECTORY:
    case SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.SUPERSEDED_DIRECTORY:
      await assertSpecContextRejectsUnrecognizedNodeDirectoryTarget(mappingCase);
  }
}

export async function assertSpecStatusCliRendersCurrentTree(): Promise<void> {
  await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
    await env.materialize();
    const result = await runSpecCli(env.productDir, SPEC_DOMAIN_CLI.COMMAND, SPEC_DOMAIN_CLI.STATUS_COMMAND);
    expect(result.exitCode).toBe(0);
    assertDeclaredStatusRows(result.stdout, env.fixture);
  });
}

export async function assertSpecStatusCliUpdatesDeclaredNodes(): Promise<void> {
  await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
    await env.materialize();
    const result = await runSpecCli(
      env.productDir,
      SPEC_DOMAIN_CLI.COMMAND,
      SPEC_DOMAIN_CLI.STATUS_COMMAND,
      SPEC_DOMAIN_CLI.UPDATE_OPTION,
    );
    expect(result.exitCode, result.stderr).toBe(0);
    assertDeclaredStatusRows(result.stdout, env.fixture);
  });
}

export async function assertSpecNextCliRendersSelection(): Promise<void> {
  await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
    await env.materialize();
    const result = await runSpecCli(env.productDir, SPEC_DOMAIN_CLI.COMMAND, SPEC_DOMAIN_CLI.NEXT_COMMAND);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(SPEC_NEXT_MESSAGE.HEADING);
    expect(result.stdout).toContain(env.fixture.root.slug);
  });
}

export async function assertSpecContextCliRendersTarget(): Promise<void> {
  await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
    await env.materialize();
    const target = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.root);
    const result = await runSpecCli(
      env.productDir,
      SPEC_DOMAIN_CLI.COMMAND,
      SPEC_DOMAIN_CLI.CONTEXT_COMMAND,
      target,
      SPEC_DOMAIN_CLI.JSON_OPTION,
    );
    const manifest = JSON.parse(result.stdout) as {
      readonly target: string;
      readonly read: readonly { readonly role: string }[];
    };
    expect(result.exitCode).toBe(0);
    expect(manifest.target).toBe(`${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${target}`);
    expect(manifest.read.some((document) => document.role === SPEC_CONTEXT_READ_ROLE.PRODUCT)).toBe(true);
  });
}

export async function assertSpecStatusCliRejectsUnsupportedFormat(): Promise<void> {
  await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
    await env.materialize();
    const fixture = specCliUnsupportedStatusFormatFixture(env.fixture);
    const result = await runSpecCli(
      env.productDir,
      SPEC_DOMAIN_CLI.COMMAND,
      SPEC_DOMAIN_CLI.STATUS_COMMAND,
      SPEC_DOMAIN_CLI.FORMAT_OPTION_FLAG,
      fixture.format,
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe(fixture.expectedDiagnostic);
  });
}

export async function assertSpecStatusCliAcceptsLocalJsonFormat(): Promise<void> {
  await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
    await env.materialize();
    const result = await runSpecCli(
      env.productDir,
      SPEC_DOMAIN_CLI.COMMAND,
      SPEC_DOMAIN_CLI.STATUS_COMMAND,
      SPEC_DOMAIN_CLI.FORMAT_OPTION_FLAG,
      OUTPUT_FORMAT.JSON,
    );
    expect(result.exitCode).toBe(0);
    expect(() => JSON.parse(result.stdout)).not.toThrow();
  });
}

export async function assertSpecStatusCliConfinesMutableState(): Promise<void> {
  await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
    await env.materialize();
    const execution = await runSpecCliWithIsolation(
      env.productDir,
      SPEC_DOMAIN_CLI.COMMAND,
      SPEC_DOMAIN_CLI.STATUS_COMMAND,
      SPEC_DOMAIN_CLI.FORMAT_OPTION_FLAG,
      OUTPUT_FORMAT.JSON,
    );
    expect(execution.result.exitCode, execution.result.stderr).toBe(0);
    expect(
      execution.mutableStateDirectories.every((path) => isWithinProductDirectory(execution.productDirectory, path)),
    )
      .toBe(true);
    expect(execution.writableDirectories.every((path) => path === execution.productDirectory))
      .toBe(true);
  });
}

export async function assertSpecApplyCliRejectsConfigurationWrites(): Promise<void> {
  await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
    await env.materialize();
    const fixture = specCliApplyProtectionFixture(env.fixture);
    await env.writeRaw(RETIRED_SPEC_APPLY_FIXTURE.excludeFile, fixture.excludeContent);
    await env.writeRaw(RETIRED_SPEC_APPLY_FIXTURE.pythonConfigFile, fixture.pythonConfigContent);
    const before = await Promise.all(fixture.protectedPaths.map((path) => env.readFile(path)));
    const result = await runSpecCli(env.productDir, SPEC_DOMAIN_CLI.COMMAND, RETIRED_SPEC_APPLY_FIXTURE.command);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(RETIRED_SPEC_APPLY_FIXTURE.unknownCommandPrefix);
    expect(result.stderr).toContain(RETIRED_SPEC_APPLY_FIXTURE.command);
    await expect(Promise.all(fixture.protectedPaths.map((path) => env.readFile(path)))).resolves.toEqual(before);
  });
}

export async function assertSpecContextCliResolvesAbbreviatedTarget(): Promise<void> {
  await withSpecTreeEnv({
    [SPEC_TREE_CONFIG.SECTION]: {
      [SPEC_TREE_CONFIG_FIELDS.KINDS]: KIND_REGISTRY,
    },
  }, async (env) => {
    await env.materialize();
    const snapshot = await env.readFilesystemSnapshot();
    const target = snapshot.allNodes.find((node) => node.parentId !== undefined) ?? snapshot.allNodes[0];
    const fixture = specCliContextTargetFixture(snapshot, target);
    const result = await runSpecCli(
      env.productDir,
      SPEC_DOMAIN_CLI.COMMAND,
      SPEC_DOMAIN_CLI.CONTEXT_COMMAND,
      fixture.invocationTarget,
      SPEC_DOMAIN_CLI.JSON_OPTION,
    );
    expect(result.exitCode, result.stderr).toBe(0);
    expect(parseContextManifest(result.stdout).target).toBe(fixture.expectedTarget);
  });
}

export async function assertSpecContextManifestIncludesMethodology(): Promise<void> {
  const methodology = generatedMethodologySection();
  await withSpecTreeEnv({
    [SPEC_TREE_CONFIG.SECTION]: {
      [SPEC_TREE_CONFIG_FIELDS.KINDS]: KIND_REGISTRY,
    },
    [METHODOLOGY_SECTION]: methodology,
  }, async (env) => {
    await env.materialize();
    const snapshot = await env.readFilesystemSnapshot();
    const target = snapshot.allNodes[0];
    const manifest = parseContextManifest(await contextCommand({ target: target.id, cwd: env.productDir }));
    expect(manifest.target).toBe(`spx/${target.id}`);
    expect(manifest.productDir).toBe(env.productDir);
    expect(manifest.methodology).toMatchObject({
      source: methodology[METHODOLOGY_CONFIG_FIELDS.SOURCE],
      version: methodology[METHODOLOGY_CONFIG_FIELDS.VERSION],
    });
  });
}

export async function assertSpecContextManifestIgnoresUntrackedScratchNodes(): Promise<void> {
  await withSpecTreeEnv({
    [SPEC_TREE_CONFIG.SECTION]: {
      [SPEC_TREE_CONFIG_FIELDS.KINDS]: KIND_REGISTRY,
    },
  }, async (env) => {
    await env.materialize();
    const trackedSnapshot = await env.readFilesystemSnapshot();
    const trackedPaths = trackedSnapshot.entries
      .map((entry) => entry.ref?.path)
      .filter((path): path is string => path !== undefined);
    const target = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.peer);
    const scratch = lowerSiblingDirectoryName(env.fixture);
    await env.writeRaw(`spx/${scratch}/${env.fixture.root.slug}.md`, "# Scratch\n");
    await env.writeRaw(`spx/${target}/PLAN.md`, "# Scratch plan\n");

    const manifest = parseContextManifest(
      await contextCommand({
        target,
        cwd: env.productDir,
        gitDependencies: trackedSpecContextGitDependencies(env.productDir, trackedPaths),
      }),
    );

    expect(allManifestPaths(manifest)).not.toContain(`spx/${scratch}/${env.fixture.root.slug}.md`);
    expect(allManifestPaths(manifest)).not.toContain(`spx/${target}/PLAN.md`);
  });
}

export async function assertSpecContextUsesLinkedWorktreeRoot(): Promise<void> {
  await withSpecTreeEnv({
    [SPEC_TREE_CONFIG.SECTION]: {
      [SPEC_TREE_CONFIG_FIELDS.KINDS]: KIND_REGISTRY,
    },
  }, async (env) => {
    await env.materialize();
    await runGit(env.productDir, [GIT_TEST_SUBCOMMANDS.INIT]);
    await runGit(
      env.productDir,
      [GIT_TEST_SUBCOMMANDS.CONFIG, GIT_TEST_CONFIG.EMAIL_KEY, GIT_TEST_CONFIG.EMAIL],
    );
    await runGit(
      env.productDir,
      [GIT_TEST_SUBCOMMANDS.CONFIG, GIT_TEST_CONFIG.USER_NAME_KEY, GIT_TEST_CONFIG.USER_NAME],
    );
    await runGit(env.productDir, [GIT_TEST_SUBCOMMANDS.ADD, SPEC_TREE_CONFIG.ROOT_DIRECTORY]);
    await runGit(
      env.productDir,
      [GIT_TEST_SUBCOMMANDS.COMMIT, GIT_TEST_FLAGS.COMMIT_MESSAGE, env.fixture.product.title],
    );

    const linkedParent = await createTempDir("spx-context-linked-");
    try {
      const linkedProductDir = join(linkedParent, "worktree");
      await runGit(
        env.productDir,
        [
          GIT_TEST_SUBCOMMANDS.WORKTREE,
          GIT_TEST_SUBCOMMANDS.ADD,
          GIT_TEST_FLAGS.NEW_BRANCH,
          `${env.fixture.root.slug}-context`,
          linkedProductDir,
        ],
      );
      const nestedCwd = join(
        linkedProductDir,
        sampleGitWorktreeTestValue(GIT_WORKTREE_TEST_GENERATOR.nestedDirectory()),
      );
      await mkdir(nestedCwd, { recursive: true });
      const scratch = lowerSiblingDirectoryName(env.fixture);
      const scratchPath = `spx/${scratch}/${env.fixture.root.slug}.md`;
      await mkdir(dirname(join(linkedProductDir, scratchPath)), { recursive: true });
      await writeFile(join(linkedProductDir, scratchPath), "# Untracked scratch\n");

      const target = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.root);
      const manifest = parseContextManifest(await contextCommand({ target, cwd: nestedCwd }));

      expect(manifest.productDir).toBe(await realpath(linkedProductDir));
      expect(manifest.target).toBe(`spx/${target}`);
      expect(allManifestPaths(manifest)).not.toContain(scratchPath);
    } finally {
      await removeTempDir(linkedParent);
    }
  });
}

export async function assertSpecContextManifestOmitsMissingNodeSpecs(): Promise<void> {
  await withSpecTreeEnv({
    [SPEC_TREE_CONFIG.SECTION]: {
      [SPEC_TREE_CONFIG_FIELDS.KINDS]: KIND_REGISTRY,
    },
  }, async (env) => {
    await env.materialize();
    const snapshot = await env.readFilesystemSnapshot();
    const target = snapshot.allNodes[0];
    const missingChild = `${target.id}/21-metadata-only.enabler`;
    await env.writeRaw(`spx/${missingChild}/${NODE_STATUS_FILENAME}`, "{}");

    const manifest = parseContextManifest(await contextCommand({ target: missingChild, cwd: env.productDir }));

    expect(manifest.target).toBe(`spx/${missingChild}`);
    expect(allManifestPaths(manifest)).not.toContain(`spx/${missingChild}/metadata-only.md`);
  });
}

export async function assertSpecContextTextIncludesContext(): Promise<void> {
  await withSpecTreeEnv({
    [SPEC_TREE_CONFIG.SECTION]: {
      [SPEC_TREE_CONFIG_FIELDS.KINDS]: KIND_REGISTRY,
    },
  }, async (env) => {
    await env.materialize();
    const snapshot = await env.readFilesystemSnapshot();
    const target = snapshot.allNodes[0];
    const textOutput = await contextOutputForFormat(
      SPEC_CONTEXT_OUTPUT_FORMAT.TEXT,
      { target: target.id, cwd: env.productDir },
    );
    const jsonOutput = await contextOutputForFormat(
      SPEC_CONTEXT_OUTPUT_FORMAT.JSON,
      { target: target.id, cwd: env.productDir },
    );
    expect(textOutput).toContain(`${SPEC_CONTEXT_TEXT_LABEL.TARGET}: spx/${target.id}`);
    expect(textOutput).toContain(`${SPEC_CONTEXT_TEXT_LABEL.PRODUCT_ROOT}: ${env.productDir}`);
    expect(textOutput).toContain(`${SPEC_CONTEXT_TEXT_LABEL.METHODOLOGY}:`);
    expect(textOutput).toContain(
      `${SPEC_CONTEXT_TEXT_LABEL.SCHEMA_VERSION}: ${SPEC_CONTEXT_MANIFEST_SCHEMA_VERSION}`,
    );
    expect(textOutput).toContain(`${SPEC_CONTEXT_TEXT_LABEL.BOOTSTRAP}: false`);
    expect(textOutput).toContain(`${SPEC_CONTEXT_TEXT_LABEL.READ}:`);
    expect(textOutput).toContain(`${SPEC_CONTEXT_TEXT_LABEL.LISTED}:`);
    expect(parseContextManifest(jsonOutput).target).toBe(`spx/${target.id}`);
  });
}

export async function assertSpecContextRejectsMalformedMethodologyConfig(): Promise<void> {
  await withSpecTreeEnv({
    [SPEC_TREE_CONFIG.SECTION]: {
      [SPEC_TREE_CONFIG_FIELDS.KINDS]: KIND_REGISTRY,
    },
    [METHODOLOGY_SECTION]: {
      [METHODOLOGY_CONFIG_FIELDS.SOURCE]: "",
    },
  }, async (env) => {
    await env.materialize();
    const snapshot = await env.readFilesystemSnapshot();
    const target = snapshot.allNodes[0];
    await expect(contextCommand({ target: target.id, cwd: env.productDir })).rejects.toThrow(
      `${METHODOLOGY_SECTION}.${METHODOLOGY_CONFIG_FIELDS.SOURCE}`,
    );
  });
}

// The two assertions below witness the CONTEXT COMMAND's wiring to the shared
// methodology resolver. The resolver's own behavior is owned and deeply tested
// by the methodology-config node; these exist so a refactor of this command's
// config path cannot silently drop the legacy-placement rejection or start
// failing on unrelated config content.
export async function assertSpecContextRejectsHarnessMethodologyConfig(): Promise<void> {
  await withSpecTreeEnv({
    [SPEC_TREE_CONFIG.SECTION]: {
      [SPEC_TREE_CONFIG_FIELDS.KINDS]: KIND_REGISTRY,
    },
    [LEGACY_METHODOLOGY_CONFIG_SECTION]: {
      [METHODOLOGY_SECTION]: generatedMethodologySection(),
    },
  }, async (env) => {
    await env.materialize();
    const snapshot = await env.readFilesystemSnapshot();
    const target = snapshot.allNodes[0];
    await expect(contextCommand({ target: target.id, cwd: env.productDir })).rejects.toThrow(
      `${LEGACY_METHODOLOGY_CONFIG_SECTION}.${METHODOLOGY_SECTION}`,
    );
  });
}

export async function assertSpecContextIgnoresUnrelatedHarnessConfigDefects(): Promise<void> {
  const methodology = generatedMethodologySection();
  await withSpecTreeEnv({
    [SPEC_TREE_CONFIG.SECTION]: {
      [SPEC_TREE_CONFIG_FIELDS.KINDS]: KIND_REGISTRY,
    },
    [METHODOLOGY_SECTION]: methodology,
    [LEGACY_METHODOLOGY_CONFIG_SECTION]: {
      unrelated: generatedMethodologySection(),
    },
  }, async (env) => {
    await env.materialize();
    const snapshot = await env.readFilesystemSnapshot();
    const target = snapshot.allNodes[0];
    const manifest = parseContextManifest(await contextCommand({ target: target.id, cwd: env.productDir }));
    expect(manifest.methodology).toMatchObject({
      source: methodology[METHODOLOGY_CONFIG_FIELDS.SOURCE],
      version: methodology[METHODOLOGY_CONFIG_FIELDS.VERSION],
    });
  });
}

function specTreeKindsConfig(): Config {
  return {
    [SPEC_TREE_CONFIG.SECTION]: {
      [SPEC_TREE_CONFIG_FIELDS.KINDS]: KIND_REGISTRY,
    },
  };
}

function readPaths(manifest: SpecContextManifest): readonly string[] {
  return manifest.read.map((document) => document.path);
}

function listedPaths(manifest: SpecContextManifest): readonly string[] {
  return manifest.listed.map((entry) => entry.path);
}

function allManifestPaths(manifest: SpecContextManifest): readonly string[] {
  return [...readPaths(manifest), ...listedPaths(manifest)];
}

/** Paths for the fully populated context fixture `withRichContextEnv` materializes. */
interface RichContextPaths {
  readonly targetId: string;
  readonly rootDirectory: string;
  readonly productPath: string;
  readonly rootSpecPath: string;
  readonly targetSpecPath: string;
  readonly ancestorDecisionPath: string;
  readonly higherAncestorDecisionPath: string;
  readonly higherProductDecisionPath: string;
  readonly lowerSiblingSpecPath: string;
  readonly citedDecisionPath: string;
  readonly transitiveCitedDecisionPath: string;
  readonly evidencePath: string;
  readonly rootPlanPath: string;
  readonly rootIssuesPath: string;
  readonly ancestorPlanPath: string;
  readonly targetIssuesPath: string;
  /**
   * Exact text written to the target ISSUES note; carries a leading byte-order
   * mark and multi-byte UTF-8 so BOM stripping or a wrong-encoding decode is
   * caught.
   */
  readonly targetIssuesText: string;
  readonly rootGuidePaths: readonly string[];
  readonly ancestorGuidePath: string;
  readonly lifecycleOverlayPath: string;
  readonly listedOverlayPath: string;
  readonly sameIndexSiblingPath: string;
  readonly higherIndexSiblingPath: string;
}

/**
 * Materializes a spec tree exercising every manifest role at once: nested
 * target with ancestor, decisions above and below the constraining order,
 * a lower-index sibling that also cites the shared decision (multi-citer
 * provenance), coordination notes at the product root, the ancestor, and the
 * target, runtime guides at the product root and along the node path, both
 * overlay classes, co-located evidence, and a transitive cited-decision chain
 * rooted in the target spec. The product-root PLAN note embeds a
 * citation-shaped path to a decision that does not exist, proving
 * coordination notes never bind citations.
 */
async function withRichContextEnv(
  callback: (env: CurrentSpecTreeEnv, paths: RichContextPaths) => Promise<void>,
): Promise<void> {
  await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
    await env.materialize();
    const fixture = env.fixture;
    const rootDirectory = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, fixture.root);
    const childDirectory = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, fixture.child);
    const peerDirectory = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, fixture.peer);
    const targetId = `${rootDirectory}/${childDirectory}`;
    const decisionSuffix = KIND_REGISTRY[fixture.decision.kind].suffix;
    const snapshot = await env.readFilesystemSnapshot();
    const productPath = snapshot.product?.ref?.path;
    expect(productPath).toBeDefined();

    const paths: RichContextPaths = {
      targetId,
      rootDirectory,
      productPath: productPath as string,
      rootSpecPath: `spx/${rootDirectory}/${fixture.root.slug}.md`,
      targetSpecPath: `spx/${targetId}/${fixture.child.slug}.md`,
      ancestorDecisionPath: `spx/${rootDirectory}/${fixture.decision.order}-${fixture.decision.slug}${decisionSuffix}`,
      higherAncestorDecisionPath:
        `spx/${rootDirectory}/${fixture.peer.order}-${fixture.decision.slug}${decisionSuffix}`,
      higherProductDecisionPath: `spx/${fixture.peer.order}-${fixture.decision.slug}${decisionSuffix}`,
      lowerSiblingSpecPath: `spx/${lowerSiblingDirectoryName(fixture)}/${fixture.root.slug}.md`,
      citedDecisionPath:
        `spx/${peerDirectory}/${fixture.decision.order}-${fixture.decision.slug}-cited${decisionSuffix}`,
      transitiveCitedDecisionPath:
        `spx/${peerDirectory}/${fixture.peer.order}-${fixture.decision.slug}-transitive${decisionSuffix}`,
      evidencePath: `spx/${targetId}/tests/${sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.evidenceFileName())}`,
      rootPlanPath: `spx/${SPEC_TREE_GRAMMAR.COORDINATION_NOTES[0]}`,
      rootIssuesPath: `spx/${SPEC_TREE_GRAMMAR.COORDINATION_NOTES[1]}`,
      ancestorPlanPath: `spx/${rootDirectory}/${SPEC_TREE_GRAMMAR.COORDINATION_NOTES[0]}`,
      targetIssuesPath: `spx/${targetId}/${SPEC_TREE_GRAMMAR.COORDINATION_NOTES[1]}`,
      targetIssuesText: "\uFEFF# Target issues — Prüfung ✓ 文脈\n",
      rootGuidePaths: SPEC_TREE_GRAMMAR.GUIDE_FILES.map((filename) => filename),
      ancestorGuidePath: `spx/${rootDirectory}/${SPEC_TREE_GRAMMAR.GUIDE_FILES[0]}`,
      lifecycleOverlayPath: SPEC_CONTEXT_LIFECYCLE_OVERLAY_PATH,
      listedOverlayPath: `spx/${SPEC_TREE_GRAMMAR.LOCAL_OVERLAYS.DIRECTORY_NAME}/${
        sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug())
      }${SPEC_TREE_GRAMMAR.LOCAL_OVERLAYS.EXTENSION}`,
      sameIndexSiblingPath: `spx/${sameIndexSiblingDirectoryName(env.fixture)}`,
      higherIndexSiblingPath: `spx/${peerDirectory}`,
    };

    await env.writeRaw(paths.targetSpecPath, `# ${fixture.child.slug}\n\nGoverned by ${paths.citedDecisionPath}\n`);
    await env.writeRaw(
      paths.citedDecisionPath,
      `# Cited decision\n\nRefines ${paths.transitiveCitedDecisionPath}\n`,
    );
    await env.writeRaw(paths.transitiveCitedDecisionPath, "# Transitive cited decision\n");
    await env.writeRaw(
      paths.lowerSiblingSpecPath,
      `# Lower sibling\n\nAlso governed by ${paths.citedDecisionPath}\n`,
    );
    await env.writeRaw(paths.higherAncestorDecisionPath, "# Higher ancestor decision\n");
    await env.writeRaw(paths.higherProductDecisionPath, "# Higher product decision\n");
    await env.writeRaw(paths.evidencePath, "import { describe, it } from \"vitest\";\n");
    await env.writeRaw(paths.rootPlanPath, "# Plan\n\nMentions spx/99-unscanned.pdr.md without binding it.\n");
    await env.writeRaw(paths.rootIssuesPath, "# Issues\n");
    await env.writeRaw(paths.ancestorPlanPath, "# Ancestor plan\n");
    await env.writeRaw(paths.targetIssuesPath, paths.targetIssuesText);
    for (const guidePath of paths.rootGuidePaths) {
      await env.writeRaw(guidePath, "# Guide\n");
    }
    await env.writeRaw(paths.ancestorGuidePath, "# Ancestor guide\n");
    await env.writeRaw(paths.lifecycleOverlayPath, "# Lifecycle overlay\n");
    await env.writeRaw(paths.listedOverlayPath, "# Listed overlay\n");
    await env.writeRaw(
      `spx/${sameIndexSiblingDirectoryName(env.fixture)}/${fixture.root.slug}-same.md`,
      "# Same sibling\n",
    );

    await callback(env, paths);
  });
}

export async function assertSpecContextManifestCarriesSchemaVersionAndBootstrap(): Promise<void> {
  await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
    await env.materialize();
    const snapshot = await env.readFilesystemSnapshot();
    const target = snapshot.allNodes[0];
    const manifest = parseContextManifest(await contextCommand({ target: target.id, cwd: env.productDir }));
    expect(manifest.schemaVersion).toBe(SPEC_CONTEXT_MANIFEST_SCHEMA_VERSION);
    expect(specContextBootstrap(0)).toBe(true);
    expect(specContextBootstrap(snapshot.allNodes.length)).toBe(false);
    expect(manifest.bootstrap).toBe(specContextBootstrap(snapshot.allNodes.length));
  });
}

export async function assertSpecContextManifestClassifiesRolesIntoReadAndListed(): Promise<void> {
  await withRichContextEnv(async (env, paths) => {
    const manifest = parseContextManifest(await contextCommand({ target: paths.targetId, cwd: env.productDir }));

    const readRoles = new Set<string>(SPEC_CONTEXT_READ_ROLE_ORDER);
    for (const document of manifest.read) {
      expect(readRoles.has(document.role)).toBe(true);
    }
    const listedRoles = new Set<string>(Object.values(SPEC_CONTEXT_LISTED_ROLE));
    for (const entry of manifest.listed) {
      expect(listedRoles.has(entry.role)).toBe(true);
    }

    expect(manifest.read).toContainEqual({ role: SPEC_CONTEXT_READ_ROLE.PRODUCT, path: paths.productPath });
    expect(manifest.read).toContainEqual({ role: SPEC_CONTEXT_READ_ROLE.ANCESTOR, path: paths.rootSpecPath });
    expect(manifest.read).toContainEqual({ role: SPEC_CONTEXT_READ_ROLE.TARGET, path: paths.targetSpecPath });
    expect(manifest.read).toContainEqual({
      role: SPEC_CONTEXT_READ_ROLE.DECISION,
      path: paths.ancestorDecisionPath,
    });
    expect(manifest.read).toContainEqual({
      role: SPEC_CONTEXT_READ_ROLE.LOWER_INDEX_SIBLING,
      path: paths.lowerSiblingSpecPath,
    });
    expect(manifest.read).toContainEqual({ role: SPEC_CONTEXT_READ_ROLE.COORDINATION, path: paths.rootPlanPath });
    expect(manifest.read).toContainEqual({
      role: SPEC_CONTEXT_READ_ROLE.GUIDE,
      path: paths.rootGuidePaths[0],
    });
    expect(manifest.read).toContainEqual({
      role: SPEC_CONTEXT_READ_ROLE.CITED_DECISION,
      path: paths.citedDecisionPath,
      citedBy: [paths.targetSpecPath, paths.lowerSiblingSpecPath],
    });
    expect(manifest.read).toContainEqual({
      role: SPEC_CONTEXT_READ_ROLE.LIFECYCLE_OVERLAY,
      path: paths.lifecycleOverlayPath,
    });

    expect(manifest.listed).toContainEqual({ role: SPEC_CONTEXT_LISTED_ROLE.EVIDENCE, path: paths.evidencePath });
    expect(manifest.listed).toContainEqual({ role: SPEC_CONTEXT_LISTED_ROLE.OVERLAY, path: paths.listedOverlayPath });

    expect(readPaths(manifest)).not.toContain(paths.higherProductDecisionPath);
    expect(readPaths(manifest)).not.toContain(paths.higherAncestorDecisionPath);
    expect(readPaths(manifest)).not.toContain(paths.evidencePath);
    expect(readPaths(manifest)).not.toContain(paths.listedOverlayPath);

    const rootManifest = parseContextManifest(
      await contextCommand({ target: paths.rootDirectory, cwd: env.productDir }),
    );
    expect(rootManifest.listed).toContainEqual({
      role: SPEC_CONTEXT_LISTED_ROLE.SAME_INDEX_SIBLING,
      path: paths.sameIndexSiblingPath,
    });
    expect(rootManifest.listed).toContainEqual({
      role: SPEC_CONTEXT_LISTED_ROLE.HIGHER_INDEX_SIBLING,
      path: paths.higherIndexSiblingPath,
    });
    expect(readPaths(rootManifest)).not.toContain(`${paths.sameIndexSiblingPath}/${env.fixture.root.slug}-same.md`);
  });
}

export async function assertSpecContextReadEntriesFollowGroupOrder(): Promise<void> {
  await withRichContextEnv(async (env, paths) => {
    const manifest = parseContextManifest(await contextCommand({ target: paths.targetId, cwd: env.productDir }));
    const groupIndexes = manifest.read.map((document) => SPEC_CONTEXT_READ_ROLE_ORDER.indexOf(document.role));
    for (const groupIndex of groupIndexes) {
      expect(groupIndex).toBeGreaterThanOrEqual(0);
    }
    for (let position = 1; position < groupIndexes.length; position += 1) {
      expect(groupIndexes[position]).toBeGreaterThanOrEqual(groupIndexes[position - 1]);
    }
    const uniquePaths = readPaths(manifest);
    expect(new Set(uniquePaths).size).toBe(uniquePaths.length);
  });
}

export async function assertSpecContextIncludesCitedDecisionsWithProvenance(): Promise<void> {
  await withRichContextEnv(async (env, paths) => {
    const manifest = parseContextManifest(await contextCommand({ target: paths.targetId, cwd: env.productDir }));
    const citedEntries = manifest.read.filter(
      (document) => document.role === SPEC_CONTEXT_READ_ROLE.CITED_DECISION,
    );
    expect(citedEntries).toEqual([
      {
        role: SPEC_CONTEXT_READ_ROLE.CITED_DECISION,
        path: paths.citedDecisionPath,
        // The target spec and the lower-index sibling both cite this decision;
        // provenance accumulates every citer once, in read order.
        citedBy: [paths.targetSpecPath, paths.lowerSiblingSpecPath],
      },
      {
        role: SPEC_CONTEXT_READ_ROLE.CITED_DECISION,
        path: paths.transitiveCitedDecisionPath,
        citedBy: [paths.citedDecisionPath],
      },
    ]);
  });
}

export async function assertSpecContextIgnoresTraversalCitationShapes(): Promise<void> {
  await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
    await env.materialize();
    const snapshot = await env.readFilesystemSnapshot();
    const target = snapshot.allNodes[0];
    const targetSpecPath = target.ref?.path;
    expect(targetSpecPath).toBeDefined();
    // The suffix-extended shapes would bind their truncated `.adr.md` prefix,
    // and the embedded shape would bind its `spx/`-rooted tail — decisions no
    // tracked file satisfies, failing the command — if the citation pattern
    // matched past the decision suffix or inside a longer path.
    await env.writeRaw(
      targetSpecPath as string,
      `# ${target.slug}\n\nMentions spx/../../outside-product.adr.md, spx/99-shape.adr.mdx,`
        + ` spx/99-shape.adr.md.bak, and dist/spx/99-shape.adr.md without binding any of them.\n`,
    );

    const manifest = parseContextManifest(
      await contextCommand({ target: target.id, cwd: env.productDir, content: true }),
    );

    expect(allManifestPaths(manifest).some((path) => path.includes(".."))).toBe(false);
    expect(allManifestPaths(manifest)).not.toContain("spx/99-shape.adr.md");
  });
}

export async function assertSpecContextRejectsMissingCitedDecision(): Promise<void> {
  await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
    await env.materialize();
    const snapshot = await env.readFilesystemSnapshot();
    const target = snapshot.allNodes[0];
    const targetSpecPath = target.ref?.path;
    expect(targetSpecPath).toBeDefined();
    const missingCitedPath = `spx/${target.id}/98-absent.adr.md`;
    await env.writeRaw(targetSpecPath as string, `# ${target.slug}\n\nGoverned by ${missingCitedPath}\n`);

    await expect(contextCommand({ target: target.id, cwd: env.productDir })).rejects.toThrow(
      formatMissingCitedDecisionError(missingCitedPath, targetSpecPath as string),
    );
  });
}

export async function assertSpecContextIncludesCoordinationAtAllLevels(): Promise<void> {
  await withRichContextEnv(async (env, paths) => {
    const manifest = parseContextManifest(await contextCommand({ target: paths.targetId, cwd: env.productDir }));
    const coordinationPaths = manifest.read
      .filter((document) => document.role === SPEC_CONTEXT_READ_ROLE.COORDINATION)
      .map((document) => document.path);
    expect(coordinationPaths).toEqual([
      paths.rootPlanPath,
      paths.rootIssuesPath,
      paths.ancestorPlanPath,
      paths.targetIssuesPath,
    ]);
  });
}

export async function assertSpecContextIncludesGuidesAlongPath(): Promise<void> {
  await withRichContextEnv(async (env, paths) => {
    const manifest = parseContextManifest(await contextCommand({ target: paths.targetId, cwd: env.productDir }));
    const guidePaths = manifest.read
      .filter((document) => document.role === SPEC_CONTEXT_READ_ROLE.GUIDE)
      .map((document) => document.path);
    expect(guidePaths).toEqual([...paths.rootGuidePaths, paths.ancestorGuidePath]);
  });
}

export async function assertSpecContextClassifiesOverlays(): Promise<void> {
  await withRichContextEnv(async (env, paths) => {
    const manifest = parseContextManifest(await contextCommand({ target: paths.targetId, cwd: env.productDir }));
    expect(manifest.read).toContainEqual({
      role: SPEC_CONTEXT_READ_ROLE.LIFECYCLE_OVERLAY,
      path: paths.lifecycleOverlayPath,
    });
    expect(manifest.listed).toContainEqual({
      role: SPEC_CONTEXT_LISTED_ROLE.OVERLAY,
      path: paths.listedOverlayPath,
    });
    expect(readPaths(manifest)).not.toContain(paths.listedOverlayPath);
    expect(listedPaths(manifest)).not.toContain(paths.lifecycleOverlayPath);
  });
}

/**
 * A name pair whose code-unit order is the opposite of its locale order,
 * proven by an in-process divergence check: distinct leading letters — never
 * a case-only difference, which collides on case-insensitive filesystems —
 * where "Z" precedes "a" by code units while locale collation orders "a"
 * before "Z". Shared by every ordering assertion so a locale-aware comparator
 * at any manifest ordering site fails a test instead of varying by host.
 */
function divergentOrderSlugPair(): { readonly codeUnitFirst: string; readonly localeFirst: string } {
  const slug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
  const codeUnitFirst = `Z${slug}`;
  const localeFirst = `a${slug}`;
  expect(codeUnitFirst < localeFirst).toBe(true);
  expect(codeUnitFirst.localeCompare(localeFirst)).toBeGreaterThan(0);
  return { codeUnitFirst, localeFirst };
}

/**
 * Listed overlays follow code-unit order on a divergent pair, through both
 * overlay-listing branches: the readdir fallback outside a git repository and
 * the tracked-paths branch a real git worktree takes.
 */
export async function assertSpecContextOrdersListedOverlaysByCodeUnits(): Promise<void> {
  await withRichContextEnv(async (env, paths) => {
    const overlayDirectory = `spx/${SPEC_TREE_GRAMMAR.LOCAL_OVERLAYS.DIRECTORY_NAME}`;
    const pair = divergentOrderSlugPair();
    const codeUnitFirstOverlayPath =
      `${overlayDirectory}/${pair.codeUnitFirst}${SPEC_TREE_GRAMMAR.LOCAL_OVERLAYS.EXTENSION}`;
    const localeFirstOverlayPath =
      `${overlayDirectory}/${pair.localeFirst}${SPEC_TREE_GRAMMAR.LOCAL_OVERLAYS.EXTENSION}`;
    await env.writeRaw(codeUnitFirstOverlayPath, "# Code-unit-first overlay\n");
    await env.writeRaw(localeFirstOverlayPath, "# Locale-first overlay\n");

    const overlayPairIn = (manifest: SpecContextManifest): readonly string[] =>
      manifest.listed
        .filter((entry) => entry.role === SPEC_CONTEXT_LISTED_ROLE.OVERLAY)
        .map((entry) => entry.path)
        .filter((path) => path === codeUnitFirstOverlayPath || path === localeFirstOverlayPath);

    const fallbackManifest = parseContextManifest(
      await contextCommand({ target: paths.targetId, cwd: env.productDir }),
    );
    expect(overlayPairIn(fallbackManifest)).toStrictEqual([codeUnitFirstOverlayPath, localeFirstOverlayPath]);

    // The tracked-paths branch is the one a real git worktree takes; it sorts
    // through the same comparator at a different call site.
    const snapshot = await env.readFilesystemSnapshot();
    const trackedPaths = [
      ...snapshot.entries
        .map((entry) => entry.ref?.path)
        .filter((path): path is string => path !== undefined),
      paths.lifecycleOverlayPath,
      codeUnitFirstOverlayPath,
      localeFirstOverlayPath,
    ];
    const trackedManifest = parseContextManifest(
      await contextCommand({
        target: paths.targetId,
        cwd: env.productDir,
        gitDependencies: trackedSpecContextGitDependencies(env.productDir, trackedPaths),
      }),
    );
    expect(overlayPairIn(trackedManifest)).toStrictEqual([codeUnitFirstOverlayPath, localeFirstOverlayPath]);
  });
}

/**
 * Sibling groups follow code-unit order, proven on directory-name pairs with
 * distinct leading letters whose locale order is the opposite: the
 * lower-index read group's identity tie-break, and the same-index and
 * higher-index listed groups.
 */
export async function assertSpecContextOrdersSiblingGroupsByCodeUnits(): Promise<void> {
  await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
    await env.materialize();
    const fixture = env.fixture;
    const nodeSuffix = KIND_REGISTRY[fixture.root.kind].suffix;
    const slug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
    const { codeUnitFirst: codeUnitFirstSlug, localeFirst: localeFirstSlug } = divergentOrderSlugPair();

    const lowerOrder = Math.max(fixture.root.order, fixture.peer.order) + 1;
    const targetOrder = lowerOrder + 1;
    const higherOrder = targetOrder + 1;
    const targetDirectory = `${targetOrder}-${slug}${nodeSuffix}`;
    const pairDirectories = (order: number): readonly [string, string] => [
      `${order}-${codeUnitFirstSlug}${nodeSuffix}`,
      `${order}-${localeFirstSlug}${nodeSuffix}`,
    ];
    const [lowerCodeUnitFirst, lowerLocaleFirst] = pairDirectories(lowerOrder);
    const [sameCodeUnitFirst, sameLocaleFirst] = pairDirectories(targetOrder);
    const [higherCodeUnitFirst, higherLocaleFirst] = pairDirectories(higherOrder);

    await env.writeRaw(`spx/${targetDirectory}/${slug}.md`, "# Ordering target\n");
    await env.writeRaw(`spx/${lowerCodeUnitFirst}/${codeUnitFirstSlug}.md`, "# Lower pair\n");
    await env.writeRaw(`spx/${lowerLocaleFirst}/${localeFirstSlug}.md`, "# Lower pair\n");
    await env.writeRaw(`spx/${sameCodeUnitFirst}/${codeUnitFirstSlug}.md`, "# Same pair\n");
    await env.writeRaw(`spx/${sameLocaleFirst}/${localeFirstSlug}.md`, "# Same pair\n");
    await env.writeRaw(`spx/${higherCodeUnitFirst}/${codeUnitFirstSlug}.md`, "# Higher pair\n");
    await env.writeRaw(`spx/${higherLocaleFirst}/${localeFirstSlug}.md`, "# Higher pair\n");

    const manifest = parseContextManifest(await contextCommand({ target: targetDirectory, cwd: env.productDir }));

    const lowerPair = manifest.read
      .filter((document) => document.role === SPEC_CONTEXT_READ_ROLE.LOWER_INDEX_SIBLING)
      .map((document) => document.path)
      .filter((path) => path.startsWith(`spx/${lowerCodeUnitFirst}/`) || path.startsWith(`spx/${lowerLocaleFirst}/`));
    expect(lowerPair).toStrictEqual([
      `spx/${lowerCodeUnitFirst}/${codeUnitFirstSlug}.md`,
      `spx/${lowerLocaleFirst}/${localeFirstSlug}.md`,
    ]);

    const listedPairFor = (role: SpecContextListedRole, pair: readonly [string, string]): readonly string[] =>
      manifest.listed
        .filter((entry) => entry.role === role)
        .map((entry) => entry.path)
        .filter((path) => path === `spx/${pair[0]}` || path === `spx/${pair[1]}`);
    expect(listedPairFor(SPEC_CONTEXT_LISTED_ROLE.SAME_INDEX_SIBLING, [sameCodeUnitFirst, sameLocaleFirst]))
      .toStrictEqual([`spx/${sameCodeUnitFirst}`, `spx/${sameLocaleFirst}`]);
    expect(listedPairFor(SPEC_CONTEXT_LISTED_ROLE.HIGHER_INDEX_SIBLING, [higherCodeUnitFirst, higherLocaleFirst]))
      .toStrictEqual([`spx/${higherCodeUnitFirst}`, `spx/${higherLocaleFirst}`]);
  });
}

/**
 * Ambiguous-segment candidate listings follow code-unit order on a divergent
 * pair, so the diagnostic's candidate order is host-independent.
 */
export async function assertSpecContextOrdersAmbiguousCandidatesByCodeUnits(): Promise<void> {
  await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
    await env.materialize();
    const fixture = env.fixture;
    const nodeSuffix = KIND_REGISTRY[fixture.root.kind].suffix;
    const pair = divergentOrderSlugPair();
    const ambiguousOrder = Math.max(fixture.root.order, fixture.peer.order) + 1;
    const codeUnitFirstDirectory = `${ambiguousOrder}-${pair.codeUnitFirst}${nodeSuffix}`;
    const localeFirstDirectory = `${ambiguousOrder}-${pair.localeFirst}${nodeSuffix}`;
    await env.writeRaw(`spx/${codeUnitFirstDirectory}/${pair.codeUnitFirst}.md`, "# Ambiguous pair\n");
    await env.writeRaw(`spx/${localeFirstDirectory}/${pair.localeFirst}.md`, "# Ambiguous pair\n");

    const snapshot = await env.readFilesystemSnapshot();
    const resolution = resolveSpecContextTarget(snapshot, `${ambiguousOrder}`);
    if (resolution.ok || resolution.failure.kind !== SPEC_CONTEXT_TARGET_FAILURE_KIND.AMBIGUOUS_SEGMENT) {
      throw new Error("Expected an ambiguous-segment resolution failure for the shared order prefix");
    }
    const candidatePair = resolution.failure.candidates.filter(
      (candidate) => candidate === codeUnitFirstDirectory || candidate === localeFirstDirectory,
    );
    expect(candidatePair).toStrictEqual([codeUnitFirstDirectory, localeFirstDirectory]);
  });
}

export async function assertSpecContextExcludesSymlinkEscapes(): Promise<void> {
  await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
    await env.materialize();
    const snapshot = await env.readFilesystemSnapshot();
    const target = snapshot.allNodes[0];
    const outsideParent = await createTempDir("spx-context-outside-");
    try {
      const outsideSecretPath = join(outsideParent, "outside-secret.md");
      // The marker carries no newline or JSON-escapable character, so it
      // appears verbatim inside a JSON-encoded content field — a leak is
      // observable in the raw output regardless of JSON string escaping.
      const secretMarker = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
      await writeFile(outsideSecretPath, `# Outside secret ${secretMarker}\n`);
      const escapingGuidePath = SPEC_TREE_GRAMMAR.GUIDE_FILES[1];
      await symlink(outsideSecretPath, join(env.productDir, escapingGuidePath));

      const manifestJson = await contextCommand({ target: target.id, cwd: env.productDir, content: true });
      const manifest = parseContextManifest(manifestJson);

      expect(allManifestPaths(manifest)).not.toContain(escapingGuidePath);
      expect(manifestJson).not.toContain(secretMarker);
    } finally {
      await removeTempDir(outsideParent);
    }
  });
}

export async function assertSpecContextProjectionIsDeterministic(): Promise<void> {
  await assertProperty(
    fc.tuple(
      arbitraryNodePath(specTreeKindsConfig()),
      arbitraryDecisionPath(specTreeKindsConfig()),
    ),
    async ([extraNodeDirectory, extraDecisionFile]) => {
      await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
        await env.materialize();
        await env.writeRaw(`spx/${extraNodeDirectory}/extra.md`, "# Extra node\n");
        await env.writeRaw(`spx/${extraDecisionFile}`, "# Extra decision\n");
        const snapshot = await env.readFilesystemSnapshot();
        const target = snapshot.allNodes[0];
        const firstJson = await contextCommand({ target: target.id, cwd: env.productDir });
        const secondJson = await contextCommand({ target: target.id, cwd: env.productDir });
        const firstText = await contextTextCommand({ target: target.id, cwd: env.productDir });
        const secondText = await contextTextCommand({ target: target.id, cwd: env.productDir });
        const firstContent = await contextCommand({ target: target.id, cwd: env.productDir, content: true });
        const secondContent = await contextCommand({ target: target.id, cwd: env.productDir, content: true });
        expect(secondJson).toBe(firstJson);
        expect(secondText).toBe(firstText);
        expect(secondContent).toBe(firstContent);
      });
    },
    { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
  );
}

export async function assertSpecContextContentModeCarriesExactBytes(): Promise<void> {
  await withRichContextEnv(async (env, paths) => {
    const manifest = parseContextManifest(
      await contextCommand({ target: paths.targetId, cwd: env.productDir, content: true }),
    );
    expect(manifest.read.length).toBeGreaterThan(0);
    // The written string is the encoding-independent oracle: a wrong-encoding
    // decode reproduces ASCII documents byte-for-byte but not the multi-byte
    // characters, and a BOM-stripping decode drops the leading U+FEFF.
    expect(
      manifest.read.find((document) => document.path === paths.targetIssuesPath)?.content,
    ).toBe(paths.targetIssuesText);
    for (const document of manifest.read) {
      const rawBytes = await readFile(join(env.productDir, document.path));
      expect(document.content).toBe(decodeContextDocumentUtf8(rawBytes));
      expect(document.digest).toBe(specContextDigest(rawBytes));
      expect(document.digest).toBe(
        `${SPEC_CONTEXT_DIGEST_ALGORITHM}:${createHash(SPEC_CONTEXT_DIGEST_ALGORITHM).update(rawBytes).digest("hex")}`,
      );
      expect(document.bytes).toBe(rawBytes.byteLength);
    }
    for (const entry of manifest.listed) {
      expect(entry).not.toHaveProperty("content");
      expect(entry).not.toHaveProperty("digest");
      expect(entry).not.toHaveProperty("bytes");
    }
  });
}

export async function assertSpecContextContentModeRejectsInvalidUtf8(): Promise<void> {
  await withRichContextEnv(async (env, paths) => {
    await writeFile(join(env.productDir, paths.ancestorPlanPath), Buffer.from([0xff, 0xfe, 0xfd]));
    await expect(
      contextCommand({ target: paths.targetId, cwd: env.productDir, content: true }),
    ).rejects.toThrow(formatInvalidContextDocumentError(paths.ancestorPlanPath));
  });
  // A citation-scanned structural document fails with the same exact-path
  // diagnostic — never a missing-citation error over mangled bytes and never
  // a raw filesystem error.
  await withRichContextEnv(async (env, paths) => {
    await writeFile(join(env.productDir, paths.targetSpecPath), Buffer.from([0xff, 0xfe, 0xfd]));
    await expect(
      contextCommand({ target: paths.targetId, cwd: env.productDir, content: true }),
    ).rejects.toThrow(formatInvalidContextDocumentError(paths.targetSpecPath));
  });
}

export async function assertSpecContextContentModeRejectsUnreadableDocument(): Promise<void> {
  await withRichContextEnv(async (env, paths) => {
    // Removing every permission bit makes the read fail on POSIX non-root
    // runners; restored afterwards so temp-directory cleanup stays quiet.
    await chmod(join(env.productDir, paths.ancestorPlanPath), 0o000);
    try {
      await expect(
        contextCommand({ target: paths.targetId, cwd: env.productDir, content: true }),
      ).rejects.toThrow(formatUnreadableContextDocumentError(paths.ancestorPlanPath));
    } finally {
      await chmod(join(env.productDir, paths.ancestorPlanPath), 0o644);
    }
  });
}

export async function assertSpecContextPathOnlyToleratesUnreadableScanSource(): Promise<void> {
  await withRichContextEnv(async (env, paths) => {
    // Removing every permission bit makes the read fail on POSIX non-root
    // runners; restored afterwards so temp-directory cleanup stays quiet.
    await chmod(join(env.productDir, paths.targetSpecPath), 0o000);
    try {
      const manifest = parseContextManifest(await contextCommand({ target: paths.targetId, cwd: env.productDir }));
      expect(readPaths(manifest)).toContain(paths.targetSpecPath);
    } finally {
      await chmod(join(env.productDir, paths.targetSpecPath), 0o644);
    }
  });
}

export async function assertSpecContextWithoutContentModeOmitsContentFields(): Promise<void> {
  await withRichContextEnv(async (env, paths) => {
    const manifest = parseContextManifest(await contextCommand({ target: paths.targetId, cwd: env.productDir }));
    for (const document of [...manifest.read, ...manifest.listed]) {
      expect(document).not.toHaveProperty("content");
      expect(document).not.toHaveProperty("digest");
      expect(document).not.toHaveProperty("bytes");
    }
  });
}

export async function assertSpecContextCliEmitsContent(): Promise<void> {
  await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
    await env.materialize();
    const target = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.root);
    const result = await runSpecCli(
      env.productDir,
      SPEC_DOMAIN_CLI.COMMAND,
      SPEC_DOMAIN_CLI.CONTEXT_COMMAND,
      target,
      SPEC_DOMAIN_CLI.JSON_OPTION,
      SPEC_DOMAIN_CLI.CONTENT_OPTION,
    );
    const manifest = JSON.parse(result.stdout) as {
      readonly read: readonly {
        readonly content?: string;
        readonly digest?: string;
        readonly bytes?: number;
      }[];
    };
    expect(result.exitCode, result.stderr).toBe(0);
    expect(manifest.read.length).toBeGreaterThan(0);
    for (const document of manifest.read) {
      expect(document.content).toBeDefined();
      expect(document.digest).toBeDefined();
      expect(document.bytes).toBeDefined();
    }
  });
}

export async function assertSpecContextCliRejectsContentWithoutJson(): Promise<void> {
  await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
    await env.materialize();
    const target = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.root);
    const result = await runSpecCli(
      env.productDir,
      SPEC_DOMAIN_CLI.COMMAND,
      SPEC_DOMAIN_CLI.CONTEXT_COMMAND,
      target,
      SPEC_DOMAIN_CLI.CONTENT_OPTION,
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(SPEC_CONTEXT_CONTENT_MESSAGE.REQUIRES_JSON);
  });
}
