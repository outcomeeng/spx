import { readFile as readFileFromDisk } from "node:fs/promises";
import { join as joinFilePath } from "node:path";
import { dirname, extname, join as joinProductPath, normalize } from "node:path/posix";
import ts from "typescript";

import { defaultGitDependencies, GIT_ROOT_COMMAND, type GitDependencies } from "@/git/root";
import {
  SPEC_TREE_ENTRY_TYPE,
  type SpecTreeEvidenceSourceEntry,
  type SpecTreeNode,
  type SpecTreeSnapshot,
} from "@/lib/spec-tree";
import { SPEC_TREE_CONFIG } from "@/lib/spec-tree/config";

import { NODE_STATUS_FILENAME } from "./read";

export const NODE_STATUS_STALENESS_STORAGE_FIELD = {
  STALE: "stale",
  DEPENDENCY_PATHS: "dependencyPaths",
  COMMIT_IDS: "commitIds",
  TIMESTAMPS: "timestamps",
} as const;

export interface NodeStatusStalenessFileSystem {
  readFile(path: string): Promise<string>;
}

export interface ResolveStaleNodeIdsOptions {
  readonly productDir: string;
  readonly snapshot: SpecTreeSnapshot;
  readonly gitDependencies?: GitDependencies;
  readonly fileSystem?: NodeStatusStalenessFileSystem;
}

const NODE_STATUS_STALENESS_FILE_SYSTEM: NodeStatusStalenessFileSystem = {
  readFile: (path: string) => readFileFromDisk(path, { encoding: "utf8" }),
};
const GIT_LOG_COMMAND = {
  LOG: "log",
  MAX_COUNT_ONE: "-1",
  FORMAT_HASH: "--format=%H",
  PATH_SEPARATOR: "--",
} as const;
const GIT_MERGE_BASE_COMMAND = {
  MERGE_BASE: "merge-base",
  IS_ANCESTOR: "--is-ancestor",
} as const;
const TYPESCRIPT_SOURCE_EXTENSIONS: readonly string[] = [".ts", ".tsx"];
const TYPESCRIPT_INDEX_BASENAME = "index";
const SOURCE_ROOT = "src";
const SOURCE_ROOT_PREFIX = `${SOURCE_ROOT}/`;
const TEST_SUPPORT_ROOT = "testing";
const TEST_SUPPORT_ROOT_PREFIX = `${TEST_SUPPORT_ROOT}/`;
const LIB_ROOT = `${SOURCE_ROOT}/lib`;
const SCRIPTS_ROOT = "scripts";
const SCRIPTS_ROOT_PREFIX = `${SCRIPTS_ROOT}/`;
const ESLINT_RULES_ROOT = "eslint-rules";
const ESLINT_RULES_ROOT_PREFIX = `${ESLINT_RULES_ROOT}/`;
const RELATIVE_IMPORT_PREFIX = ".";
const EMPTY_STDOUT = "";
const NODE_FILE_ERROR_CODE = {
  ENOENT: "ENOENT",
  EISDIR: "EISDIR",
} as const;
const LOCAL_IMPORT_ALIASES = [
  { prefix: "@/", target: SOURCE_ROOT_PREFIX },
  { prefix: "@lib/", target: `${LIB_ROOT}/` },
  { prefix: "@root/", target: "" },
  { prefix: "@scripts/", target: SCRIPTS_ROOT_PREFIX },
  { prefix: "@testing/", target: TEST_SUPPORT_ROOT_PREFIX },
  { prefix: "@eslint-rules/", target: ESLINT_RULES_ROOT_PREFIX },
] as const;
const LOCAL_DEPENDENCY_ROOT_PREFIXES = [
  SOURCE_ROOT_PREFIX,
  TEST_SUPPORT_ROOT_PREFIX,
  SCRIPTS_ROOT_PREFIX,
  ESLINT_RULES_ROOT_PREFIX,
] as const;
const IMPORT_ANALYSIS_FILENAME = "node-status-staleness-imports.ts";

/**
 * Resolve node ids whose committed status projection is older than their
 * status dependency graph. The resolver reads Git and source files through
 * injected dependencies, performs no writes, and never changes lifecycle state.
 */
export async function resolveStaleNodeIds(
  options: ResolveStaleNodeIdsOptions,
): Promise<ReadonlySet<string>> {
  const {
    productDir,
    snapshot,
    gitDependencies = defaultGitDependencies,
    fileSystem = NODE_STATUS_STALENESS_FILE_SYSTEM,
  } = options;
  const evidenceByNode = collectEvidenceByNode(snapshot);
  const staleNodeIds = new Set<string>();

  for (const node of snapshot.allNodes) {
    const statusPath = nodeStatusPath(node.id);
    const statusCommit = await latestCommitForPath(productDir, statusPath, gitDependencies);
    if (statusCommit === undefined) {
      continue;
    }

    const dependencyPaths = await statusDependencyPaths({
      productDir,
      node,
      evidence: evidenceByNode.get(node.id) ?? [],
      fileSystem,
    });
    if (await hasLaterDependencyCommit(productDir, statusCommit, dependencyPaths, gitDependencies)) {
      staleNodeIds.add(node.id);
    }
  }

  return staleNodeIds;
}

function collectEvidenceByNode(
  snapshot: SpecTreeSnapshot,
): ReadonlyMap<string, readonly SpecTreeEvidenceSourceEntry[]> {
  const evidenceByNode = new Map<string, SpecTreeEvidenceSourceEntry[]>();
  for (const entry of snapshot.entries) {
    if (entry.type === SPEC_TREE_ENTRY_TYPE.EVIDENCE) {
      const entries = evidenceByNode.get(entry.parentId) ?? [];
      entries.push(entry);
      evidenceByNode.set(entry.parentId, entries);
    }
  }
  return evidenceByNode;
}

interface StatusDependencyPathOptions {
  readonly productDir: string;
  readonly node: SpecTreeNode;
  readonly evidence: readonly SpecTreeEvidenceSourceEntry[];
  readonly fileSystem: NodeStatusStalenessFileSystem;
}

async function statusDependencyPaths(options: StatusDependencyPathOptions): Promise<ReadonlySet<string>> {
  const paths = new Set<string>();
  if (options.node.ref?.path !== undefined) {
    paths.add(options.node.ref.path);
  }

  for (const entry of options.evidence) {
    const evidencePath = entry.ref?.path ?? entry.id;
    paths.add(evidencePath);
    await collectReachableImplementationPaths({
      productDir: options.productDir,
      importerPath: evidencePath,
      fileSystem: options.fileSystem,
      collected: paths,
      visited: new Set<string>(),
    });
  }

  return paths;
}

interface CollectImplementationPathOptions {
  readonly productDir: string;
  readonly importerPath: string;
  readonly fileSystem: NodeStatusStalenessFileSystem;
  readonly collected: Set<string>;
  readonly visited: Set<string>;
}

async function collectReachableImplementationPaths(options: CollectImplementationPathOptions): Promise<void> {
  if (options.visited.has(options.importerPath)) {
    return;
  }
  options.visited.add(options.importerPath);

  const content = await readProductFile(options.productDir, options.importerPath, options.fileSystem);
  if (content === undefined) {
    return;
  }

  for (const specifier of importSpecifiers(content)) {
    const resolvedPath = await resolveLocalImplementationImport({
      productDir: options.productDir,
      importerPath: options.importerPath,
      specifier,
      fileSystem: options.fileSystem,
    });
    if (resolvedPath === undefined) {
      continue;
    }
    options.collected.add(resolvedPath);
    await collectReachableImplementationPaths({
      productDir: options.productDir,
      importerPath: resolvedPath,
      fileSystem: options.fileSystem,
      collected: options.collected,
      visited: options.visited,
    });
  }
}

function importSpecifiers(content: string): readonly string[] {
  const sourceFile = ts.createSourceFile(
    IMPORT_ANALYSIS_FILENAME,
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const specifiers: string[] = [];
  collectImportSpecifiers(sourceFile, specifiers);
  return specifiers;
}

function collectImportSpecifiers(node: ts.Node, specifiers: string[]): void {
  const specifier = importSpecifierForNode(node);
  if (specifier !== undefined) {
    specifiers.push(specifier);
  }
  ts.forEachChild(node, (child) => collectImportSpecifiers(child, specifiers));
}

function importSpecifierForNode(node: ts.Node): string | undefined {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
    return stringLiteralText(node.moduleSpecifier);
  }
  if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
    return stringLiteralText(node.arguments[0]);
  }
  return undefined;
}

function stringLiteralText(node: ts.Node | undefined): string | undefined {
  if (node === undefined) {
    return undefined;
  }
  return ts.isStringLiteral(node) ? node.text : undefined;
}

interface ResolveLocalImportOptions {
  readonly productDir: string;
  readonly importerPath: string;
  readonly specifier: string;
  readonly fileSystem: NodeStatusStalenessFileSystem;
}

async function resolveLocalImplementationImport(options: ResolveLocalImportOptions): Promise<string | undefined> {
  const unresolvedPath = unresolvedLocalImplementationPath(options.importerPath, options.specifier);
  if (unresolvedPath === undefined) {
    return undefined;
  }
  if (await canReadProductFile(options.productDir, unresolvedPath, options.fileSystem)) {
    return unresolvedPath;
  }
  for (const candidate of sourcePathCandidates(unresolvedPath)) {
    if (await canReadProductFile(options.productDir, candidate, options.fileSystem)) {
      return candidate;
    }
  }
  return undefined;
}

function unresolvedLocalImplementationPath(importerPath: string, specifier: string): string | undefined {
  const alias = LOCAL_IMPORT_ALIASES.find((candidate) => specifier.startsWith(candidate.prefix));
  if (alias !== undefined) {
    return normalize(`${alias.target}${specifier.slice(alias.prefix.length)}`);
  }
  if (!specifier.startsWith(RELATIVE_IMPORT_PREFIX)) {
    return undefined;
  }

  const resolvedPath = normalize(joinProductPath(dirname(importerPath), specifier));
  return isTrackedDependencyRoot(resolvedPath) ? resolvedPath : undefined;
}

function isTrackedDependencyRoot(path: string): boolean {
  return LOCAL_DEPENDENCY_ROOT_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function sourcePathCandidates(sourcePath: string): readonly string[] {
  if (hasTypeScriptSourceExtension(sourcePath)) {
    return [sourcePath];
  }
  return [
    ...TYPESCRIPT_SOURCE_EXTENSIONS.map((extension) => `${sourcePath}${extension}`),
    ...TYPESCRIPT_SOURCE_EXTENSIONS.map((extension) =>
      joinProductPath(sourcePath, `${TYPESCRIPT_INDEX_BASENAME}${extension}`)
    ),
  ];
}

function hasTypeScriptSourceExtension(path: string): boolean {
  const pathExtension = extname(path);
  return TYPESCRIPT_SOURCE_EXTENSIONS.includes(pathExtension);
}

async function hasLaterDependencyCommit(
  productDir: string,
  statusCommit: string,
  dependencyPaths: ReadonlySet<string>,
  gitDependencies: GitDependencies,
): Promise<boolean> {
  for (const dependencyPath of dependencyPaths) {
    const dependencyCommit = await latestCommitForPath(productDir, dependencyPath, gitDependencies);
    if (
      dependencyCommit !== undefined
      && dependencyCommit !== statusCommit
      && await isAncestorCommit(productDir, statusCommit, dependencyCommit, gitDependencies)
    ) {
      return true;
    }
  }
  return false;
}

async function latestCommitForPath(
  productDir: string,
  path: string,
  gitDependencies: GitDependencies,
): Promise<string | undefined> {
  const result = await gitDependencies.execa(
    GIT_ROOT_COMMAND.EXECUTABLE,
    [
      GIT_LOG_COMMAND.LOG,
      GIT_LOG_COMMAND.MAX_COUNT_ONE,
      GIT_LOG_COMMAND.FORMAT_HASH,
      GIT_LOG_COMMAND.PATH_SEPARATOR,
      path,
    ],
    { cwd: productDir, reject: false },
  );
  const commitHash = result.stdout.trim();
  if (result.exitCode !== 0 || commitHash === EMPTY_STDOUT) {
    return undefined;
  }
  return commitHash;
}

async function isAncestorCommit(
  productDir: string,
  ancestorCommit: string,
  descendantCommit: string,
  gitDependencies: GitDependencies,
): Promise<boolean> {
  const result = await gitDependencies.execa(
    GIT_ROOT_COMMAND.EXECUTABLE,
    [
      GIT_MERGE_BASE_COMMAND.MERGE_BASE,
      GIT_MERGE_BASE_COMMAND.IS_ANCESTOR,
      ancestorCommit,
      descendantCommit,
    ],
    { cwd: productDir, reject: false },
  );
  return result.exitCode === 0;
}

async function canReadProductFile(
  productDir: string,
  path: string,
  fileSystem: NodeStatusStalenessFileSystem,
): Promise<boolean> {
  return await readProductFile(productDir, path, fileSystem) !== undefined;
}

async function readProductFile(
  productDir: string,
  path: string,
  fileSystem: NodeStatusStalenessFileSystem,
): Promise<string | undefined> {
  try {
    return await fileSystem.readFile(joinFilePath(productDir, path));
  } catch (error) {
    if (
      isNodeError(error)
      && (error.code === NODE_FILE_ERROR_CODE.ENOENT || error.code === NODE_FILE_ERROR_CODE.EISDIR)
    ) {
      return undefined;
    }
    throw error;
  }
}

function nodeStatusPath(nodeId: string): string {
  return joinProductPath(SPEC_TREE_CONFIG.ROOT_DIRECTORY, nodeId, NODE_STATUS_FILENAME);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
