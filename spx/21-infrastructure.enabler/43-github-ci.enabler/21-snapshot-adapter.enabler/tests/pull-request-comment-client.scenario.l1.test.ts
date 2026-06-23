import { describe, expect, it } from "vitest";

import {
  createGithubPullRequestCommentClient,
  type GithubApiRunner,
  GITHUB_API,
  GITHUB_API_ERROR,
} from "@/lib/github-snapshot-sink";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import {
  arbitraryProjection,
  arbitraryPullNumber,
  arbitrarySnapshotMarker,
  sampleGithubSnapshotValue,
} from "@testing/generators/github-snapshot";

class RecordingGithubApiRunner {
  readonly calls: string[][] = [];

  constructor(private readonly listStdout: string) {}

  readonly run: GithubApiRunner = (args) => {
    this.calls.push([...args]);
    return Promise.resolve({ stdout: this.calls.length === 1 ? this.listStdout : "" });
  };
}

function repository(): string {
  return `${sampleConfigTestValue(CONFIG_TEST_GENERATOR.key())}/${sampleConfigTestValue(CONFIG_TEST_GENERATOR.key())}`;
}

function mutationBodyArgument(args: readonly string[]): string {
  const bodyArgument = args.find((arg) => arg.startsWith(`${GITHUB_API.bodyField}=`));
  if (bodyArgument === undefined) throw new Error("GitHub API mutation omitted the body field");
  return bodyArgument;
}

function expectedCommentMarkerTag(marker: string): string {
  return `${String.fromCodePoint(60, 33, 45, 45, 32)}${marker}${String.fromCodePoint(32, 45, 45, 62)}`;
}

describe("github pull-request comment client", () => {
  it("creates a new comment when none carries the run's marker", async () => {
    const pullNumber = sampleGithubSnapshotValue(arbitraryPullNumber());
    const marker = sampleGithubSnapshotValue(arbitrarySnapshotMarker());
    const body = sampleGithubSnapshotValue(arbitraryProjection());
    const runner = new RecordingGithubApiRunner("[[]]");

    await createGithubPullRequestCommentClient({ repository: repository(), run: runner.run })
      .upsertPullRequestComment({ pullNumber, marker, body });

    expect(runner.calls).toHaveLength(2);
    const mutation = runner.calls[1] ?? [];
    expect(mutation).toContain(GITHUB_API.postMethod);
    const mutationBody = mutationBodyArgument(mutation);
    expect(mutationBody).toContain(body);
    expect(mutationBody).toContain(expectedCommentMarkerTag(marker));
  });

  it("edits the existing marked comment in place", async () => {
    const pullNumber = sampleGithubSnapshotValue(arbitraryPullNumber());
    const marker = sampleGithubSnapshotValue(arbitrarySnapshotMarker());
    const body = sampleGithubSnapshotValue(arbitraryProjection());
    const commentId = sampleGithubSnapshotValue(arbitraryPullNumber());
    const listed = JSON.stringify([[{ id: commentId, body: `prior ${expectedCommentMarkerTag(marker)}` }]]);
    const runner = new RecordingGithubApiRunner(listed);

    await createGithubPullRequestCommentClient({ repository: repository(), run: runner.run })
      .upsertPullRequestComment({ pullNumber, marker, body });

    expect(runner.calls).toHaveLength(2);
    const mutation = runner.calls[1] ?? [];
    expect(mutation).toContain(GITHUB_API.patchMethod);
    expect(mutation.some((arg) => arg.endsWith(`/${commentId}`))).toBe(true);
    const mutationBody = mutationBodyArgument(mutation);
    expect(mutationBody).toContain(body);
    expect(mutationBody).toContain(expectedCommentMarkerTag(marker));
  });

  it("rejects the artifact and cache surfaces it does not serve", async () => {
    const runner = new RecordingGithubApiRunner("[]");
    const client = createGithubPullRequestCommentClient({ repository: repository(), run: runner.run });
    const name = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const payload = sampleGithubSnapshotValue(arbitraryProjection());

    await expect(client.uploadActionsArtifact({ name, body: payload })).rejects.toThrow(
      GITHUB_API_ERROR.SURFACE_UNSUPPORTED,
    );
    await expect(client.saveActionsCache({ key: name, body: payload })).rejects.toThrow(
      GITHUB_API_ERROR.SURFACE_UNSUPPORTED,
    );
  });
});
