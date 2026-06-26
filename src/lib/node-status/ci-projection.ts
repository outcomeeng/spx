import { parse as parseYaml } from "yaml";

const OBJECT_TYPE = "object";
const STRING_TYPE = "string";

export const NODE_STATUS_PROJECTION_WORKFLOW_PATHS = [
  ".github/workflows/deterministic-verification.yml",
] as const;
export const NODE_STATUS_PROJECTION_STEP_NAME = "Check committed status projection";
export const NODE_STATUS_PROJECTION_UPDATE_COMMAND = "pnpm exec tsx src/cli.ts spec status --update --format json";
export const NODE_STATUS_PROJECTION_DRIFT_CHECK_COMMAND = "git status --porcelain -- spx";
export const NODE_STATUS_PROJECTION_DIFF_COMMAND = "git diff -- spx";
export const NODE_STATUS_PROJECTION_FAILURE_COMMAND = "exit 1";

export type NodeStatusProjectionWorkflowStep = {
  readonly name?: string;
  readonly run?: string;
};

export function parseNodeStatusProjectionWorkflowSteps(raw: string): readonly NodeStatusProjectionWorkflowStep[] {
  const workflow = parseYaml(raw) as unknown;
  if (!isRecord(workflow)) return [];
  const jobs = workflow.jobs;
  if (!isRecord(jobs)) return [];
  return Object.values(jobs).flatMap((job) => {
    if (!isRecord(job) || !Array.isArray(job.steps)) return [];
    return job.steps.filter(isNodeStatusProjectionWorkflowStep);
  });
}

function isNodeStatusProjectionWorkflowStep(candidate: unknown): candidate is NodeStatusProjectionWorkflowStep {
  return isRecord(candidate)
    && (candidate.name === undefined || typeof candidate.name === STRING_TYPE)
    && (candidate.run === undefined || typeof candidate.run === STRING_TYPE);
}

function isRecord(candidate: unknown): candidate is Record<string, unknown> {
  return typeof candidate === OBJECT_TYPE && candidate !== null;
}
