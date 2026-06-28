import { basename } from "node:path";

import { createJournal, type JournalEvent, type JournalEventInput } from "@/lib/agent-run-journal";
import { createAppendableJournalStore } from "@/lib/appendable-journal-store";
import { artifactJournalRunArtifactName } from "@/lib/artifact-journal-store";
import { STATE_STORE_TEXT_ENCODING, type StateStoreFileSystem } from "@/lib/state-store";

/** The staging directory the workflow's download step restores prior-run artifacts into, in tests. */
export const RESTORED_JOURNAL_RUNS_DIR = "restored-journal-runs";

/**
 * Build a sealed run through the runner-local appendable store and return its appended
 * events with the run file's JSONL body — the body a prior job sealed and the workflow's
 * upload step retained as an artifact. Tests build a prior run with this on a job
 * filesystem, then stage its body into a fresh runner's staging directory.
 */
export async function buildSealedRunBody(args: {
  readonly fs: StateStoreFileSystem;
  readonly runFilePath: string;
  readonly runToken: string;
  readonly inputs: readonly JournalEventInput[];
}): Promise<{ readonly appended: readonly JournalEvent[]; readonly body: string }> {
  const store = createAppendableJournalStore({ runFilePath: args.runFilePath, fs: args.fs });
  const journal = createJournal(store, { streamid: args.runToken, runid: args.runToken });
  const appended: JournalEvent[] = [];
  for (const input of args.inputs) appended.push(await journal.append(input));
  await journal.seal();
  const body = await args.fs.readFile(args.runFilePath, STATE_STORE_TEXT_ENCODING);
  return { appended, body };
}

/**
 * Model the verification workflow's upload-then-download of a sealed run: write the run's
 * JSONL body into the staging directory under its per-run artifact subdirectory, holding
 * the run file at its own basename — exactly as `actions/download-artifact` restores a
 * prior run's artifact. Tests stage a pull request's prior runs with this before
 * `hydratePriorRuns` materializes them, so no programmatic Actions-artifact client is
 * involved on either side.
 */
export async function stageRestoredRun(args: {
  readonly fs: StateStoreFileSystem;
  readonly pullNumber: number;
  readonly type: string;
  readonly runToken: string;
  readonly runFilePath: string;
  readonly body: string;
}): Promise<void> {
  const artifactName = artifactJournalRunArtifactName({
    pullNumber: args.pullNumber,
    type: args.type,
    runToken: args.runToken,
  });
  const artifactDir = `${RESTORED_JOURNAL_RUNS_DIR}/${artifactName}`;
  await args.fs.mkdir(artifactDir, { recursive: true });
  await args.fs.writeFile(`${artifactDir}/${basename(args.runFilePath)}`, args.body);
}
