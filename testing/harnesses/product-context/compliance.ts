import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { CONFIG_CLI } from "@/interfaces/cli/config";
import { SPX_GLOBAL_OPTIONS } from "@/interfaces/cli/product-context";
import type { GeneratedProductContextCase } from "@testing/generators/config/product-context";
import { GIT_TEST_FLAGS, GIT_TEST_SUBCOMMANDS, runGit } from "@testing/harnesses/git-test-constants";
import { type ProductContextCliRun, runProductContextCli } from "@testing/harnesses/product-context/cli";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const DIRTY_CALLER_TEMP_PREFIX = "spx-dirty-product-caller-";

export async function observeDirtyCallerProductContext(scenario: GeneratedProductContextCase): Promise<{
  readonly productDir: string;
  readonly result: ProductContextCliRun;
}> {
  return withTempDir(DIRTY_CALLER_TEMP_PREFIX, async (callerRoot) => {
    const callerDir = join(callerRoot, scenario.caller.productDirectory, scenario.caller.nestedDirectory);
    await mkdir(callerDir, { recursive: true });
    await runGit(callerDir, [GIT_TEST_SUBCOMMANDS.INIT, GIT_TEST_FLAGS.QUIET]);
    await writeFile(join(callerDir, scenario.source.filename), scenario.source.contents);

    return withTestEnv(scenario.testing.config, async ({ productDir }) => {
      await runGit(productDir, [GIT_TEST_SUBCOMMANDS.INIT, GIT_TEST_FLAGS.QUIET]);
      const result = await runProductContextCli(
        [
          SPX_GLOBAL_OPTIONS.directory.short,
          productDir,
          CONFIG_CLI.commandName,
          CONFIG_CLI.commands.show,
          CONFIG_CLI.flags.json,
        ],
        { processCwd: callerDir },
      );
      return { productDir, result };
    });
  });
}
