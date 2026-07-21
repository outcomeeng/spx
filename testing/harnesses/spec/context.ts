import { mkdir, readFile, realpath } from "node:fs/promises";
import { isAbsolute, join, parse, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

import { execa } from "execa";
import { build } from "tsup";

import { type ContextOptions } from "@/commands/spec/context";
import { METHODOLOGY_CONFIG_FIELDS, METHODOLOGY_SECTION } from "@/config/methodology";
import type { Config } from "@/config/types";
import { contextOutputForFormat, SPEC_CONTEXT_OUTPUT_FORMAT } from "@/interfaces/cli/spec";
import { GIT_LS_FILES_COMMAND } from "@/lib/git/changed-paths";
import { GIT_ROOT_COMMAND, type GitDependencies } from "@/lib/git/root";
import { TRACKED_PATH_NUL_SEPARATOR } from "@/lib/git/tracked-paths";
import {
  FOUNDATION_MANIFEST_FIELDS,
  FOUNDATION_MANIFEST_RELATIVE_PATH,
  FOUNDATION_MANIFEST_SCHEMA_VERSION,
} from "@/lib/methodology/foundation-manifest";
import {
  KIND_REGISTRY,
  SPEC_CONTEXT_LIFECYCLE_OVERLAY_PATH,
  SPEC_TREE_CONFIG,
  SPEC_TREE_CONFIG_FIELDS,
  SPEC_TREE_GRAMMAR,
  type SpecContextListedRole,
  type SpecContextManifest,
  type SpecContextReadRole,
} from "@/lib/spec-tree";
import {
  specContextLowerSiblingDirectoryName as lowerSiblingDirectoryName,
  specContextSameIndexSiblingDirectoryName as sameIndexSiblingDirectoryName,
} from "@testing/generators/spec-tree/context-target";
import {
  sampleSpecTreeTestValue,
  SPEC_TREE_TEST_GENERATOR,
  specTreeFixtureNodeDirectoryName,
} from "@testing/generators/spec-tree/spec-tree";
import { CLI_PATH, NODE_EXECUTABLE } from "@testing/harnesses/constants";
import { type CurrentSpecTreeEnv, withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import { SPEC_CLI_ISOLATION } from "@testing/harnesses/spec/spec-cli-isolation-contract";
import { SPEC_CLI_NETWORK_GUARD_SOURCE_PATH } from "@testing/harnesses/spec/spec-cli-network-guard";

export function parseContextManifest(output: string): SpecContextManifest {
  return JSON.parse(output) as SpecContextManifest;
}

export function contextCommand(options: ContextOptions): Promise<string> {
  return contextOutputForFormat(SPEC_CONTEXT_OUTPUT_FORMAT.JSON, options);
}

export function contextTextCommand(options: ContextOptions): Promise<string> {
  return contextOutputForFormat(SPEC_CONTEXT_OUTPUT_FORMAT.TEXT, options);
}

export function trackedSpecContextGitDependencies(
  productDir: string,
  trackedPaths: readonly string[],
): GitDependencies {
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

export async function rejectedContextMessage(target: string, productDir: string): Promise<string> {
  try {
    await contextCommand({ targets: [target], cwd: productDir });
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

export async function runSpecCli(productDir: string, ...args: readonly string[]) {
  return (await runSpecCliWithIsolation(productDir, ...args)).result;
}

export async function runSpecCliWithIsolation(productDir: string, ...args: readonly string[]) {
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
  const networkAttempts = JSON.parse(await readFile(networkAttemptsFile, "utf8")) as readonly unknown[];
  return {
    mutableStateDirectories: await Promise.all(mutableStateDirectories.map((path) => realpath(path))),
    networkAttempts,
    productDirectory: writableProductDir,
    result,
    writableDirectories: [
      ...new Set(await Promise.all([productDir, writableProductDir].map((path) => realpath(path)))),
    ],
  };
}

export function isWithinProductDirectory(productDir: string, candidate: string): boolean {
  const relativePath = relative(productDir, candidate);
  return relativePath.length > 0
    && relativePath !== ".."
    && !relativePath.startsWith(`..${sep}`)
    && !isAbsolute(relativePath);
}

export function specTreeKindsConfig(): Config {
  return {
    [SPEC_TREE_CONFIG.SECTION]: {
      [SPEC_TREE_CONFIG_FIELDS.KINDS]: KIND_REGISTRY,
    },
  };
}

/** The tree-rooted form of a node id or tree-relative artifact path, projected from the grammar. */
export function rootedSpecPath(relativePath: string): string {
  return `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}${SPEC_TREE_GRAMMAR.PATH_SEPARATOR}${relativePath}`;
}

export function readPaths(manifest: SpecContextManifest): readonly string[] {
  return manifest.read.map((document) => document.path);
}

export function listedPaths(manifest: SpecContextManifest): readonly string[] {
  return manifest.listed.map((entry) => entry.path);
}

export function allManifestPaths(manifest: SpecContextManifest): readonly string[] {
  return [...readPaths(manifest), ...listedPaths(manifest)];
}

/** Read-document paths carrying `role` for any target, in manifest order. */
export function readPathsForRole(manifest: SpecContextManifest, role: SpecContextReadRole): readonly string[] {
  return manifest.read
    .filter((document) => document.roles.some((binding) => binding.role === role))
    .map((document) => document.path);
}

/** Listed-entry paths carrying `role` for any target, in manifest order. */
export function listedPathsForRole(manifest: SpecContextManifest, role: SpecContextListedRole): readonly string[] {
  return manifest.listed
    .filter((entry) => entry.roles.some((binding) => binding.role === role))
    .map((entry) => entry.path);
}

/**
 * A name pair whose code-unit order is the opposite of its locale order,
 * proven by an in-process divergence check: distinct leading letters — never
 * a case-only difference, which collides on case-insensitive filesystems —
 * where "Z" precedes "a" by code units while locale collation orders "a"
 * before "Z". Shared by every ordering assertion so a locale-aware comparator
 * at any manifest ordering site fails a test instead of varying by host.
 */
export function divergentOrderSlugPair(): { readonly codeUnitFirst: string; readonly localeFirst: string } {
  const slug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
  const codeUnitFirst = `Z${slug}`;
  const localeFirst = `a${slug}`;
  if (!(codeUnitFirst < localeFirst) || codeUnitFirst.localeCompare(localeFirst) <= 0) {
    throw new Error("Expected a slug pair whose code-unit order diverges from its locale order");
  }
  return { codeUnitFirst, localeFirst };
}

/** Paths for the fully populated context fixture `withRichContextEnv` materializes. */
export interface RichContextPaths {
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
  readonly sameIndexSiblingSpecPath: string;
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
 * coordination notes never bind citations. The root node directory is a
 * second resolvable target sharing the product spec, the root spec, and the
 * ancestor decision with the nested target, so multi-target composition
 * exercises real shared documents.
 */
export async function withRichContextEnv(
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
    if (productPath === undefined) {
      throw new Error("Expected the materialized fixture to expose a product spec path");
    }

    const paths: RichContextPaths = {
      targetId,
      rootDirectory,
      productPath,
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
      sameIndexSiblingSpecPath: `spx/${sameIndexSiblingDirectoryName(env.fixture)}/${fixture.root.slug}-same.md`,
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
    await env.writeRaw(paths.sameIndexSiblingSpecPath, "# Same sibling\n");

    await callback(env, paths);
  });
}

/** The materialized installed-methodology-package fixture: locations and exact resource text. */
export interface MethodologyPackageFixture {
  /** Product-relative package root, the value the `methodology` config descriptor carries. */
  readonly packageDir: string;
  /** Product-relative path of the written manifest file. */
  readonly manifestPath: string;
  /** Package-relative path of the core foundation document. */
  readonly corePath: string;
  /** Exact text written to the core foundation document; multi-byte content catches decode defects. */
  readonly coreText: string;
  /** Package-relative catalog paths in manifest order: references, templates, examples. */
  readonly catalogPaths: readonly string[];
}

const METHODOLOGY_PACKAGE_DIRECTORY = "methodology-package";

/** The config sections a methodology-package test passes to `withSpecTreeEnv`. */
export function methodologyPackageConfig(identity?: Record<string, unknown>): Config {
  return {
    ...specTreeKindsConfig(),
    [METHODOLOGY_SECTION]: {
      ...identity,
      [METHODOLOGY_CONFIG_FIELDS.PACKAGE_DIR]: METHODOLOGY_PACKAGE_DIRECTORY,
    },
  };
}

/**
 * Writes a schema-version-1 foundation-resource manifest and its named
 * resources under the product-relative package directory the
 * `methodologyPackageConfig` sections point at. `coreText` overrides the core
 * body so a test can prove output tracks the installed resource bytes.
 */
export async function writeMethodologyPackage(
  env: CurrentSpecTreeEnv,
  overrides?: { readonly coreText?: string; readonly schemaVersion?: number },
): Promise<MethodologyPackageFixture> {
  const slug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
  const corePath = `skills/${slug}/SKILL.md`;
  const referencePath = `skills/${slug}/references/${slug}-reference.md`;
  const templatePath = `skills/${slug}/templates/${slug}-template.md`;
  const examplePath = `skills/${slug}/examples/${slug}-example.md`;
  const coreText = overrides?.coreText ?? `# Foundation — Grundlagen ✓ 基盤 ${slug}\n`;
  const manifest = {
    [FOUNDATION_MANIFEST_FIELDS.SCHEMA_VERSION]: overrides?.schemaVersion ?? FOUNDATION_MANIFEST_SCHEMA_VERSION,
    [FOUNDATION_MANIFEST_FIELDS.CORE]: corePath,
    [FOUNDATION_MANIFEST_FIELDS.REFERENCES]: [referencePath],
    [FOUNDATION_MANIFEST_FIELDS.TEMPLATES]: [templatePath],
    [FOUNDATION_MANIFEST_FIELDS.EXAMPLES]: [examplePath],
  };
  const manifestPath = `${METHODOLOGY_PACKAGE_DIRECTORY}/${FOUNDATION_MANIFEST_RELATIVE_PATH}`;
  await env.writeRaw(manifestPath, JSON.stringify(manifest));
  await env.writeRaw(`${METHODOLOGY_PACKAGE_DIRECTORY}/${corePath}`, coreText);
  for (const catalogPath of [referencePath, templatePath, examplePath]) {
    await env.writeRaw(`${METHODOLOGY_PACKAGE_DIRECTORY}/${catalogPath}`, `# Catalog resource\n`);
  }
  return {
    packageDir: METHODOLOGY_PACKAGE_DIRECTORY,
    manifestPath,
    corePath,
    coreText,
    catalogPaths: [referencePath, templatePath, examplePath],
  };
}
