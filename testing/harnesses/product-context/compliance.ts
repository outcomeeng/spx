import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { CONFIG_CLI } from "@/interfaces/cli/config";
import { SPX_GLOBAL_OPTIONS } from "@/interfaces/cli/product-context";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { GIT_TEST_FLAGS, GIT_TEST_SUBCOMMANDS, runGit } from "@testing/harnesses/git-test-constants";
import {
  parseProductContextJsonConfig,
  ProductContextTempDirs,
  productContextTestingConfig,
  runProductContextCli,
} from "@testing/harnesses/product-context/cli";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

const tempDirs = new ProductContextTempDirs();

afterEach(async () => {
  await tempDirs.cleanup();
});

async function makeTempDir(): Promise<string> {
  return tempDirs.makeTempDir();
}

export function registerProductContextCompliance(): void {
  describe("product context compliance", () => {
    it("resolves config from -C target instead of a dirty unrelated caller worktree", async () => {
      const generated = sampleConfigTestValue(
        CONFIG_TEST_GENERATOR.testingConfig(),
      );
      const dirtyFilename = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
      const dirtyContent = sampleConfigTestValue(
        CONFIG_TEST_GENERATOR.scalar(),
      );
      const callerDir = await makeTempDir();
      await runGit(callerDir, [
        GIT_TEST_SUBCOMMANDS.INIT,
        GIT_TEST_FLAGS.QUIET,
      ]);
      await writeFile(join(callerDir, dirtyFilename), dirtyContent);

      await withTestEnv(generated.config, async ({ productDir }) => {
        await runGit(productDir, [
          GIT_TEST_SUBCOMMANDS.INIT,
          GIT_TEST_FLAGS.QUIET,
        ]);

        const result = await runCli(
          [
            SPX_GLOBAL_OPTIONS.directory.short,
            productDir,
            CONFIG_CLI.commandName,
            CONFIG_CLI.commands.show,
            CONFIG_CLI.flags.json,
          ],
          callerDir,
        );

        expect(result.exitCodes).toEqual([0]);
        expect(result.stderr).toHaveLength(0);
        expect(
          productContextTestingConfig(
            parseProductContextJsonConfig(result.stdout, productDir),
          ),
        ).toEqual(generated.expected);
      });
    });
  });
}

function runCli(args: readonly string[], processCwd: string) {
  return runProductContextCli(args, { processCwd });
}
