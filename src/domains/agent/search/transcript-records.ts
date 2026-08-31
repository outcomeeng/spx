import { AGENT_SESSION_JSON_FIELDS } from "../protocol";
import { firstString, parseJsonObject } from "../transcript-json";

/**
 * One recorded position of a session: the working directory it occupied and the
 * branch checked out there. A session moves between worktrees and products during
 * its life, so a transcript carries a sequence of these rather than a single value.
 */
export interface AgentTranscriptRecord {
  readonly cwd: string;
  readonly branch: string | null;
}

export type TranscriptRecordReader = (content: string) => readonly AgentTranscriptRecord[];

export function parseClaudeTranscriptRecords(content: string): readonly AgentTranscriptRecord[] {
  const records: AgentTranscriptRecord[] = [];
  for (const line of content.split("\n")) {
    const row = parseJsonObject(line);
    if (row === null) {
      continue;
    }
    const cwd = firstString(row, [
      [AGENT_SESSION_JSON_FIELDS.CWD],
      [AGENT_SESSION_JSON_FIELDS.PAYLOAD, AGENT_SESSION_JSON_FIELDS.CWD],
    ]);
    if (cwd === null) {
      continue;
    }
    records.push({ cwd, branch: firstString(row, [[AGENT_SESSION_JSON_FIELDS.GIT_BRANCH]]) });
  }
  return records;
}

/** The working directory recorded alongside the first occurrence of `branch`. */
export function recordedBranchCwd(
  records: readonly AgentTranscriptRecord[],
  branch: string,
): string | null {
  return records.find((record) => record.branch === branch)?.cwd ?? null;
}

/** The first recorded working directory the caller's predicate accepts. */
export function recordedCwdMatching(
  records: readonly AgentTranscriptRecord[],
  accepts: (cwd: string) => boolean,
): string | null {
  return records.find((record) => accepts(record.cwd))?.cwd ?? null;
}
