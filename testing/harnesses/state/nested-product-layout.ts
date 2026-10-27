import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { execa } from "execa";

import { CONFIG_FILE_FORMAT, CONFIG_FILENAMES, serializeConfigFileSections } from "@/config";
import { SPEC_TREE_CONFIG } from "@/lib/spec-tree/config";
import { ERROR_CODE_NOT_FOUND } from "@/lib/state-store";
import type { NestedProductLayout } from "@testing/generators/state/nested-product-layout";
import {
  buildGitTestEnvironment,
  GIT_TEST_COMMAND,
  GIT_TEST_CONFIG,
  GIT_TEST_ENVIRONMENT_KEYS,
  GIT_TEST_FLAGS,
  GIT_TEST_SUBCOMMANDS,
  runGit,
} from "@testing/harnesses/git-test-constants";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const TEMP_DIR_PREFIX = "spx-nested-product-layout-";
const ANCESTOR_TEMP_DIR_PREFIX = "spx-git-observation-ancestor-";
const CHILD_DIRECTORY_NAME = "root";
const PRODUCT_SPEC_STEM = "layout";
const TITLE_HEADING_PREFIX = "# ";

/** Section key under which a placed level's configuration value is written and read back. */
export const NESTED_LAYOUT_CONFIG_SECTION = "layout";
/** Field inside {@link NESTED_LAYOUT_CONFIG_SECTION} holding the level's configuration value. */
export const NESTED_LAYOUT_CONFIG_VALUE_FIELD = "value";

/** What the filesystem holds at one level after materialization. */
export interface ObservedProductLevel {
  readonly relativePath: string;
  readonly configFile: { readonly value: string } | null;
  readonly specFile: { readonly title: string } | null;
}

/** The materialized layout: the temporary root, the invocation directory, and every level's observed files. */
export interface ObservedNestedProductLayout {
  readonly rootDir: string;
  readonly invocationDir: string;
  /** The git directory git reports for the temporary root, or null when git finds no repository rooted there. */
  readonly gitDir: string | null;
  readonly levels: readonly ObservedProductLevel[];
}

function levelDirectory(rootDir: string, relativePath: string): string {
  return join(rootDir, relativePath);
}

async function readIfPresent(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === ERROR_CODE_NOT_FOUND) return null;
    throw error;
  }
}

async function placeLevel(
  rootDir: string,
  relativePath: string,
  placed: { readonly title: string; readonly configValue: string },
): Promise<void> {
  const directory = levelDirectory(rootDir, relativePath);
  const specDirectory = join(directory, SPEC_TREE_CONFIG.ROOT_DIRECTORY);
  await mkdir(specDirectory, { recursive: true });
  const serialized = serializeConfigFileSections(CONFIG_FILE_FORMAT.JSON, {
    [NESTED_LAYOUT_CONFIG_SECTION]: { [NESTED_LAYOUT_CONFIG_VALUE_FIELD]: placed.configValue },
  });
  await writeFile(join(directory, CONFIG_FILENAMES.json), serialized.value);
  await writeFile(
    join(specDirectory, `${PRODUCT_SPEC_STEM}${SPEC_TREE_CONFIG.PRODUCT.SUFFIX}`),
    `${TITLE_HEADING_PREFIX}${placed.title}\n`,
  );
}

async function observeLevel(rootDir: string, relativePath: string): Promise<ObservedProductLevel> {
  const directory = levelDirectory(rootDir, relativePath);
  const rawConfig = await readIfPresent(join(directory, CONFIG_FILENAMES.json));
  const rawSpec = await readIfPresent(
    join(directory, SPEC_TREE_CONFIG.ROOT_DIRECTORY, `${PRODUCT_SPEC_STEM}${SPEC_TREE_CONFIG.PRODUCT.SUFFIX}`),
  );
  const parsedConfig = rawConfig === null
    ? null
    : (JSON.parse(rawConfig) as Record<string, Record<string, string>>);
  const heading = rawSpec?.split("\n")[0] ?? null;
  return {
    relativePath,
    configFile: parsedConfig === null
      ? null
      : { value: parsedConfig[NESTED_LAYOUT_CONFIG_SECTION][NESTED_LAYOUT_CONFIG_VALUE_FIELD] },
    specFile: heading === null ? null : { title: heading.slice(TITLE_HEADING_PREFIX.length) },
  };
}

/**
 * The git directory git reports for `rootDir` when discovery stops at its parent, so a repository
 * above `rootDir` is never seen; null when no repository is rooted at `rootDir`.
 */
async function observeGitDir(rootDir: string): Promise<string | null> {
  try {
    const result = await execa(GIT_TEST_COMMAND, [GIT_TEST_SUBCOMMANDS.REV_PARSE, GIT_TEST_FLAGS.GIT_DIR], {
      cwd: rootDir,
      env: { ...buildGitTestEnvironment(), [GIT_TEST_ENVIRONMENT_KEYS.CEILING_DIRECTORIES]: dirname(rootDir) },
      extendEnv: false,
    });
    return result.stdout.trim();
  } catch {
    return null;
  }
}

/** Handles and operations over a layout root that lies beneath an ancestor git repository. */
export interface AncestorRepositoryChild {
  readonly rootDir: string;
  /** Initializes a git repository rooted at {@link AncestorRepositoryChild.rootDir}. */
  readonly initializeRepository: () => Promise<void>;
  /** The git directory git reports for the root, stopping discovery at the root's parent; null when none is rooted there. */
  readonly observeGitDir: () => Promise<string | null>;
}

/**
 * Arranges a child directory beneath an initialized ancestor git repository in a temporary
 * directory and hands the callback the child's handles and operations. The directory is removed
 * after the callback returns or throws.
 */
export async function withAncestorRepositoryChild<T>(
  callback: (child: AncestorRepositoryChild) => Promise<T>,
): Promise<T> {
  return withTempDir(ANCESTOR_TEMP_DIR_PREFIX, async (ancestorDir) => {
    await runGit(ancestorDir, [GIT_TEST_SUBCOMMANDS.INIT]);
    const rootDir = join(ancestorDir, CHILD_DIRECTORY_NAME);
    await mkdir(rootDir);
    return callback({
      rootDir,
      initializeRepository: async () => {
        await runGit(rootDir, [GIT_TEST_SUBCOMMANDS.INIT]);
      },
      observeGitDir: () => observeGitDir(rootDir),
    });
  });
}

/**
 * Materializes a generated layout in a temporary directory — initialized as a git repository when
 * the layout lies inside one — and hands the callback what each level holds on disk. The directory
 * is removed after the callback returns or throws.
 */
export async function materializeNestedProductLayout<T>(
  layout: NestedProductLayout,
  callback: (observation: ObservedNestedProductLayout) => Promise<T>,
): Promise<T> {
  return withTempDir(TEMP_DIR_PREFIX, async (rootDir) => {
    if (layout.insideRepository) {
      await runGit(rootDir, [GIT_TEST_SUBCOMMANDS.INIT]);
      await runGit(rootDir, [GIT_TEST_SUBCOMMANDS.CONFIG, GIT_TEST_CONFIG.EMAIL_KEY, GIT_TEST_CONFIG.EMAIL]);
      await runGit(rootDir, [GIT_TEST_SUBCOMMANDS.CONFIG, GIT_TEST_CONFIG.USER_NAME_KEY, GIT_TEST_CONFIG.USER_NAME]);
    }
    for (const level of layout.levels) {
      await mkdir(levelDirectory(rootDir, level.relativePath), { recursive: true });
      if (level.placed !== null) {
        await placeLevel(rootDir, level.relativePath, level.placed);
      }
    }
    const observed: ObservedProductLevel[] = [];
    for (const level of layout.levels) {
      observed.push(await observeLevel(rootDir, level.relativePath));
    }
    return callback({
      rootDir,
      invocationDir: levelDirectory(rootDir, layout.invocationPath),
      gitDir: await observeGitDir(rootDir),
      levels: observed,
    });
  });
}
