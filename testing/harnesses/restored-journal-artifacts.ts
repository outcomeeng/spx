import { basename } from "node:path";

import { createJournal, type JournalEvent, type JournalEventInput } from "@/lib/agent-run-journal";
import { createAppendableJournalStore } from "@/lib/appendable-journal-store";
import { artifactJournalRunArtifactName } from "@/lib/artifact-journal-store";
import { runFileName, STATE_STORE_TEXT_ENCODING, type StateStoreFileSystem } from "@/lib/state-store";

/** The staging directory the workflow's download step restores prior-run artifacts into, in tests. */
export const RESTORED_JOURNAL_RUNS_DIR = "restored-journal-runs";

const STAGING_READ_FAILURE_MESSAGE = "restored runs directory could not be read";

/**
 * Wrap a {@link StateStoreFileSystem} so that listing the staging directory rejects with a
 * non-ENOENT I/O error, standing in for a corrupt or unreadable restored-runs directory.
 * `hydratePriorRuns` rethrows such an error rather than treating it as an empty set, so a
 * test drives the open-hydration failure path deterministically over a real filesystem
 * double rather than a mock.
 */
export function stagingReadFailingFileSystem(base: StateStoreFileSystem): StateStoreFileSystem {
  return {
    mkdir: (path, options) => base.mkdir(path, options),
    writeFile: (path, data, options) => base.writeFile(path, data, options),
    appendFile: (path, data) => base.appendFile(path, data),
    readFile: (path, encoding) => base.readFile(path, encoding),
    readdir: () => Promise.reject(new Error(STAGING_READ_FAILURE_MESSAGE)),
    lstat: (path) => base.lstat(path),
    link: (existingPath, newPath) => base.link(existingPath, newPath),
    rename: (from, to) => base.rename(from, to),
    rm: (path, options) => base.rm(path, options),
  };
}

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
  // Match the production journal identity: the runtime opens every run with
  // `streamid`/`runid` set to the run file name, not the raw token, so a prior run this
  // fixture builds carries the same event identity a real sealed run produces.
  const identity = runFileName(args.runToken);
  const journal = createJournal(store, { streamid: identity, runid: identity });
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
