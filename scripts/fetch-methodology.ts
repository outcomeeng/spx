/**
 * Refreshes spx's shipped methodology trees from the plugins repository:
 *
 *   pnpm run methodology:fetch -- [--revision <ref>] [--line <MAJOR.MINOR>]
 *
 * A boundary entry: it parses arguments, resolves the package root from its
 * own location, wires real git and filesystem dependencies, and maps the
 * outcome to terminal output and an exit code. The fetch itself lives in
 * `src/lib/methodology/fetch`.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { defaultGitDependencies } from "../src/lib/git/root";
import {
  defaultMethodologyFetchFileSystem,
  parseFetchArguments,
  PLUGINS_REPOSITORY,
  PLUGINS_REPOSITORY_URL,
  runMethodologyFetch,
} from "../src/lib/methodology/fetch";

const CLONE_TEMP_PREFIX = "spx-methodology-fetch-";
const EXIT_FAILURE = 1;

async function main(argv: readonly string[]): Promise<number> {
  const parsed = parseFetchArguments(argv);
  if (!parsed.ok) {
    console.error(parsed.error);
    return EXIT_FAILURE;
  }
  const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const cloneDirs: string[] = [];
  try {
    const outcome = await runMethodologyFetch({
      ...parsed.value,
      repository: PLUGINS_REPOSITORY,
      repositoryUrl: PLUGINS_REPOSITORY_URL,
      packageRoot,
      dependencies: {
        git: defaultGitDependencies,
        fs: defaultMethodologyFetchFileSystem,
        createCloneDir: async () => {
          const cloneDir = await mkdtemp(join(tmpdir(), CLONE_TEMP_PREFIX));
          cloneDirs.push(cloneDir);
          return cloneDir;
        },
      },
    });
    if (!outcome.ok) {
      console.error(outcome.error);
      return EXIT_FAILURE;
    }
    console.log(`Fetched ${PLUGINS_REPOSITORY}@${outcome.value.revision} into ${outcome.value.lineDir}`);
    return 0;
  } finally {
    for (const cloneDir of cloneDirs) {
      await rm(cloneDir, { recursive: true, force: true });
    }
  }
}

process.exitCode = await main(process.argv.slice(2));
