import { PACKAGED_CLI_INVOCATION } from "@/interfaces/cli/invocation";
import { RELEASE_CLI } from "@/interfaces/cli/release";

export const RELEASE_PUBLICATION_WORKFLOW = {
  PATH: ".github/workflows/publish.yml",
  JOB: {
    DETERMINISTIC: "deterministic",
    PUBLISH: "publish",
  },
  PERMISSION: {
    CONTENTS: "contents",
    ID_TOKEN: "id-token",
    READ: "read",
    WRITE: "write",
  },
} as const;

export const RELEASE_PUBLISH_INVOCATION = [
  PACKAGED_CLI_INVOCATION,
  RELEASE_CLI.COMMAND,
  RELEASE_CLI.PUBLISH_COMMAND,
].join(" ");

export const RELEASE_PUBLICATION_WORKFLOW_VIOLATION = {
  COMMAND_ABSENT: "command-absent",
  DETERMINISTIC_DEPENDENCY_ABSENT: "deterministic-dependency-absent",
  PUBLISH_CONTENTS_WRITE_ABSENT: "publish-contents-write-absent",
  PUBLISH_ID_TOKEN_WRITE_ABSENT: "publish-id-token-write-absent",
  NON_PUBLISH_CONTENTS_NOT_READ_ONLY: "non-publish-contents-not-read-only",
} as const;

export type ReleasePublicationWorkflowViolation =
  (typeof RELEASE_PUBLICATION_WORKFLOW_VIOLATION)[keyof typeof RELEASE_PUBLICATION_WORKFLOW_VIOLATION];

export interface ReleasePublicationWorkflowJob {
  readonly id: string;
  readonly needs: readonly string[];
  readonly permissions: Readonly<Record<string, string>>;
  readonly commands: readonly string[];
}

export interface ReleasePublicationWorkflowSnapshot {
  readonly jobs: readonly ReleasePublicationWorkflowJob[];
}

export function releasePublicationWorkflowViolations(
  snapshot: ReleasePublicationWorkflowSnapshot,
): readonly ReleasePublicationWorkflowViolation[] {
  const violations = new Set<ReleasePublicationWorkflowViolation>();
  const publishJob = snapshot.jobs.find((job) => job.id === RELEASE_PUBLICATION_WORKFLOW.JOB.PUBLISH);
  if (publishJob === undefined || !publishJob.commands.includes(RELEASE_PUBLISH_INVOCATION)) {
    violations.add(RELEASE_PUBLICATION_WORKFLOW_VIOLATION.COMMAND_ABSENT);
  }
  if (
    publishJob === undefined
    || !publishJob.needs.includes(RELEASE_PUBLICATION_WORKFLOW.JOB.DETERMINISTIC)
  ) {
    violations.add(RELEASE_PUBLICATION_WORKFLOW_VIOLATION.DETERMINISTIC_DEPENDENCY_ABSENT);
  }
  if (
    publishJob?.permissions[RELEASE_PUBLICATION_WORKFLOW.PERMISSION.CONTENTS]
      !== RELEASE_PUBLICATION_WORKFLOW.PERMISSION.WRITE
  ) {
    violations.add(RELEASE_PUBLICATION_WORKFLOW_VIOLATION.PUBLISH_CONTENTS_WRITE_ABSENT);
  }
  if (
    publishJob?.permissions[RELEASE_PUBLICATION_WORKFLOW.PERMISSION.ID_TOKEN]
      !== RELEASE_PUBLICATION_WORKFLOW.PERMISSION.WRITE
  ) {
    violations.add(RELEASE_PUBLICATION_WORKFLOW_VIOLATION.PUBLISH_ID_TOKEN_WRITE_ABSENT);
  }
  if (
    snapshot.jobs.some((job) =>
      job.id !== RELEASE_PUBLICATION_WORKFLOW.JOB.PUBLISH
      && job.permissions[RELEASE_PUBLICATION_WORKFLOW.PERMISSION.CONTENTS]
        !== RELEASE_PUBLICATION_WORKFLOW.PERMISSION.READ
    )
  ) {
    violations.add(RELEASE_PUBLICATION_WORKFLOW_VIOLATION.NON_PUBLISH_CONTENTS_NOT_READ_ONLY);
  }
  return [...violations];
}
