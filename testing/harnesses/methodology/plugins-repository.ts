/**
 * A local git repository shaped like the plugins repository's published
 * `dist/` layout, so the methodology fetch verifies its clone, copy, and record
 * effects against a real repository without the network.
 *
 * The harness owns the temp directory, the repository lifecycle, and the
 * fetch's injected dependencies; it returns locations, the committed revision,
 * and the content it wrote. Every predicate stays in the linked test.
 *
 * @module harnesses/methodology/plugins-repository
 */

import type { Dirent } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

import { defaultGitDependencies } from "@/lib/git/root";
import {
  defaultMethodologyFetchFileSystem,
  FETCH_CODING_AGENTS,
  type MethodologyFetchDependencies,
  PLUGIN_MANIFEST_FIELDS,
  UNDERSTAND_SKILL_RELATIVE_DIR,
} from "@/lib/methodology/fetch";
import type { GeneratedPluginsContent } from "@testing/generators/methodology/tree";
import {
  GIT_TEST_CONFIG,
  GIT_TEST_FLAGS,
  GIT_TEST_SUBCOMMANDS,
  readGit,
  runGit,
} from "@testing/harnesses/git-test-constants";
import { createTempDir, removeTempDir } from "@testing/harnesses/with-temp-dir";

const REPOSITORY_TEMP_PREFIX = "spx-plugins-repository-";
const PACKAGE_TEMP_PREFIX = "spx-methodology-package-";
const CLONE_TEMP_PREFIX = "spx-methodology-clone-";
const INITIAL_COMMIT_MESSAGE = "publish plugins";
const UPLOADPACK_ALLOW_FILTER_KEY = "uploadpack.allowFilter";
const UPLOADPACK_ALLOW_FILTER_VALUE = "true";
const HEAD_REVISION = "HEAD";
const INITIAL_BRANCH_FLAG = "--initial-branch";
/** The branch the harness publishes on, the name a fetch may pass as its revision. */
export const PUBLISHED_BRANCH = "main";
const ADD_ALL_FLAG = "--all";

/** A published plugins repository: where it lives, the revision it holds, and what it carries. */
export interface PluginsRepository {
  /** Absolute path of the repository working tree; usable as a clone URL. */
  readonly repositoryDir: string;
  /** Full commit SHA of the published revision. */
  readonly revision: string;
  /** The branch holding the published revision. */
  readonly branch: string;
  readonly content: GeneratedPluginsContent;
  /** Absolute path of an empty directory standing in for spx's package root. */
  readonly packageRoot: string;
  /** Fetch dependencies wired to real git and the real filesystem, cloning under the harness temp root. */
  readonly dependencies: MethodologyFetchDependencies;
}

async function writeRepositoryFile(repositoryDir: string, relativePath: string, content: string): Promise<void> {
  const target = join(repositoryDir, relativePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content);
}

function pluginManifestText(
  agentContent: GeneratedPluginsContent["agents"] extends ReadonlyMap<string, infer T> ? T : never,
): string {
  const methodology = agentContent.provides === undefined
    ? {}
    : {
      [PLUGIN_MANIFEST_FIELDS.METHODOLOGY]: {
        [PLUGIN_MANIFEST_FIELDS.PROVIDES]: agentContent.provides,
        ...(agentContent.supports === undefined ? {} : { [PLUGIN_MANIFEST_FIELDS.SUPPORTS]: agentContent.supports }),
      },
    };
  return `${
    JSON.stringify(
      {
        [PLUGIN_MANIFEST_FIELDS.NAME]: agentContent.pluginName,
        [PLUGIN_MANIFEST_FIELDS.VERSION]: agentContent.pluginVersion,
        ...methodology,
      },
      null,
      2,
    )
  }\n`;
}

/** Writes and commits the generated content in the plugins repository's `dist/` layout. */
async function publish(repositoryDir: string, content: GeneratedPluginsContent): Promise<string> {
  await runGit(repositoryDir, [GIT_TEST_SUBCOMMANDS.INIT, INITIAL_BRANCH_FLAG, PUBLISHED_BRANCH]);
  await runGit(repositoryDir, [GIT_TEST_SUBCOMMANDS.CONFIG, GIT_TEST_CONFIG.EMAIL_KEY, GIT_TEST_CONFIG.EMAIL]);
  await runGit(repositoryDir, [GIT_TEST_SUBCOMMANDS.CONFIG, GIT_TEST_CONFIG.USER_NAME_KEY, GIT_TEST_CONFIG.USER_NAME]);
  await runGit(repositoryDir, [
    GIT_TEST_SUBCOMMANDS.CONFIG,
    UPLOADPACK_ALLOW_FILTER_KEY,
    UPLOADPACK_ALLOW_FILTER_VALUE,
  ]);
  for (const [agent, layout] of Object.entries(FETCH_CODING_AGENTS)) {
    const agentContent = content.agents.get(agent);
    if (agentContent === undefined) continue;
    await writeRepositoryFile(
      repositoryDir,
      join(layout.distRelativeDir, layout.pluginManifestRelativePath),
      pluginManifestText(agentContent),
    );
    for (const [relativePath, text] of agentContent.skillFiles) {
      await writeRepositoryFile(
        repositoryDir,
        join(layout.distRelativeDir, UNDERSTAND_SKILL_RELATIVE_DIR, relativePath),
        text,
      );
    }
  }
  await runGit(repositoryDir, [GIT_TEST_SUBCOMMANDS.ADD, ADD_ALL_FLAG]);
  await runGit(repositoryDir, [GIT_TEST_SUBCOMMANDS.COMMIT, GIT_TEST_FLAGS.COMMIT_MESSAGE, INITIAL_COMMIT_MESSAGE]);
  return readGit(repositoryDir, [GIT_TEST_SUBCOMMANDS.REV_PARSE, HEAD_REVISION]);
}

/**
 * Publishes `content` in a fresh local repository, hands the callback the
 * repository, an empty package root, and fetch dependencies whose clone
 * directory lives under the harness temp root, and removes everything after.
 */
export async function withPluginsRepository<T>(
  content: GeneratedPluginsContent,
  callback: (repository: PluginsRepository) => Promise<T>,
): Promise<T> {
  const repositoryDir = await createTempDir(REPOSITORY_TEMP_PREFIX);
  const packageRoot = await createTempDir(PACKAGE_TEMP_PREFIX);
  const cloneRoot = await createTempDir(CLONE_TEMP_PREFIX);
  let cloneCount = 0;
  try {
    const revision = await publish(repositoryDir, content);
    return await callback({
      repositoryDir,
      revision,
      branch: PUBLISHED_BRANCH,
      content,
      packageRoot,
      dependencies: {
        git: defaultGitDependencies,
        fs: defaultMethodologyFetchFileSystem,
        createCloneDir: async () => {
          cloneCount += 1;
          const cloneDir = join(cloneRoot, String(cloneCount));
          await mkdir(cloneDir, { recursive: true });
          return cloneDir;
        },
      },
    });
  } finally {
    await removeTempDir(cloneRoot);
    await removeTempDir(packageRoot);
    await removeTempDir(repositoryDir);
  }
}

/** Every regular file under `dir` as a sorted, root-relative path-to-text map; an absent directory reads as empty. */
export async function readDirectoryTree(dir: string): Promise<ReadonlyMap<string, string>> {
  const entries = new Map<string, string>();
  async function walk(current: string): Promise<void> {
    let names: Dirent[];
    try {
      names = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of names) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
      } else if (entry.isFile()) {
        entries.set(relative(dir, path), await readFile(path, "utf8"));
      }
    }
  }
  await walk(dir);
  return new Map([...entries].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)));
}
