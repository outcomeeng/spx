import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import {
  GIT_TEST_COMMAND,
  GIT_TEST_EXECUTABLE,
  GIT_TEST_FLAGS,
  GIT_TEST_SUBCOMMANDS,
} from "@testing/harnesses/git-test-constants";
import { withGitEnv } from "@testing/harnesses/with-git-env";

describe("precommit git environment test harness", () => {
  it("writes a file and returns an ExecResult for zero-exit and non-zero-exit commands", async () => {
    await withGitEnv(async ({ exec, writeFile }) => {
      const fileName = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
      const content = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());

      await writeFile(fileName, content);

      // String form, zero exit: stage the written file (proves writeFile created it under the env root).
      const staged = await exec(`${GIT_TEST_COMMAND} ${GIT_TEST_SUBCOMMANDS.ADD} ${fileName}`);
      expect(staged.exitCode).toBe(0);
      expect(staged.stdout).toHaveLength(0);
      expect(staged.stderr).toHaveLength(0);

      // Array form, zero exit: the staged index lists the written file.
      const listed = await exec([GIT_TEST_COMMAND, GIT_TEST_SUBCOMMANDS.LS_FILES, GIT_TEST_FLAGS.CACHED]);
      expect(listed.exitCode).toBe(0);
      expect(listed.stdout).toContain(fileName);
      expect(listed.stderr).toHaveLength(0);

      // Array form, non-zero process exit: execa throws, the harness normalizes it into an ExecResult
      // rather than propagating the throw.
      const failed = await exec([GIT_TEST_EXECUTABLE.NODE, "-e", "process.exit(1)"]);
      expect(failed.exitCode).toBe(1);
      expect(failed.stdout).toHaveLength(0);
      expect(failed.stderr).toHaveLength(0);
    });
  });

  it("propagates the error when a command cannot be spawned", async () => {
    await withGitEnv(async ({ exec }) => {
      // An absolute path under the OS temp dir is never resolved through PATH and the
      // random basename does not exist, so the spawn fails structurally rather than by
      // chance — a bare generated name could collide with a real binary on PATH.
      const missingBinary = join(tmpdir(), sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()));

      await expect(exec([missingBinary])).rejects.toThrow();
    });
  });
});
