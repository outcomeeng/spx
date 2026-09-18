import { GIT_RELEASE_SUBCOMMAND, type GitCommit } from "@/lib/git/release";
import { GIT_ROOT_COMMAND, type GitDependencies } from "@/lib/git/root";
import type { ReleaseDataDeterminismScenario } from "@testing/generators/release/release";

interface ControlledGitStep {
  readonly subcommand: string;
  readonly stdout: string;
}

const COMMIT_FIELD_SEPARATOR = "\0";
const PATH_SEPARATOR = "\n";

export function releaseDataGitDependencies(scenario: ReleaseDataDeterminismScenario): GitDependencies {
  const { expected } = scenario;
  if (expected.previousTag === null) {
    throw new Error("Release-data determinism scenarios require a previous release tag");
  }

  const steps: readonly ControlledGitStep[] = [
    { subcommand: GIT_ROOT_COMMAND.REV_PARSE, stdout: expected.releaseRef },
    { subcommand: GIT_RELEASE_SUBCOMMAND.TAG, stdout: "" },
    { subcommand: GIT_RELEASE_SUBCOMMAND.DESCRIBE, stdout: expected.previousTag },
    { subcommand: GIT_RELEASE_SUBCOMMAND.LOG, stdout: serializeCommits(expected.commits) },
    { subcommand: GIT_RELEASE_SUBCOMMAND.LOG, stdout: expected.changedPaths.join(PATH_SEPARATOR) },
  ];
  let invocationIndex = 0;

  return {
    execa: async (command, args, options) => {
      const step = steps.at(invocationIndex % steps.length);
      if (step === undefined) throw new Error("Release-data controlled runner has no configured step");
      invocationIndex += 1;

      if (command !== GIT_ROOT_COMMAND.EXECUTABLE || args.at(0) !== step.subcommand) {
        throw new Error(`Unexpected release-data operation: ${command} ${args.join(" ")}`);
      }
      if (options?.cwd !== scenario.productDir) {
        throw new Error(`Unexpected release-data product directory: ${String(options?.cwd)}`);
      }

      return { exitCode: 0, stdout: step.stdout, stderr: "" };
    },
  };
}

function serializeCommits(commits: readonly GitCommit[]): string {
  const fields = commits.flatMap((commit) => [commit.sha, commit.subject, commit.body]);
  return `${fields.join(COMMIT_FIELD_SEPARATOR)}${COMMIT_FIELD_SEPARATOR}`;
}
