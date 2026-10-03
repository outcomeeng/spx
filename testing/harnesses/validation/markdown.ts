import { readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

import { CONFIG_PROCESS_CWD } from "@/lib/config/cwd";
import { NODE_STATUS_EXCLUDE_FILENAME, NODE_STATUS_EXCLUDE_LINE_GRAMMAR } from "@/lib/node-status/exclude";
import { SPEC_TREE_CONFIG } from "@/lib/spec-tree/config";
import { MARKDOWN_DEFAULT_DIRECTORY_NAMES } from "@/validation/steps/markdown";
import type { MarkdownLinkShapeCase } from "@testing/generators/validation/markdown";
import { GIT_TEST_SUBCOMMANDS, runGit } from "@testing/harnesses/git-test-constants";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const MARKDOWN_TEMP_PROJECT_PREFIX = "mdlint-project-";
const [, DOCS_DIRECTORY_NAME] = MARKDOWN_DEFAULT_DIRECTORY_NAMES;

export interface MarkdownTempProject {
  /** Absolute product root of the temporary project. */
  readonly productDir: string;
  /** Absolute path of the spec-tree directory under the product root. */
  readonly spxDir: string;
  /** Absolute path of the docs directory under the product root. */
  readonly docsDir: string;
  /** Writes content at a product-relative path, creating parent directories, and returns its absolute path. */
  readonly write: (relativePath: string, content: string) => Promise<string>;
  /**
   * Writes a link case's supporting files and then its citing file, makes the product root a git repository
   * tracking the case's tracked paths when it names any, and returns the citing file's absolute path.
   */
  readonly writeLinkCase: (linkCase: MarkdownLinkShapeCase) => Promise<string>;
  /** Writes the spec-tree exclude file listing each spec-tree-relative node directory, and returns its absolute path. */
  readonly writeNodeStatusExclude: (nodeDirectories: readonly string[]) => Promise<string>;
  /** Makes the product root a git repository whose index tracks exactly the given product-relative paths. */
  readonly track: (relativePaths: readonly string[]) => Promise<void>;
}

/** The repository the test process runs from, with its spec-tree directory. */
export interface RepositoryMarkdownProject {
  /** Absolute product root of the repository under test. */
  readonly productDir: string;
  /** Absolute path of the repository's spec-tree directory. */
  readonly spxDir: string;
}

/**
 * Runs the callback against an empty temporary product directory with no
 * pre-created spec-tree or docs directory; cleanup is owned by `withTempDir`.
 */
export function withMarkdownTempProject<T>(callback: (project: MarkdownTempProject) => Promise<T>): Promise<T> {
  return withTempDir(MARKDOWN_TEMP_PROJECT_PREFIX, (productDir) => {
    const write = async (relativePath: string, content: string): Promise<string> => {
      const absolutePath = join(productDir, relativePath);
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, content);
      return absolutePath;
    };
    const track = async (relativePaths: readonly string[]): Promise<void> => {
      await runGit(productDir, [GIT_TEST_SUBCOMMANDS.INIT]);
      await runGit(productDir, [GIT_TEST_SUBCOMMANDS.ADD, ...relativePaths]);
    };
    const writeLinkCase = async ({ link, supportingFiles, trackedPaths }: MarkdownLinkShapeCase): Promise<string> => {
      for (const supportingFile of supportingFiles) await write(supportingFile.path, supportingFile.content);
      const citingFile = await write(link.citingFile, link.content);
      if (trackedPaths !== undefined) await track(trackedPaths);
      return citingFile;
    };
    const writeNodeStatusExclude = (nodeDirectories: readonly string[]): Promise<string> =>
      write(
        join(SPEC_TREE_CONFIG.ROOT_DIRECTORY, NODE_STATUS_EXCLUDE_FILENAME),
        nodeDirectories
          .map((nodeDirectory) => `${nodeDirectory}${NODE_STATUS_EXCLUDE_LINE_GRAMMAR.ENTRY_SEPARATOR}`)
          .join(""),
      );
    return callback({
      productDir,
      spxDir: join(productDir, SPEC_TREE_CONFIG.ROOT_DIRECTORY),
      docsDir: join(productDir, DOCS_DIRECTORY_NAME),
      write,
      writeLinkCase,
      writeNodeStatusExclude,
      track,
    });
  });
}

/** Observes every file and directory path beneath a directory, relative to it. */
export function listTreeEntries(directory: string): ReadonlySet<string> {
  return new Set(
    readdirSync(directory, { recursive: true, encoding: "utf8" }).map((entry) =>
      relative(directory, join(directory, entry))
    ),
  );
}

/** Resolves the repository the test process runs from as a markdown validation product. */
export function repositoryMarkdownProject(): RepositoryMarkdownProject {
  const productDir = CONFIG_PROCESS_CWD.read();
  return { productDir, spxDir: join(productDir, SPEC_TREE_CONFIG.ROOT_DIRECTORY) };
}
