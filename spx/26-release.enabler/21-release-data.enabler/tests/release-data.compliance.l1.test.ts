import { describe, expect, it } from "vitest";

import { restrictReleaseDataGitDependencies } from "@/domains/release/release-data";
import { type GitDependencies } from "@/lib/git/root";
import { RELEASE_TEST_GENERATOR, sampleReleaseTestValue } from "@testing/generators/release/release";

describe("release-data external-operation boundary", () => {
  it.each(sampleReleaseTestValue(RELEASE_TEST_GENERATOR.releaseDataOperationViolations()))(
    "rejects $label before delegating",
    async ({ command, args, productDir }) => {
      const invocations: Array<{ readonly command: string; readonly args: readonly string[] }> = [];
      const deps: GitDependencies = {
        execa: async (receivedCommand, receivedArgs) => {
          invocations.push({ command: receivedCommand, args: receivedArgs });
          return { exitCode: 0, stdout: "", stderr: "" };
        },
      };

      await expect(
        restrictReleaseDataGitDependencies(deps, productDir).execa(command, args, { cwd: productDir, reject: false }),
      ).rejects.toThrow();
      expect(invocations).toEqual([]);
    },
  );
});
