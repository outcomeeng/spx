import { describe, expect, it } from "vitest";

import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import {
  GIT_TEST_ENVIRONMENT_KEYS,
  GIT_TEST_FLAGS,
  GIT_TEST_OUTPUT,
  GIT_TEST_SUBCOMMANDS,
  readGit,
  runGit,
} from "@testing/harnesses/git-test-constants";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

describe("git command test harness compliance", () => {
  it("runs git subprocesses through an explicitly cleaned environment", async () => {
    const tempPrefix = sampleConfigTestValue(CONFIG_TEST_GENERATOR.tempPrefix());

    await withTempDir(tempPrefix, async (productDir) => {
      const pollutedGitEnvironment = {
        [GIT_TEST_ENVIRONMENT_KEYS.DIR]: GIT_TEST_OUTPUT.MISSING_ENV_VALUE,
        [GIT_TEST_ENVIRONMENT_KEYS.WORK_TREE]: GIT_TEST_OUTPUT.MISSING_ENV_VALUE,
      };

      await runGit(productDir, [GIT_TEST_SUBCOMMANDS.INIT, GIT_TEST_FLAGS.QUIET], pollutedGitEnvironment);
      const insideWorkTree = await readGit(
        productDir,
        [GIT_TEST_SUBCOMMANDS.REV_PARSE, GIT_TEST_FLAGS.IS_INSIDE_WORK_TREE],
        pollutedGitEnvironment,
      );

      expect(insideWorkTree).toBe(GIT_TEST_OUTPUT.IS_INSIDE_WORK_TREE_TRUE);
    });
  });
});
