import { describe, expect, it } from "vitest";

import {
  createGithubPrCommentClient,
  type GhRunner,
  GITHUB_CLI,
  GITHUB_CLI_ERROR,
  githubCommentMarkerTag,
} from "@/commands/journal/github-client";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import {
  arbitraryProjection,
  arbitraryPullNumber,
  arbitrarySnapshotMarker,
  sampleGithubSnapshotValue,
} from "@testing/generators/github-snapshot";

class RecordingGhRunner {
  readonly calls: string[][] = [];

  constructor(private readonly listStdout: string) {}

  readonly run: GhRunner = (args) => {
    this.calls.push([...args]);
    return Promise.resolve({ stdout: this.calls.length === 1 ? this.listStdout : "" });
  };
}

function repository(): string {
  return `${sampleConfigTestValue(CONFIG_TEST_GENERATOR.key())}/${sampleConfigTestValue(CONFIG_TEST_GENERATOR.key())}`;
}

describe("github pull-request comment client", () => {
  it("creates a new comment when none carries the run's marker", async () => {
    const pullNumber = sampleGithubSnapshotValue(arbitraryPullNumber());
    const marker = sampleGithubSnapshotValue(arbitrarySnapshotMarker());
    const body = sampleGithubSnapshotValue(arbitraryProjection());
    const runner = new RecordingGhRunner("[]");

    await createGithubPrCommentClient({ repository: repository(), run: runner.run })
      .upsertPullRequestComment({ pullNumber, marker, body });

    expect(runner.calls).toHaveLength(2);
    const mutation = runner.calls[1] ?? [];
    expect(mutation).toContain(GITHUB_CLI.postMethod);
    expect(
      mutation.some((arg) =>
        arg.startsWith(`${GITHUB_CLI.bodyField}=`) && arg.includes(githubCommentMarkerTag(marker))
      ),
    ).toBe(true);
  });

  it("edits the existing marked comment in place", async () => {
    const pullNumber = sampleGithubSnapshotValue(arbitraryPullNumber());
    const marker = sampleGithubSnapshotValue(arbitrarySnapshotMarker());
    const body = sampleGithubSnapshotValue(arbitraryProjection());
    const commentId = sampleGithubSnapshotValue(arbitraryPullNumber());
    const listed = JSON.stringify([{ id: commentId, body: `prior ${githubCommentMarkerTag(marker)}` }]);
    const runner = new RecordingGhRunner(listed);

    await createGithubPrCommentClient({ repository: repository(), run: runner.run })
      .upsertPullRequestComment({ pullNumber, marker, body });

    expect(runner.calls).toHaveLength(2);
    const mutation = runner.calls[1] ?? [];
    expect(mutation).toContain(GITHUB_CLI.patchMethod);
    expect(mutation.some((arg) => arg.endsWith(`/${commentId}`))).toBe(true);
  });

  it("rejects the artifact and cache surfaces it does not serve", async () => {
    const runner = new RecordingGhRunner("[]");
    const client = createGithubPrCommentClient({ repository: repository(), run: runner.run });
    const name = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const payload = sampleGithubSnapshotValue(arbitraryProjection());

    await expect(client.uploadActionsArtifact({ name, body: payload })).rejects.toThrow(
      GITHUB_CLI_ERROR.SURFACE_UNSUPPORTED,
    );
    await expect(client.saveActionsCache({ key: name, body: payload })).rejects.toThrow(
      GITHUB_CLI_ERROR.SURFACE_UNSUPPORTED,
    );
  });
});
