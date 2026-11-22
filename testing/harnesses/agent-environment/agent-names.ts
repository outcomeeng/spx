/**
 * The agent-names rule: no source file outside the agent registry module, its agent modules, and
 * the rule's transitional allowlist holds a string literal exactly equal to a registered agent id
 * or to a variable name an agent module declares. Comments, the module specifier of an import
 * declaration, and files under `src/lib/methodology/` are out of the rule's scope.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const AGENT_NAMES_SOURCE_ROOT = "src";

/** The agent registry module and the directory of its agent modules. */
export const AGENT_NAMES_REGISTRY_MODULE = "src/lib/agent-environment/index.ts";
export const AGENT_NAMES_AGENT_MODULES_DIR = "src/lib/agent-environment/agents/";

/** The methodology bundle vocabulary, out of the rule's scope. */
export const AGENT_NAMES_METHODOLOGY_DIR = "src/lib/methodology/";

/**
 * The files that named an agent when the rule landed. Each leaves the list in the Change that
 * removes its agent names, and the list is empty once every such Change has merged.
 */
export const AGENT_NAMES_TRANSITIONAL_ALLOWLIST: readonly string[] = [
  "src/domains/session/agent-session.ts",
  "src/domains/session/pick-model.ts",
  "src/domains/worktree/controlling-process.ts",
  "src/domains/hooks/session-start.ts",
  "src/interfaces/cli/coding-agent.ts",
  "src/interfaces/cli/hook.ts",
  "src/domains/agent/protocol.ts",
  "src/domains/agent/home.ts",
  "src/domains/agent-environment/config.ts",
  "src/domains/agent-environment/runtime-config.ts",
  "src/commands/diagnose/probes.ts",
];

const TYPESCRIPT_SOURCE_PATTERN = /\.(?:ts|tsx|mts|cts)$/;
const POSIX_SEPARATOR = "/";
const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

/** One source file, by its repository-relative POSIX path. */
export interface AgentNamesSourceFile {
  readonly path: string;
  readonly text: string;
}

/** One string literal that names an agent, by its file, its 1-based line, and its text. */
export interface AgentNameLiteral {
  readonly path: string;
  readonly line: number;
  readonly literal: string;
}

/** Whether the rule judges the file at this repository-relative path. */
export function isInAgentNamesScope(path: string, allowlist: readonly string[]): boolean {
  if (!path.startsWith(`${AGENT_NAMES_SOURCE_ROOT}${POSIX_SEPARATOR}`)) return false;
  if (!TYPESCRIPT_SOURCE_PATTERN.test(path)) return false;
  if (path === AGENT_NAMES_REGISTRY_MODULE) return false;
  if (path.startsWith(AGENT_NAMES_AGENT_MODULES_DIR)) return false;
  if (path.startsWith(AGENT_NAMES_METHODOLOGY_DIR)) return false;
  return !allowlist.includes(path);
}

/** Every string literal in the file whose text equals one of the names, outside import specifiers. */
function namedLiteralsInFile(file: AgentNamesSourceFile, names: ReadonlySet<string>): AgentNameLiteral[] {
  const source = ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, true);
  const found: AgentNameLiteral[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      ts.forEachChild(node, (child) => {
        if (child !== node.moduleSpecifier) visit(child);
      });
      return;
    }
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && names.has(node.text)) {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
      found.push({ path: file.path, line: line + 1, literal: node.text });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** Every literal the rule rejects among the files, judged against the names and the allowlist. */
export function findAgentNameLiterals(
  files: readonly AgentNamesSourceFile[],
  names: readonly string[],
  allowlist: readonly string[] = AGENT_NAMES_TRANSITIONAL_ALLOWLIST,
): AgentNameLiteral[] {
  const nameSet = new Set(names);
  return files
    .filter((file) => isInAgentNamesScope(file.path, allowlist))
    .flatMap((file) => namedLiteralsInFile(file, nameSet));
}

function collectSourcePaths(directory: string, paths: string[]): string[] {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) collectSourcePaths(path, paths);
    else if (TYPESCRIPT_SOURCE_PATTERN.test(entry)) paths.push(path);
  }
  return paths;
}

/** Every TypeScript file under the repository's `src/`, by repository-relative POSIX path. */
export function readRepositorySourceFiles(): AgentNamesSourceFile[] {
  return collectSourcePaths(join(REPO_ROOT, AGENT_NAMES_SOURCE_ROOT), []).map((absolute) => ({
    path: relative(REPO_ROOT, absolute).split(sep).join(POSIX_SEPARATOR),
    text: readFileSync(absolute, "utf8"),
  }));
}
