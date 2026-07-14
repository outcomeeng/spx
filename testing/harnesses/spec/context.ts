import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, parse, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

import { execa } from "execa";
import { build } from "tsup";
import { expect, it } from "vitest";

import {
  type ContextOptions,
  SPEC_CONTEXT_DOCUMENT_ROLE,
  SPEC_CONTEXT_TEXT_LABEL,
  type SpecContextManifest,
} from "@/commands/spec/context";
import { SPEC_NEXT_MESSAGE } from "@/commands/spec/next";
import { OUTPUT_FORMAT } from "@/commands/spec/status";
import { METHODOLOGY_CONFIG_FIELDS, METHODOLOGY_SECTION } from "@/config/methodology";
import { LEGACY_METHODOLOGY_CONFIG_SECTION } from "@/config/methodology-placement";
import { resolveSpecContextTarget, SPEC_CONTEXT_TARGET_FAILURE_KIND } from "@/domains/spec/context-target";
import {
  contextOutputForFormat,
  formatSpecContextTargetFailure,
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
import { RETIRED_SPEC_APPLY_FIXTURE, specTreeFixtureNodeDirectoryName } from "@testing/generators/spec-tree/spec-tree";
import { generatedMethodologySection } from "@testing/harnesses/config/methodology";
import { CLI_PATH, NODE_EXECUTABLE } from "@testing/harnesses/constants";
import { GIT_TEST_CONFIG, GIT_TEST_FLAGS, GIT_TEST_SUBCOMMANDS, runGit } from "@testing/harnesses/git-test-constants";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
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
      readonly documents: readonly { readonly role: string }[];
    };
    expect(result.exitCode).toBe(0);
    expect(manifest.target).toBe(`${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${target}`);
    expect(manifest.documents.some((document) => document.role === SPEC_CONTEXT_DOCUMENT_ROLE.PRODUCT)).toBe(true);
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

export async function assertSpecContextManifestIncludesDocuments(): Promise<void> {
  await withSpecTreeEnv({
    [SPEC_TREE_CONFIG.SECTION]: {
      [SPEC_TREE_CONFIG_FIELDS.KINDS]: KIND_REGISTRY,
    },
  }, async (env) => {
    await env.materialize();
    const snapshot = await env.readFilesystemSnapshot();
    const target = snapshot.allNodes.find((node) => node.parentId !== undefined) ?? snapshot.allNodes[0];
    const lowerSibling = lowerSiblingDirectoryName(env.fixture);
    const evidencePath = `spx/${target.id}/tests/${target.slug}.scenario.l1.test.ts`;
    const decisionSuffix = KIND_REGISTRY[env.fixture.decision.kind].suffix;
    const targetDecisionPath =
      `spx/${target.id}/${env.fixture.decision.order}-${env.fixture.decision.slug}${decisionSuffix}`;
    const higherTargetDecisionPath =
      `spx/${target.id}/${env.fixture.peer.order}-${env.fixture.decision.slug}${decisionSuffix}`;
    const productDecisionPath = `spx/${env.fixture.decision.order}-${env.fixture.decision.slug}${decisionSuffix}`;
    const higherProductDecisionPath = `spx/${env.fixture.peer.order}-${env.fixture.decision.slug}${decisionSuffix}`;
    const ancestorDecisionPath =
      `spx/${target.parentId}/${env.fixture.decision.order}-${env.fixture.decision.slug}${decisionSuffix}`;
    const higherAncestorDecisionPath =
      `spx/${target.parentId}/${env.fixture.peer.order}-${env.fixture.decision.slug}${decisionSuffix}`;
    for (const filename of SPEC_TREE_GRAMMAR.COORDINATION_NOTES) {
      await env.writeRaw(`spx/${filename}`, `# Product ${filename}\n`);
      await env.writeRaw(`spx/${target.parentId}/${filename}`, `# Ancestor ${filename}\n`);
      await env.writeRaw(`spx/${target.id}/${filename}`, `# Target ${filename}\n`);
    }
    await env.writeRaw(`spx/${lowerSibling}/${env.fixture.root.slug}.md`, "# Lower sibling\n");
    await env.writeRaw(evidencePath, "import { describe, it } from \"vitest\";\n");
    await env.writeRaw(targetDecisionPath, "# Target decision\n");
    await env.writeRaw(higherTargetDecisionPath, "# Higher target decision\n");
    await env.writeRaw(productDecisionPath, "# Product decision\n");
    await env.writeRaw(higherProductDecisionPath, "# Higher product decision\n");
    await env.writeRaw(higherAncestorDecisionPath, "# Higher ancestor decision\n");
    const manifest = parseContextManifest(await contextCommand({ target: target.id, cwd: env.productDir }));
    const productPath = snapshot.product?.ref?.path;
    const ancestorPath = snapshot.allNodes.find((node) => node.id === target.parentId)?.ref?.path;
    expect(productPath).toBeDefined();
    expect(ancestorPath).toBeDefined();
    const roles = new Set(manifest.documents.map((document) => document.role));
    expect(manifest.documents).toContainEqual({
      path: productPath,
      role: SPEC_CONTEXT_DOCUMENT_ROLE.PRODUCT,
    });
    expect(manifest.documents).toContainEqual({
      path: ancestorPath,
      role: SPEC_CONTEXT_DOCUMENT_ROLE.ANCESTOR,
    });
    expect(roles.has(SPEC_CONTEXT_DOCUMENT_ROLE.TARGET)).toBe(true);
    expect(roles.has(SPEC_CONTEXT_DOCUMENT_ROLE.DECISION)).toBe(true);
    expect(roles.has(SPEC_CONTEXT_DOCUMENT_ROLE.EVIDENCE)).toBe(true);
    for (const filename of SPEC_TREE_GRAMMAR.COORDINATION_NOTES) {
      expect(manifest.documents).toContainEqual({
        path: `spx/${filename}`,
        role: SPEC_CONTEXT_DOCUMENT_ROLE.COORDINATION,
      });
      expect(manifest.documents).toContainEqual({
        path: `spx/${target.parentId}/${filename}`,
        role: SPEC_CONTEXT_DOCUMENT_ROLE.COORDINATION,
      });
      expect(manifest.documents).toContainEqual({
        path: `spx/${target.id}/${filename}`,
        role: SPEC_CONTEXT_DOCUMENT_ROLE.COORDINATION,
      });
    }
    expect(manifest.documents).toContainEqual({
      path: `spx/${lowerSibling}/${env.fixture.root.slug}.md`,
      role: SPEC_CONTEXT_DOCUMENT_ROLE.LOWER_INDEX_SIBLING,
    });
    expect(manifest.documents).toContainEqual({
      path: evidencePath,
      role: SPEC_CONTEXT_DOCUMENT_ROLE.EVIDENCE,
    });
    expect(manifest.documents).toContainEqual({
      path: targetDecisionPath,
      role: SPEC_CONTEXT_DOCUMENT_ROLE.DECISION,
    });
    expect(manifest.documents).toContainEqual({
      path: higherTargetDecisionPath,
      role: SPEC_CONTEXT_DOCUMENT_ROLE.DECISION,
    });
    expect(manifest.documents).toContainEqual({
      path: productDecisionPath,
      role: SPEC_CONTEXT_DOCUMENT_ROLE.DECISION,
    });
    expect(manifest.documents).toContainEqual({
      path: ancestorDecisionPath,
      role: SPEC_CONTEXT_DOCUMENT_ROLE.DECISION,
    });
    expect(manifest.documents.map((document) => document.path)).not.toContain(higherProductDecisionPath);
    expect(manifest.documents.map((document) => document.path)).not.toContain(higherAncestorDecisionPath);
    const productIndex = manifest.documents.findIndex((document) =>
      document.role === SPEC_CONTEXT_DOCUMENT_ROLE.PRODUCT
    );
    const targetIndex = manifest.documents.findIndex((document) => document.role === SPEC_CONTEXT_DOCUMENT_ROLE.TARGET);
    expect(productIndex).toBeGreaterThanOrEqual(0);
    expect(targetIndex).toBeGreaterThan(productIndex);
    expect(manifest.documents.length).toBeGreaterThan(0);
  });
}

export async function assertSpecContextManifestListsSameAndHigherSiblings(): Promise<void> {
  await withSpecTreeEnv({
    [SPEC_TREE_CONFIG.SECTION]: {
      [SPEC_TREE_CONFIG_FIELDS.KINDS]: KIND_REGISTRY,
    },
  }, async (env) => {
    await env.materialize();
    const target = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.root);
    const sameIndexSibling = sameIndexSiblingDirectoryName(env.fixture);
    const higherIndexSibling = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.peer);
    await env.writeRaw(`spx/${sameIndexSibling}/${env.fixture.root.slug}-same.md`, "# Same sibling\n");

    const manifest = parseContextManifest(await contextCommand({ target, cwd: env.productDir }));
    const output = await contextTextCommand({ target, cwd: env.productDir });

    expect(manifest.siblings.sameIndex).toContain(`spx/${sameIndexSibling}`);
    expect(manifest.siblings.higherIndex).toContain(`spx/${higherIndexSibling}`);
    expect(manifest.documents.map((document) => document.path)).not.toContain(
      `spx/${sameIndexSibling}/${env.fixture.root.slug}-same.md`,
    );
    expect(manifest.documents.map((document) => document.path)).not.toContain(
      `spx/${higherIndexSibling}/${env.fixture.peer.slug}.md`,
    );
    expect(output).toContain(`${SPEC_CONTEXT_TEXT_LABEL.SAME_INDEX_SIBLINGS}:`);
    expect(output).toContain(`  - spx/${sameIndexSibling}`);
    expect(output).toContain(`${SPEC_CONTEXT_TEXT_LABEL.HIGHER_INDEX_SIBLINGS}:`);
    expect(output).toContain(`  - spx/${higherIndexSibling}`);
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

    expect(manifest.documents.map((document) => document.path)).not.toContain(
      `spx/${scratch}/${env.fixture.root.slug}.md`,
    );
    expect(manifest.documents.map((document) => document.path)).not.toContain(`spx/${target}/PLAN.md`);
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
      expect(manifest.documents.map((document) => document.path)).not.toContain(scratchPath);
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
    expect(manifest.documents.map((document) => document.path)).not.toContain(
      `spx/${missingChild}/metadata-only.md`,
    );
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
    expect(textOutput).toContain(`${SPEC_CONTEXT_TEXT_LABEL.DOCUMENTS}:`);
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
