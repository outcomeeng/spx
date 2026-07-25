import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  RELEASE_PUBLICATION_WORKFLOW,
  type ReleasePublicationWorkflowJob,
  type ReleasePublicationWorkflowSnapshot,
} from "@/interfaces/cli/release-publication-workflow";
import { parse as parseYaml } from "yaml";

export async function observeReleasePublicationWorkflow(): Promise<
  ReleasePublicationWorkflowSnapshot
> {
  const workflow = parseYaml(
    await readFile(join(process.cwd(), RELEASE_PUBLICATION_WORKFLOW.PATH), "utf8"),
  ) as unknown;
  if (!isRecord(workflow) || !isRecord(workflow.jobs)) {
    return { jobs: [] };
  }
  return {
    jobs: Object.entries(workflow.jobs).flatMap(([id, candidate]) => {
      const job = parseJob(id, candidate);
      return job === undefined ? [] : [job];
    }),
  };
}

function parseJob(id: string, candidate: unknown): ReleasePublicationWorkflowJob | undefined {
  if (!isRecord(candidate)) {
    return undefined;
  }
  return {
    id,
    needs: stringList(candidate.needs),
    permissions: stringRecord(candidate.permissions),
    commands: Array.isArray(candidate.steps)
      ? candidate.steps.flatMap((step) =>
        isRecord(step) && typeof step.run === "string" ? [step.run.trim()] : []
      )
      : [],
  };
}

function stringList(candidate: unknown): readonly string[] {
  if (typeof candidate === "string") {
    return [candidate];
  }
  return Array.isArray(candidate)
    ? candidate.filter((item): item is string => typeof item === "string")
    : [];
}

function stringRecord(candidate: unknown): Readonly<Record<string, string>> {
  if (!isRecord(candidate)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(candidate).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

function isRecord(candidate: unknown): candidate is Record<string, unknown> {
  return typeof candidate === "object" && candidate !== null;
}
