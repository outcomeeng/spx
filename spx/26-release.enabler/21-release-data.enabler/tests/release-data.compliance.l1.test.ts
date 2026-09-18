import { describe, expect, it } from "vitest";

import { RELEASE_DATA_GIT_SUBCOMMANDS, restrictReleaseDataGitDependencies } from "@/domains/release/release-data";
import { GIT_ROOT_COMMAND, type GitDependencies } from "@/lib/git/root";
import { RELEASE_TEST_GENERATOR, sampleReleaseTestValue } from "@testing/generators/release/release";

describe("release-data external-operation boundary", () => {
  it.each(sampleReleaseTestValue(RELEASE_TEST_GENERATOR.releaseDataOperationViolations()))(
    "rejects $command before delegating",
    async ({ command, args }) => {
      const invocations: Array<{ readonly command: string; readonly args: readonly string[] }> = [];
      const deps: GitDependencies = {
        execa: async (receivedCommand, receivedArgs) => {
          invocations.push({ command: receivedCommand, args: receivedArgs });
          return { exitCode: 0, stdout: "", stderr: "" };
        },
      };

      await expect(restrictReleaseDataGitDependencies(deps).execa(command, args)).rejects.toThrow();
      expect(invocations).toEqual([]);
    },
  );

  it.each(RELEASE_DATA_GIT_SUBCOMMANDS)("delegates the required local git operation %s", async (subcommand) => {
    const invocations: Array<{ readonly command: string; readonly args: readonly string[] }> = [];
    const deps: GitDependencies = {
      execa: async (command, args) => {
        invocations.push({ command, args });
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    };

    await restrictReleaseDataGitDependencies(deps).execa(GIT_ROOT_COMMAND.EXECUTABLE, [subcommand]);

    expect(invocations).toEqual([{ command: GIT_ROOT_COMMAND.EXECUTABLE, args: [subcommand] }]);
  });
});
