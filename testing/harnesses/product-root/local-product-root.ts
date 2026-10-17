import { mkdir, realpath, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  LOCAL_PRODUCT_ROOT_DIRECTORY,
  type LocalProductRootCase,
  type LocalProductRootDirectory,
} from "@testing/generators/product-root/local-product-root";
import { GIT_TEST_FLAGS, GIT_TEST_SUBCOMMANDS, runGit } from "@testing/harnesses/git-test-constants";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const TEMP_DIR_PREFIX = "spx-local-product-root-";

export type LocalProductRootEnv = {
  /** The directory to resolve from. */
  readonly invocationDir: string;
  /** The real path of the directory the case's placement makes the local product root. */
  readonly expectedProductDir: string;
};

/**
 * Materializes one layout case in a temporary directory — a git repository with the case's config
 * files placed, or a bare directory outside git — and hands the test the directory to resolve from
 * and the real path of the root the case's placement derives.
 */
export async function withLocalProductRootEnv(
  layoutCase: LocalProductRootCase,
  consume: (env: LocalProductRootEnv) => Promise<void>,
): Promise<void> {
  await withTempDir(TEMP_DIR_PREFIX, async (toplevel) => {
    if (layoutCase.insideGit) {
      await runGit(toplevel, [GIT_TEST_SUBCOMMANDS.INIT, GIT_TEST_FLAGS.QUIET]);
    }
    const intermediateAncestor = resolve(toplevel, ...layoutCase.productSegments);
    const invocationDir = layoutCase.insideGit
      ? resolve(intermediateAncestor, layoutCase.invocationSegment)
      : toplevel;
    await mkdir(invocationDir, { recursive: true });

    const directories: Readonly<Record<LocalProductRootDirectory, string>> = {
      [LOCAL_PRODUCT_ROOT_DIRECTORY.INVOCATION]: invocationDir,
      [LOCAL_PRODUCT_ROOT_DIRECTORY.INTERMEDIATE_ANCESTOR]: intermediateAncestor,
      [LOCAL_PRODUCT_ROOT_DIRECTORY.TOPLEVEL]: toplevel,
    };
    for (const placed of layoutCase.configPlacedAt) {
      await writeFile(resolve(directories[placed], layoutCase.configFilename), "");
    }

    await consume({
      invocationDir,
      expectedProductDir: await realpath(directories[layoutCase.expectedRoot]),
    });
  });
}
