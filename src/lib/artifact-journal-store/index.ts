import { basename, dirname } from "node:path";

import { appendableJournalSealMarkerPath } from "@/lib/appendable-journal-store";
import {
  ERROR_CODE_NOT_FOUND,
  hasErrorCode,
  STATE_STORE_TEXT_ENCODING,
  type StateStoreFileSystem,
  validateScopeToken,
} from "@/lib/state-store";

const ARTIFACT_NAME_PR_PREFIX = "spx-journal-pr-";
// `.` delimits the pull request, verification type, and run token. The type and run
// token are scope tokens (`[A-Za-z0-9_-]`) and the run token is a fixed dotless format,
// so none can contain `.` — the delimiter is unambiguous and `.` is legal in an Actions
// artifact name. This keeps one pull request's verification types in disjoint name
// spaces so hydration never materializes another type's runs.
const ARTIFACT_NAME_SEGMENT_DELIMITER = ".";
// A seal marker carries no body — its presence is the sealed signal, matching the local
// appendable store's marker contract.
const EMPTY_SEAL_MARKER_BODY = "";

/**
 * The artifact-name prefix shared by every run of one pull request and verification
 * type, used by the workflow's download `pattern` and by hydration to select that
 * scope's restored runs. Including the opaque `<type>` keeps a pull request's
 * verification kinds in disjoint artifact name spaces, so hydration for one type never
 * materializes another type's runs.
 *
 * `type` must be a scope token (`[A-Za-z0-9_-]`, the journal's `<type>` segment): the `.`
 * delimiter relies on the type being dotless for the disjoint-name-space guarantee.
 */
export function artifactJournalScopePrefix(args: { pullNumber: number; type: string }): string {
  const d = ARTIFACT_NAME_SEGMENT_DELIMITER;
  return `${ARTIFACT_NAME_PR_PREFIX}${args.pullNumber}${d}${args.type}${d}`;
}

/**
 * The per-run artifact name that retains one run, addressed by its pull request,
 * verification type, and run token — the `name` the verification workflow's
 * `actions/upload-artifact` step uploads the sealed run file under. `type` and
 * `runToken` must be scope tokens (`[A-Za-z0-9_-]`) so the `.` delimiters stay unambiguous.
 */
export function artifactJournalRunArtifactName(args: { pullNumber: number; type: string; runToken: string }): string {
  return `${artifactJournalScopePrefix({ pullNumber: args.pullNumber, type: args.type })}${args.runToken}`;
}

/** A prior run materialized into the runner-local runs directory from its restored artifact. */
export interface HydratedRun {
  /** The hydrated run's token. */
  readonly runToken: string;
  /** The runner-local runs-directory path the run's JSONL history was materialized to. */
  readonly runFilePath: string;
}

export interface HydratePriorRunsOptions {
  /** Injected filesystem the restored runs are read from and the prior runs materialized into. */
  readonly fs: StateStoreFileSystem;
  /**
   * The staging directory the verification workflow's `actions/download-artifact` step
   * restored this pull request's prior-run artifacts into — one subdirectory per artifact,
   * named by its per-run artifact name and holding that run's JSONL file.
   */
  readonly restoredRunsDir: string;
  /** The pull request whose restored prior runs to hydrate. */
  readonly pullNumber: number;
  /** The opaque verification-type segment to hydrate; a scope token (`[A-Za-z0-9_-]`). Another type's runs are not materialized. */
  readonly type: string;
  /** Maps a run token to the runner-local runs-directory path its history is materialized to. */
  readonly runFilePathFor: (runToken: string) => string;
}

/**
 * Hydrate a pull request's prior runs of one verification type into the runner-local
 * runs directory: read the restored artifact subdirectories the workflow's download step
 * left in `restoredRunsDir`, select those whose name carries the pull-request-and-type
 * prefix, copy each restored run's JSONL into the runs directory, and write its seal
 * marker. Scoping by the prefix keeps another verification kind's runs out of the
 * materialized set. A staging directory the workflow did not populate (no prior runs
 * restored) yields no hydrated runs rather than failing the opening run.
 *
 * Each restored subdirectory's name is network-sourced, so the run-token segment is
 * validated as a scope token before it reaches the filesystem: a name whose suffix is not
 * a valid token (a path separator, a `..` segment, or any non-`[A-Za-z0-9_-]` character)
 * is skipped, so a malformed or adversarial artifact name cannot redirect a hydrated write
 * outside the runs directory. A restored run is materialized as sealed — its seal marker
 * written alongside its events — because a retained artifact exists only for a sealed run,
 * so a hydrated prior run reports sealed and rejects a further append.
 */
export async function hydratePriorRuns(options: HydratePriorRunsOptions): Promise<readonly HydratedRun[]> {
  const { fs, restoredRunsDir, pullNumber, type, runFilePathFor } = options;
  const prefix = artifactJournalScopePrefix({ pullNumber, type });

  let entries;
  try {
    entries = await fs.readdir(restoredRunsDir, { withFileTypes: true });
  } catch (error) {
    // No staging directory means the workflow restored no prior runs; that is an empty
    // readable set, not a hydration failure for the opening run.
    if (hasErrorCode(error, ERROR_CODE_NOT_FOUND)) return [];
    throw error;
  }

  const hydrated: HydratedRun[] = [];
  for (const entry of entries) {
    if (!entry.name.startsWith(prefix)) continue;
    // A restored artifact is the subdirectory `actions/download-artifact` creates, holding
    // the run file; a stray plain file in the staging directory is not a restored run, so
    // skip it before building a path or reading it rather than failing the opening run.
    if (entry.isFile()) continue;
    const runToken = entry.name.slice(prefix.length);
    // The run token comes from a network-sourced artifact name; reject anything that is not
    // a scope token before it reaches runFilePathFor and the filesystem, so a traversal
    // suffix cannot escape the runs directory.
    if (!validateScopeToken(runToken).ok) continue;
    // The artifact holds the run file under its own basename, so resolve the restored
    // file from the run file the workflow uploaded — `run-<token>.jsonl` in production,
    // whatever basename the caller's run path uses under test.
    const runFilePath = runFilePathFor(runToken);
    const restoredFilePath = `${restoredRunsDir}/${entry.name}/${basename(runFilePath)}`;
    let body: string;
    try {
      body = await fs.readFile(restoredFilePath, STATE_STORE_TEXT_ENCODING);
    } catch (error) {
      // A restored artifact directory that does not hold its run file — an empty or
      // truncated upload — is a malformed restored run, not a hydration failure: skip it
      // so the materialized set stays the restored runs the workflow actually retained.
      if (hasErrorCode(error, ERROR_CODE_NOT_FOUND)) continue;
      throw error;
    }
    await fs.mkdir(dirname(runFilePath), { recursive: true });
    await fs.writeFile(runFilePath, body);
    // A restored artifact exists only because its run was sealed, so write the seal
    // marker alongside the body — otherwise a hydrated prior run reports unsealed and a
    // caller could append to it, diverging from the journal's terminal-seal contract.
    await fs.writeFile(appendableJournalSealMarkerPath(runFilePath), EMPTY_SEAL_MARKER_BODY);
    hydrated.push({ runToken, runFilePath });
  }
  return hydrated;
}
