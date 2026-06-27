import { dirname } from "node:path";

import { type AppendableBackend, JOURNAL_BACKEND_KIND } from "@/lib/agent-run-journal";
import { appendableJournalSealMarkerPath, createAppendableJournalStore } from "@/lib/appendable-journal-store";
import {
  defaultStateStoreFileSystem,
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
// spaces so hydration never lists another type's runs.
const ARTIFACT_NAME_SEGMENT_DELIMITER = ".";
const EMPTY_ARTIFACT_BODY = "";

/** A run-scoped GitHub Actions artifact discovered when listing a pull request's retained runs. */
export interface ActionsArtifactSummary {
  /** The artifact name, carrying the pull request and run token. */
  readonly name: string;
  /** Whether the artifact's retention window has lapsed, so its body is no longer downloadable. */
  readonly expired: boolean;
}

/**
 * The injected GitHub Actions-artifact boundary. Distinct from the write-only Snapshot
 * client because hydration reads prior runs back: the contract is upload, list-by-prefix,
 * and download. Every artifact access of the GitHub Appendable store routes through here,
 * so the store's dispatch verifies over a controlled client without the Actions runtime.
 */
export interface ActionsArtifactClient {
  /** Retain a sealed run's JSONL body as a per-run artifact. */
  uploadArtifact(args: { name: string; body: string }): Promise<void>;
  /** List the artifacts whose name begins with `namePrefix`, with each one's retention state. */
  listArtifacts(args: { namePrefix: string }): Promise<readonly ActionsArtifactSummary[]>;
  /** Download a retained artifact's body by name. */
  downloadArtifact(args: { name: string }): Promise<string>;
}

/**
 * The artifact-name prefix shared by every run of one pull request and verification
 * type, used to list that scope's retained runs. Including the opaque `<type>` keeps a
 * pull request's verification kinds in disjoint artifact name spaces, so hydration for
 * one type never lists or materializes another type's runs.
 *
 * `type` must be a scope token (`[A-Za-z0-9_-]`, the journal's `<type>` segment): the `.`
 * delimiter relies on the type being dotless for the disjoint-name-space guarantee.
 */
export function artifactJournalScopePrefix(args: { pullNumber: number; type: string }): string {
  const d = ARTIFACT_NAME_SEGMENT_DELIMITER;
  return `${ARTIFACT_NAME_PR_PREFIX}${args.pullNumber}${d}${args.type}${d}`;
}

/**
 * The artifact name that retains one run, addressed by its pull request, verification type,
 * and run token. `type` and `runToken` must be scope tokens (`[A-Za-z0-9_-]`) so the `.`
 * delimiters stay unambiguous.
 */
export function artifactJournalRunArtifactName(args: { pullNumber: number; type: string; runToken: string }): string {
  return `${artifactJournalScopePrefix({ pullNumber: args.pullNumber, type: args.type })}${args.runToken}`;
}

export interface ArtifactJournalStoreOptions {
  /** The resolved runner-local `.spx/` run file path that holds this run's JSONL history. */
  readonly runFilePath: string;
  /** Injected filesystem; defaults to the real state-store filesystem. */
  readonly fs?: StateStoreFileSystem;
  /** Injected GitHub Actions-artifact boundary for durable retention. */
  readonly artifactClient: ActionsArtifactClient;
  /** The pull request whose retained runs this run joins. */
  readonly pullNumber: number;
  /** The opaque verification-type segment this run is scoped to; a scope token (`[A-Za-z0-9_-]`). */
  readonly type: string;
  /** This run's token, addressing its per-run artifact. */
  readonly runToken: string;
}

/**
 * Bind the agent-run-journal `AppendableBackend` port to the runner-local JSONL run history
 * and add GitHub durability: `append`, `readAll`, and `isSealed` delegate to the local
 * Appendable store, while `seal` additionally retains the run's JSONL body as a per-run
 * Actions artifact. A run performs no per-append network write — retention happens once, at seal.
 */
export function createArtifactJournalStore(options: ArtifactJournalStoreOptions): AppendableBackend {
  const fs = options.fs ?? defaultStateStoreFileSystem;
  const { runFilePath, artifactClient, pullNumber, type, runToken } = options;
  const local = createAppendableJournalStore({ runFilePath, fs });

  return {
    kind: JOURNAL_BACKEND_KIND.APPENDABLE,

    append(record): Promise<void> {
      return local.append(record);
    },

    readAll() {
      return local.readAll();
    },

    isSealed(): Promise<boolean> {
      return local.isSealed();
    },

    async seal(): Promise<void> {
      // Seal the local marker first: sealing is terminal, so a sealed run rejects
      // further appends and the JSONL body can no longer grow. Retention captures
      // that frozen body, so no append can interleave between a failed seal and a
      // retry to diverge the retained record from the local one. Idempotent — a
      // re-seal skips the marker when the run is already sealed.
      if (!(await local.isSealed())) await local.seal();
      // Then ensure durable retention, independently of the seal guard and
      // idempotently: a retention failure leaves the run sealed-but-unretained, and
      // a later seal re-attempts the upload. Skip the upload when the artifact is
      // already retained — its per-run name is immutable under the Actions API, so
      // re-uploading it would conflict.
      const name = artifactJournalRunArtifactName({ pullNumber, type, runToken });
      if (await isArtifactRetained(artifactClient, name)) return;
      const body = await readFileOrEmpty(fs, runFilePath);
      await artifactClient.uploadArtifact({ name, body });
    },
  };
}

/** A prior run materialized into the runner-local filesystem from its retained artifact. */
export interface HydratedRun {
  /** The hydrated run's token. */
  readonly runToken: string;
  /** The runner-local run file path the run's JSONL history was written to. */
  readonly runFilePath: string;
}

export interface HydratePriorRunsOptions {
  /** Injected GitHub Actions-artifact boundary. */
  readonly artifactClient: ActionsArtifactClient;
  /** Injected filesystem the prior runs' histories are written into. */
  readonly fs: StateStoreFileSystem;
  /** The pull request whose retained runs to hydrate. */
  readonly pullNumber: number;
  /** The opaque verification-type segment to hydrate; a scope token (`[A-Za-z0-9_-]`). Another type's runs are not listed. */
  readonly type: string;
  /** Maps a run token to the runner-local run file path its history is written to. */
  readonly runFilePathFor: (runToken: string) => string;
}

/**
 * Hydrate a pull request's prior runs of one verification type into the runner-local
 * filesystem: list the retained artifacts by the pull-request-and-type prefix, skip any
 * whose retention has expired, download each live artifact's JSONL body, and write it to
 * the run's local path. Scoping the prefix by type keeps another verification kind's runs
 * out of the listing. A prior run whose artifact expired is skipped rather than failing the
 * opening run, so the readable set is the type's still-retained runs.
 *
 * Artifact names are network-sourced, so the run-token segment extracted from each name is
 * validated as a scope token before it reaches the filesystem: an artifact whose suffix is
 * not a valid token (a path separator, a `..` segment, or any non-`[A-Za-z0-9_-]` character)
 * is skipped, so a malformed or adversarial artifact name cannot redirect a hydrated write
 * outside the runs directory.
 */
export async function hydratePriorRuns(options: HydratePriorRunsOptions): Promise<readonly HydratedRun[]> {
  const { artifactClient, fs, pullNumber, type, runFilePathFor } = options;
  const prefix = artifactJournalScopePrefix({ pullNumber, type });
  const summaries = await artifactClient.listArtifacts({ namePrefix: prefix });

  const hydrated: HydratedRun[] = [];
  for (const summary of summaries) {
    if (summary.expired) continue;
    const runToken = summary.name.slice(prefix.length);
    // The run token comes from a network-sourced artifact name; reject anything that is not a
    // scope token before it reaches runFilePathFor and the filesystem, so a traversal suffix
    // cannot escape the runs directory.
    if (!validateScopeToken(runToken).ok) continue;
    const body = await artifactClient.downloadArtifact({ name: summary.name });
    const runFilePath = runFilePathFor(runToken);
    await fs.mkdir(dirname(runFilePath), { recursive: true });
    await fs.writeFile(runFilePath, body);
    // A retained artifact exists only because its run was sealed, so restore the
    // seal marker alongside the body — otherwise a reopened prior run reports
    // unsealed and a caller could append to it, diverging the durable record from
    // the journal's terminal-seal contract.
    await fs.writeFile(appendableJournalSealMarkerPath(runFilePath), EMPTY_ARTIFACT_BODY);
    hydrated.push({ runToken, runFilePath });
  }
  return hydrated;
}

async function isArtifactRetained(client: ActionsArtifactClient, name: string): Promise<boolean> {
  const summaries = await client.listArtifacts({ namePrefix: name });
  return summaries.some((summary) => summary.name === name && !summary.expired);
}

async function readFileOrEmpty(fs: StateStoreFileSystem, path: string): Promise<string> {
  try {
    return await fs.readFile(path, STATE_STORE_TEXT_ENCODING);
  } catch (error) {
    if (hasErrorCode(error, ERROR_CODE_NOT_FOUND)) return EMPTY_ARTIFACT_BODY;
    throw error;
  }
}
