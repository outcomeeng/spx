import { readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { SPEC_TREE_CONFIG } from "@/lib/spec-tree/config";
import { MARKDOWN_DEFAULT_DIRECTORY_NAMES } from "@/validation/steps/markdown";
import { MARKDOWN_VALIDATION_DATA } from "@testing/generators/validation/markdown";
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
  /** Writes a linked source/target markdown pair into a directory and returns the source path. */
  readonly writeValidMarkdownPair: (directory: string) => Promise<string>;
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
    const writeValidMarkdownPair = async (directory: string): Promise<string> => {
      await mkdir(directory, { recursive: true });
      await writeFile(
        join(directory, MARKDOWN_VALIDATION_DATA.targetMarkdownFile),
        MARKDOWN_VALIDATION_DATA.validMarkdownTargetContent,
      );
      const sourceFile = join(directory, MARKDOWN_VALIDATION_DATA.sourceMarkdownFile);
      await writeFile(sourceFile, MARKDOWN_VALIDATION_DATA.validMarkdownSourceContent);
      return sourceFile;
    };
    return callback({
      productDir,
      spxDir: join(productDir, SPEC_TREE_CONFIG.ROOT_DIRECTORY),
      docsDir: join(productDir, DOCS_DIRECTORY_NAME),
      write,
      writeValidMarkdownPair,
    });
  });
}

/** Writes content at an absolute path inside an existing temporary project, creating parent directories. */
export async function writeMarkdownFile(absolutePath: string, content: string): Promise<string> {
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content);
  return absolutePath;
}

/** Observes the entry names directly inside a directory. */
export function listDirectoryEntries(directory: string): ReadonlySet<string> {
  return new Set(readdirSync(directory));
}
