import { execa } from "execa";
import { cp, readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";

import {
  SPEC_CONTEXT_DOCUMENT_ROLE,
  type SpecContextDocument,
  type SpecContextManifest,
} from "@/commands/spec/context";
import { SPEC_NEXT_MESSAGE } from "@/commands/spec/next";
import { OUTPUT_FORMAT } from "@/commands/spec/status";
import { DEFAULT_METHODOLOGY_CONFIG } from "@/config/methodology";
import { formatSpecCliError, SPEC_DOMAIN_CLI, specStatusInvalidFormatMessage } from "@/interfaces/cli/spec";
import {
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_NODE_STATE,
  type SpecTreeProjectedNode,
  type SpecTreeProjection,
} from "@/lib/spec-tree";
import { KIND_REGISTRY, SPEC_TREE_CONFIG } from "@/lib/spec-tree/config";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import { sampleSpecCliTestValue, SPEC_CLI_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-cli";
import { specTreeFixtureNodeDirectoryName } from "@testing/generators/spec-tree/spec-tree";
import { PRODUCT_ROOT } from "@testing/harnesses/constants";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const SPEC_CLI_FIXTURE_DIRECTORY = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "fixtures",
  "spec-cli",
);
const RETIRED_APPLY_PRODUCT_FIXTURE = join(SPEC_CLI_FIXTURE_DIRECTORY, "retired-apply-product");
const RETIRED_COMMAND_FILE = "command.txt";
const RETIRED_EXPECTED_STDERR_FILE = "expected-stderr.txt";
const CONTEXT_TARGET_FIXTURE = "context-target.md.fixture";
const CONTEXT_EVIDENCE_FIXTURE = "context-evidence.ts.fixture";
const CONTEXT_EVIDENCE_FILE = "context.scenario.l1.test.ts";
const TEMP_RETIRED_PRODUCT_PREFIX = "spx-retired-apply-";
const TYPESCRIPT_EXECUTABLE = resolve(PRODUCT_ROOT, "node_modules", ".bin", "tsx");
const TYPESCRIPT_CONFIG_PATH = resolve(PRODUCT_ROOT, "tsconfig.json");
const DEVELOPMENT_CLI_PATH = resolve(PRODUCT_ROOT, "src", "cli.ts");

export async function assertStatusRoutesThroughDevelopmentCli(): Promise<void> {
  await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
    await env.materialize();

    const { stdout, exitCode } = await runCli(
      env.productDir,
      SPEC_DOMAIN_CLI.COMMAND,
      SPEC_DOMAIN_CLI.STATUS_COMMAND,
    );

    expect(exitCode).toBe(0);
    expect(stdout).toContain(env.fixture.root.slug);
    expect(stdout).toContain(SPEC_TREE_NODE_STATE.DECLARED);
  });
}

export async function assertStatusUpdateRoutesThroughDevelopmentCli(): Promise<void> {
  await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
    await env.materialize();

    const { stdout, stderr, exitCode } = await runCli(
      env.productDir,
      SPEC_DOMAIN_CLI.COMMAND,
      SPEC_DOMAIN_CLI.STATUS_COMMAND,
      SPEC_DOMAIN_CLI.UPDATE_OPTION,
      SPEC_DOMAIN_CLI.FORMAT_OPTION_FLAG,
      OUTPUT_FORMAT.JSON,
    );

    expect(exitCode, stderr).toBe(0);
    const projection = JSON.parse(stdout) as SpecTreeProjection;
    const projectedNodes = flattenProjectedNodes(projection.nodes);
    const fixtureNodes = env.fixture.entries.filter((entry) => entry.type === SPEC_TREE_ENTRY_TYPE.NODE);
    expect(projectedNodes).toHaveLength(fixtureNodes.length);
    for (const node of projectedNodes) {
      expect(node.state).toBe(SPEC_TREE_NODE_STATE.DECLARED);
    }
  });
}

export async function assertNextRoutesThroughDevelopmentCli(): Promise<void> {
  await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
    await env.materialize();

    const { stdout, exitCode } = await runCli(
      env.productDir,
      SPEC_DOMAIN_CLI.COMMAND,
      SPEC_DOMAIN_CLI.NEXT_COMMAND,
    );

    expect(exitCode).toBe(0);
    expect(stdout).toContain(SPEC_NEXT_MESSAGE.HEADING);
    expect(stdout).toContain(env.fixture.root.slug);
  });
}

export async function assertContextRoutesThroughDevelopmentCli(): Promise<void> {
  await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
    await env.materialize();
    const rootDirectory = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.root);
    const childDirectory = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.child);
    const peerDirectory = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.peer);
    const childTarget = `${rootDirectory}/${childDirectory}`;
    const childSpecPath = `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${childTarget}/${env.fixture.child.slug}.md`;
    const evidencePath = `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${childTarget}/tests/${CONTEXT_EVIDENCE_FILE}`;
    await env.writeNode(childSpecPath, await readSpecCliFixture(CONTEXT_TARGET_FIXTURE));
    await env.writeNode(evidencePath, await readSpecCliFixture(CONTEXT_EVIDENCE_FIXTURE));

    const childResult = await runCli(
      env.productDir,
      SPEC_DOMAIN_CLI.COMMAND,
      SPEC_DOMAIN_CLI.CONTEXT_COMMAND,
      childTarget,
      SPEC_DOMAIN_CLI.JSON_OPTION,
    );
    const childManifest = JSON.parse(childResult.stdout) as SpecContextManifest;
    expect(childResult.exitCode).toBe(0);
    expect(childManifest.methodology).toEqual(DEFAULT_METHODOLOGY_CONFIG);
    expect(childManifest.target).toBe(`${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${childTarget}`);
    expectDocument(childManifest.documents, SPEC_CONTEXT_DOCUMENT_ROLE.PRODUCT);
    expectDocument(childManifest.documents, SPEC_CONTEXT_DOCUMENT_ROLE.ANCESTOR);
    expectDocument(childManifest.documents, SPEC_CONTEXT_DOCUMENT_ROLE.TARGET, childSpecPath);
    expectDocument(childManifest.documents, SPEC_CONTEXT_DOCUMENT_ROLE.DECISION);
    expectDocument(childManifest.documents, SPEC_CONTEXT_DOCUMENT_ROLE.EVIDENCE, evidencePath);

    const peerResult = await runCli(
      env.productDir,
      SPEC_DOMAIN_CLI.COMMAND,
      SPEC_DOMAIN_CLI.CONTEXT_COMMAND,
      peerDirectory,
      SPEC_DOMAIN_CLI.JSON_OPTION,
    );
    const peerManifest = JSON.parse(peerResult.stdout) as SpecContextManifest;
    expect(peerResult.exitCode).toBe(0);
    expectDocument(
      peerManifest.documents,
      SPEC_CONTEXT_DOCUMENT_ROLE.LOWER_INDEX_SIBLING,
      `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${rootDirectory}/${env.fixture.root.slug}.md`,
    );

    const rootResult = await runCli(
      env.productDir,
      SPEC_DOMAIN_CLI.COMMAND,
      SPEC_DOMAIN_CLI.CONTEXT_COMMAND,
      rootDirectory,
      SPEC_DOMAIN_CLI.JSON_OPTION,
    );
    const rootManifest = JSON.parse(rootResult.stdout) as SpecContextManifest;
    expect(rootResult.exitCode).toBe(0);
    expect(rootManifest.siblings.sameIndex).toEqual([]);
    expect(rootManifest.siblings.higherIndex).toEqual([
      `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${peerDirectory}`,
    ]);
  });
}

export async function assertUnsupportedStatusFormatIsRejected(): Promise<void> {
  const unsupportedFormat = sampleSpecCliTestValue(SPEC_CLI_TEST_GENERATOR.unsupportedStatusFormat());

  await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
    await env.materialize();

    const result = await runCli(
      env.productDir,
      SPEC_DOMAIN_CLI.COMMAND,
      SPEC_DOMAIN_CLI.STATUS_COMMAND,
      SPEC_DOMAIN_CLI.FORMAT_OPTION_FLAG,
      unsupportedFormat,
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe(formatSpecCliError(specStatusInvalidFormatMessage(unsupportedFormat)));
  });
}

export async function assertLocalStatusFormatFlagsRemainHermetic(): Promise<void> {
  await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
    await env.materialize();

    const { stdout, exitCode } = await runCli(
      env.productDir,
      SPEC_DOMAIN_CLI.COMMAND,
      SPEC_DOMAIN_CLI.STATUS_COMMAND,
      SPEC_DOMAIN_CLI.FORMAT_OPTION_FLAG,
      OUTPUT_FORMAT.JSON,
    );

    expect(exitCode).toBe(0);
    expect(() => JSON.parse(stdout)).not.toThrow();
  });
}

export async function assertRetiredApplyRoutingPreservesProductConfig(): Promise<void> {
  await withRetiredApplyProduct(async ({ productDir, command, expectedStderr, productConfigSnapshot }) => {
    const result = await runCli(productDir, SPEC_DOMAIN_CLI.COMMAND, command);
    expect(result.exitCode).toBe(1);
    expect(result.stderr.trim()).toBe(expectedStderr);
    expect(await snapshotProductRootFiles(productDir)).toEqual(productConfigSnapshot);
  });
}

async function runCli(cwd: string, ...args: readonly string[]) {
  return execa(
    TYPESCRIPT_EXECUTABLE,
    ["--tsconfig", TYPESCRIPT_CONFIG_PATH, DEVELOPMENT_CLI_PATH, ...args],
    { cwd, reject: false, stripFinalNewline: false },
  );
}

function flattenProjectedNodes(nodes: readonly SpecTreeProjectedNode[]): readonly SpecTreeProjectedNode[] {
  return nodes.flatMap((node) => [node, ...flattenProjectedNodes(node.children)]);
}

function expectDocument(
  documents: readonly SpecContextDocument[],
  role: string,
  path?: string,
): void {
  expect(documents).toContainEqual(path === undefined ? expect.objectContaining({ role }) : { role, path });
}

function readSpecCliFixture(filename: string): Promise<string> {
  return readFile(join(SPEC_CLI_FIXTURE_DIRECTORY, filename), "utf8");
}

function withRetiredApplyProduct(
  callback: (fixture: {
    readonly productDir: string;
    readonly command: string;
    readonly expectedStderr: string;
    readonly productConfigSnapshot: ReadonlyMap<string, string>;
  }) => Promise<void>,
): Promise<void> {
  return withTempDir(TEMP_RETIRED_PRODUCT_PREFIX, async (temporaryDirectory) => {
    const productDir = join(temporaryDirectory, "product");
    await cp(RETIRED_APPLY_PRODUCT_FIXTURE, productDir, { recursive: true });
    await callback({
      productDir,
      command: (await readFile(join(productDir, RETIRED_COMMAND_FILE), "utf8")).trim(),
      expectedStderr: (await readFile(join(productDir, RETIRED_EXPECTED_STDERR_FILE), "utf8")).trim(),
      productConfigSnapshot: await snapshotProductRootFiles(productDir),
    });
  });
}

async function snapshotProductRootFiles(productDir: string): Promise<ReadonlyMap<string, string>> {
  const entries = await readdir(productDir, { withFileTypes: true });
  return new Map(
    await Promise.all(
      entries
        .filter((entry) => entry.isFile())
        .sort((left, right) => left.name.localeCompare(right.name))
        .map(async (entry) => [entry.name, await readFile(join(productDir, entry.name), "utf8")] as const),
    ),
  );
}
