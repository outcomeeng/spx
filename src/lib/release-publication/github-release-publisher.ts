import {
  type HostedRelease,
  type HostedReleasePublisher,
  ReleasePublicationError,
} from "@/domains/release/publication";

import { type ReleasePublicationRunner, runReleasePublicationCommand } from "./runner";

const GITHUB_RELEASE = {
  EXECUTABLE: "gh",
  RELEASE: "release",
  VIEW: "view",
  CREATE: "create",
  EDIT: "edit",
  JSON: "--json",
  JSON_FIELDS: "tagName,name,targetCommitish,body",
  TITLE: "--title",
  TARGET: "--target",
  NOTES_FILE: "--notes-file",
  STDIN_FILE: "-",
  VERIFY_TAG: "--verify-tag",
  NOT_FOUND: "release not found",
} as const;

export interface GithubReleasePublisherOptions {
  readonly productDir: string;
  readonly run?: ReleasePublicationRunner;
}

export function createGithubReleasePublisher(
  options: GithubReleasePublisherOptions,
): HostedReleasePublisher {
  const run = options.run ?? runReleasePublicationCommand;
  return {
    reconcile: async (release) => {
      const existing = await inspectHostedRelease(release.tag, options.productDir, run);
      if (existing !== null && hostedReleaseMatches(release, existing)) {
        return;
      }
      const command = existing === null ? GITHUB_RELEASE.CREATE : GITHUB_RELEASE.EDIT;
      const args = [
        GITHUB_RELEASE.RELEASE,
        command,
        release.tag,
        GITHUB_RELEASE.TITLE,
        release.title,
        GITHUB_RELEASE.TARGET,
        release.targetCommit,
        GITHUB_RELEASE.NOTES_FILE,
        GITHUB_RELEASE.STDIN_FILE,
        ...(existing === null ? [GITHUB_RELEASE.VERIFY_TAG] : []),
      ];
      const result = await run(GITHUB_RELEASE.EXECUTABLE, args, {
        cwd: options.productDir,
        input: release.body,
      });
      if (result.exitCode !== 0) {
        throw new ReleasePublicationError(`gh release ${command} failed: ${result.stderr.trim()}`);
      }
    },
  };
}

async function inspectHostedRelease(
  tag: string,
  productDir: string,
  run: ReleasePublicationRunner,
): Promise<HostedRelease | null> {
  const result = await run(
    GITHUB_RELEASE.EXECUTABLE,
    [
      GITHUB_RELEASE.RELEASE,
      GITHUB_RELEASE.VIEW,
      tag,
      GITHUB_RELEASE.JSON,
      GITHUB_RELEASE.JSON_FIELDS,
    ],
    { cwd: productDir },
  );
  if (result.exitCode !== 0) {
    if (result.stderr.toLowerCase().includes(GITHUB_RELEASE.NOT_FOUND)) {
      return null;
    }
    throw new ReleasePublicationError(`gh release view failed: ${result.stderr.trim()}`);
  }
  const release = JSON.parse(result.stdout) as unknown;
  if (!isRecord(release)) {
    throw new ReleasePublicationError("gh release view returned invalid release metadata");
  }
  const tagName = release.tagName;
  const name = release.name;
  const targetCommitish = release.targetCommitish;
  const body = release.body;
  if (
    typeof tagName !== "string"
    || typeof name !== "string"
    || typeof targetCommitish !== "string"
    || typeof body !== "string"
  ) {
    throw new ReleasePublicationError("gh release metadata lacks tag, title, target, or body");
  }
  return { tag: tagName, title: name, targetCommit: targetCommitish, body };
}

function hostedReleaseMatches(expected: HostedRelease, actual: HostedRelease): boolean {
  return actual.tag === expected.tag
    && actual.title === expected.title
    && actual.targetCommit === expected.targetCommit
    && actual.body === expected.body;
}

function isRecord(candidate: unknown): candidate is Record<string, unknown> {
  return typeof candidate === "object" && candidate !== null;
}
